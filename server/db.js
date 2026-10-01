const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR
  || ((process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME)
    ? path.join('/tmp', 'nexorago-data')
    : path.join(__dirname, '..', 'data'));
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'visa-store.db');
const SCHEMA_VERSION = 7;

function hashPassword(pw) {
  return crypto.createHash('sha256').update(pw).digest('hex');
}

function resolveWasm() {
  const candidates = [
    path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
    path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return fs.readFileSync(p);
  }
  throw new Error('sql.js wasm not found — run npm install');
}

/** Wrap sql.js so call sites can keep using DatabaseSync-style prepare().get/all/run */
function wrapSqlJs(SQL, fileBytes) {
  const raw = fileBytes ? new SQL.Database(fileBytes) : new SQL.Database();

  function persist() {
    try {
      const data = raw.export();
      fs.writeFileSync(DB_PATH, Buffer.from(data));
    } catch (err) {
      console.error('[DB] persist failed:', err.message);
    }
  }

  function prepare(sql) {
    return {
      all(...params) {
        const stmt = raw.prepare(sql);
        try {
          if (params.length) stmt.bind(params);
          const rows = [];
          while (stmt.step()) rows.push(stmt.getAsObject());
          return rows;
        } finally {
          stmt.free();
        }
      },
      get(...params) {
        const rows = this.all(...params);
        return rows[0];
      },
      run(...params) {
        raw.run(sql, params);
        const idRow = raw.exec('SELECT last_insert_rowid() AS id');
        const lastInsertRowid = idRow[0]?.values?.[0]?.[0] ?? 0;
        const changesRow = raw.exec('SELECT changes() AS c');
        const changes = changesRow[0]?.values?.[0]?.[0] ?? 0;
        persist();
        return { lastInsertRowid, changes };
      },
    };
  }

  function exec(sql) {
    raw.exec(sql);
    persist();
  }

  return { prepare, exec, _raw: raw, _persist: persist };
}

function migrateIfNeeded(db) {
  let version = 0;
  try {
    const row = db.prepare('PRAGMA user_version').get();
    version = row?.user_version ?? 0;
  } catch { /* empty db */ }

  if (version >= SCHEMA_VERSION) return;

  db.exec(`
    DROP TABLE IF EXISTS kyc_verifications;
    DROP TABLE IF EXISTS orders;
    DROP TABLE IF EXISTS jobs;
    DROP TABLE IF EXISTS admin_sessions;
    DROP TABLE IF EXISTS visas;
    DROP TABLE IF EXISTS admin_users;
  `);
}

function createSchema(db) {
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

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  country_code TEXT NOT NULL,
  country_name TEXT NOT NULL,
  city TEXT NOT NULL,
  category TEXT NOT NULL,
  salary_range TEXT,
  visa_support INTEGER DEFAULT 1,
  description TEXT NOT NULL,
  active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  visa_id INTEGER NOT NULL,
  applicant_name TEXT NOT NULL,
  applicant_email TEXT NOT NULL,
  applicant_phone TEXT NOT NULL,
  passport_number TEXT NOT NULL,
  travel_date TEXT NOT NULL,
  nationality TEXT,
  age INTEGER,
  date_of_birth TEXT,
  residence TEXT,
  current_city TEXT,
  preferred_city TEXT,
  job_id INTEGER,
  target_job TEXT,
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
  order_id TEXT NOT NULL,
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
}

const VISA_DATA = [
  { code: 'CA', name: 'Canada', flag: '🇨🇦', type: 'Express Entry (PR)', category: 'work', price: 0, processing: 180, validity: 1825, entries: 'Permanent', reqs: ['Valid passport', 'IELTS / CELPIP', 'ECA', 'Work experience', 'Proof of funds'], desc: 'Top PR pathway for skilled workers via Express Entry and PNP.', popular: 1 },
  { code: 'CA', name: 'Canada', flag: '🇨🇦', type: 'Visitor Visa (TRV)', category: 'tourist', price: 0, processing: 21, validity: 3650, entries: 'Multiple', reqs: ['Passport', 'Proof of funds', 'Ties to home'], desc: 'Canadian visitor visa for tourism and family visits.', popular: 1 },
  { code: 'CA', name: 'Canada', flag: '🇨🇦', type: 'Study Permit', category: 'student', price: 0, processing: 30, validity: 3650, entries: 'Multiple', reqs: ['LOA', 'Proof of funds', 'Language test'], desc: 'Study in Canada with work rights during studies.', popular: 0 },
  { code: 'DE', name: 'Germany', flag: '🇩🇪', type: 'EU Blue Card', category: 'work', price: 0, processing: 60, validity: 1460, entries: 'Multiple', reqs: ['Job offer', 'Degree', 'Salary threshold'], desc: 'EU Blue Card for engineers and IT professionals.', popular: 1 },
  { code: 'DE', name: 'Germany', flag: '🇩🇪', type: 'Skilled Worker Visa', category: 'work', price: 0, processing: 60, validity: 1460, entries: 'Multiple', reqs: ['Job contract', 'Qualification recognition'], desc: 'Germany skilled worker pathway outside Blue Card thresholds.', popular: 1 },
  { code: 'DE', name: 'Germany', flag: '🇩🇪', type: 'Schengen Visa (C)', category: 'tourist', price: 0, processing: 10, validity: 180, entries: 'Single/Multiple', reqs: ['Travel insurance', 'Bank statements'], desc: 'Short-stay Schengen for Germany and 29 countries.', popular: 0 },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', type: 'Skilled Worker Visa', category: 'work', price: 0, processing: 21, validity: 1825, entries: 'Multiple', reqs: ['CoS', 'English', 'Salary threshold'], desc: 'UK sponsored work visa with large Indian community.', popular: 1 },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', type: 'Graduate Visa', category: 'work', price: 0, processing: 14, validity: 730, entries: 'Multiple', reqs: ['UK degree', 'Student visa history'], desc: 'Post-study work without sponsorship for 2–3 years.', popular: 1 },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', type: 'Standard Visitor Visa', category: 'tourist', price: 0, processing: 15, validity: 1825, entries: 'Multiple', reqs: ['Bank statements', 'Itinerary'], desc: 'UK visitor visa for tourism and short business.', popular: 0 },
  { code: 'NL', name: 'Netherlands', flag: '🇳🇱', type: 'Highly Skilled Migrant', category: 'work', price: 0, processing: 30, validity: 1825, entries: 'Multiple', reqs: ['Recognized sponsor', 'Salary criterion'], desc: 'English-friendly tech hub work permit.', popular: 1 },
  { code: 'IE', name: 'Ireland', flag: '🇮🇪', type: 'Critical Skills Employment Permit', category: 'work', price: 0, processing: 45, validity: 730, entries: 'Multiple', reqs: ['Critical Skills job', 'Degree'], desc: 'Ireland tech and EU-access pathway.', popular: 1 },
  { code: 'PT', name: 'Portugal', flag: '🇵🇹', type: 'D3 Highly Qualified Worker', category: 'work', price: 0, processing: 60, validity: 730, entries: 'Multiple', reqs: ['Qualified job', 'Degree'], desc: 'Portugal residency track for qualified workers.', popular: 1 },
  { code: 'SE', name: 'Sweden', flag: '🇸🇪', type: 'Work Permit', category: 'work', price: 0, processing: 60, validity: 730, entries: 'Multiple', reqs: ['Job offer', 'Collective agreement'], desc: 'Sweden work permit for tech and engineering.', popular: 1 },
  { code: 'AU', name: 'Australia', flag: '🇦🇺', type: 'Skilled Independent (189/190)', category: 'work', price: 0, processing: 180, validity: 1825, entries: 'Permanent', reqs: ['Skills assessment', 'Points test', 'English'], desc: 'Australia points-based PR for skilled migrants.', popular: 1 },
  { code: 'AU', name: 'Australia', flag: '🇦🇺', type: 'Visitor Visa (600)', category: 'tourist', price: 0, processing: 20, validity: 365, entries: 'Single/Multiple', reqs: ['Funds', 'Itinerary'], desc: 'Australian visitor visa.', popular: 0 },
  { code: 'US', name: 'United States', flag: '🇺🇸', type: 'H-1B Specialty Occupation', category: 'work', price: 0, processing: 90, validity: 1095, entries: 'Multiple', reqs: ['US employer petition', 'Degree', 'LCA'], desc: 'US specialty occupation visa for IT and skilled roles.', popular: 1 },
  { code: 'US', name: 'United States', flag: '🇺🇸', type: 'Tourist Visa (B1/B2)', category: 'tourist', price: 0, processing: 14, validity: 3650, entries: 'Multiple', reqs: ['DS-160', 'Interview'], desc: 'US B1/B2 tourist and business visitor.', popular: 1 },
  { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪', type: 'Employment Visa', category: 'work', price: 0, processing: 14, validity: 730, entries: 'Multiple', reqs: ['Job offer', 'Medical', 'Attested docs'], desc: 'UAE employment visa — tax-free Gulf careers.', popular: 1 },
  { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪', type: 'Tourist Visa', category: 'tourist', price: 0, processing: 3, validity: 60, entries: 'Single/Multiple', reqs: ['Passport', 'Hotel'], desc: 'UAE tourist visa for Dubai and emirates.', popular: 0 },
  { code: 'NZ', name: 'New Zealand', flag: '🇳🇿', type: 'Skilled Migrant Category', category: 'work', price: 0, processing: 120, validity: 1825, entries: 'Permanent', reqs: ['Points', 'Job / skills', 'English'], desc: 'NZ skilled migrant pathway for PR.', popular: 1 },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬', type: 'Employment Pass', category: 'work', price: 0, processing: 21, validity: 730, entries: 'Multiple', reqs: ['Job offer', 'Salary threshold', 'Degree'], desc: 'Singapore EP for professionals in Asia hub.', popular: 1 },
  { code: 'JP', name: 'Japan', flag: '🇯🇵', type: 'Engineer / Specialist in Humanities', category: 'work', price: 0, processing: 45, validity: 1095, entries: 'Multiple', reqs: ['Job offer', 'Degree', 'COE'], desc: 'Japan work visa for engineers and specialists.', popular: 1 },
  { code: 'FR', name: 'France', flag: '🇫🇷', type: 'Talent Passport / Salarié', category: 'work', price: 0, processing: 60, validity: 1460, entries: 'Multiple', reqs: ['Job contract', 'Degree'], desc: 'France skilled worker and talent routes.', popular: 1 },
  { code: 'PL', name: 'Poland', flag: '🇵🇱', type: 'National Work Visa (D)', category: 'work', price: 0, processing: 30, validity: 365, entries: 'Multiple', reqs: ['Work permit / declaration', 'Job offer'], desc: 'Poland work visa — EU entry for many roles.', popular: 1 },
  { code: 'MT', name: 'Malta', flag: '🇲🇹', type: 'Single Permit (Work)', category: 'work', price: 0, processing: 45, validity: 365, entries: 'Multiple', reqs: ['Job offer', 'Qualifications'], desc: 'Malta English-speaking EU work permit.', popular: 0 },
  { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦', type: 'Work Visa (Iqama track)', category: 'work', price: 0, processing: 21, validity: 730, entries: 'Multiple', reqs: ['Sponsor', 'Medical', 'Attested docs'], desc: 'Saudi work visa for Vision 2030 job demand.', popular: 1 },
  { code: 'QA', name: 'Qatar', flag: '🇶🇦', type: 'Work Residence Permit', category: 'work', price: 0, processing: 21, validity: 730, entries: 'Multiple', reqs: ['Job offer', 'Medical'], desc: 'Qatar employment for skilled and hospitality roles.', popular: 0 },
  { code: 'MY', name: 'Malaysia', flag: '🇲🇾', type: 'Employment Pass', category: 'work', price: 0, processing: 30, validity: 730, entries: 'Multiple', reqs: ['Job offer', 'Qualifications'], desc: 'Malaysia EP for professionals in KL and tech parks.', popular: 0 },
  { code: 'KR', name: 'South Korea', flag: '🇰🇷', type: 'E-7 Specialty Occupation', category: 'work', price: 0, processing: 45, validity: 730, entries: 'Multiple', reqs: ['Job offer', 'Degree / experience'], desc: 'Korea E-7 for skilled specialty workers.', popular: 0 },
  { code: 'CZ', name: 'Czech Republic', flag: '🇨🇿', type: 'Employee Card', category: 'work', price: 0, processing: 60, validity: 730, entries: 'Multiple', reqs: ['Job offer', 'Qualifications'], desc: 'Czech Employee Card for EU work and stay.', popular: 0 },
  { code: 'IT', name: 'Italy', flag: '🇮🇹', type: 'Work Visa (Decreto Flussi / Blue Card)', category: 'work', price: 0, processing: 60, validity: 730, entries: 'Multiple', reqs: ['Quota / Blue Card job', 'Contract'], desc: 'Italy work routes for skilled and seasonal demand.', popular: 0 },
  { code: 'ES', name: 'Spain', flag: '🇪🇸', type: 'Highly Qualified / Work Visa', category: 'work', price: 0, processing: 60, validity: 730, entries: 'Multiple', reqs: ['Job offer', 'Degree'], desc: 'Spain highly qualified and work residence.', popular: 1 },
  { code: 'FI', name: 'Finland', flag: '🇫🇮', type: 'Specialist Residence Permit', category: 'work', price: 0, processing: 45, validity: 730, entries: 'Multiple', reqs: ['Job offer', 'Salary threshold'], desc: 'Finland specialist permit for tech talent.', popular: 0 },
  { code: 'DK', name: 'Denmark', flag: '🇩🇰', type: 'Pay Limit / Positive List', category: 'work', price: 0, processing: 30, validity: 1460, entries: 'Multiple', reqs: ['Job offer', 'Salary / Positive List'], desc: 'Denmark work schemes for skilled professionals.', popular: 0 },
];

const JOB_DATA = [
  { title: 'Software Engineer', company: 'NorthPeak Tech', code: 'CA', name: 'Canada', city: 'Toronto', category: 'IT', salary: 'CAD 85k–120k', desc: 'Full-stack role with PR-friendly employer support.' },
  { title: 'Cloud / DevOps Engineer', company: 'Maple Cloud', code: 'CA', name: 'Canada', city: 'Vancouver', category: 'IT', salary: 'CAD 90k–130k', desc: 'AWS/Azure DevOps with Express Entry friendly profile.' },
  { title: 'Registered Nurse', company: 'CareBridge Health', code: 'CA', name: 'Canada', city: 'Calgary', category: 'Healthcare', salary: 'CAD 70k–95k', desc: 'Hospital nursing roles with licensing guidance.' },
  { title: 'Java Backend Developer', company: 'Berlin SoftLabs', code: 'DE', name: 'Germany', city: 'Berlin', category: 'IT', salary: '€55k–75k', desc: 'EU Blue Card eligible backend engineering.' },
  { title: 'Mechanical Engineer', company: 'AutoTechnik GmbH', code: 'DE', name: 'Germany', city: 'Stuttgart', category: 'Engineering', salary: '€50k–70k', desc: 'Automotive OEM supplier — skilled worker visa.' },
  { title: 'Data Engineer', company: 'Rhine Analytics', code: 'DE', name: 'Germany', city: 'Munich', category: 'IT', salary: '€60k–80k', desc: 'Python/Spark pipelines, Blue Card salary band.' },
  { title: 'Full Stack Developer', company: 'Thames Digital', code: 'GB', name: 'United Kingdom', city: 'London', category: 'IT', salary: '£45k–70k', desc: 'Skilled Worker visa sponsorship available.' },
  { title: 'Product Manager', company: 'Northern Apps', code: 'GB', name: 'United Kingdom', city: 'Manchester', category: 'Product', salary: '£50k–75k', desc: 'SaaS product role with CoS sponsorship.' },
  { title: 'Healthcare Assistant', company: 'CareUK Partners', code: 'GB', name: 'United Kingdom', city: 'Birmingham', category: 'Healthcare', salary: '£24k–32k', desc: 'Care sector demand with visa support pathways.' },
  { title: 'Frontend Engineer', company: 'Dam Digital', code: 'NL', name: 'Netherlands', city: 'Amsterdam', category: 'IT', salary: '€50k–70k', desc: 'Highly Skilled Migrant eligible React role.' },
  { title: 'QA Automation Engineer', company: 'Eindhoven Labs', code: 'NL', name: 'Netherlands', city: 'Eindhoven', category: 'IT', salary: '€45k–62k', desc: 'Embedded/test automation with HSM sponsor.' },
  { title: 'Software Engineer', company: 'Liffey Tech', code: 'IE', name: 'Ireland', city: 'Dublin', category: 'IT', salary: '€45k–70k', desc: 'Critical Skills list occupation.' },
  { title: 'Account Manager', company: 'Atlantic Sales', code: 'IE', name: 'Ireland', city: 'Cork', category: 'Sales', salary: '€35k–50k', desc: 'B2B SaaS sales with EU base.' },
  { title: 'Full Stack Developer', company: 'Lisboa Code', code: 'PT', name: 'Portugal', city: 'Lisbon', category: 'IT', salary: '€30k–48k', desc: 'D3 qualified worker track.' },
  { title: 'Data Scientist', company: 'Nordic Insight', code: 'SE', name: 'Sweden', city: 'Stockholm', category: 'IT', salary: 'SEK 450k–650k', desc: 'Work permit for AI/ML talent.' },
  { title: 'Civil Engineer', company: 'Harbour Build', code: 'AU', name: 'Australia', city: 'Sydney', category: 'Engineering', salary: 'AUD 90k–130k', desc: 'Points-friendly engineering role.' },
  { title: 'Software Engineer', company: 'Outback Cloud', code: 'AU', name: 'Australia', city: 'Melbourne', category: 'IT', salary: 'AUD 95k–140k', desc: 'Skilled migration aligned tech role.' },
  { title: 'Software Engineer', company: 'Bay Area Systems', code: 'US', name: 'United States', city: 'San Francisco', category: 'IT', salary: 'USD 120k–170k', desc: 'H-1B specialty occupation track.' },
  { title: 'Data Analyst', company: 'Austin Metrics', code: 'US', name: 'United States', city: 'Austin', category: 'IT', salary: 'USD 85k–115k', desc: 'Analytics role for specialty visa profiles.' },
  { title: 'Software Engineer', company: 'Dubai FinTech', code: 'AE', name: 'United Arab Emirates', city: 'Dubai', category: 'IT', salary: 'AED 15k–25k/mo', desc: 'Tax-free tech role with employment visa.' },
  { title: 'Hospitality Supervisor', company: 'Gulf Hotels Group', code: 'AE', name: 'United Arab Emirates', city: 'Abu Dhabi', category: 'Hospitality', salary: 'AED 8k–14k/mo', desc: 'Hotel operations with sponsor visa.' },
  { title: 'Software Developer', company: 'Kiwi Soft', code: 'NZ', name: 'New Zealand', city: 'Auckland', category: 'IT', salary: 'NZD 80k–110k', desc: 'Skilled Migrant aligned developer role.' },
  { title: 'Cloud Engineer', company: 'Lion City Cloud', code: 'SG', name: 'Singapore', city: 'Singapore', category: 'IT', salary: 'SGD 6k–10k/mo', desc: 'Employment Pass for cloud talent.' },
  { title: 'Embedded Software Engineer', company: 'Tokyo Devices', code: 'JP', name: 'Japan', city: 'Tokyo', category: 'IT', salary: 'JPY 5.5M–8M', desc: 'Engineer visa with COE support.' },
  { title: 'Backend Developer', company: 'Paris SaaS', code: 'FR', name: 'France', city: 'Paris', category: 'IT', salary: '€42k–60k', desc: 'Talent Passport / salarié eligible.' },
  { title: 'Warehouse Operative', company: 'Warsaw Logistics', code: 'PL', name: 'Poland', city: 'Warsaw', category: 'Logistics', salary: 'PLN 5k–7k/mo', desc: 'Work visa with employer declaration.' },
  { title: 'iOS Developer', company: 'Madrid Mobile', code: 'ES', name: 'Spain', city: 'Madrid', category: 'IT', salary: '€35k–55k', desc: 'Highly qualified worker route.' },
  { title: 'Site Engineer', company: 'Riyadh Projects', code: 'SA', name: 'Saudi Arabia', city: 'Riyadh', category: 'Engineering', salary: 'SAR 10k–18k/mo', desc: 'Construction demand with work visa.' },
  { title: 'Chef de Partie', company: 'Doha Dining', code: 'QA', name: 'Qatar', city: 'Doha', category: 'Hospitality', salary: 'QAR 4k–7k/mo', desc: 'Hospitality employment residence.' },
  { title: 'Cybersecurity Analyst', company: 'KL Secure', code: 'MY', name: 'Malaysia', city: 'Kuala Lumpur', category: 'IT', salary: 'MYR 7k–12k/mo', desc: 'Employment Pass for security talent.' },
];

function seed(db) {
  const insertVisa = db.prepare(`
    INSERT OR IGNORE INTO visas (country_code, country_name, flag_emoji, visa_type, category, price, processing_days, validity_days, entries, requirements, description, popular)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const v of VISA_DATA) {
    insertVisa.run(v.code, v.name, v.flag, v.type, v.category, v.price, v.processing, v.validity, v.entries, JSON.stringify(v.reqs), v.desc, v.popular);
  }

  const jobCount = db.prepare('SELECT COUNT(*) as c FROM jobs').get().c;
  if (!jobCount) {
    const insertJob = db.prepare(`
      INSERT INTO jobs (title, company, country_code, country_name, city, category, salary_range, visa_support, description, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 1)
    `);
    for (const j of JOB_DATA) {
      insertJob.run(j.title, j.company, j.code, j.name, j.city, j.category, j.salary, j.desc);
    }
  }

  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminPass = process.env.ADMIN_PASS || 'NexoraGo2026!';
  db.prepare(`
    INSERT OR IGNORE INTO admin_users (username, password_hash) VALUES (?, ?)
  `).run(adminUser, hashPassword(adminPass));

  const count = db.prepare('SELECT COUNT(*) as c FROM visas').get().c;
  const jobs = db.prepare('SELECT COUNT(*) as c FROM jobs').get().c;
  console.log(`[DB] Seeded ${count} visa products, ${jobs} jobs (sql.js)`);
  console.log(`[DB] Admin login: ${adminUser} / (set ADMIN_PASS to change)`);
}


let _db = null;
let _initPromise = null;

async function initDb() {
  if (_db) return _db;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const wasmBinary = resolveWasm();
    const SQL = await initSqlJs({ wasmBinary });

    let fileBytes = null;
    if (fs.existsSync(DB_PATH)) {
      try {
        fileBytes = new Uint8Array(fs.readFileSync(DB_PATH));
      } catch {
        fileBytes = null;
      }
    }

    const db = wrapSqlJs(SQL, fileBytes);
    migrateIfNeeded(db);
    createSchema(db);
    seed(db);
    _db = db;
    return _db;
  })();

  try {
    return await _initPromise;
  } catch (err) {
    _initPromise = null;
    throw err;
  }
}

function getDb() {
  if (!_db) throw new Error('Database not initialized — call initDb() first');
  return _db;
}

const dbProxy = new Proxy({}, {
  get(_t, prop) {
    if (prop === 'initDb') return initDb;
    if (prop === 'getDb') return getDb;
    return getDb()[prop];
  },
});

module.exports = dbProxy;
module.exports.initDb = initDb;
module.exports.getDb = getDb;
