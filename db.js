const fs = require("fs");
const path = require("path");
const { app, dialog } = require("electron");
const Database = require("better-sqlite3");

let db;

const schemaSql = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  platform TEXT,
  handle TEXT,
  url TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL,
  subject_id INTEGER,
  source TEXT,
  url TEXT NOT NULL,
  title TEXT,
  captured_at TEXT NOT NULL DEFAULT (datetime('now')),
  screenshot_path TEXT,
  html_path TEXT,
  text_path TEXT,
  content_hash TEXT,
  meta_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS legal_marks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artifact_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  article_text TEXT,
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_subjects_case_id ON subjects(case_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_case_id ON artifacts(case_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_subject_id ON artifacts(subject_id);
CREATE INDEX IF NOT EXISTS idx_legal_marks_artifact_id ON legal_marks(artifact_id);
`;

function resolveDbPath() {
  const baseDir = app.isPackaged
    ? path.dirname(app.getPath("exe"))
    : app.getAppPath();
  const dbDir = path.join(baseDir, "db");
  const dbPath = path.join(dbDir, "osint.sqlite");
  return { baseDir, dbDir, dbPath };
}

function initDb() {
  try {
    const { baseDir, dbDir, dbPath } = resolveDbPath();

    // Гарантируем наличие каталога рядом с приложением.
    fs.mkdirSync(dbDir, { recursive: true });

    console.log("[DB] Base:", baseDir);
    console.log("[DB] Path:", dbPath);
    db = new Database(dbPath);
    db.exec(schemaSql);

    return db;
  } catch (err) {
    console.error("[DB] инициализация не удалась:", err);
    dialog.showErrorBox(
      "Ошибка инициализации базы данных",
      `Не удалось открыть или инициализировать базу данных.\n\n${err.message}`
    );
    // Завершение, чтобы не работать в неконсистентном состоянии.
    app.exit(1);
  }
}

function getDb() {
  if (!db) {
    throw new Error(
      "База данных не инициализирована. Вызовите initDb() после app.whenReady()."
    );
  }
  return db;
}

function closeDb() {
  try {
    if (db) db.close();
  } catch (err) {
    console.warn("[DB] закрытие не удалось:", err);
  }
}

module.exports = { initDb, getDb, closeDb };
