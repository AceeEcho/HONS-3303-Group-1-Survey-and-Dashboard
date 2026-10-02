import test from "node:test";
import assert from "node:assert/strict";
import { mergeDraft } from "../client/draft-sync.js";
import worker from "../src/worker.js";
import { validateDefinition, validateAnswers, csvRows } from "../src/model.js";

const fixture = () => ({
  title: "Fixture",
  description: "",
  consent: "",
  questions: [
    {
      id: "first",
      type: "shorttext",
      label: "First",
      help: "",
      required: true,
    },
    {
      id: "second",
      type: "rating",
      label: "Second",
      help: "",
      required: false,
      max: 5,
      minLabel: "",
      maxLabel: "",
    },
  ],
});

test("a save acknowledges its own database snapshot without rereading a later edit", async () => {
  const draft = fixture();
  const saved = {
    id: 1,
    draft_version: 2,
    draft_json: JSON.stringify(draft),
    published_id: null,
  };
  const env = {
    APP_MODE: "local",
    ENVIRONMENT: "development",
    DB: {
      prepare(sql) {
        if (sql.startsWith("UPDATE survey")) {
          assert.match(sql, /RETURNING \*/);
          return { bind: () => ({ first: async () => saved }) };
        }
        if (sql.startsWith("SELECT id,number"))
          return { all: async () => ({ results: [] }) };
        if (sql.startsWith("SELECT COUNT"))
          return { first: async () => ({ n: 0 }) };
        throw new Error(
          "Draft state must not be reread after the successful write",
        );
      },
    },
  };
  const result = await worker.fetch(
    new Request("http://localhost/api/admin/survey", {
      method: "PUT",
      headers: {
        Cookie: "fieldwork_local=creator",
        Origin: "http://localhost",
        "X-Survey-Request": "1",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ draft, expected_version: 1 }),
    }),
    env,
  );
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.draft_version, 2);
  assert.deepEqual(body.draft, draft);
});
test("different fields and different question edits merge without data loss", () => {
  const base = fixture(),
    mine = fixture(),
    theirs = fixture();
  mine.title = "Local title";
  mine.questions[0].label = "Local question";
  theirs.description = "Remote description";
  theirs.questions[1].label = "Remote question";
  const result = mergeDraft(base, mine, theirs);
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.draft.title, mine.title);
  assert.equal(result.draft.description, theirs.description);
  assert.equal(result.draft.questions[0].label, mine.questions[0].label);
  assert.equal(result.draft.questions[1].label, theirs.questions[1].label);
  assert.deepEqual(base, fixture());
});
test("same-field edits, deletion against editing, type changes and incompatible ordering conflict", () => {
  const base = fixture(),
    mine = fixture(),
    theirs = fixture();
  mine.title = "Local";
  theirs.title = "Remote";
  let result = mergeDraft(base, mine, theirs);
  assert.deepEqual(result.conflicts, ["title"]);
  assert.equal(result.draft.title, "Local");
  mine.questions.splice(0, 1);
  theirs.questions[0].label = "Changed";
  result = mergeDraft(base, mine, theirs);
  assert.ok(result.conflicts.some((path) => path === "Question first"));
  const other = fixture();
  other.questions[0].type = "rating";
  result = mergeDraft(base, other, theirs);
  assert.ok(result.conflicts.includes("Question first.type"));
  base.questions.push({
    id: "third",
    type: "shorttext",
    label: "Third",
    help: "",
    required: false,
  });
  const a = structuredClone(base),
    b = structuredClone(base);
  a.questions.reverse();
  b.questions = [b.questions[1], b.questions[0], b.questions[2]];
  assert.ok(mergeDraft(base, a, b).conflicts.includes("Question order"));
});
test("independent insertions and unedited deletions merge; remote insert order is preserved", () => {
  const base = fixture(),
    mine = fixture(),
    theirs = fixture();
  theirs.questions.unshift({
    id: "added",
    type: "shorttext",
    label: "Added",
    help: "",
    required: false,
  });
  assert.equal(mergeDraft(base, mine, theirs).draft.questions[0].id, "added");
  mine.questions.push({
    id: "local",
    type: "shorttext",
    label: "Local",
    help: "",
    required: false,
  });
  const result = mergeDraft(base, mine, theirs);
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.draft.questions.length, 4);
  const deleted = fixture();
  deleted.questions.pop();
  assert.equal(mergeDraft(base, base, deleted).draft.questions.length, 1);
});
test("labeled scales accept zero, reject out-of-range values and export the published label", () => {
  const definition = {
    title: "Scale fixture",
    description: "",
    consent: "",
    questions: [
      {
        id: "mood",
        type: "scale",
        label: "Mood",
        help: "",
        required: true,
        start: 0,
        options: ["Low", "Neutral", "High"],
      },
    ],
  };
  const validated = validateDefinition(definition, true);
  assert.deepEqual(validateAnswers(validated, { mood: 0 }), { mood: 0 });
  for (const value of [-1, 3, "0", null])
    assert.throws(() => validateAnswers(validated, { mood: value }));
  for (const options of [["Only"], ["", "High"], ["Same", "Same"]]) {
    const invalid = structuredClone(definition);
    invalid.questions[0].options = options;
    assert.throws(() => validateDefinition(invalid, true));
  }
  const csv = csvRows({
    id: "response",
    submitted_at: "2026-10-02",
    number: 1,
    definition_json: JSON.stringify(validated),
    answers_json: '{"mood":0}',
  });
  assert.match(csv, /0 = Low/);
  const draft = structuredClone(definition);
  draft.title = "  In-progress ";
  draft.questions[0].options = ["A ", ""];
  assert.equal(validateDefinition(draft).title, draft.title);
  assert.equal(validateDefinition(draft).questions[0].options[0], "A ");
});
