/**
 * kame-social-feed — Cloudflare Worker
 *
 * エンドポイント:
 *   GET /api/feed/youtube   → D1 から最新4件を返す
 *
 * Cron (wrangler.toml で設定):
 *   毎時0分 → YouTube RSS を取得して D1 を更新
 *
 * 将来追加予定:
 *   GET /api/feed/instagram → Instagram Graph API (Business アカウント取得後)
 *   POST /api/line/notify   → line-harness-oss broadcast 連携
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://yusakupad-cmd.github.io',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
};

export default {
  // ── Cron トリガー (毎時0分) ──────────────────────────────────────
  async scheduled(event, env, ctx) {
    ctx.waitUntil(syncYouTube(env));
  },

  // ── HTTP リクエストハンドラ ────────────────────────────────────────
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const { pathname } = new URL(request.url);

    if (pathname === '/api/feed/youtube') {
      return handleYouTubeFeed(env);
    }

    // 将来: Instagram Graph API 対応 (Business アカウント取得後に実装)
    // if (pathname === '/api/feed/instagram') {
    //   return handleInstagramFeed(env);
    // }

    // 将来: Instagram 新規投稿 → line-harness-oss broadcast
    // if (pathname === '/api/line/notify' && request.method === 'POST') {
    //   return handleLineNotify(request, env);
    // }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: CORS_HEADERS,
    });
  },
};

// ── YouTube ────────────────────────────────────────────────────────

async function syncYouTube(env) {
  const channelId = env.YOUTUBE_CHANNEL_ID;
  if (!channelId || channelId === 'YOUR_YOUTUBE_CHANNEL_ID') {
    console.log('YOUTUBE_CHANNEL_ID が未設定です。wrangler.toml を確認してください。');
    return;
  }

  const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  const res = await fetch(rssUrl, {
    headers: { 'User-Agent': 'kame-social-feed/1.0' },
  });
  if (!res.ok) {
    console.error('YouTube RSS fetch 失敗:', res.status);
    return;
  }

  const xml = await res.text();
  const videos = parseYouTubeRSS(xml).slice(0, 6);
  if (!videos.length) return;

  await env.DB.prepare('DELETE FROM youtube_videos').run();

  const stmt = env.DB.prepare(
    `INSERT INTO youtube_videos (video_id, title, thumbnail_url, published_at, video_url)
     VALUES (?, ?, ?, ?, ?)`
  );
  for (const v of videos) {
    await stmt.bind(v.videoId, v.title, v.thumbnail, v.published, v.url).run();
  }
  console.log(`YouTube: ${videos.length} 件を D1 に保存しました`);
}

async function handleYouTubeFeed(env) {
  const { results } = await env.DB.prepare(
    'SELECT video_id, title, thumbnail_url, published_at, video_url FROM youtube_videos ORDER BY published_at DESC LIMIT 4'
  ).all();

  return new Response(JSON.stringify(results ?? []), { headers: CORS_HEADERS });
}

function parseYouTubeRSS(xml) {
  const videos = [];
  const entries = xml.split('<entry>').slice(1);

  for (const entry of entries) {
    const videoId = (entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) ?? [])[1] ?? '';
    const title   = (entry.match(/<title>([^<]+)<\/title>/) ?? [])[1] ?? '';
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
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
