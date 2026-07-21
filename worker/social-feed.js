/**
 * kame-social-feed — Cloudflare Worker
 *
 * エンドポイント:
 *   GET /api/feed/youtube    → YouTube 最新4件
 *   GET /api/feed/instagram  → Instagram 最新9件
 *   GET /api/news            → line-harness-oss お知らせ 最新5件（リアルタイムプロキシ）
 *   GET /api/blog            → Notion ブログ 最新4件
 *
 * Cron (wrangler.toml で設定):
 *   毎時0分 → YouTube RSS + Instagram Graph API を D1 に同期
 *   ※お知らせは line-harness /api/public/news をリアルタイム fetch するため同期不要
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
};

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(Promise.all([
      syncYouTube(env),
      syncInstagram(env),
      // お知らせは line-harness /api/public/news をリアルタイム fetch するため同期不要
    ]));
  },

  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const { pathname } = new URL(request.url);

    if (pathname === '/api/feed/youtube')    return handleYouTubeFeed(env);
    if (pathname === '/api/feed/instagram')  return handleInstagramFeed(env);
    if (pathname === '/api/news')            return handleNotionNews(env);
    if (pathname === '/api/blog')            return handleNotionBlog(env);
    if (pathname === '/api/sync')            return handleSync(env);
    if (pathname === '/api/debug/news')      return handleDebugNews(env);

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: CORS_HEADERS,
    });
  },
};

// ── 手動同期 ───────────────────────────────────────────────────────

async function handleSync(env) {
  try {
    await Promise.all([syncYouTube(env), syncInstagram(env)]);
    return new Response(JSON.stringify({ ok: true, synced_at: new Date().toISOString() }), { headers: CORS_HEADERS });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: CORS_HEADERS });
  }
}

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

// ── Instagram ──────────────────────────────────────────────────────

async function syncInstagram(env) {
  const token = env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) return;

  const fields = 'id,media_type,media_url,thumbnail_url,permalink,caption,timestamp';
  const res = await fetch(
    `https://graph.instagram.com/v22.0/me/media?fields=${fields}&limit=12&access_token=${token}`,
    { headers: { 'User-Agent': 'kame-social-feed/1.0' } }
  );
  if (!res.ok) return;

  const json = await res.json();
  const posts = (json.data ?? [])
    .filter(p => {
      if (p.media_type === 'IMAGE' || p.media_type === 'CAROUSEL_ALBUM') return !!p.media_url;
      if (p.media_type === 'VIDEO') return !!p.thumbnail_url;
      return false;
    })
    .slice(0, 9);

  await env.DB.prepare('DELETE FROM instagram_posts').run();
  const stmt = env.DB.prepare(
    'INSERT INTO instagram_posts (media_id, media_type, media_url, caption, permalink, timestamp) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const p of posts) {
    const mediaUrl = p.media_type === 'VIDEO' ? p.thumbnail_url : p.media_url;
    await stmt.bind(p.id, p.media_type, mediaUrl, p.caption ?? '', p.permalink, p.timestamp).run();
  }
}

async function handleInstagramFeed(env) {
  const { results } = await env.DB.prepare(
    'SELECT media_id, media_type, media_url, caption, permalink, timestamp FROM instagram_posts ORDER BY timestamp DESC LIMIT 9'
  ).all();
  return new Response(JSON.stringify(results ?? []), { headers: CORS_HEADERS });
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
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Notion API ${res.status}: ${body}`);
  }
  return res.json();
}

// ── お知らせ（line-harness-oss /api/public/news プロキシ） ─────────
//
// Notion→D1同期を廃止し、line-harness-ossのお知らせCRUDを正としてプロキシする。
// HP側のrenderNews()が期待するフィールド形式に変換して返す。
//   HP期待: [{ notion_id, title, date, category, notion_url, cover_url }]
//   line-harness形式: { success, data: [{ id, title, category, publishedAt, content, ... }] }

// ── デバッグ: upstream fetch の診断 ────────────────────────────────
// GET /api/debug/news
// wrangler tail 不要でフォールバック原因を確認できる診断エンドポイント

async function fetchLineHarness(env, path) {
  // Service Binding が利用可能な場合はそちらを優先（同一アカウント内 Worker-to-Worker）
  if (env.LINE_HARNESS) {
    return env.LINE_HARNESS.fetch(
      new Request(`https://line-harness.kizuku-lab.workers.dev${path}`, {
        headers: { 'User-Agent': 'kame-social-feed/1.0' },
      })
    );
  }
  // フォールバック: HTTP fetch（別アカウントへの接続時）
  const baseUrl = env.LINE_HARNESS_URL || 'https://line-harness.kizuku-lab.workers.dev';
  return fetch(`${baseUrl}${path}`, {
    headers: { 'User-Agent': 'kame-social-feed/1.0' },
  });
}

function publicNewsPath(env) {
  if (!env.LINE_ACCOUNT_ID) {
    throw new Error('LINE_ACCOUNT_ID is not configured');
  }

  return `/api/public/news?accountId=${encodeURIComponent(env.LINE_ACCOUNT_ID)}`;
}

async function handleDebugNews(env) {
  const result = {
    mode: env.LINE_HARNESS ? 'service-binding' : 'http-fetch',
    upstreamOk: false,
    upstreamStatus: null,
    upstreamData: null,
    upstreamError: null,
    fallbackCount: null,
    checkedAt: new Date().toISOString(),
  };

  try {
    const res = await fetchLineHarness(env, publicNewsPath(env));
    result.upstreamStatus = res.status;
    if (res.ok) {
      const json = await res.json();
      result.upstreamOk = true;
      result.upstreamData = json;
    } else {
      result.upstreamError = `HTTP ${res.status}`;
    }
  } catch (e) {
    result.upstreamError = e?.message ?? String(e);
  }

  try {
    const row = await env.DB.prepare('SELECT COUNT(*) as cnt FROM notion_news').first();
    result.fallbackCount = row?.cnt ?? null;
  } catch {
    // fallbackCount remains null
  }

  return new Response(JSON.stringify(result, null, 2), {
    headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' },
  });
}

async function handleNotionNews(env) {
  try {
    const res = await fetchLineHarness(env, publicNewsPath(env));
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const json = await res.json();
    const items = (json.data ?? []).slice(0, 5).map(item => ({
      notion_id:  item.id,
      title:      item.title,
      content:    item.content || '',  // HP側アコーディオン展開用
      date:       (item.publishedAt || item.createdAt || '').slice(0, 10),
      category:   item.category || 'お知らせ',
      notion_url: '',
      cover_url:  '',
    }));
    return new Response(JSON.stringify(items), { headers: CORS_HEADERS });
  } catch (e) {
    // upstream障害時はD1キャッシュから返すフォールバック
    console.error('[kame-social-feed] /api/news upstream fetch failed:', e?.message ?? String(e));
    const { results } = await env.DB.prepare(
      'SELECT notion_id, title, date, category, notion_url, cover_url FROM notion_news ORDER BY date DESC LIMIT 5'
    ).all();
    return new Response(JSON.stringify(results ?? []), { headers: CORS_HEADERS });
  }
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
