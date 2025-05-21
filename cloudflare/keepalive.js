export default {
  // Manual fetch handler so you can open the Worker URL in a browser
  async fetch(_req, env) {
    return new Response(
      `🛠 Keep-alive Worker. Will ping: ${env.KEEPALIVE_URLS}`,
      { headers: { 'content-type': 'text/plain' } }
    );
  },

  // Cron trigger handler (Cloudflare schedules)
  async scheduled(_event, env, ctx) {
    const targets = (env.KEEPALIVE_URLS || '').split(',').map(u => u.trim()).filter(Boolean);
    for (const url of targets) {
      if (!url) continue;
      const sep = url.includes('?') ? '&' : '?';
      const fullUrl = `${url}${sep}_t=${Date.now()}`; // cache-buster so it hits origin

      ctx.waitUntil(
        fetch(fullUrl, {
          method: 'GET',
          headers: {
            'user-agent': 'KeepAliveWorker/1.0',
            'cf-no-cache': '1' // bypass any existing edge cache
          },
          cf: { cacheTtl: 0 } // ensure Cloudflare doesn't cache the response
        })
          .then(res => {
            console.log(`[keepalive] ${fullUrl} -> ${res.status}`);
          })
          .catch(err => {
            console.error(`[keepalive] ${fullUrl} failed`, err);
          })
      );
    }
  }
}; 