PRAGMA foreign_keys = ON;
CREATE TABLE survey (
 id INTEGER PRIMARY KEY CHECK(id=1), draft_json TEXT NOT NULL,
 draft_version INTEGER NOT NULL DEFAULT 0, published_id TEXT,
 accepting INTEGER NOT NULL DEFAULT 0 CHECK(accepting IN(0,1)),
 updated_at TEXT NOT NULL
);
INSERT INTO survey(id,draft_json,updated_at) VALUES(1,'{"title":"","description":"","consent":"","questions":[]}',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TABLE revisions (
 id TEXT PRIMARY KEY, number INTEGER NOT NULL UNIQUE,
 definition_json TEXT NOT NULL, published_at TEXT NOT NULL
);
CREATE TABLE responses (
 seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
 revision_id TEXT NOT NULL REFERENCES revisions(id),
 answers_json TEXT NOT NULL, submitted_at TEXT NOT NULL
);
CREATE INDEX idx_responses_revision ON responses(revision_id,seq);
CREATE TRIGGER revisions_no_update BEFORE UPDATE ON revisions BEGIN SELECT RAISE(ABORT,'Published revisions are immutable'); END;
CREATE TRIGGER revisions_no_delete BEFORE DELETE ON revisions BEGIN SELECT RAISE(ABORT,'Published revisions are immutable'); END;
