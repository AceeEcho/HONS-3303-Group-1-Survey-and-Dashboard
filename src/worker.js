import {
  authorize,
  isLocal,
  usesSharedPassword,
  createPasswordSession,
  clearPasswordSession,
} from "./auth.js";
import {
  HttpError,
  validateDefinition,
  validateAnswers,
  csvRows,
} from "./model.js";
const json = (v, status = 200) =>
  new Response(JSON.stringify(v), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
const secure = (response) => {
  const r = new Response(response.body, response);
  for (const [k, v] of Object.entries({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  }))
    r.headers.set(k, v);
  return r;
};
function writeGuard(req) {
  if (
    req.headers.get("Origin") !== new URL(req.url).origin ||
    req.headers.get("X-Survey-Request") !== "1"
  )
    throw new HttpError(403, "This request must come from this website.");
  if (!req.headers.get("Content-Type")?.startsWith("application/json"))
    throw new HttpError(415, "Use JSON for this request.");
}
async function body(req) {
  if (Number(req.headers.get("Content-Length")) > 524288)
    throw new HttpError(413, "This request is too large.");
  const reader = req.body?.getReader();
  let size = 0,
    chunks = [];
  if (!reader) throw new HttpError(400, "A request body is required.");
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 524288) {
      await reader.cancel();
      throw new HttpError(413, "This request is too large.");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(
      new TextDecoder().decode(await new Blob(chunks).arrayBuffer()),
    );
  } catch {
    throw new HttpError(400, "The request is not valid JSON.");
  }
}
const state = (env) =>
  env.DB.prepare("SELECT * FROM survey WHERE id=1").first();
async function overview(env, user) {
  const s = await state(env);
  const versions = await env.DB.prepare(
    "SELECT id,number,published_at FROM revisions ORDER BY number DESC",
  ).all();
  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM responses",
  ).first();
  return {
    ...s,
    draft: JSON.parse(s.draft_json),
    draft_json: undefined,
    versions: versions.results,
    response_count: count.n,
    user,
    public_url: env.PUBLIC_SURVEY_URL || null,
  };
}
async function handle(req, env) {
  const url = new URL(req.url),
    p = url.pathname,
    local = isLocal(req, env),
    adminMode = env.APP_MODE === "admin" || local;
  if (p === "/api/dev/session" && local && req.method === "POST") {
    writeGuard(req);
    return new Response("{}", {
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie":
          "fieldwork_local=creator; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400",
        "Cache-Control": "no-store",
      },
    });
  }
  if (p === "/api/environment" && req.method === "GET")
    return json({
      mode: local ? "local" : env.APP_MODE,
      authentication: usesSharedPassword(env) ? "shared-password" : "access",
    });
  // Login and logout never return the password, session token or allowed list.
  if (p.startsWith("/api/auth/")) {
    if (
      usesSharedPassword(env) &&
      p === "/api/auth/session" &&
      req.method === "GET"
    ) {
      // A signed-out visitor can load the login screen without requesting private data.
      try {
        await authorize(req, env);
        return json({ authenticated: true });
      } catch (error) {
        if (error instanceof HttpError && [401, 403].includes(error.status))
          return json({ authenticated: false });
        throw error;
      }
    }
    if (!usesSharedPassword(env) || req.method !== "POST")
      throw new HttpError(404, "Not found.");
    writeGuard(req);
    if (p === "/api/auth/logout") {
      return new Response("{}", {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "Set-Cookie": clearPasswordSession(),
        },
      });
    }
    if (p === "/api/auth/login") {
      if (!env.AUTH_LIMITER)
        throw new HttpError(503, "Creator sign-in is temporarily unavailable.");
      const limit = await env.AUTH_LIMITER.limit({
        key: req.headers.get("CF-Connecting-IP") || "unknown",
      });
      if (!limit.success)
        throw new HttpError(
          429,
          "Too many sign-in attempts. Please wait a minute.",
        );
      const input = await body(req);
      const cookie = await createPasswordSession(req, env, input?.password);
      return new Response("{}", {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "Set-Cookie": cookie,
        },
      });
    }
    throw new HttpError(404, "Not found.");
  }
  if (p.startsWith("/api/admin")) {
    if (!adminMode) throw new HttpError(404, "Not found.");
    const user = await authorize(req, env);
    if (!["GET", "HEAD"].includes(req.method)) writeGuard(req);
    if (p === "/api/admin/survey" && req.method === "GET")
      return json(await overview(env, user));
    if (p === "/api/admin/survey" && req.method === "PUT") {
      const input = await body(req),
        draft = validateDefinition(input.draft);
      if (!Number.isInteger(input.expected_version))
        throw new HttpError(400, "A draft version is required.");
      const r = await env.DB.prepare(
        "UPDATE survey SET draft_json=?,draft_version=draft_version+1,updated_at=? WHERE id=1 AND draft_version=?",
      )
        .bind(
          JSON.stringify(draft),
          new Date().toISOString(),
          input.expected_version,
        )
        .run();
      if (!r.meta.changes)
        throw new HttpError(
          409,
          "This draft changed in another window. Reload before saving.",
        );
      return json(await overview(env, user));
    }
    if (p === "/api/admin/publish" && req.method === "POST") {
      const input = await body(req),
        s = await state(env);
      if (input.expected_version !== s.draft_version)
        throw new HttpError(409, "Save your latest draft before publishing.");
      const draft = validateDefinition(JSON.parse(s.draft_json), true),
        id = crypto.randomUUID(),
        now = new Date().toISOString();
      const results = await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO revisions(id,number,definition_json,published_at) SELECT ?,COALESCE((SELECT MAX(number) FROM revisions),0)+1,?,? FROM survey WHERE id=1 AND draft_version=?",
        ).bind(id, JSON.stringify(draft), now, input.expected_version),
        env.DB.prepare(
          "UPDATE survey SET published_id=?,accepting=1,draft_version=draft_version+1,updated_at=? WHERE id=1 AND EXISTS(SELECT 1 FROM revisions WHERE id=?)",
        ).bind(id, now, id),
      ]);
      if (!results[0].meta.changes)
        throw new HttpError(409, "The draft changed. Reload and try again.");
      return json(await overview(env, user), 201);
    }
    if (p === "/api/admin/collection" && req.method === "POST") {
      const input = await body(req);
      if (typeof input.accepting !== "boolean")
        throw new HttpError(400, "Choose whether to accept responses.");
      const s = await state(env);
      if (!s.published_id) throw new HttpError(400, "Publish a survey first.");
      await env.DB.prepare("UPDATE survey SET accepting=? WHERE id=1")
        .bind(input.accepting ? 1 : 0)
        .run();
      return json(await overview(env, user));
    }
    if (p === "/api/admin/responses" && req.method === "GET") {
      const cursor = Number(
        url.searchParams.get("before") || Number.MAX_SAFE_INTEGER,
      );
      if (!Number.isSafeInteger(cursor) || cursor < 1)
        throw new HttpError(400, "Invalid page.");
      const r = await env.DB.prepare(
        "SELECT r.*,v.number,v.definition_json FROM responses r JOIN revisions v ON r.revision_id=v.id WHERE r.seq<? ORDER BY r.seq DESC LIMIT 51",
      )
        .bind(cursor)
        .all();
      const page = r.results.slice(0, 50);
      const total = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM responses",
      ).first();
      return json({
        total: total.n,
        responses: page.map((r) => ({
          ...r,
          definition: JSON.parse(r.definition_json),
          answers: JSON.parse(r.answers_json),
          definition_json: undefined,
          answers_json: undefined,
        })),
        next_cursor: r.results.length > 50 ? page.at(-1).seq : null,
      });
    }
    if (p === "/api/admin/export.csv" && req.method === "GET") {
      const stream = new ReadableStream({
        async start(controller) {
          const enc = new TextEncoder();
          controller.enqueue(
            enc.encode(
              "\uFEFFresponse_id,submitted_at_utc,revision,survey_title,question_order,question_id,question,question_type,required,answer\r\n",
            ),
          );
          let after = 0;
          try {
            for (;;) {
              const r = await env.DB.prepare(
                "SELECT r.*,v.number,v.definition_json FROM responses r JOIN revisions v ON r.revision_id=v.id WHERE r.seq>? ORDER BY r.seq LIMIT 100",
              )
                .bind(after)
                .all();
              if (!r.results.length) break;
              for (const row of r.results)
                controller.enqueue(enc.encode(csvRows(row)));
              after = r.results.at(-1).seq;
            }
            controller.close();
          } catch (e) {
            controller.error(e);
          }
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition":
            'attachment; filename="fieldwork-responses.csv"',
          "Cache-Control": "private, no-store",
        },
      });
    }
    throw new HttpError(404, "Not found.");
  }
  if (p.startsWith("/api/public")) {
    if (env.APP_MODE === "admin")
      throw new HttpError(404, "Open the public survey link to participate.");
    if (p === "/api/public/survey" && req.method === "GET") {
      const s = await state(env);
      if (!s.published_id || !s.accepting)
        return json({ status: s.published_id ? "paused" : "draft" });
      const revision = await env.DB.prepare(
        "SELECT * FROM revisions WHERE id=?",
      )
        .bind(s.published_id)
        .first();
      return json({
        status: "open",
        revision_id: revision.id,
        revision: revision.number,
        definition: JSON.parse(revision.definition_json),
      });
    }
    if (p === "/api/public/responses" && req.method === "POST") {
      writeGuard(req);
      if (!local) {
        if (!env.SUBMIT_LIMITER)
          throw new HttpError(
            503,
            "Response collection is temporarily unavailable.",
          );
        const ip = req.headers.get("CF-Connecting-IP") || "unknown";
        const { success } = await env.SUBMIT_LIMITER.limit({ key: ip });
        if (!success)
          throw new HttpError(429, "Please wait a minute before trying again.");
      }
      const input = await body(req);
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          input.id || "",
        ) ||
        typeof input.revision_id !== "string"
      )
        throw new HttpError(400, "Invalid response identifier.");
      const s = await state(env);
      if (!s.accepting || !s.published_id)
        throw new HttpError(
          409,
          "This survey is not currently accepting responses.",
        );
      const revision = await env.DB.prepare(
        "SELECT * FROM revisions WHERE id=?",
      )
        .bind(input.revision_id)
        .first();
      if (!revision)
        throw new HttpError(400, "This survey version does not exist.");
      const answers = validateAnswers(
          JSON.parse(revision.definition_json),
          input.answers,
          input.consented,
        ),
        serialized = JSON.stringify(answers);
      const r = await env.DB.prepare(
        "INSERT INTO responses(id,revision_id,answers_json,submitted_at) SELECT ?,?,?,? FROM survey WHERE id=1 AND accepting=1 AND published_id IS NOT NULL ON CONFLICT(id) DO NOTHING",
      )
        .bind(input.id, revision.id, serialized, new Date().toISOString())
        .run();
      if (!r.meta.changes) {
        const prior = await env.DB.prepare(
          "SELECT revision_id,answers_json FROM responses WHERE id=?",
        )
          .bind(input.id)
          .first();
        if (!prior)
          throw new HttpError(
            409,
            "This survey is not currently accepting responses.",
          );
        if (
          prior.revision_id !== revision.id ||
          prior.answers_json !== serialized
        )
          throw new HttpError(
            409,
            "This submission identifier is already in use. Reload to start again.",
          );
      }
      return json({ submitted: true }, r.meta.changes ? 201 : 200);
    }
    throw new HttpError(404, "Not found.");
  }
  if (p.startsWith("/api/")) throw new HttpError(404, "Not found.");
  if (p === "/admin" || p.startsWith("/admin/")) {
    if (!adminMode) throw new HttpError(404, "Not found.");
    // Shared-password mode serves a login shell. Every creator API still authenticates.
    // Access mode also authenticates before serving the shell.
    if (!local && !usesSharedPassword(env)) await authorize(req, env);
  }
  if (env.APP_MODE === "admin" && p === "/")
    return Response.redirect(url.origin + "/admin", 302);
  if (!["GET", "HEAD"].includes(req.method))
    throw new HttpError(405, "Method not allowed.");
  if (p === "/" || p === "/admin" || p.startsWith("/admin/")) {
    const a = new URL("/index.html", req.url);
    const r = await env.ASSETS.fetch(new Request(a, { method: req.method }));
    const copy = new Response(r.body, r);
    copy.headers.set("Cache-Control", "no-store");
    return copy;
  }
  if (p === "/index.html") throw new HttpError(404, "Not found.");
  return env.ASSETS.fetch(req);
}
export default {
  async fetch(req, env) {
    try {
      return secure(await handle(req, env));
    } catch (e) {
      if (e instanceof HttpError)
        return secure(json({ error: e.message, details: e.details }, e.status));
      console.error("Request failed", e?.name);
      return secure(
        json(
          {
            error: "Something could not be saved or loaded. Please try again.",
          },
          503,
        ),
      );
    }
  },
};
