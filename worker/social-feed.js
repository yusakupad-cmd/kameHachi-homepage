/**
 * kame-social-feed — Cloudflare Worker
 *
 * エンドポイント:
 *   GET /api/feed/youtube   → YouTube 最新4件
 *   GET /api/news           → Notion お知らせ 最新5件
 *   GET /api/blog           → Notion ブログ 最新4件
 *
 * Cron (wrangler.toml で設定):
 *   毎時0分 → YouTube RSS + Notion DB を D1 に同期
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://yusakupad-cmd.github.io',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
};

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(Promise.all([
      syncYouTube(env),
      syncNotionNews(env),
      syncNotionBlog(env),
    ]));
  },

  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const { pathname } = new URL(request.url);

    if (pathname === '/api/feed/youtube') return handleYouTubeFeed(env);
    if (pathname === '/api/news')         return handleNotionNews(env);
    if (pathname === '/api/blog')         return handleNotionBlog(env);

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: CORS_HEADERS,
    });
  },
};

// ── YouTube ────────────────────────────────────────────────────────

async function syncYouTube(env) {
  const channelId = env.YOUTUBE_CHANNEL_ID;
  if (!channelId || channelId === 'YOUR_YOUTUBE_CHANNEL_ID') return;

  const res = await fetch(
    `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
    { headers: { 'User-Agent': 'kame-social-feed/1.0' } }
  );
  if (!res.ok) return;

  const videos = parseYouTubeRSS(await res.text()).slice(0, 6);
  if (!videos.length) return;

  await env.DB.prepare('DELETE FROM youtube_videos').run();
  const stmt = env.DB.prepare(
    'INSERT INTO youtube_videos (video_id, title, thumbnail_url, published_at, video_url) VALUES (?, ?, ?, ?, ?)'
  );
  for (const v of videos) {
    await stmt.bind(v.videoId, v.title, v.thumbnail, v.published, v.url).run();
  }
}

async function handleYouTubeFeed(env) {
  const { results } = await env.DB.prepare(
    'SELECT video_id, title, thumbnail_url, published_at, video_url FROM youtube_videos ORDER BY published_at DESC LIMIT 4'
  ).all();
  return new Response(JSON.stringify(results ?? []), { headers: CORS_HEADERS });
}

function parseYouTubeRSS(xml) {
  const videos = [];
  for (const entry of xml.split('<entry>').slice(1)) {
    const videoId  = (entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) ?? [])[1] ?? '';
    const title    = (entry.match(/<title>([^<]+)<\/title>/) ?? [])[1] ?? '';
    const published = (entry.match(/<published>([^<]+)<\/published>/) ?? [])[1] ?? '';
    if (!videoId) continue;
    videos.push({
      videoId,
      title: decodeXmlEntities(title),
      thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
      published: published.slice(0, 10),
      url: `https://www.youtube.com/watch?v=${videoId}`,
    });
  }
  return videos;
}

function decodeXmlEntities(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

// ── Notion 共通 ────────────────────────────────────────────────────

async function queryNotion(env, dbId, sorts, filter) {
  const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.NOTION_API_KEY}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sorts, filter, page_size: 10 }),
  });
  if (!res.ok) throw new Error(`Notion API ${res.status}`);
  return res.json();
}

// ── Notion お知らせ ────────────────────────────────────────────────

async function syncNotionNews(env) {
  const dbId = env.NOTION_NEWS_DB_ID;
  if (!dbId || dbId === 'YOUR_NOTION_NEWS_DB_ID') return;

  const data = await queryNotion(env, dbId,
    [{ property: 'Date', direction: 'descending' }],
    { property: '公開', checkbox: { equals: true } }
  );

  await env.DB.prepare('DELETE FROM notion_news').run();
  const stmt = env.DB.prepare(
    'INSERT INTO notion_news (notion_id, title, date, category, notion_url) VALUES (?, ?, ?, ?, ?)'
  );
  for (const page of data.results ?? []) {
    const title     = page.properties['タイトル']?.title?.[0]?.plain_text ?? '';
    const date      = page.properties['公開日']?.date?.start ?? '';
    const cat       = page.properties['カテゴリ']?.select?.name ?? 'お知らせ';
    const notionUrl = page.url ?? '';
    if (title && date) await stmt.bind(page.id, title, date, cat, notionUrl).run();
  }
}

async function handleNotionNews(env) {
  const { results } = await env.DB.prepare(
    'SELECT notion_id, title, date, category, notion_url FROM notion_news ORDER BY date DESC LIMIT 5'
  ).all();
  return new Response(JSON.stringify(results ?? []), { headers: CORS_HEADERS });
}

// ── Notion ブログ ──────────────────────────────────────────────────

async function syncNotionBlog(env) {
  const dbId = env.NOTION_BLOG_DB_ID;
  if (!dbId || dbId === 'YOUR_NOTION_BLOG_DB_ID') return;

  const data = await queryNotion(env, dbId,
    [{ property: 'Date', direction: 'descending' }],
    { property: '公開', checkbox: { equals: true } }
  );

  await env.DB.prepare('DELETE FROM notion_blog').run();
  const stmt = env.DB.prepare(
    'INSERT INTO notion_blog (notion_id, title, date, cover_url, notion_url) VALUES (?, ?, ?, ?, ?)'
  );
  for (const page of data.results ?? []) {
    const title    = page.properties['タイトル']?.title?.[0]?.plain_text ?? '';
    const date     = page.properties['投稿日']?.date?.start ?? '';
    const coverUrl = page.cover?.type === 'file'     ? page.cover.file.url
                   : page.cover?.type === 'external' ? page.cover.external.url : '';
    const notionUrl = page.url ?? '';
    if (title && date) await stmt.bind(page.id, title, date, coverUrl, notionUrl).run();
  }
}

async function handleNotionBlog(env) {
  const { results } = await env.DB.prepare(
    'SELECT notion_id, title, date, cover_url, notion_url FROM notion_blog ORDER BY date DESC LIMIT 4'
  ).all();
  return new Response(JSON.stringify(results ?? []), { headers: CORS_HEADERS });
}
