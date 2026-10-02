/**
 * Durable applications backup on Netlify Blobs (JSON).
 * Survives redeploys even when the sql.js binary blob fails.
 */
const fs = require('fs');
const path = require('path');

const { isServerless, isNetlifyBlobs } = require('./runtime');
const IS_SERVERLESS = isServerless();
const APPS_BLOB_KEY = 'applications-v1.json';
const LOCAL_APPS_PATH = path.join(
  process.env.DATA_DIR
    || (IS_SERVERLESS ? path.join('/tmp', 'nexorago-data') : path.join(__dirname, '..', 'data')),
  'applications-v1.json'
);

function getStore() {
  if (!isNetlifyBlobs()) return null;
  try {
    const { getStore } = require('@netlify/blobs');
    return getStore({ name: 'nexorago-apps', consistency: 'strong' });
  } catch (err) {
    console.error('[APPS] getStore failed:', err.message);
    return null;
  }
}

function exportAppsFromDb(db) {
  const orders = db.prepare('SELECT * FROM orders').all();
  const kyc = db.prepare('SELECT * FROM kyc_verifications').all();
  return {
    version: 1,
    saved_at: new Date().toISOString(),
    orders,
    kyc,
  };
}

function restoreAppsIntoDb(db, payload) {
  if (!payload || !Array.isArray(payload.orders)) return 0;
  const existing = db.prepare('SELECT COUNT(*) as c FROM orders').get().c;
  if (existing > 0) {
    // Merge missing only — never wipe
    let added = 0;
    const find = db.prepare('SELECT id FROM orders WHERE id = ? OR order_number = ?');
    const cols = Object.keys(payload.orders[0] || {});
    if (!cols.length) return 0;
    for (const o of payload.orders) {
      if (find.get(o.id, o.order_number)) continue;
      const keys = cols.filter((k) => o[k] !== undefined);
      const placeholders = keys.map(() => '?').join(',');
      db.prepare(`INSERT INTO orders (${keys.join(',')}) VALUES (${placeholders})`)
        .run(...keys.map((k) => o[k]));
      added++;
    }
    if (Array.isArray(payload.kyc)) {
      const findK = db.prepare('SELECT id FROM kyc_verifications WHERE id = ?');
      for (const k of payload.kyc) {
        if (k.id != null && findK.get(k.id)) continue;
        const keys = Object.keys(k);
        db.prepare(`INSERT INTO kyc_verifications (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`)
          .run(...keys.map((x) => k[x]));
      }
    }
    console.log(`[APPS] Merged ${added} applications from backup (had ${existing})`);
    return added;
  }

  // Empty DB — full restore
  for (const o of payload.orders) {
    const keys = Object.keys(o);
    db.prepare(`INSERT INTO orders (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`)
      .run(...keys.map((k) => o[k]));
  }
  if (Array.isArray(payload.kyc)) {
    for (const k of payload.kyc) {
      const keys = Object.keys(k);
      db.prepare(`INSERT INTO kyc_verifications (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`)
        .run(...keys.map((x) => k[x]));
    }
  }
  console.log(`[APPS] Restored ${payload.orders.length} applications from backup`);
  return payload.orders.length;
}

async function loadAppsBackup() {
  // Blobs first
  const store = getStore();
  if (store) {
    try {
      const text = await store.get(APPS_BLOB_KEY, { type: 'text' });
      if (text) {
        const data = JSON.parse(text);
        console.log(`[APPS] Loaded backup from Blobs (${(data.orders || []).length} orders)`);
        return data;
      }
    } catch (err) {
      console.error('[APPS] Blob load failed:', err.message);
    }
  }

  // Local file fallback
  try {
    if (fs.existsSync(LOCAL_APPS_PATH)) {
      const data = JSON.parse(fs.readFileSync(LOCAL_APPS_PATH, 'utf8'));
      console.log(`[APPS] Loaded backup from disk (${(data.orders || []).length} orders)`);
      return data;
    }
  } catch (err) {
    console.error('[APPS] Disk load failed:', err.message);
  }
  return null;
}

async function saveAppsBackup(db) {
  const payload = exportAppsFromDb(db);
  const text = JSON.stringify(payload);

  try {
    const dir = path.dirname(LOCAL_APPS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(LOCAL_APPS_PATH, text, 'utf8');
  } catch (err) {
    console.error('[APPS] Disk save failed:', err.message);
  }

  const store = getStore();
  if (!store) {
    if (isNetlifyBlobs()) {
      console.error('[APPS] WARNING: Blobs store unavailable — apps may not survive cold start');
    }
    return payload.orders.length;
  }
  try {
    await store.set(APPS_BLOB_KEY, text, { metadata: { count: String(payload.orders.length) } });
    console.log(`[APPS] Saved ${payload.orders.length} applications to Netlify Blobs`);
  } catch (err) {
    console.error('[APPS] Blob save failed:', err.message);
  }
  return payload.orders.length;
}

module.exports = {
  loadAppsBackup,
  saveAppsBackup,
  restoreAppsIntoDb,
  IS_SERVERLESS,
};
