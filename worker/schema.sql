-- D1 スキーマ: kame-social
-- 実行: wrangler d1 execute kame-social --file=schema.sql

CREATE TABLE IF NOT EXISTS youtube_videos (
  id            INTEGER  PRIMARY KEY AUTOINCREMENT,
  video_id      TEXT     NOT NULL UNIQUE,
  title         TEXT     NOT NULL,
  thumbnail_url TEXT     NOT NULL,
  published_at  TEXT     NOT NULL,
  video_url     TEXT     NOT NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- お知らせ (Notion お知らせDB からキャッシュ)
CREATE TABLE IF NOT EXISTS notion_news (
  id         INTEGER  PRIMARY KEY AUTOINCREMENT,
  notion_id  TEXT     NOT NULL UNIQUE,
  title      TEXT     NOT NULL,
  date       TEXT     NOT NULL,
  category   TEXT     NOT NULL DEFAULT 'お知らせ',
  notion_url TEXT     DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- スタッフブログ (Notion ブログDB からキャッシュ)
CREATE TABLE IF NOT EXISTS notion_blog (
  id         INTEGER  PRIMARY KEY AUTOINCREMENT,
  notion_id  TEXT     NOT NULL UNIQUE,
  title      TEXT     NOT NULL,
  date       TEXT     NOT NULL,
  cover_url  TEXT     DEFAULT '',
  notion_url TEXT     DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 将来: Instagram 投稿キャッシュ (Business アカウント取得後)
-- CREATE TABLE IF NOT EXISTS instagram_posts (
--   id         INTEGER  PRIMARY KEY AUTOINCREMENT,
--   media_id   TEXT     NOT NULL UNIQUE,
--   media_type TEXT     NOT NULL,
--   media_url  TEXT     NOT NULL,
--   caption    TEXT,
--   permalink  TEXT     NOT NULL,
--   timestamp  TEXT     NOT NULL,
--   created_at DATETIME DEFAULT CURRENT_TIMESTAMP
-- );
