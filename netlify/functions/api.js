const { connectLambda } = require('@netlify/blobs');
const serverless = require('serverless-http');
const app = require('../../server/server');

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

// Netlify rewrite /api/* → function with :splat (drops /api). Restore it for Express.
exports.handler = async (event, context) => {
  // REQUIRED for Netlify Blobs in Lambda-compat mode (serverless-http).
  // Without this, application saves look fine but data is NOT persisted.
  try {
    connectLambda(event);
  } catch (err) {
    console.error('[api] connectLambda failed:', err.message);
  }

  try {
    await ensureReady();
  } catch (err) {
    console.error('[api] DB init failed:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Database failed to start', detail: String(err.message || err) }),
    };
  }

  const raw = event.rawPath || event.path || '';
  if (raw && !raw.startsWith('/api') && !raw.startsWith('/.netlify')) {
    event.path = '/api' + (raw.startsWith('/') ? raw : `/${raw}`);
    if (event.rawPath) event.rawPath = event.path;
  } else if (raw.startsWith('/.netlify/functions/api')) {
    const rest = raw.replace(/^\/.netlify\/functions\/api/, '') || '/';
    event.path = rest.startsWith('/api') ? rest : `/api${rest === '/' ? '' : rest}`;
    if (event.rawPath) event.rawPath = event.path;
  }

  try {
    return await baseHandler(event, context);
  } catch (err) {
    console.error('[api] handler error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Request failed', detail: String(err.message || err) }),
    };
  }
};
