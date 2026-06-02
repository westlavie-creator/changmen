from db.client import executescript, fetchall


def init_schema():
    executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY,
            user_name     TEXT    NOT NULL UNIQUE,
            password_hash TEXT    NOT NULL,
            salt          TEXT    NOT NULL,
            setting       TEXT    NOT NULL DEFAULT '{}',
            created_at    INTEGER NOT NULL,
            updated_at    INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS users_user_name ON users (user_name);

        CREATE TABLE IF NOT EXISTS accounts (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id       INTEGER NOT NULL,
            account_id    INTEGER,
            platform_id   INTEGER,
            platform_name TEXT,
            player_name   TEXT,
            provider      TEXT,
            gateway       TEXT,
            token         TEXT,
            referer       TEXT,
            user_agent    TEXT,
            cookie        TEXT,
            currency      TEXT,
            balance       REAL,
            credit        REAL,
            active        INTEGER NOT NULL DEFAULT 0,
            pause         INTEGER NOT NULL DEFAULT 0,
            sort_order    INTEGER NOT NULL DEFAULT 0,
            raw           TEXT    NOT NULL,
            created_at    INTEGER NOT NULL,
            updated_at    INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS accounts_user_id ON accounts (user_id);
        CREATE INDEX IF NOT EXISTS accounts_provider ON accounts (provider);
        CREATE UNIQUE INDEX IF NOT EXISTS accounts_user_account_id ON accounts (user_id, account_id);

        CREATE TABLE IF NOT EXISTS user_settings (
            user_id    INTEGER NOT NULL,
            key        TEXT    NOT NULL,
            content    TEXT    NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (user_id, key),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS user_settings_key ON user_settings (key);

        CREATE TABLE IF NOT EXISTS ob_matches (
            source_match_id TEXT    PRIMARY KEY,
            source_game_id  TEXT,
            home            TEXT    NOT NULL,
            home_id         TEXT,
            away            TEXT    NOT NULL,
            away_id         TEXT,
            bo              INTEGER,
            start_time      INTEGER,
            is_live         INTEGER,
            saved_at        INTEGER NOT NULL,
            raw             TEXT    NOT NULL
        );
        CREATE INDEX IF NOT EXISTS ob_matches_game  ON ob_matches (source_game_id);
        CREATE INDEX IF NOT EXISTS ob_matches_saved ON ob_matches (saved_at);
    """)

    # 若 client_matches 缺 title 列则重建
    cols = fetchall("PRAGMA table_info(client_matches)")
    col_names = [c["name"] for c in cols]
    if cols and "title" not in col_names:
        executescript("DROP TABLE IF EXISTS client_matches;")

    executescript("""
        CREATE TABLE IF NOT EXISTS client_matches (
            id          INTEGER PRIMARY KEY,
            title       TEXT    NOT NULL,
            game        TEXT,
            game_id     TEXT,
            start_time  INTEGER,
            bo          INTEGER,
            round       INTEGER,
            matchs      TEXT,
            bets        TEXT,
            built_at    INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS client_matches_game ON client_matches (game_id);
        CREATE INDEX IF NOT EXISTS client_matches_time ON client_matches (start_time);
    """)
