import { test, expect } from "@playwright/test";
test.describe.configure({ mode: "serial" });
test("desktop/mobile authoring, survey submission, response inspection and reduced motion", async ({
  page,
  context,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1040 });
  await page.goto("/admin");
  await expect(
    page
      .getByRole("button", { name: "Open local studio" })
      .or(page.getByRole("heading", { name: "No questions yet" })),
  ).toBeVisible();
  if (await page.getByRole("button", { name: "Open local studio" }).isVisible())
    await page.getByRole("button", { name: "Open local studio" }).click();
  await expect(
    page.getByRole("heading", { name: "No questions yet" }),
  ).toBeVisible();
  await page.screenshot({ path: "docs/studio-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "docs/studio-mobile.png", fullPage: true });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Add first question" }).click();
  await page.getByLabel("Question", { exact: true }).fill("QA-only question");
  await page.getByRole("switch", { name: "Required answer" }).check();
  await page
    .getByLabel("Survey title", { exact: true })
    .fill("Browser QA fixture");
  await expect(page.locator("#save-state")).toHaveText("All changes saved");
  await page.reload();
  await expect(
    page.getByText("QA-only question", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page
    .getByRole("button", { name: "Publish survey", exact: true })
    .click();
  await expect(page.locator('.toast[role="status"]')).toContainText(
    "published",
  );
  await page.getByRole("button", { name: "Share & access" }).click();
  await expect(page.locator("#qr")).toBeVisible();
  const respondent = await context.newPage();
  await respondent.goto("/");
  await expect(
    respondent.getByRole("heading", { name: "Browser QA fixture" }),
  ).toBeVisible();
  await respondent.getByRole("button", { name: "Send response" }).click();
  await expect(
    respondent.getByText("Please answer this question."),
  ).toBeVisible();
  await respondent
    .getByRole("textbox", { name: "QA-only question" })
    .fill("Browser fixture answer");
  await respondent.getByRole("button", { name: "Send response" }).click();
  await expect(
    respondent.getByRole("heading", {
      name: "Thank you for your perspective.",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Responses" }).click();
  await page.getByText("Anonymous response", { exact: true }).click();
  await expect(
    page.getByText("Browser fixture answer", { exact: true }),
  ).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Survey builder" }).click();
  const duration = await page
    .locator(".question-card")
    .evaluate((el) => getComputedStyle(el).animationDuration);
  expect(duration).toBe("0s");
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  expect(errors).toEqual([]);
});

test("labeled scale autosaves, reloads and submits zero with its original label", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "fieldwork_local", value: "creator", url: "http://127.0.0.1:8787" },
  ]);
  await page.goto("/admin");
  await page.locator('[data-add="scale"]').click();
  await page
    .getByLabel("Question", { exact: true })
    .fill("QA labeled mood scale");
  await page
    .getByLabel("Scale labels", { exact: false })
    .fill("Very sad\nNeutral\nVery happy");
  await page.getByRole("switch", { name: "Required answer" }).check();
  await expect(page.locator("#save-state")).toHaveText("All changes saved");
  await page.reload();
  await page.getByText("QA labeled mood scale", { exact: true }).click();
  await expect(page.getByLabel("Scale labels", { exact: false })).toHaveValue(
    "Very sad\nNeutral\nVery happy",
  );
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page
    .getByRole("button", { name: "Publish survey", exact: true })
    .click();
  await expect(page.locator('.toast[role="status"]')).toContainText(
    "published",
  );
  const respondent = await context.newPage();
  await respondent.setViewportSize({ width: 390, height: 844 });
  await respondent.goto("/");
  await respondent
    .getByRole("textbox", { name: "QA-only question" })
    .fill("Scale QA response");
  await respondent
    .getByRole("radio", { name: "0 = Very sad", exact: true })
    .check();
  await respondent.screenshot({
    path: "docs/labeled-scale-mobile.png",
    fullPage: true,
  });
  await respondent.getByRole("button", { name: "Send response" }).click();
  await expect(
    respondent.getByRole("heading", {
      name: "Thank you for your perspective.",
    }),
  ).toBeVisible();
  const data = await (await page.request.get("/api/admin/responses")).json();
  const latest = data.responses[0];
  const scale = latest.definition.questions.find((q) => q.type === "scale");
  expect(latest.answers[scale.id]).toBe(0);
  const csv = await (await page.request.get("/api/admin/export.csv")).text();
  expect(csv).toContain("0 = Very sad");
  // A later draft edit must not relabel an already collected response.
  await page
    .getByLabel("Scale labels", { exact: false })
    .fill("Changed low label\nNeutral\nVery happy");
  await expect(page.locator("#save-state")).toHaveText("All changes saved");
  expect(
    (
      await (await page.request.get("/api/admin/responses")).json()
    ).responses[0].definition.questions.find((q) => q.type === "scale")
      .options[0],
  ).toBe("Very sad");
});

test("concurrent editors merge separate fields and require review for overlapping fields", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "fieldwork_local", value: "creator", url: "http://127.0.0.1:8787" },
  ]);
  const second = await context.newPage();
  await Promise.all([page.goto("/admin"), second.goto("/admin")]);
  await expect(page.getByLabel("Survey title", { exact: true })).toBeVisible();
  await expect(
    second.getByLabel("Survey title", { exact: true }),
  ).toBeVisible();
  await Promise.all([
    page
      .getByLabel("Survey title", { exact: true })
      .fill("Concurrent title fixture"),
    second
      .getByLabel("Introduction", { exact: false })
      .fill("Independent introduction fixture"),
  ]);
  await expect(page.locator("#save-state")).toHaveText("All changes saved");
  await expect(second.locator("#save-state")).toHaveText("All changes saved");
  const stored = await (await page.request.get("/api/admin/survey")).json();
  expect(stored.draft.title).toBe("Concurrent title fixture");
  expect(stored.draft.description).toBe("Independent introduction fixture");
  // A clean editor picks up another creator's saved draft without reloading.
  await expect(page.getByLabel("Introduction", { exact: false })).toHaveValue(
    "Independent introduction fixture",
    { timeout: 10000 },
  );
  await Promise.all([page.reload(), second.reload()]);
  await expect(page.locator("#save-state")).toHaveText("All changes saved");
  await expect(second.locator("#save-state")).toHaveText("All changes saved");
  await Promise.all([
    page.getByLabel("Survey title", { exact: true }).fill("Creator A title"),
    second.getByLabel("Survey title", { exact: true }).fill("Creator B title"),
  ]);
  await expect
    .poll(
      async () =>
        (await page.locator("#sync-notice").count()) +
        (await second.locator("#sync-notice").count()),
    )
    .toBe(1);
  const conflicted = (await page.locator("#sync-notice").count())
    ? page
    : second;
  const localTitle = await conflicted
    .getByLabel("Survey title", { exact: true })
    .inputValue();
  const savedTitle = (
    await (await page.request.get("/api/admin/survey")).json()
  ).draft.title;
  expect(savedTitle).not.toBe(localTitle);
  await conflicted.screenshot({
    path: "docs/creator-conflict-desktop.png",
    fullPage: true,
  });
  await conflicted
    .getByRole("button", { name: "Use my changes", exact: true })
    .click();
  await conflicted
    .getByRole("button", { name: "Use my changes", exact: true })
    .last()
    .click();
  await expect(conflicted.locator("#sync-notice")).toHaveCount(0);
  await expect(conflicted.locator("#save-state")).toHaveText(
    "All changes saved",
  );
  expect(
    (await (await page.request.get("/api/admin/survey")).json()).draft.title,
  ).toBe(localTitle);
});

test("typing while an autosave is in flight preserves the newer draft and focus", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "fieldwork_local", value: "creator", url: "http://127.0.0.1:8787" },
  ]);
  await page.goto("/admin");
  let unblock;
  const gate = new Promise((resolve) => {
    unblock = resolve;
  });
  let intercepted;
  const started = new Promise((resolve) => {
    intercepted = resolve;
  });
  await page.route("**/api/admin/survey", async (route) => {
    if (route.request().method() === "PUT") {
      intercepted();
      await gate;
    }
    await route.continue();
  });
  const title = page.getByLabel("Survey title", { exact: true });
  await title.fill("First in-flight title");
  await started;
  await title.fill("Newer in-flight title");
  unblock();
  await expect(page.locator("#save-state")).toHaveText("All changes saved");
  await expect(title).toHaveValue("Newer in-flight title");
  await expect(title).toBeFocused();
  expect(
    (await (await page.request.get("/api/admin/survey")).json()).draft.title,
  ).toBe("Newer in-flight title");
});
