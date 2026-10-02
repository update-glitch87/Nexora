/** Netlify, Vercel, and other ephemeral serverless hosts */
function isServerless() {
  return !!(process.env.VERCEL || process.env.NETLIFY || process.env.NETLIFY_BLOBS_CONTEXT
    || (process.env.AWS_LAMBDA_FUNCTION_NAME && !process.env.VERCEL));
}

/** Netlify Blobs — not available on Vercel */
function isNetlifyBlobs() {
  return !!(process.env.NETLIFY || process.env.NETLIFY_BLOBS_CONTEXT);
}

function platformLabel() {
  if (process.env.VERCEL) return 'vercel';
  if (process.env.NETLIFY || process.env.NETLIFY_BLOBS_CONTEXT) return 'netlify';
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) return 'serverless';
  return 'local';
}

module.exports = { isServerless, isNetlifyBlobs, platformLabel };
