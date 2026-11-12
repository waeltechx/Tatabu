import type { Migration } from './migrate'

/**
 * Schema history. Never edit a released migration; add a new one.
 * File paths in the database are relative to the documents folder, so moving
 * that folder never touches the database.
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    up: /* sql */ `
      CREATE TABLE settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL                       -- JSON
      );

      CREATE TABLE secrets (
        name  TEXT PRIMARY KEY,
        value BLOB NOT NULL                       -- encrypted with the OS keychain (safeStorage)
      );

      CREATE TABLE languages (
        id      TEXT PRIMARY KEY,
        name    TEXT NOT NULL,
        dir     TEXT NOT NULL DEFAULT 'ltr' CHECK (dir IN ('ltr', 'rtl')),
        builtin INTEGER NOT NULL DEFAULT 0,
        sort    INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO languages (id, name, dir, builtin, sort) VALUES
        ('en', 'English', 'ltr', 1, 0),
        ('ar', 'العربية', 'rtl', 1, 1);

      CREATE TABLE applications (
        id               TEXT PRIMARY KEY,
        company          TEXT NOT NULL DEFAULT '',
        job_title        TEXT NOT NULL DEFAULT '',
        location         TEXT NOT NULL DEFAULT '',
        work_mode        TEXT NOT NULL DEFAULT 'unknown'
                         CHECK (work_mode IN ('remote', 'hybrid', 'onsite', 'unknown')),
        application_link TEXT NOT NULL DEFAULT '',
        source           TEXT NOT NULL DEFAULT '',
        deadline         TEXT NOT NULL DEFAULT '',
        salary           TEXT NOT NULL DEFAULT '',
        job_description  TEXT NOT NULL DEFAULT '',
        requirements     TEXT NOT NULL DEFAULT '[]',
        language         TEXT NOT NULL DEFAULT 'en',
        status           TEXT NOT NULL DEFAULT 'saved'
                         CHECK (status IN ('saved', 'applied', 'interview', 'offer', 'rejected', 'withdrawn')),
        date_added       TEXT NOT NULL DEFAULT '',
        updated_at       TEXT NOT NULL DEFAULT '',
        notes            TEXT NOT NULL DEFAULT '',
        contact_person   TEXT NOT NULL DEFAULT '',
        company_address  TEXT NOT NULL DEFAULT '',
        folder           TEXT NOT NULL DEFAULT '',
        normalized_url   TEXT NOT NULL DEFAULT '',
        job_id           TEXT NOT NULL DEFAULT '',
        content_hash     TEXT NOT NULL DEFAULT '',
        raw_text         TEXT NOT NULL DEFAULT '',
        text_fingerprint TEXT NOT NULL DEFAULT '',
        ref_numbers      TEXT NOT NULL DEFAULT '[]'
      );
      CREATE INDEX idx_applications_status ON applications (status);
      CREATE INDEX idx_applications_url ON applications (normalized_url);
      CREATE INDEX idx_applications_job_id ON applications (job_id);
      CREATE INDEX idx_applications_hash ON applications (content_hash);

      CREATE TABLE files (
        id             TEXT PRIMARY KEY,
        application_id TEXT NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
        type           TEXT NOT NULL DEFAULT 'other'
                       CHECK (type IN ('cv', 'cover_letter', 'reference', 'other', 'combined')),
        rel_path       TEXT NOT NULL,
        filename       TEXT NOT NULL DEFAULT '',
        date_added     TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX idx_files_application ON files (application_id);

      CREATE TABLE library_files (
        id         TEXT PRIMARY KEY,
        label      TEXT NOT NULL DEFAULT '',
        kind       TEXT NOT NULL DEFAULT 'document' CHECK (kind IN ('document', 'cv_source')),
        filename   TEXT NOT NULL DEFAULT '',
        rel_path   TEXT NOT NULL,
        date_added TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE profile (
        id        INTEGER PRIMARY KEY CHECK (id = 1),
        full_name TEXT NOT NULL DEFAULT '',
        headline  TEXT NOT NULL DEFAULT '',
        phone     TEXT NOT NULL DEFAULT '',
        email     TEXT NOT NULL DEFAULT '',
        address   TEXT NOT NULL DEFAULT '',
        links     TEXT NOT NULL DEFAULT '[]',
        signature TEXT NOT NULL DEFAULT ''        -- PNG data URL
      );
      INSERT INTO profile (id) VALUES (1);

      CREATE TABLE referees (
        id                   TEXT PRIMARY KEY,
        name                 TEXT NOT NULL DEFAULT '',
        affiliation          TEXT NOT NULL DEFAULT '',
        relationship         TEXT NOT NULL DEFAULT '',
        include_relationship INTEGER NOT NULL DEFAULT 0,
        email                TEXT NOT NULL DEFAULT '',
        phone                TEXT NOT NULL DEFAULT '',
        address              TEXT NOT NULL DEFAULT '',
        sort                 INTEGER NOT NULL DEFAULT 0
      );

      -- When an application has rows here, they replace the default referee list for it.
      CREATE TABLE application_referees (
        application_id TEXT NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
        referee_id     TEXT NOT NULL REFERENCES referees (id) ON DELETE CASCADE,
        sort           INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (application_id, referee_id)
      );

      CREATE TABLE cv_master (
        id             INTEGER PRIMARY KEY CHECK (id = 1),
        data           TEXT NOT NULL DEFAULT '{}',   -- structured master CV (JSON)
        source_file_id TEXT REFERENCES library_files (id) ON DELETE SET NULL,
        updated_at     TEXT NOT NULL DEFAULT ''
      );
      INSERT INTO cv_master (id) VALUES (1);

      CREATE TABLE cv_templates (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL DEFAULT '',
        kind       TEXT NOT NULL DEFAULT 'custom' CHECK (kind IN ('ats', 'custom')),
        html       TEXT NOT NULL DEFAULT '',
        css        TEXT NOT NULL DEFAULT '',
        meta       TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT ''
      );

      -- Generated CVs, cover letters and reference pages.
      CREATE TABLE documents (
        id             TEXT PRIMARY KEY,
        application_id TEXT NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
        kind           TEXT NOT NULL CHECK (kind IN ('cv', 'cover_letter', 'reference')),
        language       TEXT NOT NULL DEFAULT 'en',
        layout         TEXT NOT NULL DEFAULT '',
        data           TEXT NOT NULL DEFAULT '{}',
        file_id        TEXT REFERENCES files (id) ON DELETE SET NULL,
        created_at     TEXT NOT NULL DEFAULT '',
        updated_at     TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX idx_documents_application ON documents (application_id);

      -- Cover letter layout remembered per document language.
      CREATE TABLE letter_prefs (
        language_id TEXT PRIMARY KEY REFERENCES languages (id) ON DELETE CASCADE,
        layout      TEXT NOT NULL
      );
    `
  }
]
