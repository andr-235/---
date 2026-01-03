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
  assigned_to TEXT,
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
  label TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS artifact_legal_marks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artifact_id INTEGER NOT NULL,
  legal_mark_id INTEGER NOT NULL,
  article_text TEXT NOT NULL,
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE CASCADE,
  FOREIGN KEY (legal_mark_id) REFERENCES legal_marks(id) ON DELETE RESTRICT,
  UNIQUE(artifact_id)
);

CREATE INDEX IF NOT EXISTS idx_subjects_case_id ON subjects(case_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_case_id ON artifacts(case_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_subject_id ON artifacts(subject_id);
CREATE INDEX IF NOT EXISTS idx_legal_marks_label ON legal_marks(label);
CREATE INDEX IF NOT EXISTS idx_artifact_legal_marks_artifact_id ON artifact_legal_marks(artifact_id);
CREATE INDEX IF NOT EXISTS idx_artifact_legal_marks_mark ON artifact_legal_marks(legal_mark_id);
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
    ensureCaseColumns(db);
    migrateLegalMarks(db);

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

function ensureCaseColumns(database) {
  try {
    const columns = database.prepare("PRAGMA table_info(cases)").all();
    const names = new Set(columns.map((column) => column.name));
    if (!names.has("assigned_to")) {
      database.exec("ALTER TABLE cases ADD COLUMN assigned_to TEXT;");
    }
  } catch (error) {
    console.warn("[DB] не удалось проверить или добавить assigned_to:", error);
  }
}

function migrateLegalMarks(database) {
  try {
    const columns = database.prepare("PRAGMA table_info(legal_marks)").all();
    const hasArtifactId = columns.some(
      (column) => column.name === "artifact_id"
    );
    if (hasArtifactId) {
      database.exec("ALTER TABLE legal_marks RENAME TO legal_marks_legacy;");
      database.exec(`
        CREATE TABLE IF NOT EXISTS legal_marks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          label TEXT NOT NULL UNIQUE,
          description TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT
        );
      `);
      database.exec(`
        CREATE TABLE IF NOT EXISTS artifact_legal_marks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          artifact_id INTEGER NOT NULL,
          legal_mark_id INTEGER NOT NULL,
          article_text TEXT NOT NULL,
          comment TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT,
          FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE CASCADE,
          FOREIGN KEY (legal_mark_id) REFERENCES legal_marks(id) ON DELETE RESTRICT,
          UNIQUE(artifact_id)
        );
        CREATE INDEX IF NOT EXISTS idx_legal_marks_label ON legal_marks(label);
        CREATE INDEX IF NOT EXISTS idx_artifact_legal_marks_artifact_id ON artifact_legal_marks(artifact_id);
        CREATE INDEX IF NOT EXISTS idx_artifact_legal_marks_mark ON artifact_legal_marks(legal_mark_id);
      `);
      const legacyRows = database
        .prepare(
          "SELECT artifact_id, label, article_text, comment, created_at FROM legal_marks_legacy"
        )
        .all();
      const insertMark = database.prepare(
        `INSERT OR IGNORE INTO legal_marks (label, created_at)
         VALUES (?, COALESCE(?, datetime('now')))`
      );
      const selectMark = database.prepare(
        "SELECT id FROM legal_marks WHERE label = ?"
      );
      const insertLink = database.prepare(
        `INSERT OR REPLACE INTO artifact_legal_marks
           (artifact_id, legal_mark_id, article_text, comment, created_at)
         VALUES (?, ?, ?, ?, COALESCE(?, datetime('now')))`
      );
      const transaction = database.transaction(() => {
        legacyRows.forEach((row) => {
          const labelValue =
            typeof row.label === "string" ? row.label.trim() : "";
          if (!labelValue) {
            return;
          }
          insertMark.run(labelValue, row.created_at);
          const found = selectMark.get(labelValue);
          if (!found || !found.id) {
            return;
          }
          const articleText =
            typeof row.article_text === "string" && row.article_text.trim()
              ? row.article_text
              : labelValue;
          insertLink.run(
            row.artifact_id,
            found.id,
            articleText,
            row.comment || null,
            row.created_at
          );
        });
      });
      transaction();
      database.exec("DROP TABLE IF EXISTS legal_marks_legacy;");
    } else {
      database.exec(
        "CREATE INDEX IF NOT EXISTS idx_legal_marks_label ON legal_marks(label);"
      );
    }
  } catch (error) {
    console.warn("[DB] migrateLegalMarks не удалось:", error);
  }

  try {
    const info = database
      .prepare("PRAGMA table_info(artifact_legal_marks)")
      .all();
    if (!info.length) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS artifact_legal_marks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          artifact_id INTEGER NOT NULL,
          legal_mark_id INTEGER NOT NULL,
          article_text TEXT NOT NULL,
          comment TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT,
          FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE CASCADE,
          FOREIGN KEY (legal_mark_id) REFERENCES legal_marks(id) ON DELETE RESTRICT,
          UNIQUE(artifact_id)
        );
        CREATE INDEX IF NOT EXISTS idx_artifact_legal_marks_artifact_id ON artifact_legal_marks(artifact_id);
        CREATE INDEX IF NOT EXISTS idx_artifact_legal_marks_mark ON artifact_legal_marks(legal_mark_id);
      `);
    }
  } catch (error) {
    console.warn("[DB] проверка artifact_legal_marks не удалась:", error);
  }
}

module.exports = { initDb, getDb, closeDb };
