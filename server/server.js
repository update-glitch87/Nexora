const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const db = require('./db');

const app = express();
const IS_NETLIFY = !!(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
const UPLOAD_DIR = process.env.UPLOAD_DIR
  || (IS_NETLIFY ? path.join('/tmp', 'uploads', 'kyc') : path.join(__dirname, '..', 'public', 'uploads', 'kyc'));

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Local/Render: serve static. Netlify serves public/ separately.
if (!IS_NETLIFY) {
  app.use(express.static(path.join(__dirname, '..', 'public')));
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only JPG, PNG, or PDF files are allowed'));
  },
});

const hashPassword = (pw) => crypto.createHash('sha256').update(pw).digest('hex');

function createSession(username) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO admin_sessions (token, username, expires_at) VALUES (?, ?, ?)').run(token, username, expires);
  return token;
}

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.headers['x-admin-token'];
  if (!token) return res.status(401).json({ error: 'Admin login required' });

  const session = db.prepare(`
    SELECT * FROM admin_sessions WHERE token = ? AND datetime(expires_at) > datetime('now')
  `).get(token);

  if (!session) return res.status(401).json({ error: 'Session expired. Please log in again.' });
  req.adminUser = session.username;
  next();
}

function parseRequirements(row) {
  try {
    const { price, ...rest } = row;
    return { ...rest, requirements: JSON.parse(row.requirements || '[]') };
  } catch {
    const { price, ...rest } = row;
    return { ...rest, requirements: [] };
  }
}

/** Dummy KYC verification fee: $1, $10, or $100 (Stripe later) */
function kycFeeFor(visa, order = {}) {
  const duration = Number(order.visa_duration || visa?.validity_days || 0);
  const category = (visa?.category || '').toLowerCase();
  if (category === 'student' || category === 'work' || duration >= 730) return 100;
  if (category === 'business' || duration >= 180) return 10;
  return 1;
}

// ── Public API ──

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'NexoraGo', time: new Date().toISOString() });
});

app.get('/api/visas', (req, res) => {
  const { country, category, search, popular } = req.query;
  let sql = 'SELECT * FROM visas WHERE 1=1';
  const params = [];

  if (country) { sql += ' AND country_code = ?'; params.push(country); }
  if (category) { sql += ' AND category = ?'; params.push(category); }
  if (popular === '1') { sql += ' AND popular = 1'; }
  if (search) {
    sql += ' AND (country_name LIKE ? OR visa_type LIKE ? OR country_code LIKE ?)';
    const q = `%${search}%`;
    params.push(q, q, q);
  }

  sql += ' ORDER BY popular DESC, country_name ASC, category ASC';
  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(parseRequirements));
});

app.get('/api/visas/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM visas WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Visa not found' });
  res.json(parseRequirements(row));
});

app.get('/api/countries', (req, res) => {
  const rows = db.prepare(
    'SELECT DISTINCT country_code, country_name, flag_emoji FROM visas ORDER BY country_name'
  ).all();
  res.json(rows);
});

app.post('/api/orders', (req, res) => {
  const {
    visa_id, applicant_name, applicant_email, applicant_phone,
    passport_number, travel_date, nationality, age, date_of_birth, residence,
    education, work_experience, language, notes,
    visa_duration, purpose, occupation, employment_status,
    id_type, id_number, net_worth, annual_income, trip_funds,
  } = req.body;

  if (!visa_id || !applicant_name || !applicant_email || !applicant_phone || !passport_number || !travel_date) {
    return res.status(400).json({ error: 'Please fill all required fields' });
  }
  if (!visa_duration || !purpose || !occupation || !employment_status || !work_experience || !education) {
    return res.status(400).json({ error: 'Please complete stay & work details' });
  }
  if (!nationality || !residence || !id_type || !id_number || !language || !date_of_birth) {
    return res.status(400).json({ error: 'Please complete identity details' });
  }
  if (!net_worth || !annual_income || !trip_funds) {
    return res.status(400).json({ error: 'Please complete financial profile' });
  }

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(applicant_email);
  if (!emailOk) return res.status(400).json({ error: 'Invalid email address' });

  if (id_type === 'aadhaar' && !/^\d{12}$/.test(String(id_number).replace(/\s/g, ''))) {
    return res.status(400).json({ error: 'Aadhaar must be a 12-digit number' });
  }

  const visa = db.prepare('SELECT * FROM visas WHERE id = ?').get(visa_id);
  if (!visa) return res.status(404).json({ error: 'Visa not found' });

  const orderNumber = `VSA-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const id = uuidv4();
  const ageVal = age != null ? Number(age) : null;
  const kycFee = kycFeeFor(visa, { visa_duration });

  db.prepare(`
    INSERT INTO orders (
      id, order_number, visa_id, applicant_name, applicant_email, applicant_phone,
      passport_number, travel_date, nationality, age, date_of_birth, residence, education,
      work_experience, language, visa_duration, purpose, occupation, employment_status,
      id_type, id_number, net_worth, annual_income, trip_funds, notes,
      payment_method, payment_status, amount
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'card', 'pending', ?)
  `).run(
    id, orderNumber, visa_id, applicant_name, applicant_email, applicant_phone || '',
    passport_number, travel_date, nationality, ageVal, date_of_birth, residence, education,
    work_experience, language, visa_duration, purpose, occupation, employment_status,
    id_type, id_number, net_worth, annual_income, trip_funds, notes || '',
    kycFee
  );

  res.status(201).json({
    order_id: orderNumber,
    order_number: orderNumber,
    id,
    kyc_fee: kycFee,
    message: 'Assessment submitted successfully',
  });
});

app.get('/api/orders/:id', (req, res) => {
  const order = db.prepare(`
    SELECT o.*, v.country_name, v.flag_emoji, v.visa_type, v.processing_days
    FROM orders o JOIN visas v ON o.visa_id = v.id WHERE o.id = ?
  `).get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

app.get('/api/orders/track/:orderId', (req, res) => {
  const q = decodeURIComponent(String(req.params.orderId || '')).trim();
  if (!q) return res.status(400).json({ error: 'Order ID required' });

  let order = db.prepare(`
    SELECT o.id, o.order_number, o.order_status, o.payment_status, o.kyc_status,
           o.applicant_name, o.amount, o.visa_duration, o.created_at, o.updated_at,
           v.country_name, v.flag_emoji, v.visa_type, v.processing_days, v.category
    FROM orders o JOIN visas v ON o.visa_id = v.id
    WHERE o.order_number = ? OR o.id = ?
  `).get(q, q);

  if (!order && q.length >= 8) {
    order = db.prepare(`
      SELECT o.id, o.order_number, o.order_status, o.payment_status, o.kyc_status,
             o.applicant_name, o.amount, o.visa_duration, o.created_at, o.updated_at,
             v.country_name, v.flag_emoji, v.visa_type, v.processing_days, v.category
      FROM orders o JOIN visas v ON o.visa_id = v.id
      WHERE o.order_number LIKE ?
      ORDER BY o.created_at DESC LIMIT 1
    `).get(`%${q}%`);
  }

  if (!order) return res.status(404).json({ error: 'Order not found. Check your Tracking ID.' });

  const fee = Number(order.amount) > 0 ? Number(order.amount) : kycFeeFor(order, order);
  res.json({ ...order, kyc_fee: fee });
});

app.get('/api/orders/:id/kyc-fee', (req, res) => {
  const order = db.prepare(`
    SELECT o.*, v.category, v.country_name, v.flag_emoji, v.visa_type
    FROM orders o JOIN visas v ON o.visa_id = v.id WHERE o.id = ?
  `).get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (order.order_status !== 'completed') {
    return res.status(403).json({
      error: 'KYC is not available yet. Wait for approval, then track with your reference ID.',
      order_status: order.order_status,
    });
  }

  let fee = Number(order.amount);
  if (!fee || fee <= 0) {
    fee = kycFeeFor(order, order);
    db.prepare('UPDATE orders SET amount = ? WHERE id = ?').run(fee, order.id);
  }

  res.json({
    id: order.id,
    order_number: order.order_number,
    kyc_fee: fee,
    payment_status: order.payment_status,
    kyc_status: order.kyc_status,
    order_status: order.order_status,
    country_name: order.country_name,
    flag_emoji: order.flag_emoji,
    visa_type: order.visa_type,
    kyc_link: `/track?ref=${encodeURIComponent(order.order_number)}`,
  });
});

app.post('/api/orders/:id/kyc', upload.fields([
  { name: 'id_document', maxCount: 1 },
  { name: 'selfie', maxCount: 1 },
]), (req, res) => {
  const { full_name, date_of_birth, nationality, id_type, id_number } = req.body;
  const orderId = req.params.id;

  if (!full_name || !date_of_birth || !nationality || !id_type || !id_number) {
    return res.status(400).json({ error: 'All KYC fields are required' });
  }

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (order.payment_status !== 'confirmed') {
    return res.status(402).json({ error: 'Please pay the KYC verification fee first' });
  }

  if (order.order_status !== 'completed') {
    return res.status(403).json({ error: 'KYC opens after your application is approved' });
  }

  if (!req.files?.id_document?.[0] || !req.files?.selfie?.[0]) {
    return res.status(400).json({ error: 'ID document and selfie are required' });
  }

  const idDocPath = `/api/files/${req.files.id_document[0].filename}`;
  const selfiePath = `/api/files/${req.files.selfie[0].filename}`;

  db.prepare(`
    INSERT INTO kyc_verifications (
      order_id, full_name, date_of_birth, nationality, id_type, id_number, id_document_path, selfie_path
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(orderId, full_name, date_of_birth, nationality, id_type, id_number, idDocPath, selfiePath);

  db.prepare(`
    UPDATE orders SET
      kyc_status = 'submitted',
      kyc_document_path = ?,
      kyc_selfie_path = ?,
      kyc_submitted_at = datetime('now'),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(idDocPath, selfiePath, orderId);

  res.json({ message: 'KYC submitted successfully', status: 'submitted' });
});

app.post('/api/orders/:id/pay-crypto', (req, res) => {
  const { currency } = req.body;
  const orderId = req.params.id;
  const coin = String(currency || 'BTC').toUpperCase();

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const addresses = {
    BTC: process.env.CRYPTO_BTC || 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
    ETH: process.env.CRYPTO_ETH || '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
    USDT: process.env.CRYPTO_USDT || 'TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9',
  };

  if (!addresses[coin]) {
    return res.status(400).json({ error: 'Unsupported cryptocurrency' });
  }

  db.prepare(`UPDATE orders SET payment_method = 'crypto', updated_at = datetime('now') WHERE id = ?`).run(orderId);

  res.json({
    order_id: orderId,
    order_number: order.order_number,
    currency: coin,
    address: addresses[coin],
    amount: order.amount,
    network: coin === 'USDT' ? 'TRC-20' : coin,
    status: 'awaiting_payment',
    expires_in: 1800,
  });
});

app.post('/api/orders/:id/confirm-crypto', (req, res) => {
  const { tx_hash } = req.body;
  const orderId = req.params.id;

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  db.prepare(`
    UPDATE orders SET
      payment_status = 'confirmed',
      tx_hash = ?,
      order_status = 'processing',
      updated_at = datetime('now')
    WHERE id = ?
  `).run(tx_hash || `demo-${Date.now()}`, orderId);

  res.json({ message: 'Payment confirmed', status: 'confirmed' });
});

app.post('/api/orders/:id/pay-card', (req, res) => {
  const { card_number, card_expiry, card_cvc, card_name } = req.body;
  const orderId = req.params.id;

  const order = db.prepare(`
    SELECT o.*, v.category FROM orders o JOIN visas v ON o.visa_id = v.id WHERE o.id = ?
  `).get(orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (order.payment_status === 'confirmed') {
    return res.json({ message: 'Already paid', status: 'confirmed', card_last4: order.card_last4, amount: order.amount });
  }

  if (order.order_status !== 'completed') {
    return res.status(403).json({ error: 'KYC payment opens after your application is approved' });
  }

  if (!card_name || !card_number || !card_expiry || !card_cvc) {
    return res.status(400).json({ error: 'All card fields are required' });
  }

  const cleanCard = String(card_number).replace(/\s/g, '');
  if (cleanCard.length < 13 || cleanCard.length > 19 || !/^\d+$/.test(cleanCard)) {
    return res.status(400).json({ error: 'Invalid card number' });
  }
  if (!/^\d{3,4}$/.test(String(card_cvc))) {
    return res.status(400).json({ error: 'Invalid CVC' });
  }
  if (!/^\d{2}\/\d{2}$/.test(String(card_expiry))) {
    return res.status(400).json({ error: 'Invalid expiry format (MM/YY)' });
  }

  let fee = Number(order.amount);
  if (!fee || fee <= 0) {
    fee = kycFeeFor(order, order);
  }

  const last4 = cleanCard.slice(-4);

  // Dummy card charge — replace with Stripe later
  db.prepare(`
    UPDATE orders SET
      payment_status = 'confirmed',
      payment_method = 'card',
      card_last4 = ?,
      amount = ?,
      kyc_status = CASE WHEN kyc_status = 'n/a' OR kyc_status = 'pending' THEN 'awaiting' ELSE kyc_status END,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(last4, fee, orderId);

  res.json({
    message: 'KYC fee paid successfully',
    status: 'confirmed',
    card_last4: last4,
    amount: fee,
  });
});

// ── Admin API ──

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const hash = hashPassword(password);
  const user = db.prepare(
    'SELECT * FROM admin_users WHERE username = ? AND password_hash = ?'
  ).get(username, hash);

  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const token = createSession(user.username);
  res.json({ success: true, username: user.username, token });
});

app.post('/api/admin/logout', requireAdmin, (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.headers['x-admin-token'];
  if (token) db.prepare('DELETE FROM admin_sessions WHERE token = ?').run(token);
  res.json({ success: true });
});

app.get('/api/admin/orders', requireAdmin, (req, res) => {
  const { status, kyc_status, payment_status } = req.query;
  let sql = `
    SELECT o.*, v.country_name, v.flag_emoji, v.visa_type
    FROM orders o JOIN visas v ON o.visa_id = v.id WHERE 1=1
  `;
  const params = [];
  if (status) { sql += ' AND o.order_status = ?'; params.push(status); }
  if (kyc_status) { sql += ' AND o.kyc_status = ?'; params.push(kyc_status); }
  if (payment_status) { sql += ' AND o.payment_status = ?'; params.push(payment_status); }
  sql += ' ORDER BY o.created_at DESC';
  res.json(db.prepare(sql).all(...params));
});

app.patch('/api/admin/orders/:id', requireAdmin, (req, res) => {
  const { order_status, kyc_status, kyc_notes } = req.body || {};
  const orderId = req.params.id;

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const updates = [];
  const params = [];
  if (order_status) { updates.push('order_status = ?'); params.push(order_status); }
  if (kyc_status) { updates.push('kyc_status = ?'); params.push(kyc_status); }
  if (kyc_notes !== undefined) { updates.push('kyc_notes = ?'); params.push(kyc_notes); }
  if (kyc_status && kyc_status !== 'pending') {
    updates.push("kyc_reviewed_at = datetime('now')");
  }
  updates.push("updated_at = datetime('now')");

  db.prepare(`UPDATE orders SET ${updates.join(', ')} WHERE id = ?`).run(...params, orderId);

  if (kyc_status === 'verified' || kyc_status === 'rejected') {
    db.prepare(`
      UPDATE kyc_verifications SET
        status = ?,
        reviewed_at = datetime('now'),
        rejection_reason = ?
      WHERE order_id = ?
    `).run(kyc_status === 'verified' ? 'approved' : 'rejected', kyc_notes || null, orderId);
  }

  res.json({ message: 'Order updated' });
});

app.get('/api/admin/kyc', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT k.*, o.applicant_name, o.applicant_email, o.order_number, v.country_name, v.flag_emoji
    FROM kyc_verifications k
    JOIN orders o ON k.order_id = o.id
    JOIN visas v ON o.visa_id = v.id
    ORDER BY k.submitted_at DESC
  `).all();
  res.json(rows);
});

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const totalOrders = db.prepare('SELECT COUNT(*) as c FROM orders').get().c;
  const pendingOrders = db.prepare("SELECT COUNT(*) as c FROM orders WHERE order_status = 'pending'").get().c;
  const processingOrders = db.prepare("SELECT COUNT(*) as c FROM orders WHERE order_status = 'processing'").get().c;
  const completedOrders = db.prepare("SELECT COUNT(*) as c FROM orders WHERE order_status = 'completed'").get().c;
  res.json({ totalOrders, pendingOrders, processingOrders, completedOrders });
});

app.post('/api/admin/visas', requireAdmin, (req, res) => {
  const {
    country_code, country_name, flag_emoji, visa_type, category, price,
    processing_days, validity_days, entries, requirements, description,
  } = req.body || {};

  if (!country_code || !country_name || !visa_type || !category || price == null) {
    return res.status(400).json({ error: 'Missing required visa fields' });
  }

  const result = db.prepare(`
    INSERT INTO visas (
      country_code, country_name, flag_emoji, visa_type, category, price,
      processing_days, validity_days, entries, requirements, description
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    country_code, country_name, flag_emoji || '🏳️', visa_type, category, price,
    processing_days || 14, validity_days || 90, entries || 'Single',
    JSON.stringify(requirements || []), description || ''
  );

  res.status(201).json({ id: Number(result.lastInsertRowid), message: 'Visa added' });
});

app.delete('/api/admin/visas/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM visas WHERE id = ?').run(req.params.id);
  res.json({ message: 'Visa deleted' });
});

// Serve uploaded KYC files (works on Netlify /tmp and local disk)
app.get('/api/files/:name', (req, res) => {
  const name = path.basename(req.params.name);
  const filePath = path.join(UPLOAD_DIR, name);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  res.sendFile(filePath);
});

// Multer / API errors
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message?.includes('Only JPG')) {
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

if (!IS_NETLIFY) {
  app.get('/track', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });
}

async function ready() {
  await db.initDb();
  return app;
}

module.exports = app;
module.exports.ready = ready;

if (require.main === module) {
  ready().then(() => {
    const PORT = process.env.PORT || 3000;
    const HOST = process.env.HOST || '0.0.0.0';
    app.listen(PORT, HOST, () => {
      console.log(`\n  NexoraGo live at http://localhost:${PORT}`);
      console.log(`  Bound to ${HOST}:${PORT}\n`);
    });
  }).catch((err) => {
    console.error('[NexoraGo] Failed to start:', err);
    process.exit(1);
  });
}