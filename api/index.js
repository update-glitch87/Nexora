/**
 * Vercel serverless entry — all /api/* routes (see vercel.json rewrites).
 */
const serverless = require('serverless-http');
const app = require('../server/server');

const baseHandler = serverless(app, {
  binary: ['image/*', 'application/pdf'],
});

let readyPromise = null;

function ensureReady() {
  if (!readyPromise) {
    readyPromise = app.ready().catch((err) => {
      readyPromise = null;
      throw err;
    });
  }
  return readyPromise;
}

module.exports = async (req, res) => {
  try {
    await ensureReady();
  } catch (err) {
    console.error('[vercel api] DB init failed:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: 'Database failed to start',
      detail: String(err.message || err),
    }));
    return;
  }

  try {
    return await baseHandler(req, res);
  } catch (err) {
    console.error('[vercel api] handler error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Request failed', detail: String(err.message || err) }));
  }
};
