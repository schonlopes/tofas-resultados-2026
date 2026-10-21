CREATE TABLE ambassadors (
 id TEXT PRIMARY KEY,
 username TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL,
 salt TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1))
);
CREATE TABLE sessions (
 token_hash TEXT PRIMARY KEY,
 ambassador_id TEXT NOT NULL REFERENCES ambassadors(id) ON DELETE CASCADE,
 expires INTEGER NOT NULL
);
CREATE INDEX session_expiry ON sessions(expires);
