CREATE TABLE IF NOT EXISTS user_errors (
  id TEXT PRIMARY KEY,
  error_type TEXT NOT NULL,
  error_message TEXT NOT NULL,
  file_path TEXT NOT NULL,
  line_number INTEGER NOT NULL DEFAULT 0,
  component TEXT NOT NULL,
  url TEXT NOT NULL,
  user_device TEXT NOT NULL,
  last_action TEXT NOT NULL,
  stack_trace TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS student_inquiries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  device_id TEXT NOT NULL,
  device_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED', 'SPAM')),
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  admin_notes TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS student_inquiries_device_day_idx
  ON student_inquiries (device_id, device_date);

CREATE INDEX IF NOT EXISTS student_inquiries_created_at_idx
  ON student_inquiries (created_at DESC);
