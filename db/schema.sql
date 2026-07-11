CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  google_uid TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  UNIQUE (user_id, name)
);

CREATE INDEX idx_subjects_user_id ON subjects(user_id);

CREATE TABLE study_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  subject_id INTEGER NOT NULL REFERENCES subjects(id),
  studied_on TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  memo TEXT,
  recall_score INTEGER,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  CHECK (recall_score IS NULL OR recall_score BETWEEN 1 AND 5)
);

CREATE INDEX idx_study_logs_user_studied_on ON study_logs(user_id, studied_on);