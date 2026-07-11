ALTER TABLE subjects ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
UPDATE subjects SET position = id;
