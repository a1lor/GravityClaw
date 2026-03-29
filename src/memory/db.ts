import Database, { type Database as BetterDatabase } from "better-sqlite3";
import path from "path";
import { mkdirSync } from "fs";

// ── Data directories ──────────────────────────────────
const DATA_DIR = path.join(process.cwd(), "data");
mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(path.join(DATA_DIR, "notes"), { recursive: true });

// ── Open database ─────────────────────────────────────
const DB_PATH = path.join(DATA_DIR, "memory.db");
export const db: BetterDatabase = new Database(DB_PATH);
console.log(`💾 SQLite database: ${DB_PATH}`);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ── Schema ────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS memories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    content     TEXT    NOT NULL,
    category    TEXT    NOT NULL DEFAULT 'general',
    tags        TEXT    NOT NULL DEFAULT '',
    is_archived INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    accessed_at TEXT    NOT NULL DEFAULT (datetime('now')),
    access_count INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    dialogue_id INTEGER,                   -- NULL = core bot history; non-NULL = dashboard dialogue
    role        TEXT    NOT NULL,
    content     TEXT,
    tool_calls  TEXT,              -- JSON array of tool calls
    tool_call_id TEXT,             -- ID for tool response role
    is_summary  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS dashboard_dialogues (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT    NOT NULL,
    model       TEXT    NOT NULL DEFAULT 'google/gemini-2.0-flash-001',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS profile (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS job_postings (
    id          TEXT PRIMARY KEY,          -- "{source}:{externalId}"
    source      TEXT NOT NULL,             -- 'linkedin' | 'wttj'
    title       TEXT NOT NULL,
    company     TEXT NOT NULL,
    location    TEXT NOT NULL DEFAULT '',
    url         TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    found_at    TEXT NOT NULL DEFAULT (datetime('now')),
    applied_at  TEXT,                      -- NULL until marked applied
    notified_at TEXT                       -- NULL until sent in heartbeat
  );

  CREATE TABLE IF NOT EXISTS usage_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    model         TEXT    NOT NULL,
    tier          TEXT    NOT NULL DEFAULT 'free',
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens  INTEGER NOT NULL DEFAULT 0,
    cost_usd      REAL   NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS job_emails (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    from_addr   TEXT    NOT NULL,
    subject     TEXT    NOT NULL,
    snippet     TEXT    NOT NULL DEFAULT '',
    status      TEXT    NOT NULL DEFAULT 'neutral',
    email_date  TEXT    NOT NULL DEFAULT '',
    gmail_thread_id TEXT DEFAULT '',
    gmail_message_id TEXT DEFAULT '',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS daily_cache (
    category    TEXT    PRIMARY KEY,
    content     TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL DEFAULT (date('now'))
  );

  CREATE TABLE IF NOT EXISTS kg_nodes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    entity      TEXT    NOT NULL UNIQUE,
    type        TEXT    NOT NULL,
    properties  TEXT    NOT NULL DEFAULT '{}',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS kg_edges (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    source      TEXT    NOT NULL,
    target      TEXT    NOT NULL,
    relation    TEXT    NOT NULL,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(source, target, relation),
    FOREIGN KEY(source) REFERENCES kg_nodes(entity) ON DELETE CASCADE,
    FOREIGN KEY(target) REFERENCES kg_nodes(entity) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS secure_secrets (
    key_name        TEXT PRIMARY KEY,
    iv              TEXT NOT NULL,
    auth_tag        TEXT NOT NULL,
    encrypted_data  TEXT NOT NULL,
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    t           TEXT    NOT NULL DEFAULT 'log',
    l           TEXT    NOT NULL,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

// ── Indexes (non-migration-dependent) ─────────────────
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_memories_category
    ON memories(category, is_archived, accessed_at);
  CREATE INDEX IF NOT EXISTS idx_conversations_created
    ON conversations(created_at);
  CREATE INDEX IF NOT EXISTS idx_job_emails_created
    ON job_emails(created_at);
  CREATE INDEX IF NOT EXISTS idx_logs_created
    ON logs(created_at);
`);

// ── Versioned schema migrations ───────────────────────
db.exec(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL DEFAULT 0)`);
const versionRow = db.prepare(`SELECT version FROM schema_version`).get() as { version: number } | undefined;
if (!versionRow) db.exec(`INSERT INTO schema_version (version) VALUES (0)`);
const currentVersion = versionRow?.version ?? 0;

function addColumnIfNotExists(table: string, column: string, definition: string) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!columns.some(c => c.name === column)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
}

const migrations: (() => void)[] = [
    // v1: Core column additions
    () => {
        addColumnIfNotExists("conversations", "tool_calls", "TEXT");
        addColumnIfNotExists("conversations", "tool_call_id", "TEXT");
        addColumnIfNotExists("conversations", "dialogue_id", "INTEGER");
        addColumnIfNotExists("memories", "category", "TEXT NOT NULL DEFAULT 'general'");
        addColumnIfNotExists("memories", "is_archived", "INTEGER NOT NULL DEFAULT 0");
        addColumnIfNotExists("job_postings", "pipeline_status", "TEXT NOT NULL DEFAULT 'new'");
        addColumnIfNotExists("job_emails", "linked_job_id", "TEXT");
    },
    // v2: Job pipeline enhancements
    () => {
        addColumnIfNotExists("job_postings", "followup_at", "TEXT");
        addColumnIfNotExists("job_postings", "followup_sent_at", "TEXT");
        addColumnIfNotExists("job_postings", "cover_letter_path", "TEXT");
        addColumnIfNotExists("job_postings", "application_folder", "TEXT");
        addColumnIfNotExists("job_postings", "detected_language", "TEXT NOT NULL DEFAULT 'en'");
        addColumnIfNotExists("job_postings", "job_type", "TEXT NOT NULL DEFAULT 'unspecified'");
        addColumnIfNotExists("job_postings", "outcome", "TEXT DEFAULT ''");
    },
    // v3: Job scoring
    () => {
        addColumnIfNotExists("job_postings", "job_score", "INTEGER");
        addColumnIfNotExists("job_postings", "job_score_reason", "TEXT DEFAULT ''");
        addColumnIfNotExists("job_postings", "job_scored_at", "TEXT DEFAULT ''");
    },
    // v4: Spontaneous outreach + Gmail
    () => {
        addColumnIfNotExists("spontaneous_targets", "email_subject", "TEXT DEFAULT ''");
        addColumnIfNotExists("spontaneous_targets", "sent_letter", "TEXT DEFAULT ''");
        addColumnIfNotExists("job_emails", "gmail_message_id", "TEXT DEFAULT ''");
    },
    // v5: Follow-up drafts + full email body
    () => {
        addColumnIfNotExists("job_emails", "followup_subject", "TEXT DEFAULT ''");
        addColumnIfNotExists("job_emails", "followup_body", "TEXT DEFAULT ''");
        addColumnIfNotExists("job_emails", "followup_created_at", "TEXT DEFAULT ''");
        addColumnIfNotExists("job_emails", "full_body", "TEXT DEFAULT ''");
    },
    // v6: Action-needed flag on emails (test/quiz/reply required)
    () => {
        addColumnIfNotExists("job_emails", "action_needed", "TEXT DEFAULT ''");
        addColumnIfNotExists("job_emails", "stage", "TEXT DEFAULT ''");
    },
    // v7: Purge non-application emails — job alerts, newsletters, logs, etc.
    () => {
        db.exec(`
            DELETE FROM job_emails WHERE
                -- Log/error entries that ended up in wrong table
                from_addr IN ('log', 'error', 'warn')
                -- Job alert platforms
                OR from_addr LIKE '%glassdoor%'
                OR from_addr LIKE '%indeed%'
                OR from_addr LIKE '%linkedin%'
                -- Newsletters
                OR from_addr LIKE '%tldr%'
                OR from_addr LIKE '%aktionnaire%'
                OR from_addr LIKE '%newsletter%'
                -- GitHub / developer tool notifications
                OR from_addr LIKE '%github%'
                OR from_addr LIKE '%gitlab%'
                -- Apple / AWS / SaaS transactional
                OR from_addr LIKE '%apple.com%'
                OR from_addr LIKE '%signin.aws%'
                OR from_addr LIKE '%claude.com%'
                OR from_addr LIKE '%circana%'
                -- Hermes opportunités (job alerts, not responses)
                OR from_addr LIKE '%myclickh.hermes%'
                -- Subjects that are clearly job alerts, not responses
                OR subject LIKE '%job alert%'
                OR subject LIKE '%offres qui correspondent%'
                OR subject LIKE '%nouveaux postes%'
                OR subject LIKE '%nouveau poste%'
                OR subject LIKE '%you might like%'
                OR subject LIKE '%vous seriez un excellent candidat%'
                OR subject LIKE '%jobs you might like%'
                OR subject LIKE '%invoice from Apple%'
                OR subject LIKE '%Password updated%'
                OR subject LIKE '%New Project Proposal%'
                OR subject LIKE '%A third-party OAuth%'
                OR subject LIKE '%A third-party GitHub%'
                OR subject LIKE '%new jobs%'
                OR subject LIKE '%nouvelles opportunités%'
        `);
        console.log("🧹 Purged non-application emails from job_emails");
    },
    // v8: Remove junk auto-created job entries from bad emails
    () => {
        db.exec(`
            DELETE FROM job_postings
            WHERE source = 'email'
            AND (
                lower(company) IN ('claude', 'aws', 'amazon web services')
                OR id LIKE 'email:claude:%'
                OR id LIKE 'email:aws:%'
            )
        `);
        console.log("🧹 Removed junk auto-created job postings");
    },
    // v9: Add thread_id support
    () => {
        addColumnIfNotExists("job_emails", "gmail_thread_id", "TEXT DEFAULT ''");
    },
    // v10: Add description support to job_postings
    () => {
        addColumnIfNotExists("job_postings", "description", "TEXT DEFAULT ''");
    },
    // v11: Add hidden flag to job_emails (mark as not-job-related without deleting)
    () => {
        addColumnIfNotExists("job_emails", "hidden", "INTEGER NOT NULL DEFAULT 0");
    },
    // v12: Bot events for SSE activity feed
    () => {
        db.exec(`
            CREATE TABLE IF NOT EXISTS bot_events (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              type TEXT NOT NULL,
              message TEXT NOT NULL,
              metadata TEXT,
              created_at DATETIME DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_bot_events_created_at ON bot_events(created_at);
        `);
    },
];

// Run pending migrations
for (let i = currentVersion; i < migrations.length; i++) {
    console.log(`📦 Running DB migration v${i + 1}…`);
    migrations[i]();
    db.prepare(`UPDATE schema_version SET version = ?`).run(i + 1);
}
if (migrations.length > currentVersion) {
    console.log(`✅ DB schema at v${migrations.length}`);
}

// ── Post-migration indexes (depend on columns added above) ──
db.exec("CREATE INDEX IF NOT EXISTS idx_job_postings_pipeline ON job_postings(pipeline_status)");
db.exec("CREATE INDEX IF NOT EXISTS idx_conversations_dialogue ON conversations(dialogue_id, id)");

// ── Spontaneous outreach table ────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS spontaneous_targets (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    company    TEXT    NOT NULL,
    hr_email   TEXT    NOT NULL,
    industry   TEXT    NOT NULL DEFAULT '',
    status     TEXT    NOT NULL DEFAULT 'pending',
    sent_at    TEXT,
    reply_at   TEXT,
    notes      TEXT    NOT NULL DEFAULT '',
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(company, hr_email)
  );
  CREATE INDEX IF NOT EXISTS idx_spontaneous_status ON spontaneous_targets(status, sent_at);
`);

// ── CV Library table ──────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS cv_library (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    job_type      TEXT    NOT NULL,    -- 'alternance' | 'stage' | 'cdi' | 'general'
    language      TEXT    NOT NULL,    -- 'fr' | 'en'
    file_path     TEXT    NOT NULL,
    file_name     TEXT    NOT NULL,
    extracted_text TEXT,
    is_default    INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(job_type, language)
  );
  CREATE INDEX IF NOT EXISTS idx_cv_library_type_lang ON cv_library(job_type, language);
`);

// Non-destructive migration for existing DBs created before extracted_text existed.
addColumnIfNotExists("cv_library", "extracted_text", "TEXT");

// ── Reminders table ──────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS reminders (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    message    TEXT    NOT NULL,
    due_at     TEXT    NOT NULL,
    sent       INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(due_at, sent);
`);

console.log("💾 SQLite memory database ready");
