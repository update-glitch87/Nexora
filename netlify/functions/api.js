const serverless = require('serverless-http');
const app = require('../../server/server');

const baseHandler = serverless(app, {
  binary: ['image/*', 'application/pdf'],
});

// Netlify rewrite /api/* → function with :splat (drops /api). Restore it for Express.
exports.handler = async (event, context) => {
  const raw = event.rawPath || event.path || '';
  if (raw && !raw.startsWith('/api') && !raw.startsWith('/.netlify')) {
    event.path = '/api' + (raw.startsWith('/') ? raw : `/${raw}`);
    if (event.rawPath) event.rawPath = event.path;
  } else if (raw.startsWith('/.netlify/functions/api')) {
    const rest = raw.replace(/^\/.netlify\/functions\/api/, '') || '/';
    event.path = rest.startsWith('/api') ? rest : `/api${rest === '/' ? '' : rest}`;
    if (event.rawPath) event.rawPath = event.path;
  }
  return baseHandler(event, context);
};
