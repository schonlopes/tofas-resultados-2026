PRAGMA foreign_keys = ON;
CREATE TABLE schools (
 id TEXT PRIMARY KEY, nre TEXT NOT NULL, name TEXT NOT NULL,
 public_approved INTEGER NOT NULL DEFAULT 0 CHECK(public_approved IN (0,1))
);
CREATE TABLE students (
 id TEXT PRIMARY KEY,
 school_id TEXT NOT NULL REFERENCES schools(id),
 name TEXT NOT NULL, grade TEXT NOT NULL
);
CREATE TABLE documents (
 id TEXT PRIMARY KEY,
 student_id TEXT NOT NULL REFERENCES students(id),
 kind TEXT NOT NULL CHECK(kind IN ('certificate','report')),
 level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 3),
 file_id TEXT NOT NULL,
 approved INTEGER NOT NULL DEFAULT 0 CHECK(approved IN (0,1)),
 source_id TEXT NOT NULL, source_row INTEGER NOT NULL,
 UNIQUE(student_id,kind,level)
);
CREATE TABLE grants (
 subject TEXT NOT NULL, scope TEXT NOT NULL CHECK(scope IN ('school','student')),
 target_id TEXT NOT NULL, expires INTEGER NOT NULL,
 PRIMARY KEY(subject,scope,target_id)
);
CREATE TABLE audit (
 id INTEGER PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL,
 target TEXT NOT NULL, at INTEGER NOT NULL
);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE INDEX student_school ON students(school_id,id);
CREATE INDEX doc_student ON documents(student_id);
CREATE INDEX audit_time ON audit(at);
CREATE INDEX rate_expiry ON rate_limits(expires);
