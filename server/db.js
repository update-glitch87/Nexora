const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR
  || ((process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME)
    ? path.join('/tmp', 'nexorago-data')
    : path.join(__dirname, '..', 'data'));
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'visa-store.db');
const SCHEMA_VERSION = 6;

const db = new DatabaseSync(DB_PATH);

function hashPassword(pw) {
  return crypto.createHash('sha256').update(pw).digest('hex');
}

function currentVersion() {
  return db.prepare('PRAGMA user_version').get().user_version;
}

function migrateIfNeeded() {
  const version = currentVersion();
  if (version >= SCHEMA_VERSION) return;

  // Rebuild schema (assessment form, no prices in flow)
  db.exec(`
    DROP TABLE IF EXISTS kyc_verifications;
    DROP TABLE IF EXISTS orders;
    DROP TABLE IF EXISTS admin_sessions;
    DROP TABLE IF EXISTS visas;
    DROP TABLE IF EXISTS admin_users;
  `);
}

migrateIfNeeded();

db.exec(`
CREATE TABLE IF NOT EXISTS visas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country_code TEXT NOT NULL,
  country_name TEXT NOT NULL,
  flag_emoji TEXT NOT NULL,
  visa_type TEXT NOT NULL,
  category TEXT NOT NULL,
  price REAL NOT NULL,
  processing_days INTEGER NOT NULL,
  validity_days INTEGER NOT NULL,
  entries TEXT NOT NULL,
  requirements TEXT NOT NULL,
  description TEXT NOT NULL,
  popular INTEGER DEFAULT 0,
  UNIQUE(country_code, visa_type, category)
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  visa_id INTEGER NOT NULL REFERENCES visas(id),
  applicant_name TEXT NOT NULL,
  applicant_email TEXT NOT NULL,
  applicant_phone TEXT NOT NULL,
  passport_number TEXT NOT NULL,
  travel_date TEXT NOT NULL,
  nationality TEXT,
  age INTEGER,
  date_of_birth TEXT,
  residence TEXT,
  education TEXT,
  work_experience TEXT,
  language TEXT,
  visa_duration TEXT,
  purpose TEXT,
  occupation TEXT,
  employment_status TEXT,
  id_type TEXT,
  id_number TEXT,
  net_worth TEXT,
  annual_income TEXT,
  trip_funds TEXT,
  notes TEXT,
  payment_method TEXT NOT NULL DEFAULT 'assessment',
  payment_status TEXT NOT NULL DEFAULT 'n/a',
  order_status TEXT NOT NULL DEFAULT 'pending',
  kyc_status TEXT NOT NULL DEFAULT 'n/a',
  kyc_document_path TEXT,
  kyc_selfie_path TEXT,
  kyc_submitted_at TEXT,
  kyc_reviewed_at TEXT,
  kyc_notes TEXT,
  tx_hash TEXT,
  card_last4 TEXT,
  amount REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kyc_verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id),
  full_name TEXT NOT NULL,
  date_of_birth TEXT NOT NULL,
  nationality TEXT NOT NULL,
  id_type TEXT NOT NULL,
  id_number TEXT NOT NULL,
  id_document_path TEXT NOT NULL,
  selfie_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT,
  rejection_reason TEXT
);

CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
`);

db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);

const VISA_DATA = [
  // Top destinations for Indian migrants
  { code: 'CA', name: 'Canada', flag: '🇨🇦', type: 'Express Entry (PR)', category: 'work', price: 0, processing: 180, validity: 1825, entries: 'Permanent', reqs: ['Valid passport', 'IELTS / CELPIP', 'ECA education assessment', 'Work experience proof', 'Proof of funds', 'Police clearance'], desc: 'Canada ranks #1 for Indian migrants. Express Entry (FSW, CEC, FST) and PNP pathways to permanent residency with strong diaspora networks.', popular: 1 },
  { code: 'CA', name: 'Canada', flag: '🇨🇦', type: 'Visitor Visa (TRV)', category: 'tourist', price: 0, processing: 21, validity: 3650, entries: 'Multiple', reqs: ['Valid passport', 'Proof of funds', 'Employment letter', 'Travel history', 'Digital photo'], desc: 'Canadian Temporary Resident Visa for tourism and visiting family. Usually valid up to 10 years.', popular: 1 },
  { code: 'CA', name: 'Canada', flag: '🇨🇦', type: 'Study Permit', category: 'student', price: 0, processing: 30, validity: 3650, entries: 'Multiple', reqs: ['Letter of acceptance', 'Proof of funds', 'Language test', 'SOP'], desc: 'Canadian study permit for designated learning institutions. Includes work rights during studies.', popular: 0 },

  { code: 'DE', name: 'Germany', flag: '🇩🇪', type: 'EU Blue Card', category: 'work', price: 0, processing: 60, validity: 1460, entries: 'Multiple', reqs: ['Job offer in Germany', 'Degree recognition', 'Salary threshold proof', 'Valid passport', 'Health insurance'], desc: 'Leading European choice for Indian engineers and IT professionals. EU Blue Card for skilled workers with efficient processing.', popular: 1 },
  { code: 'DE', name: 'Germany', flag: '🇩🇪', type: 'Skilled Worker Visa', category: 'work', price: 0, processing: 60, validity: 1460, entries: 'Multiple', reqs: ['Job contract', 'Qualification recognition', 'German language (if required)', 'Passport'], desc: 'Germany skilled worker pathway for qualified professionals outside Blue Card salary thresholds.', popular: 1 },
  { code: 'DE', name: 'Germany', flag: '🇩🇪', type: 'Schengen Visa (C)', category: 'tourist', price: 0, processing: 10, validity: 180, entries: 'Single/Multiple', reqs: ['Travel insurance (€30k)', 'Bank statements', 'Hotel booking', 'Flight reservation'], desc: 'Short-stay Schengen visa for Germany and 29 European countries. Up to 90 days in 180.', popular: 0 },

  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', type: 'Skilled Worker Visa', category: 'work', price: 0, processing: 21, validity: 1825, entries: 'Multiple', reqs: ['Certificate of Sponsorship', 'English proof', 'Salary meets threshold', 'Passport'], desc: 'Highly favored for its large Indian community. Skilled Worker route for sponsored employment in the UK.', popular: 1 },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', type: 'Graduate Visa', category: 'work', price: 0, processing: 14, validity: 730, entries: 'Multiple', reqs: ['UK degree completion', 'Valid Student visa history', 'Passport'], desc: 'UK Graduate route after studies — work or look for work without sponsorship for 2–3 years.', popular: 1 },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', type: 'Standard Visitor Visa', category: 'tourist', price: 0, processing: 15, validity: 1825, entries: 'Multiple', reqs: ['Bank statements', 'Employment proof', 'Travel itinerary'], desc: 'UK visitor visa for tourism, family visits, and short business trips.', popular: 0 },

  { code: 'NL', name: 'Netherlands', flag: '🇳🇱', type: 'Highly Skilled Migrant', category: 'work', price: 0, processing: 30, validity: 1825, entries: 'Multiple', reqs: ['Recognized sponsor job offer', 'Salary criterion', 'Passport', 'Degree'], desc: 'English-friendly tech hub with progressive work-life standards. Highly Skilled Migrant permit for IT and engineering.', popular: 1 },
  { code: 'IE', name: 'Ireland', flag: '🇮🇪', type: 'Critical Skills Employment Permit', category: 'work', price: 0, processing: 45, validity: 730, entries: 'Multiple', reqs: ['Job offer on Critical Skills list', 'Degree', 'Passport', 'Salary threshold'], desc: 'Ireland ranks high for English-speaking tech roles and EU access via Critical Skills permit.', popular: 1 },
  { code: 'PT', name: 'Portugal', flag: '🇵🇹', type: 'D3 Highly Qualified Worker', category: 'work', price: 0, processing: 60, validity: 730, entries: 'Multiple', reqs: ['Qualified job contract', 'Degree', 'Proof of means', 'Passport'], desc: 'Portugal offers progressive residency options and growing tech opportunities for qualified workers.', popular: 1 },
  { code: 'SE', name: 'Sweden', flag: '🇸🇪', type: 'Work Permit', category: 'work', price: 0, processing: 60, validity: 730, entries: 'Multiple', reqs: ['Job offer', 'Collective agreement / salary', 'Passport', 'Insurance'], desc: 'Sweden ranks high for work-life balance and English-friendly tech and engineering careers.', popular: 1 },

  { code: 'AU', name: 'Australia', flag: '🇦🇺', type: 'Skilled Independent (189/190)', category: 'work', price: 0, processing: 180, validity: 1825, entries: 'Permanent', reqs: ['Skills assessment', 'Points test', 'English (IELTS)', 'Age under 45', 'EOI'], desc: 'Australia points and salary/skills systems for PR. Popular alternative global option for Indian professionals.', popular: 1 },
  { code: 'AU', name: 'Australia', flag: '🇦🇺', type: 'Visitor Visa (600)', category: 'tourist', price: 0, processing: 20, validity: 365, entries: 'Single/Multiple', reqs: ['Bank statements', 'Employment proof', 'Itinerary'], desc: 'Australian visitor visa for tourism and family visits.', popular: 0 },

  { code: 'US', name: 'United States', flag: '🇺🇸', type: 'H-1B Specialty Occupation', category: 'work', price: 0, processing: 90, validity: 1095, entries: 'Multiple', reqs: ['US employer petition', 'Bachelor degree+', 'LCA', 'Passport'], desc: 'US tech and H-1B track remains a massive favorite for Indian IT and specialty occupations.', popular: 1 },
  { code: 'US', name: 'United States', flag: '🇺🇸', type: 'Tourist Visa (B1/B2)', category: 'tourist', price: 0, processing: 14, validity: 3650, entries: 'Multiple', reqs: ['DS-160', 'Interview', 'Bank statements', 'Ties to home country'], desc: 'US B1/B2 for tourism and short business visits. Valid up to 10 years.', popular: 1 },

  { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪', type: 'Employment Visa', category: 'work', price: 0, processing: 14, validity: 730, entries: 'Multiple', reqs: ['UAE job offer', 'Attested documents', 'Medical fitness', 'Passport'], desc: 'UAE remains a favorite for tax-free earnings, Dubai/Abu Dhabi careers, and fast employment visas.', popular: 1 },
  { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪', type: 'Tourist Visa', category: 'tourist', price: 0, processing: 3, validity: 60, entries: 'Single/Multiple', reqs: ['Passport 6+ months', 'Photo', 'Hotel / ticket'], desc: 'UAE tourist visa for Dubai and other emirates. Extendable options available.', popular: 1 },
];

const insertVisa = db.prepare(`
  INSERT OR IGNORE INTO visas (country_code, country_name, flag_emoji, visa_type, category, price, processing_days, validity_days, entries, requirements, description, popular)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (const v of VISA_DATA) {
  insertVisa.run(v.code, v.name, v.flag, v.type, v.category, v.price, v.processing, v.validity, v.entries, JSON.stringify(v.reqs), v.desc, v.popular);
}

const adminUser = process.env.ADMIN_USER || 'admin';
const adminPass = process.env.ADMIN_PASS || 'NexoraGo2026!';
db.prepare(`
  INSERT OR IGNORE INTO admin_users (username, password_hash) VALUES (?, ?)
`).run(adminUser, hashPassword(adminPass));

const count = db.prepare('SELECT COUNT(*) as c FROM visas').get().c;
console.log(`[DB] Seeded ${count} visa products`);
console.log(`[DB] Admin login: ${adminUser} / (set ADMIN_PASS to change)`);

module.exports = db;
