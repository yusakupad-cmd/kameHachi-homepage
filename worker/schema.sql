-- D1 スキーマ: kame-social
-- 実行: wrangler d1 execute kame-social --file=schema.sql

CREATE TABLE IF NOT EXISTS youtube_videos (
  id           INTEGER  PRIMARY KEY AUTOINCREMENT,
  video_id     TEXT     NOT NULL UNIQUE,
  title        TEXT     NOT NULL,
  thumbnail_url TEXT    NOT NULL,
  published_at TEXT     NOT NULL,
  video_url    TEXT     NOT NULL,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 将来: Instagram 投稿キャッシュ (Business アカウント取得後)
-- CREATE TABLE IF NOT EXISTS instagram_posts (
--   id           INTEGER  PRIMARY KEY AUTOINCREMENT,
--   media_id     TEXT     NOT NULL UNIQUE,
--   media_type   TEXT     NOT NULL,  -- IMAGE / VIDEO / CAROUSEL_ALBUM
--   media_url    TEXT     NOT NULL,
--   caption      TEXT,
--   permalink    TEXT     NOT NULL,
--   timestamp    TEXT     NOT NULL,
--   created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
-- );
