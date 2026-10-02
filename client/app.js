import "./style.css";
import QRCode from "qrcode";
import { mergeDraft } from "./draft-sync.js";
const app = document.querySelector("#app");
const escape = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const icons = {
  plus: "M12 5v14M5 12h14",
  list: "M8 6h12M8 12h12M8 18h12M3 6h.01M3 12h.01M3 18h.01",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  check: "m5 12 4 4L19 6",
  share:
    "M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8.6 10.5l6.8-4M8.6 13.5l6.8 4",
  text: "M4 5h16M12 5v15M8 20h8",
  radio:
    "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  box: "M4 4h16v16H4zM8 12l3 3 5-6",
  star: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  lock: "M6 10h12v11H6zM8 10V6a4 4 0 0 1 8 0v4",
  download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
  close: "m6 6 12 12M6 18 18 6",
  up: "m6 15 6-6 6 6",
  down: "m6 9 6 6 6-6",
  trash: "M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7",
  copy: "M8 8h13v13H8zM16 8V3H3v13h5",
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${(
    icons[name] || icons.list
  )
    .split("ZZZ")
    .map((d) => `<path d="${d}"/>`)
    .join("")}</svg>`;
const labels = {
  shorttext: "Short text",
  multiplechoice: "Multiple choice",
  checkbox: "Checkboxes",
  rating: "Rating scale",
  scale: "Labeled scale",
};
const typeIcons = {
  shorttext: "text",
  multiplechoice: "radio",
  checkbox: "box",
  rating: "star",
  scale: "list",
};
let state = null,
  draft = null,
  selected = null,
  tab = "build",
  dirty = false,
  busy = false,
  local = false,
  responses = [],
  nextCursor = null;

// Acknowledged server snapshot plus edit generation protects typing during saves.
let baseDraft = null,
  editGeneration = 0,
  saveTimer = null,
  savePromise = null;
let saveError = "",
  conflicts = [],
  polling = false;
const autosaveDelay = 650;
const syncInterval = 5000;
async function api(path, method = "GET", data) {
  const r = await fetch(path, {
    method,
    headers:
      method === "GET"
        ? {}
        : { "Content-Type": "application/json", "X-Survey-Request": "1" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const v = await r.json();
  if (!r.ok) {
    const e = new Error(v.error || "Please try again.");
    e.details = v.details;
    e.status = r.status;
    throw e;
  }
  return v;
}
function announce(message) {
  document.querySelector("#announcer").textContent = message;
}
function toast(message, error = false) {
  document.querySelector(".toast")?.remove();
  const d = document.createElement("div");
  d.className = "toast" + (error ? " error" : "");
  d.setAttribute("role", error ? "alert" : "status");
  d.textContent = message;
  document.body.append(d);
  setTimeout(() => d.remove(), 6000);
}
function brand() {
  return `<a class="brand" href="${location.pathname.startsWith("/admin") ? "/admin" : "/"}" aria-label="HONS 3303 home"><img class="tech-logo" src="/texas-tech-double-t.svg" alt="Texas Tech Double T" width="38" height="42"><span>HONS 3303</span></a>`;
}
function markDirty() {
  dirty = true;
  editGeneration++;
  saveError = "";
  updateSaveStatus();
  clearTimeout(saveTimer);
  if (!conflicts.length)
    saveTimer = setTimeout(() => saveDraft(), autosaveDelay);
}
function updateSaveStatus() {
  const element = document.querySelector("#save-state");
  if (element) {
    element.textContent = conflicts.length
      ? "Conflicting edits — review required"
      : saveError
        ? "Not saved — " + saveError
        : savePromise
          ? "Saving…"
          : dirty
            ? "Changes pending…"
            : "All changes saved";
    element.setAttribute("role", "status");
    element.setAttribute("aria-live", "polite");
  }
  const button = document.querySelector("#save");
  if (button) button.disabled = !dirty || !!savePromise || !!conflicts.length;
}
// Server updates must not steal focus, scroll position or the text selection.
function refreshBuilder() {
  const focused = document.activeElement;
  const id = focused?.id;
  const selection =
    typeof focused?.selectionStart === "number"
      ? [focused.selectionStart, focused.selectionEnd]
      : null;
  const scroll = [window.scrollX, window.scrollY];
  renderBuilder();
  const replacement = id && document.getElementById(id);
  replacement?.focus({ preventScroll: true });
  if (selection && replacement?.setSelectionRange)
    replacement.setSelectionRange(...selection);
  window.scrollTo(...scroll);
}
function showSyncNotice() {
  document.querySelector("#sync-notice")?.remove();
  if (!conflicts.length || tab !== "build") return;
  document.querySelector(".builder-toolbar").insertAdjacentHTML(
    "afterend",
    `
    <section id="sync-notice" class="sync-notice" role="alert">
      <h2>Conflicting edits</h2>
      <p>Another creator changed ${conflicts.length} of the same fields. Saving is paused. Your edits are retained in this window; unrelated changes have been merged.</p>
      <div class="sync-actions"><button id="download-draft" class="button secondary">Download my draft</button>
        <button id="load-latest" class="button secondary">Load latest version</button>
        <button id="keep-mine" class="button primary">Use my changes</button></div>
    </section>`,
  );
  document.querySelector("#download-draft").onclick = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "hons3303-draft.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  document.querySelector("#load-latest").onclick = async () => {
    if (
      !(await confirmDialog(
        "Load the latest draft?",
        "This replaces your unsaved edits in this window. Download your draft first if you need a copy.",
        "Load latest",
      ))
    )
      return;
    try {
      state = await api("/api/admin/survey");
      draft = structuredClone(state.draft);
      baseDraft = structuredClone(state.draft);
      conflicts = [];
      dirty = false;
      saveError = "";
      selected = null;
      renderAdmin();
    } catch (error) {
      toast(error.message, true);
    }
  };
  document.querySelector("#keep-mine").onclick = async () => {
    if (
      !(await confirmDialog(
        "Use your changes for the conflicting fields?",
        "Your values will replace the conflicting values. Other creators’ unrelated edits are retained.",
        "Use my changes",
      ))
    )
      return;
    conflicts = [];
    markDirty();
    refreshBuilder();
    await saveDraft(true);
  };
}
async function syncFromServer() {
  if (
    !state ||
    dirty ||
    savePromise ||
    busy ||
    conflicts.length ||
    polling ||
    document.hidden ||
    document.querySelector("dialog[open]")
  )
    return;
  polling = true;
  try {
    const next = await api("/api/admin/survey");
    // Recheck after the request: the creator may have started typing meanwhile.
    if (dirty || savePromise || conflicts.length || !state) return;
    if (next.draft_version !== state.draft_version) {
      const selectedId = draft.questions[selected]?.id;
      state = next;
      baseDraft = structuredClone(next.draft);
      draft = structuredClone(next.draft);
      selected = selectedId
        ? draft.questions.findIndex((q) => q.id === selectedId)
        : null;
      if (selected === -1) selected = null;
      if (tab === "build") refreshBuilder();
      else renderAdmin();
      announce("Draft updated from another creator");
    }
  } catch {
    /* A temporary connection failure must never discard local edits. */
  } finally {
    polling = false;
  }
}
setInterval(syncFromServer, syncInterval);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) syncFromServer();
});
window.addEventListener("online", () =>
  dirty ? saveDraft() : syncFromServer(),
);
window.addEventListener("beforeunload", (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
function status() {
  return !state.published_id
    ? "Unpublished"
    : state.accepting
      ? "Collecting responses"
      : "Collection paused";
}
function adminShell() {
  app.innerHTML = `<div class="studio"><aside class="rail">${brand()}<div class="rail-label">CLASS SURVEY</div><nav aria-label="Studio"><button data-tab="build" class="nav-item ${tab === "build" ? "active" : ""}">${icon("grid")}<span>Survey builder</span></button><button data-tab="responses" class="nav-item ${tab === "responses" ? "active" : ""}">${icon("list")}<span>Responses</span><span class="nav-count">${state.response_count}</span></button><button data-tab="share" class="nav-item ${tab === "share" ? "active" : ""}">${icon("share")}<span>Share & access</span></button></nav><div class="rail-bottom"><span class="private-icon">${icon("lock")}</span><strong>Private creator space</strong><p>Creator access is required to see your drafts and responses.</p><div class="identity">${escape(state.user.local ? "Local preview" : state.user.email)}</div></div></aside><div class="workspace"><header class="topbar"><div class="breadcrumb">Workspace <span>/</span> <strong>${tab === "build" ? "Survey builder" : tab === "responses" ? "Responses" : "Share & access"}</strong></div><span class="privacy-badge">${icon("lock")} Private</span></header><main id="main" class="main"><div class="page-heading"><div><div class="eyebrow">HONS 3303</div><h1>${tab === "build" ? "Survey creator" : tab === "responses" ? "Responses" : "Sharing and access"}</h1></div><div class="heading-side"><span class="status-pill ${state.accepting ? "live" : ""}">${state.accepting ? '<span class="status-dot"></span>' : ""}${status()}</span><p>${state.versions.length ? `Version ${state.versions[0].number} published` : "Your draft is private until you publish"}</p></div></div>${local ? '<div class="local-note">Local preview · Changes are saved to the local test database. This is not a live study.</div>' : ""}<div id="tab-content"></div></main><footer>HONS 3303 <span>Group 1 survey</span></footer></div></div>`;
  document.querySelectorAll("[data-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        tab = b.dataset.tab;
        renderAdmin();
      }),
  );
  appendSignOut();
}
function renderAdmin() {
  adminShell();
  if (tab === "build") renderBuilder();
  if (tab === "responses") renderResponses();
  if (tab === "share") renderShare();
}
function renderBuilder() {
  const q = selected === null ? null : draft.questions[selected];
  document.querySelector("#tab-content").innerHTML =
    `<div class="builder-toolbar"><div class="tab-title">Your survey <span class="small-pill">${draft.questions.length} question${draft.questions.length === 1 ? "" : "s"}</span></div><div class="toolbar-actions"><span id="save-state" class="save-state">${dirty ? "Unsaved changes" : "All changes saved"}</span><button class="button ghost" id="preview">${icon("eye")}<span>Preview</span></button><button class="button secondary" id="save" ${!dirty ? "disabled" : ""}>Save draft</button><button class="button primary" id="publish">Publish</button></div></div><div class="builder-grid"><section class="canvas" aria-label="Survey draft"><div class="intro-card"><div class="card-label">01 / STUDY DETAILS</div><label for="survey-title">Survey title</label><input id="survey-title" class="title-input" placeholder="Give your study a title" maxlength="160" value="${escape(draft.title)}"><label for="survey-description">Introduction <span>Optional</span></label><textarea id="survey-description" rows="2" maxlength="3000" placeholder="Tell participants what this study is about">${escape(draft.description)}</textarea><details class="consent-details" ${draft.consent ? "open" : ""}><summary>Study consent statement <span>Optional</span></summary><label class="sr-only" for="survey-consent">Study consent statement</label><textarea id="survey-consent" maxlength="3000" rows="3" placeholder="Add consent information if your study requires it">${escape(draft.consent)}</textarea><p class="help">When supplied, participants must agree before submitting. Add any required research approval, contact and data-use information here.</p></details></div><div class="section-label"><span>02 / QUESTIONS</span><span>${draft.questions.length} of 80</span></div><div class="question-list">${draft.questions.map((q, i) => `<button class="question-card ${selected === i ? "selected" : ""}" data-question="${i}" aria-expanded="${selected === i}" aria-controls="question-editor"><span class="question-number">${String(i + 1).padStart(2, "0")}</span><span class="question-summary"><strong>${escape(q.label || "Untitled question")}</strong><small>${labels[q.type]} <span>·</span> ${q.required ? "Required" : "Optional"}</small></span><span class="type-symbol">${icon(typeIcons[q.type])}</span></button>`).join("")}</div>${!draft.questions.length ? `<div class="empty-builder"><div class="empty-symbol">${icon("plus")}</div><h2>No questions yet</h2><p>Add a question to begin.</p><button class="button primary" id="add-first">${icon("plus")}Add first question</button></div>` : `<button class="add-question" id="add-question" ${draft.questions.length >= 80 ? "disabled" : ""}>${icon("plus")} Add a question</button>`}</section><aside class="inspector" id="question-editor" aria-label="Question settings">${
      q
        ? editorMarkup(q)
        : `<div class="inspector-header"><span class="card-label">QUESTION TYPES</span>${icon("grid")}</div><h2>Add a question</h2><div class="type-list">${Object.entries(
            labels,
          )
            .map(
              ([type, label]) =>
                `<button data-add="${type}"><span class="type-icon">${icon(typeIcons[type])}</span><span><strong>${label}</strong><small>${{ shorttext: "Free-text answer", multiplechoice: "One answer from a list", checkbox: "More than one answer", rating: "Numeric range", scale: "A label for each value" }[type]}</small></span>${icon("plus")}</button>`,
            )
            .join(
              "",
            )}</div><div class="inspector-note">${icon("lock")}<p>Published versions and responses are preserved.</p></div>`
    }</aside></div>`;
  const bind = (id, key) =>
    document.querySelector(id).addEventListener("input", (e) => {
      draft[key] = e.target.value;
      markDirty();
    });
  bind("#survey-title", "title");
  bind("#survey-description", "description");
  bind("#survey-consent", "consent");
  document.querySelector("#save").onclick = () => saveDraft(true);
  updateSaveStatus();
  showSyncNotice();
  document.querySelector("#publish").onclick = publish;
  document.querySelector("#preview").onclick = preview;
  document
    .querySelector("#add-first")
    ?.addEventListener("click", () => addQuestion("shorttext"));
  document
    .querySelector("#add-question")
    ?.addEventListener("click", () => addQuestion("shorttext"));
  document
    .querySelectorAll("[data-add]")
    .forEach((b) => (b.onclick = () => addQuestion(b.dataset.add)));
  document.querySelectorAll("[data-question]").forEach(
    (b) =>
      (b.onclick = () => {
        selected = Number(b.dataset.question);
        renderBuilder();
        document.querySelector("#q-label")?.focus();
      }),
  );
  if (q) bindEditor(q);
}
function editorMarkup(q) {
  return `<div class="inspector-header"><span class="card-label">QUESTION ${String(selected + 1).padStart(2, "0")}</span><button class="icon-button" id="close-editor" aria-label="Close question editor">${icon("close")}</button></div><h2>Question settings</h2><label for="q-type">Question type</label><select id="q-type">${Object.entries(
    labels,
  )
    .map(
      ([t, l]) =>
        `<option value="${t}" ${q.type === t ? "selected" : ""}>${l}</option>`,
    )
    .join(
      "",
    )}</select><label for="q-label">Question</label><textarea id="q-label" rows="3" maxlength="500" placeholder="Question text">${escape(q.label)}</textarea><label for="q-help">Supporting text <span>Optional</span></label><textarea id="q-help" rows="2" maxlength="1000" placeholder="Instructions for participants">${escape(q.help)}</textarea>${["multiplechoice", "checkbox"].includes(q.type) ? `<label for="q-options">Choices <span>One per line</span></label><textarea id="q-options" rows="5" placeholder="First choice&#10;Second choice">${escape(q.options.join("\n"))}</textarea><p class="help">2–30 distinct choices, up to 200 characters each.</p>` : ""}${
    q.type === "rating"
      ? `<label for="q-max">Scale</label><select id="q-max">${Array.from(
          { length: 8 },
          (_, i) => i + 3,
        )
          .map(
            (v) =>
              `<option value="${v}" ${q.max === v ? "selected" : ""}>1 to ${v}</option>`,
          )
          .join(
            "",
          )}</select><label for="q-min-label">Label for 1 <span>Optional</span></label><input id="q-min-label" value="${escape(q.minLabel)}" maxlength="80"><label for="q-max-label">Label for ${q.max} <span>Optional</span></label><input id="q-max-label" value="${escape(q.maxLabel)}" maxlength="80">`
      : ""
  }${q.type === "scale" ? `<label for="q-start">First value</label><select id="q-start"><option value="0" ${q.start === 0 ? "selected" : ""}>0</option><option value="1" ${q.start === 1 ? "selected" : ""}>1</option></select><label for="q-scale-labels">Scale labels <span>One per line</span></label><textarea id="q-scale-labels" rows="7" placeholder="First label&#10;Second label">${escape(q.options.join("\n"))}</textarea><p class="help">Values start at ${q.start} and increase by 1. Each value has its own label. Use 2–30 distinct labels.</p>` : ""}<label class="toggle-row" for="q-required"><span><strong>Required answer</strong><small>Participants can’t skip this question</small></span><input id="q-required" type="checkbox" role="switch" ${q.required ? "checked" : ""}></label><div class="editor-bottom"><div><button class="icon-button" id="move-up" aria-label="Move question up" ${selected === 0 ? "disabled" : ""}>${icon("up")}</button><button class="icon-button" id="move-down" aria-label="Move question down" ${selected === draft.questions.length - 1 ? "disabled" : ""}>${icon("down")}</button></div><button class="button danger ghost" id="delete-question">${icon("trash")}Delete</button></div>`;
}
function bindEditor(q) {
  document.querySelector("#close-editor").onclick = () => {
    selected = null;
    renderBuilder();
  };
  document.querySelector("#q-type").onchange = (e) => {
    q.type = e.target.value;
    if (["multiplechoice", "checkbox"].includes(q.type))
      q.options = q.options || ["", ""];
    if (q.type === "scale") {
      q.start ??= 0;
      q.options ||= ["", ""];
    }
    if (q.type === "rating") {
      q.max = q.max || 5;
      q.minLabel = q.minLabel || "";
      q.maxLabel = q.maxLabel || "";
    }
    markDirty();
    renderBuilder();
    document.querySelector("#q-type").focus();
  };
  const bind = (id, key, transform = (v) => v) =>
    document.querySelector(id)?.addEventListener("input", (e) => {
      q[key] = transform(e.target.value);
      markDirty();
      if (key === "label")
        document.querySelector(
          `[data-question="${selected}"] strong`,
        ).textContent = q.label || "Untitled question";
    });
  bind("#q-label", "label");
  bind("#q-help", "help");
  bind("#q-options", "options", (v) => v.split("\n"));
  bind("#q-scale-labels", "options", (v) => v.split("\n"));
  document.querySelector("#q-start")?.addEventListener("change", (event) => {
    q.start = Number(event.target.value);
    markDirty();
    refreshBuilder();
  });
  bind("#q-max", "max", Number);
  bind("#q-min-label", "minLabel");
  bind("#q-max-label", "maxLabel");
  document.querySelector("#q-required").onchange = (e) => {
    q.required = e.target.checked;
    markDirty();
    document.querySelector(`[data-question="${selected}"] small`).textContent =
      `${labels[q.type]} · ${q.required ? "Required" : "Optional"}`;
  };
  for (const [id, delta] of [
    ["#move-up", -1],
    ["#move-down", 1],
  ])
    document.querySelector(id).onclick = () => {
      const target = selected + delta;
      [draft.questions[selected], draft.questions[target]] = [
        draft.questions[target],
        draft.questions[selected],
      ];
      selected = target;
      markDirty();
      renderBuilder();
      announce(`Question moved to position ${selected + 1}`);
      document.querySelector(`[data-question="${selected}"]`).focus();
    };
  document.querySelector("#delete-question").onclick = async () => {
    if (
      !(await confirmDialog(
        "Delete this draft question?",
        "Existing published versions and their responses will stay intact.",
        "Delete question",
        true,
      ))
    )
      return;
    draft.questions.splice(selected, 1);
    selected = null;
    markDirty();
    renderBuilder();
    announce("Draft question deleted");
  };
}
function addQuestion(type) {
  if (draft.questions.length >= 80) return;
  draft.questions.push({
    id: crypto.randomUUID(),
    type,
    label: "",
    help: "",
    required: false,
    ...(["multiplechoice", "checkbox"].includes(type)
      ? { options: ["", ""] }
      : {}),
    ...(type === "rating" ? { max: 5, minLabel: "", maxLabel: "" } : {}),
    ...(type === "scale" ? { start: 0, options: ["", ""] } : {}),
  });
  selected = draft.questions.length - 1;
  markDirty();
  renderBuilder();
  document.querySelector("#q-label").focus();
}
async function saveDraft(manual = false) {
  clearTimeout(saveTimer);
  if (conflicts.length || busy || !state) return false;
  if (savePromise) {
    const saved = await savePromise;
    return saved && dirty ? saveDraft(manual) : saved;
  }
  if (!dirty) return true;
  savePromise = (async () => {
    let retries = 0;
    while (dirty && !conflicts.length && retries < 5) {
      const generation = editGeneration;
      const snapshot = structuredClone(draft);
      try {
        const next = await api("/api/admin/survey", "PUT", {
          draft: snapshot,
          expected_version: state.draft_version,
        });
        state = next;
        baseDraft = structuredClone(next.draft);
        saveError = "";
        // New keystrokes entered during this request remain pending for the next save.
        if (generation === editGeneration) dirty = false;
      } catch (error) {
        if (error.status === 409) {
          const remote = await api("/api/admin/survey");
          const selectedId = draft.questions[selected]?.id;
          const merged = mergeDraft(baseDraft, draft, remote.draft);
          state = remote;
          baseDraft = structuredClone(remote.draft);
          draft = merged.draft;
          selected = selectedId
            ? draft.questions.findIndex((q) => q.id === selectedId)
            : null;
          if (selected === -1) selected = null;
          conflicts = merged.conflicts;
          editGeneration++;
          retries++;
          dirty = JSON.stringify(draft) !== JSON.stringify(baseDraft);
          if (tab === "build") refreshBuilder();
          if (conflicts.length) return false;
          continue;
        }
        throw error;
      }
    }
    if (dirty) throw new Error("Other edits are arriving. Try saving again.");
    if (manual) toast("Draft saved");
    return true;
  })()
    .catch((error) => {
      saveError = error.message;
      if (manual) toast(error.message, true);
      // Invalid drafts need editing; connection errors can retry without erasing text.
      if (!error.status || error.status >= 500)
        saveTimer = setTimeout(() => saveDraft(), 3000);
      return false;
    })
    .finally(() => {
      savePromise = null;
      updateSaveStatus();
    });
  updateSaveStatus();
  return savePromise;
}
async function publish() {
  if (busy || conflicts.length) return;
  if ((dirty || savePromise) && !(await saveDraft())) return;
  if (
    !(await confirmDialog(
      "Publish this version?",
      `Your ${draft.questions.length} question${draft.questions.length === 1 ? "" : "s"} will be available on the public survey link. Future edits stay in draft until you publish again.`,
      "Publish survey",
    ))
  )
    return;
  busy = true;
  try {
    state = await api("/api/admin/publish", "POST", {
      expected_version: state.draft_version,
    });
    draft = structuredClone(state.draft);
    baseDraft = structuredClone(state.draft);
    dirty = false;
    renderAdmin();
    toast(`Version ${state.versions[0].number} is published`);
  } catch (e) {
    toast(e.message, true);
  } finally {
    busy = false;
  }
}
function confirmDialog(title, text, button, danger = false) {
  return new Promise((resolve) => {
    const d = document.createElement("dialog");
    d.className = "confirm-dialog";
    d.innerHTML = `<form method="dialog"><div class="eyebrow">HONS 3303</div><h2>${escape(title)}</h2><p>${escape(text)}</p><div class="dialog-actions"><button class="button secondary" value="cancel">Cancel</button><button class="button ${danger ? "danger-fill" : "primary"}" value="confirm">${escape(button)}</button></div></form>`;
    document.body.append(d);
    d.onclose = () => {
      const value = d.returnValue === "confirm";
      d.remove();
      resolve(value);
    };
    d.showModal();
  });
}
async function renderResponses(append = false) {
  const el = document.querySelector("#tab-content");
  if (!append)
    el.innerHTML =
      '<div class="loading" aria-busy="true">Loading responses…</div>';
  try {
    const data = await api(
      "/api/admin/responses" +
        (append && nextCursor ? "?before=" + nextCursor : ""),
    );
    responses = append ? [...responses, ...data.responses] : data.responses;
    nextCursor = data.next_cursor;
    state.response_count = data.total;
    const navCount = document.querySelector(".nav-count");
    if (navCount) navCount.textContent = data.total;
    if (tab !== "responses") return;
    el.innerHTML = `<div class="builder-toolbar"><div class="tab-title">All responses <span class="small-pill">${state.response_count}</span></div><a class="button secondary" href="/api/admin/export.csv">${icon("download")}Export CSV</a></div><div class="response-note">Answers stay paired with the exact questions and choices each participant saw.</div>${responses.length ? `<div class="response-list">${responses.map((r, i) => `<details class="response-card"><summary><span class="response-index">${String(state.response_count - i).padStart(2, "0")}</span><span><strong>Anonymous response</strong><small>${escape(new Date(r.submitted_at).toLocaleString())}</small></span><span class="small-pill">Version ${r.number}</span>${icon("down")}</summary><div class="response-detail"><p class="help">Response ${escape(r.id)}</p><h3>${escape(r.definition.title)}</h3><dl>${r.definition.questions.map((q) => `<dt>${escape(q.label)} <span>${labels[q.type]}</span></dt><dd>${r.answers[q.id] === null || (Array.isArray(r.answers[q.id]) && !r.answers[q.id].length) ? '<span class="muted">Not answered</span>' : escape(Array.isArray(r.answers[q.id]) ? r.answers[q.id].join(" · ") : q.type === "scale" ? `${r.answers[q.id]} = ${q.options[r.answers[q.id] - q.start]}` : r.answers[q.id])}</dd>`).join("")}</dl></div></details>`).join("")}</div>${nextCursor ? '<button id="load-more" class="button secondary">Load more responses</button>' : ""}` : `<div class="empty-panel"><span class="empty-symbol">${icon("list")}</span><h2>No responses yet</h2><p>${state.published_id ? "Share the published survey to collect responses." : "Publish your survey when it’s ready. Responses will appear here."}</p><button id="go-share" class="button secondary">${state.published_id ? "View sharing options" : "Back to builder"}</button></div>`}`;
    document
      .querySelector("#load-more")
      ?.addEventListener("click", () => renderResponses(true));
    document.querySelector("#go-share")?.addEventListener("click", () => {
      tab = state.published_id ? "share" : "build";
      renderAdmin();
    });
  } catch (e) {
    el.innerHTML = `<div class="empty-panel"><h2>Responses couldn’t load</h2><p>${escape(e.message)}</p><button id="retry" class="button secondary">Try again</button></div>`;
    document.querySelector("#retry").onclick = () => renderResponses();
  }
}
async function renderShare() {
  const url = state.public_url;
  document.querySelector("#tab-content").innerHTML =
    `<div class="share-grid"><section class="share-card"><span class="card-label">PARTICIPANT LINK</span><h2>Public survey link</h2><p>Anyone with the public link can respond in their browser. No account needed.</p>${state.published_id && url ? `<label for="public-url">${local ? "Local test link" : "Public survey link"}</label><div class="copy-input"><input id="public-url" readonly value="${escape(url)}"><button class="icon-button" id="copy-link" aria-label="Copy survey link">${icon("copy")}</button></div><div class="qr-area"><canvas id="qr" aria-label="QR code for the survey link"></canvas><div><strong>Survey QR code</strong><p>${local ? "This preview QR works only on the computer running the local server." : "Download this code for posters, handouts or slides."}</p><button id="download-qr" class="button secondary">${icon("download")}Save QR code</button></div></div><a class="button secondary" href="${escape(url)}" target="_blank" rel="noopener">Open survey</a>` : `<div class="share-placeholder">${icon("share")}<strong>${state.published_id ? "Add the public URL during deployment" : "Survey not published"}</strong><p>${state.published_id ? "Sharing activates once the public Worker address is configured." : "Add your questions and publish a version to activate sharing."}</p></div>`}</section><div><section class="access-card"><span class="card-label">CREATOR ACCESS</span><h2>Creator access</h2><p>Drafts, individual responses and exports require creator access.</p><div class="access-row">${icon("lock")}<span><strong>${local ? "Local preview account" : escape(state.user.email)}</strong><small>Creator</small></span></div><p class="help">Ask the workspace owner to update creator access. Anyone with an allowed creator password can edit the study and view all responses.</p></section><section class="access-card collection-card"><span class="card-label">RESPONSE COLLECTION</span><h3>${status()}</h3><p>${state.accepting ? "Pause collection whenever you need to. Existing responses stay available." : "Publishing opens collection. A paused study keeps all its existing responses."}</p>${state.published_id ? `<button id="toggle-collection" class="button secondary">${state.accepting ? "Pause collection" : "Resume collection"}</button>` : ""}</section></div></div>`;
  if (state.published_id && url) {
    await QRCode.toCanvas(document.querySelector("#qr"), url, {
      width: 160,
      margin: 2,
      color: { dark: "#202124", light: "#ffffff" },
    });
    document.querySelector("#copy-link").onclick = async () => {
      try {
        await navigator.clipboard.writeText(url);
        toast("Survey link copied");
      } catch {
        document.querySelector("#public-url").select();
        toast("Select and copy the survey link");
      }
    };
    document.querySelector("#download-qr").onclick = () => {
      const a = document.createElement("a");
      a.download = "hons3303-survey-qr.png";
      a.href = document.querySelector("#qr").toDataURL();
      a.click();
    };
  }
  document
    .querySelector("#toggle-collection")
    ?.addEventListener("click", async () => {
      try {
        state = await api("/api/admin/collection", "POST", {
          accepting: !state.accepting,
        });
        renderAdmin();
        toast(state.accepting ? "Collection resumed" : "Collection paused");
      } catch (e) {
        toast(e.message, true);
      }
    });
}
function questionMarkup(q, i) {
  const id = "answer-" + q.id;
  return `<fieldset class="answer-card" data-answer="${escape(q.id)}"><legend><span class="answer-index">${String(i + 1).padStart(2, "0")}</span><span>${escape(q.label || "Untitled question")}<small>${q.required ? "Required" : "Optional"}</small></span></legend>${q.help ? `<p class="question-help" id="help-${escape(q.id)}">${escape(q.help)}</p>` : ""}${q.type === "shorttext" ? `<label for="${id}" class="sr-only">${escape(q.label || "Untitled question")}</label><textarea id="${id}" name="${escape(q.id)}" rows="3" maxlength="4000" ${q.required ? "required" : ""} placeholder="Your answer" aria-describedby="error-${escape(q.id)}${q.help ? " help-" + escape(q.id) : ""}"></textarea>` : ""}${["multiplechoice", "checkbox"].includes(q.type) ? `<div class="choice-list">${q.options.map((o, j) => `<label class="choice"><input type="${q.type === "multiplechoice" ? "radio" : "checkbox"}" name="${escape(q.id)}" value="${escape(o)}" id="${id}-${j}"><span>${escape(o || "Untitled choice")}</span></label>`).join("")}</div>` : ""}${q.type === "scale" ? `<div class="choice-list labeled-scale">${q.options.map((label, index) => `<label class="choice"><input type="radio" name="${escape(q.id)}" value="${q.start + index}" aria-describedby="error-${escape(q.id)}"><span><strong>${q.start + index}</strong> = ${escape(label)}</span></label>`).join("")}</div>` : ""}${q.type === "rating" ? `<div class="rating-list">${Array.from({ length: q.max }, (_, j) => `<label><input type="radio" name="${escape(q.id)}" value="${j + 1}"><span>${j + 1}</span></label>`).join("")}</div><div class="rating-labels"><span>${escape(q.minLabel)}</span><span>${escape(q.maxLabel)}</span></div>` : ""}<p class="field-error" id="error-${escape(q.id)}" role="alert"></p></fieldset>`;
}
function formMarkup(def, previewMode = false) {
  return `<div class="respondent-heading"><div class="eyebrow">${previewMode ? "PARTICIPANT PREVIEW" : "AN INVITATION TO SHARE"}</div><h1>${escape(def.title || "Untitled survey")}</h1>${def.description ? `<p class="study-intro">${escape(def.description)}</p>` : ""}<div class="study-meta"><span>${def.questions.length} question${def.questions.length === 1 ? "" : "s"}</span><span>No account needed</span></div></div><form id="survey-form" novalidate><div class="survey-progress"><span id="progress-label">0 of ${def.questions.length} answered</span><progress id="form-progress" max="${def.questions.length || 1}" value="0" aria-label="Questions answered"></progress></div>${def.questions.map(questionMarkup).join("")}${def.consent ? `<section class="consent-card"><h2>Before you submit</h2><p>${escape(def.consent)}</p><label class="choice"><input type="checkbox" name="_consented" id="consented"><span>I’ve read this information and agree to participate</span></label><p id="consent-error" class="field-error" role="alert"></p></section>` : ""}<div id="form-error" class="form-error" role="alert"></div><div class="submit-bar"><div><strong>Share at your own pace.</strong><p>Only questions marked required need an answer.</p></div><button class="button primary large" type="submit">${previewMode ? "Check preview" : "Send response"}</button></div><p class="privacy-footnote">Anonymous by default. This form does not ask you to sign in or save your IP address in responses. Avoid identifying details in your answers unless you intend to share them. Hosting providers may process technical request data.</p></form>`;
}
function readAnswers(form, def) {
  const fd = new FormData(form),
    answers = {};
  for (const q of def.questions) {
    const v = fd.get(q.id);
    answers[q.id] =
      q.type === "checkbox"
        ? fd.getAll(q.id)
        : ["rating", "scale"].includes(q.type)
          ? v
            ? Number(v)
            : null
          : v || null;
  }
  return answers;
}
function bindForm(def, revisionId, previewMode = false) {
  const form = document.querySelector("#survey-form"),
    id = crypto.randomUUID();
  let sending = false;
  form.addEventListener("input", () => {
    const answers = readAnswers(form, def);
    const count = Object.values(answers).filter((v) =>
      Array.isArray(v)
        ? v.length
        : typeof v === "string"
          ? v.trim()
          : v !== null,
    ).length;
    document.querySelector("#form-progress").value = count;
    document.querySelector("#progress-label").textContent =
      `${count} of ${def.questions.length} answered`;
  });
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (sending) return;
    document
      .querySelectorAll(".field-error")
      .forEach((el) => (el.textContent = ""));
    document
      .querySelectorAll("[aria-invalid]")
      .forEach((el) => el.removeAttribute("aria-invalid"));
    document.querySelector("#form-error").textContent = "";
    const answers = readAnswers(form, def),
      errors = {};
    for (const q of def.questions) {
      const v = answers[q.id];
      if (
        q.required &&
        (v === null ||
          (typeof v === "string" && !v.trim()) ||
          (Array.isArray(v) && !v.length))
      )
        errors[q.id] = "Please answer this question.";
    }
    const consented = !!document.querySelector("#consented")?.checked;
    if (def.consent && !consented) {
      document.querySelector("#consent-error").textContent =
        "Please agree before submitting.";
      if (!Object.keys(errors).length)
        document.querySelector("#consented").focus();
    }
    if (Object.keys(errors).length) {
      showErrors(errors);
      return;
    }
    if (def.consent && !consented) return;
    if (previewMode) {
      document.querySelector("#form-error").textContent =
        "Preview checked. No response was saved.";
      announce("Preview checked. No response was saved.");
      return;
    }
    sending = true;
    const button = form.querySelector("[type=submit]");
    button.disabled = true;
    button.textContent = "Sending…";
    try {
      await api("/api/public/responses", "POST", {
        id,
        revision_id: revisionId,
        answers,
        consented,
      });
      document.querySelector("#respondent-content").innerHTML =
        `<div class="success-screen"><div class="success-mark">${icon("check")}</div><div class="eyebrow">RESPONSE RECEIVED</div><h1>Thank you for<br><em>your perspective.</em></h1><p>Your response has been saved.<br>You can close this page whenever you’re ready.</p></div>`;
      document.querySelector(".success-screen").tabIndex = -1;
      document.querySelector(".success-screen").focus();
    } catch (err) {
      document.querySelector("#form-error").textContent = err.message;
      if (err.details) showErrors(err.details);
      else
        document
          .querySelector("#form-error")
          .scrollIntoView({ block: "center" });
      button.disabled = false;
      button.textContent = "Send response";
    } finally {
      sending = false;
    }
  };
}
function showErrors(errors) {
  let first;
  for (const [id, message] of Object.entries(errors)) {
    const area = document.getElementById("error-" + id);
    if (area) {
      area.textContent = message;
      const field = area.closest("fieldset").querySelector("input,textarea");
      field?.setAttribute("aria-invalid", "true");
      field?.setAttribute("aria-describedby", "error-" + id);
      first ??= field;
    }
  }
  first?.focus();
}
function preview() {
  const d = document.createElement("dialog");
  d.className = "preview-dialog";
  d.innerHTML = `<div class="preview-toolbar"><strong>Participant preview</strong><span>Nothing here is submitted</span><button class="icon-button" id="close-preview" aria-label="Close preview">${icon("close")}</button></div><div class="preview-content">${formMarkup(draft, true)}</div>`;
  document.body.append(d);
  d.onclose = () => d.remove();
  d.showModal();
  document.querySelector("#close-preview").onclick = () => d.close();
  bindForm(draft, null, true);
}
async function respondent() {
  app.innerHTML = `<div class="respondent-page"><header class="respondent-header">${brand()}<span>Research, one perspective at a time</span></header><main id="main"><div id="respondent-content" class="respondent-content"><div class="loading" aria-busy="true">Loading survey…</div></div></main><footer>HONS 3303 <span>Class survey</span></footer></div>`;
  try {
    const data = await api("/api/public/survey");
    const el = document.querySelector("#respondent-content");
    if (data.status !== "open") {
      el.innerHTML = `<div class="unavailable"><span class="empty-symbol">${icon(data.status === "paused" ? "lock" : "text")}</span><div class="eyebrow">${data.status === "paused" ? "COLLECTION PAUSED" : "A STUDY IN THE MAKING"}</div><h1>${data.status === "paused" ? "Taking a pause." : "Good questions<br>take shape here."}</h1><p>${data.status === "paused" ? "This survey isn’t accepting responses right now. Please check with the person who shared it." : "This survey hasn’t been published yet. Please come back when the researcher shares the study."}</p></div>`;
      return;
    }
    document.title = data.definition.title + " · HONS 3303";
    el.innerHTML = formMarkup(data.definition);
    bindForm(data.definition, data.revision_id);
  } catch (e) {
    document.querySelector("#respondent-content").innerHTML =
      `<div class="unavailable"><h1>We couldn’t load this survey.</h1><p>${escape(e.message)}</p><button id="retry" class="button secondary">Try again</button></div>`;
    document.querySelector("#retry").onclick = respondent;
  }
}
function renderSignIn(info, error) {
  const sharedPassword = info.authentication === "shared-password";
  app.innerHTML = `<main id="main" class="sign-in">
    ${brand()}<span class="empty-symbol">${icon("lock")}</span>
    <div class="eyebrow">CREATOR WORKSPACE</div>
    <h1>${local ? "Local survey preview" : "Creator sign-in"}</h1>
    <p>${
      local
        ? "Explore the studio using an isolated local database."
        : sharedPassword
          ? "Enter one of the email addresses shared with your group as your password."
          : escape(error.message)
    }</p>
    ${
      local
        ? '<button id="local-signin" class="button primary large">Open local studio</button>'
        : sharedPassword
          ? `<form id="creator-signin" class="creator-signin">
        <label for="creator-password">Creator password</label>
        <input id="creator-password" type="password" autocomplete="current-password"
          required maxlength="254" aria-describedby="signin-error">
        <p id="signin-error" class="form-error" role="alert"></p>
        <button class="button primary large" type="submit">Open creator dashboard</button>
      </form>`
          : '<button id="reload" class="button secondary">Try sign-in again</button>'
    }
  </main>`;
  document
    .querySelector("#local-signin")
    ?.addEventListener("click", async () => {
      try {
        await api("/api/dev/session", "POST", {});
        await init();
      } catch (err) {
        toast(err.message, true);
      }
    });
  document
    .querySelector("#reload")
    ?.addEventListener("click", () => location.reload());
  document
    .querySelector("#creator-signin")
    ?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector("button");
      const password = form.querySelector("input");
      const errorMessage = form.querySelector("#signin-error");
      button.disabled = true;
      button.textContent = "Opening…";
      errorMessage.textContent = "";
      try {
        await api("/api/auth/login", "POST", { password: password.value });
        password.value = "";
        await init();
      } catch (err) {
        errorMessage.textContent = err.message;
        password.setAttribute("aria-invalid", "true");
        password.focus();
        button.disabled = false;
        button.textContent = "Open creator dashboard";
      }
    });
}

function appendSignOut() {
  if (state.user.authentication !== "shared-password") return;
  const signOut = document.createElement("button");
  signOut.className = "button secondary";
  signOut.textContent = "Sign out";
  document.querySelector(".topbar").append(signOut);
  signOut.onclick = async () => {
    if (dirty && !confirm("You have unsaved changes. Sign out anyway?")) return;
    try {
      await api("/api/auth/logout", "POST", {});
      dirty = false;
      clearTimeout(saveTimer);
      conflicts = [];
      saveError = "";
      state = null;
      draft = null;
      selected = null;
      tab = "build";
      await init();
    } catch (err) {
      toast(err.message, true);
    }
  };
}

async function init() {
  try {
    const info = await api("/api/environment");
    local = info.mode === "local";
    if (!location.pathname.startsWith("/admin")) return respondent();
    if (info.authentication === "shared-password") {
      const session = await api("/api/auth/session");
      if (!session.authenticated) return renderSignIn(info);
    }
    try {
      state = await api("/api/admin/survey");
      draft = structuredClone(state.draft);
      baseDraft = structuredClone(state.draft);
      renderAdmin();
    } catch (error) {
      renderSignIn(info, error);
    }
  } catch (error) {
    app.innerHTML = `<main id="main" class="unavailable"><h1>HONS 3303 is unavailable</h1>
      <p>${escape(error.message)}</p><button id="reload" class="button secondary">Try again</button></main>`;
    document.querySelector("#reload").onclick = () => location.reload();
  }
}
init();
