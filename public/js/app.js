// ── State ──
let currentVisa = null;
let currentOrder = null;
let formStep = 1;
let adminToken = localStorage.getItem('nexorago_admin_token') || null;
const ADMIN_SECRET_PATH = '/admin82832783';
let adminGateOk = sessionStorage.getItem('nexorago_admin_gate') === '1';

function isAdminSecretPath() {
  const path = (window.location.pathname || '').replace(/\/+$/, '') || '/';
  return path === ADMIN_SECRET_PATH || path.endsWith(ADMIN_SECRET_PATH);
}

function unlockAdminGate() {
  adminGateOk = true;
  sessionStorage.setItem('nexorago_admin_gate', '1');
}

function showView(viewName) {
  if (viewName === 'admin' && !adminGateOk && !isAdminSecretPath()) {
    showToast('Admin is not available here', 'error');
    return;
  }
  if (viewName === 'admin') unlockAdminGate();

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const view = document.getElementById(`view-${viewName}`);
  if (view) view.classList.add('active');
  window.scrollTo(0, 0);

  const navLinks = document.getElementById('navLinks');
  if (navLinks) navLinks.classList.remove('open');

  if (viewName === 'home') {
    loadPopularVisas();
    loadHomeJobs();
  }
  if (viewName === 'visas') loadAllVisas();
  if (viewName === 'jobs') loadAllJobs();
  if (viewName === 'admin') {
    if (adminToken) {
      document.getElementById('admin-login').style.display = 'none';
      document.getElementById('admin-dashboard').style.display = 'block';
      loadAdminDashboard();
    } else {
      document.getElementById('admin-login').style.display = 'block';
      document.getElementById('admin-dashboard').style.display = 'none';
    }
  }
}

function toggleNav() {
  document.getElementById('navLinks').classList.toggle('open');
}

async function api(url, options = {}) {
  const opts = { ...options };
  const headers = { ...(options.headers || {}) };
  const isFormData = typeof FormData !== 'undefined' && opts.body instanceof FormData;
  if (!isFormData && !headers['Content-Type'] && opts.body) {
    headers['Content-Type'] = 'application/json';
  }
  if (adminToken) headers.Authorization = `Bearer ${adminToken}`;
  opts.headers = headers;

  try {
    const res = await fetch(url, opts);
    let data = {};
    const text = await res.text();
    try { data = text ? JSON.parse(text) : {}; } catch {
      data = { error: text?.slice(0, 120) || `Request failed (${res.status})` };
    }

    if (!res.ok) {
      if (res.status === 401 && url.includes('/api/admin/') && !url.includes('/login')) {
        adminToken = null;
        localStorage.removeItem('nexorago_admin_token');
      }
      const msg = data.error || data.detail || `Request failed (${res.status})`;
      throw new Error(typeof msg === 'string' ? msg : 'Request failed');
    }
    return data;
  } catch (err) {
    const message = err.message === 'Failed to fetch'
      ? 'Cannot reach API — check Netlify function deploy'
      : err.message;
    showToast(message, 'error');
    throw err;
  }
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeJs(str) {
  return String(str ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r?\n/g, ' ');
}

/** Open WhatsApp outside the webview/APK (native WhatsApp via wa.me) */
function openWhatsApp(phone, event) {
  if (event) event.preventDefault();
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return false;
  const msg = encodeURIComponent('Hi NexoraGo, I need help with jobs / visa.');
  const url = `https://wa.me/${digits}?text=${msg}`;
  // Opens outside the site / WebView into WhatsApp when installed
  const win = window.open(url, '_blank', 'noopener,noreferrer');
  if (!win) window.location.href = url;
  return false;
}

function toggleWaFloat() {
  const menu = document.getElementById('wa-float-menu');
  if (!menu) return;
  menu.hidden = !menu.hidden;
}

async function loadPopularVisas() {
  try {
    const visas = await api('/api/visas?popular=1');
    document.getElementById('popular-visas').innerHTML = visas.map(v => visaCardHTML(v)).join('');
    refreshCardEffects();
  } catch (e) { /* handled */ }
}

async function loadAllVisas() {
  try {
    const visas = await api('/api/visas');
    document.getElementById('all-visas').innerHTML = visas.map(v => visaCardHTML(v)).join('');
    const countries = [...new Map(visas.map(v => [v.country_code, v])).values()]
      .sort((a, b) => a.country_name.localeCompare(b.country_name));
    document.getElementById('filter-country').innerHTML =
      '<option value="">All Countries</option>' +
      countries.map(c => `<option value="${escapeHtml(c.country_code)}">${c.flag_emoji} ${escapeHtml(c.country_name)}</option>`).join('');
    refreshCardEffects();
  } catch (e) { /* handled */ }
}

async function filterVisas() {
  const params = new URLSearchParams();
  const search = document.getElementById('search-input').value;
  const category = document.getElementById('filter-category').value;
  const country = document.getElementById('filter-country').value;
  if (search) params.set('search', search);
  if (category) params.set('category', category);
  if (country) params.set('country', country);

  try {
    const visas = await api(`/api/visas?${params}`);
    document.getElementById('all-visas').innerHTML = visas.length
      ? visas.map(v => visaCardHTML(v)).join('')
      : '<p style="text-align:center;color:var(--text-muted);padding:2rem;">No visas found.</p>';
    refreshCardEffects();
  } catch (e) { /* handled */ }
}

function visaCardHTML(v) {
  const cat = (v.category || '').charAt(0).toUpperCase() + (v.category || '').slice(1);
  return `
    <div class="visa-card" onclick="startFromCard(${Number(v.id)})">
      <div class="visa-card-header">
        <span class="visa-flag">${v.flag_emoji}</span>
        <div class="visa-card-title">
          <h3>${escapeHtml(v.country_name)}</h3>
          <span>${escapeHtml(v.visa_type)}</span>
        </div>
      </div>
      <div class="visa-card-body">
        <p>${escapeHtml(v.description)}</p>
        <div class="visa-card-footer">
          <div class="visa-meta">
            <span class="visa-tag">${escapeHtml(cat)}</span>
            <span>⏱ ${Number(v.processing_days)} days</span>
          </div>
          <span class="visa-cta">Select →</span>
        </div>
      </div>
    </div>
  `;
}

async function startFromCard(id) {
  try {
    currentVisa = await api(`/api/visas/${id}`);
    startApplication(currentVisa.id);
  } catch (e) { /* handled */ }
}

let allJobsCache = [];
let pendingJobId = null;

function jobCardHTML(j) {
  return `
    <div class="job-card">
      <div class="job-card-top">
        <h3>${escapeHtml(j.title)}</h3>
        <span class="job-tag">${escapeHtml(j.category)}</span>
      </div>
      <p class="job-company">${escapeHtml(j.company)}</p>
      <p class="job-loc">${escapeHtml(j.country_name)} · ${escapeHtml(j.city)}</p>
      <p class="job-salary">${escapeHtml(j.salary_range || 'Competitive')}</p>
      <p class="job-desc">${escapeHtml(j.description)}</p>
      <div class="job-card-actions">
        <span class="visa-tag">${j.visa_support ? 'Visa support' : 'Check visa'}</span>
        <button type="button" class="btn btn-sm btn-primary" onclick="applyForJob(${Number(j.id)})">Apply →</button>
      </div>
    </div>
  `;
}

async function loadHomeJobs() {
  try {
    const jobs = await api('/api/jobs');
    allJobsCache = jobs;
    const el = document.getElementById('home-jobs');
    if (el) el.innerHTML = jobs.slice(0, 6).map(jobCardHTML).join('');
  } catch (e) { /* handled */ }
}

async function loadAllJobs() {
  try {
    const jobs = await api('/api/jobs');
    allJobsCache = jobs;
    const countries = [...new Map(jobs.map(j => [j.country_code, j])).values()]
      .sort((a, b) => a.country_name.localeCompare(b.country_name));
    const sel = document.getElementById('job-filter-country');
    if (sel) {
      sel.innerHTML = '<option value="">All Countries</option>' +
        countries.map(c => `<option value="${escapeHtml(c.country_code)}">${escapeHtml(c.country_name)}</option>`).join('');
    }
    renderJobs(jobs);
  } catch (e) { /* handled */ }
}

function renderJobs(jobs) {
  const el = document.getElementById('all-jobs');
  if (!el) return;
  el.innerHTML = jobs.length
    ? jobs.map(jobCardHTML).join('')
    : '<p style="text-align:center;color:var(--text-muted);padding:2rem;">No jobs found.</p>';
}

function filterJobs() {
  const q = (document.getElementById('job-search')?.value || '').toLowerCase();
  const country = document.getElementById('job-filter-country')?.value || '';
  const category = document.getElementById('job-filter-category')?.value || '';
  const filtered = allJobsCache.filter(j => {
    if (country && j.country_code !== country) return false;
    if (category && j.category !== category) return false;
    if (q) {
      const hay = `${j.title} ${j.company} ${j.city} ${j.country_name}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  renderJobs(filtered);
}

async function applyForJob(jobId) {
  try {
    const job = await api(`/api/jobs/${jobId}`);
    pendingJobId = job.id;
    // pick a matching work visa for that country
    const visas = await api(`/api/visas?country=${encodeURIComponent(job.country_code)}&category=work`);
    const visa = visas[0] || (await api(`/api/visas?country=${encodeURIComponent(job.country_code)}`))[0];
    if (!visa) {
      showToast('No visa pathway found for this country', 'warning');
      return;
    }
    currentVisa = visa;
    startApplication(visa.id, job);
  } catch (e) { /* handled */ }
}

async function prepareApplyForm(selectedJob = null) {
  try {
    const meta = await api(`/api/cities?country=${encodeURIComponent(currentVisa?.country_code || '')}`);
    const homeSel = document.getElementById('current-city');
    const prefSel = document.getElementById('preferred-city');
    const jobSel = document.getElementById('apply-job-id');
    const list = document.getElementById('job-title-list');

    if (homeSel) {
      homeSel.innerHTML = '<option value="">Select city</option>' +
        (meta.home_cities || []).map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    }
    if (prefSel) {
      const cities = meta.cities || [];
      prefSel.innerHTML = '<option value="">Select city</option>' +
        cities.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('') +
        '<option value="Other">Other</option>';
    }
    if (list) {
      list.innerHTML = (meta.job_titles || []).map(t => `<option value="${escapeHtml(t)}"></option>`).join('');
    }

    const countryJobs = await api(`/api/jobs?country=${encodeURIComponent(currentVisa?.country_code || '')}`);
    if (jobSel) {
      jobSel.innerHTML = '<option value="">Custom / not listed</option>' +
        countryJobs.map(j => `<option value="${j.id}">${escapeHtml(j.title)} — ${escapeHtml(j.city)}</option>`).join('');
    }

    if (selectedJob) {
      if (jobSel) jobSel.value = String(selectedJob.id);
      const occ = document.getElementById('occupation-input');
      if (occ) occ.value = selectedJob.title;
      const tj = document.getElementById('target-job-input');
      if (tj) tj.value = selectedJob.title;
      if (prefSel && selectedJob.city) prefSel.value = selectedJob.city;
      const purpose = document.querySelector('#apply-form [name="purpose"]');
      if (purpose) purpose.value = 'work';
    } else if (pendingJobId && jobSel) {
      jobSel.value = String(pendingJobId);
      onApplyJobChange();
    }
  } catch (e) { /* handled */ }
}

function onApplyJobChange() {
  const jobSel = document.getElementById('apply-job-id');
  const id = jobSel?.value;
  if (!id) return;
  const job = allJobsCache.find(j => String(j.id) === String(id));
  if (!job) return;
  const occ = document.getElementById('occupation-input');
  if (occ) occ.value = job.title;
  const tj = document.getElementById('target-job-input');
  if (tj) tj.value = job.title;
  const prefSel = document.getElementById('preferred-city');
  if (prefSel && [...prefSel.options].some(o => o.value === job.city)) prefSel.value = job.city;
}

function startApplication(visaId, selectedJob = null) {
  if (!currentVisa || Number(currentVisa.id) !== Number(visaId)) {
    showToast('Please select a visa first', 'warning');
    return;
  }

  const form = document.getElementById('apply-form');
  if (form) form.reset();

  const travelInput = document.querySelector('#apply-form input[name="travel_date"]');
  if (travelInput) {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    travelInput.min = d.toISOString().slice(0, 10);
  }

  const setHidden = (name, val) => {
    const el = document.querySelector(`#apply-form [name="${name}"]`);
    if (el) el.value = val;
  };
  setHidden('residence', 'India');
  setHidden('language', 'fluent');
  setHidden('trip_funds', '5k_10k');
  setHidden('notes', '');
  const emp = document.querySelector('#apply-form [name="employment_status"]');
  if (emp) emp.value = 'employed';

  document.getElementById('apply-visa-label').textContent =
    `${currentVisa.flag_emoji} ${currentVisa.country_name} — ${currentVisa.visa_type}`;

  updateSummary();
  showView('apply');
  prepareApplyForm(selectedJob);
  pendingJobId = null;
}

async function showVisaDetail(id) {
  try {
    const v = await api(`/api/visas/${id}`);
    currentVisa = v;
    const reqs = Array.isArray(v.requirements) ? v.requirements : [];

    document.getElementById('visa-detail-content').innerHTML = `
      <div class="detail-container">
        <div class="detail-header">
          <span class="detail-flag">${v.flag_emoji}</span>
          <div class="detail-info">
            <h2>${escapeHtml(v.country_name)}</h2>
            <p>${escapeHtml(v.visa_type)}</p>
          </div>
        </div>
        <div class="detail-section">
          <p style="color:var(--text-secondary);">${escapeHtml(v.description)}</p>
        </div>
        <div class="detail-section">
          <div class="detail-meta">
            <div class="meta-item">
              <div class="value">${Number(v.processing_days)} days</div>
              <div class="label">Processing</div>
            </div>
            <div class="meta-item">
              <div class="value">${escapeHtml(v.entries)}</div>
              <div class="label">Entries</div>
            </div>
            <div class="meta-item">
              <div class="value">${escapeHtml(v.category)}</div>
              <div class="label">Category</div>
            </div>
          </div>
        </div>
        <div class="detail-section">
          <h3>Typical Requirements</h3>
          <ul>${reqs.slice(0, 5).map(r => `<li>${escapeHtml(r)}</li>`).join('')}</ul>
        </div>
        <button class="btn btn-primary btn-lg btn-full" onclick="startApplication(${Number(v.id)})">
          Continue Assessment
        </button>
      </div>
    `;
    showView('detail');
  } catch (e) { /* handled */ }
}

function updateSummary() {
  if (!currentVisa) return;
  document.getElementById('order-summary').innerHTML = `
    <div class="summary-row">
      <span>Selected visa</span>
      <span>${currentVisa.flag_emoji} ${escapeHtml(currentVisa.country_name)}</span>
    </div>
    <div class="summary-row">
      <span>Type</span>
      <span>${escapeHtml(currentVisa.visa_type)}</span>
    </div>
  `;
}

function updateIdLabel() {
  const type = document.querySelector('#apply-form select[name="id_type"]')?.value;
  const label = document.getElementById('id-number-label');
  const input = document.querySelector('#apply-form input[name="id_number"]');
  const map = {
    aadhaar: ['Aadhaar Number *', '12-digit Aadhaar'],
    passport: ['Passport Number *', 'Passport number'],
    national_id: ['National ID Number *', 'ID number'],
    drivers_license: ["Driver's License Number *", 'License number'],
  };
  const [text, ph] = map[type] || ['ID / Aadhaar Number *', 'Enter ID number'];
  if (label) label.textContent = text;
  if (input) input.placeholder = ph;
}

function goToStep(step) {
  formStep = step;
  document.querySelectorAll('.wizard-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`step-${step}`)?.classList.add('active');

  document.querySelectorAll('.wizard-step').forEach(el => {
    const n = Number(el.dataset.step);
    el.classList.toggle('active', n === step);
    el.classList.toggle('done', n < step);
  });
  window.scrollTo(0, 0);
}

function validateStep(step) {
  const panel = document.getElementById(`step-${step}`);
  if (!panel) return false;
  const fields = panel.querySelectorAll('input[required], select[required], textarea[required]');
  for (const field of fields) {
    if (!field.checkValidity()) {
      field.reportValidity();
      return false;
    }
  }
  return true;
}

function nextStep(from) {
  if (!validateStep(from)) return;
  goToStep(from + 1);
}

function prevStep(from) {
  goToStep(Math.max(1, from - 1));
}

function calcAge(dob) {
  if (!dob) return null;
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

async function submitApplication(e) {
  e.preventDefault();
  if (!currentVisa) {
    showToast('Please select a visa first', 'warning');
    return;
  }

  const form = e.target;
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const data = Object.fromEntries(new FormData(form));
  data.visa_id = currentVisa.id;
  data.age = calcAge(data.date_of_birth);
  data.residence = data.residence || data.nationality || 'India';
  data.employment_status = data.employment_status || 'employed';
  data.language = data.language || 'fluent';
  data.trip_funds = data.trip_funds || '5k_10k';
  data.target_job = data.target_job || data.occupation;
  if (!data.job_id) delete data.job_id;

  const btn = form.querySelector('button[type="submit"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Submitting...'; }

  try {
    const result = await api('/api/orders', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    currentOrder = {
      id: result.id,
      order_number: result.order_number || result.order_id,
      kyc_fee: result.kyc_fee,
    };

    localStorage.setItem('nexorago_last_ref', currentOrder.order_number);

    const ref = currentOrder.order_number;
    document.getElementById('success-details').innerHTML = `
      <div class="ref-box">
        <div class="ref-label">Your Tracking ID — copy &amp; save</div>
        <div class="ref-id" id="success-ref-id">${escapeHtml(ref)}</div>
        <button type="button" class="btn btn-primary btn-full" onclick="copyTrackingId('${escapeHtml(ref)}')">Copy Tracking ID</button>
      </div>
      <div class="summary-row" style="margin-top:1rem;"><span>Visa</span><span>${escapeHtml(currentVisa.country_name)} — ${escapeHtml(currentVisa.visa_type)}</span></div>
      <div class="summary-row"><span>Status</span><span>Under review</span></div>
      <p style="margin-top:0.75rem;font-size:0.85rem;color:var(--text-muted);">Use Track later with this ID. After approval, KYC verify will appear there.</p>
    `;

    const trackInput = document.getElementById('track-order-id');
    if (trackInput) trackInput.value = ref;

    form.reset();
    showToast('Submitted — copy your Tracking ID', 'success');
    showView('success');
  } catch (err) { /* handled */ }
  finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Submit Assessment'; }
  }
}

function copyTrackingId(ref) {
  const id = ref || document.getElementById('success-ref-id')?.textContent?.trim();
  if (!id) return;
  navigator.clipboard?.writeText(id)
    .then(() => showToast('Tracking ID copied', 'success'))
    .catch(() => prompt('Copy your Tracking ID:', id));
}

function displayTrackResult(order) {
  currentOrder = {
    id: order.id,
    order_number: order.order_number,
    kyc_fee: order.kyc_fee || order.amount || 1,
  };

  const approved = order.order_status === 'completed';
  const paid = order.payment_status === 'confirmed';
  const kycDone = ['submitted', 'verified', 'approved'].includes(order.kyc_status);
  const reviewing = order.order_status === 'processing' || approved;

  let stepIndex = 0;
  if (reviewing) stepIndex = 1;
  if (approved) stepIndex = 2;
  if (approved && (paid || kycDone)) stepIndex = 3;

  const steps = [
    { label: 'Received' },
    { label: 'Reviewing' },
    { label: 'Approved' },
    { label: 'KYC' },
  ];

  let actionHtml = '';
  if (!approved) {
    actionHtml = `
      <div style="margin-top:1.25rem;padding:1rem;border-radius:var(--radius-sm);background:var(--bg-glass);">
        <p style="color:var(--text-secondary);font-size:0.9rem;margin:0;">
          Status: <strong>Under review</strong>. When approved, a <strong>Verify KYC</strong> button will appear here.
        </p>
      </div>`;
  } else if (!paid) {
    actionHtml = `
      <div style="margin-top:1.25rem;padding:1rem;border-radius:var(--radius-sm);background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.35);">
        <p style="color:var(--success);margin-bottom:0.75rem;font-size:0.95rem;font-weight:600;">
          Application approved — complete KYC verification
        </p>
        <p style="color:var(--text-secondary);margin-bottom:0.75rem;font-size:0.85rem;">
          Pay $${Number(order.kyc_fee || 1)} verification fee, then upload your ID documents.
        </p>
        <button class="btn btn-primary btn-full" onclick="goToKycPayment()">Verify KYC — Pay $${Number(order.kyc_fee || 1)} →</button>
      </div>`;
  } else if (!kycDone) {
    actionHtml = `
      <div style="margin-top:1.25rem;">
        <p style="color:var(--success);margin-bottom:0.75rem;font-size:0.9rem;">Fee paid. Upload documents to finish KYC.</p>
        <button class="btn btn-primary btn-full" onclick="showKYC()">Verify KYC — Upload Documents →</button>
      </div>`;
  } else {
    actionHtml = `
      <div style="margin-top:1.25rem;">
        <div class="summary-row"><span>Payment</span><span class="status-badge status-confirmed">paid</span></div>
        <div class="summary-row"><span>KYC</span><span class="status-badge status-${escapeHtml(order.kyc_status)}">${escapeHtml(order.kyc_status)}</span></div>
      </div>`;
  }

  document.getElementById('track-result').innerHTML = `
    <div class="order-card">
      <div class="order-card-header">
        <h3>${order.flag_emoji} ${escapeHtml(order.country_name)} — ${escapeHtml(order.visa_type)}</h3>
        <span class="status-badge status-${escapeHtml(order.order_status)}">${escapeHtml(order.order_status)}</span>
      </div>
      <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:1rem;font-family:monospace;">${escapeHtml(order.order_number || order.id)}</p>
      <div class="status-timeline steps-4">
        ${steps.map((s, i) => `
          <div class="timeline-step ${i <= stepIndex ? 'completed' : ''} ${i === stepIndex ? 'active' : ''}">
            <div class="timeline-dot">${i + 1}</div>
            <div class="timeline-label">${s.label}</div>
          </div>
        `).join('')}
      </div>
      <div class="summary-row"><span>Submitted</span><span>${new Date(order.created_at).toLocaleDateString()}</span></div>
      ${actionHtml}
    </div>
  `;
}

async function goToKycPayment() {
  if (!currentOrder?.id) {
    showToast('Track your application first', 'warning');
    showView('track');
    return;
  }
  try {
    const info = await api(`/api/orders/${currentOrder.id}/kyc-fee`);
    currentOrder.kyc_fee = info.kyc_fee;
    if (info.payment_status === 'confirmed') {
      showToast('Fee already paid — continue to KYC', 'info');
      showKYC();
      return;
    }
    showCardPayment(info);
    showView('payment');
    window.scrollTo(0, 0);
  } catch (e) { /* handled by api() */ }
}

function showCardPayment(info) {
  const fee = Number(info.kyc_fee || currentOrder?.kyc_fee || 1);
  const container = document.getElementById('payment-content');
  if (!container) {
    showToast('Payment page missing — refresh the page', 'error');
    return;
  }
  container.innerHTML = `
    <div class="payment-panel card-form">
      <div class="order-summary" style="margin-bottom:1.25rem;">
        <div class="summary-row">
          <span>${info.flag_emoji || ''} ${escapeHtml(info.country_name || '')} — ${escapeHtml(info.visa_type || 'KYC')}</span>
        </div>
        <div class="summary-row">
          <span>KYC verification fee</span>
          <span><strong>$${fee}</strong></span>
        </div>
        <p style="font-size:0.8rem;color:var(--text-muted);margin-top:0.5rem;">Dummy card payment for now. Stripe later.</p>
      </div>
      <form onsubmit="processCardPayment(event)">
        <div class="form-group">
          <label>Cardholder Name</label>
          <input type="text" name="card_name" required placeholder="Name on card" autocomplete="cc-name">
        </div>
        <div class="form-group">
          <label>Card Number</label>
          <input type="text" name="card_number" required placeholder="4242 4242 4242 4242" maxlength="19" oninput="formatCardNumber(this)" inputmode="numeric" autocomplete="cc-number">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Expiry (MM/YY)</label>
            <input type="text" name="card_expiry" required placeholder="12/28" maxlength="5" oninput="formatExpiry(this)" inputmode="numeric" autocomplete="cc-exp">
          </div>
          <div class="form-group">
            <label>CVC</label>
            <input type="text" name="card_cvc" required placeholder="123" maxlength="4" inputmode="numeric" autocomplete="cc-csc">
          </div>
        </div>
        <button type="submit" class="btn btn-primary btn-lg btn-full">Pay $${fee}</button>
      </form>
    </div>
  `;
}

function formatCardNumber(input) {
  let value = input.value.replace(/\D/g, '').slice(0, 16);
  value = value.replace(/(.{4})/g, '$1 ').trim();
  input.value = value;
}

function formatExpiry(input) {
  let value = input.value.replace(/\D/g, '').slice(0, 4);
  if (value.length >= 2) value = value.slice(0, 2) + '/' + value.slice(2);
  input.value = value;
}

async function processCardPayment(e) {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form));
  const btn = form.querySelector('button[type="submit"]');
  const fee = Number(currentOrder.kyc_fee || 1);
  if (btn) { btn.disabled = true; btn.textContent = 'Processing...'; }

  try {
    await api(`/api/orders/${currentOrder.id}/pay-card`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    showToast(`Paid $${fee} — continue to KYC`, 'success');
    setTimeout(() => showKYC(), 600);
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = `Pay $${fee}`; }
  }
}

function showKYC() {
  const form = document.getElementById('kyc-form');
  if (form) form.reset();
  const idPrev = document.getElementById('id-preview');
  const selfPrev = document.getElementById('selfie-preview');
  if (idPrev) idPrev.innerHTML = '';
  if (selfPrev) selfPrev.innerHTML = '';
  showView('kyc');
}

function previewFile(input, previewId) {
  const file = input.files[0];
  if (!file) return;
  const preview = document.getElementById(previewId);
  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = e => { preview.innerHTML = `<img src="${e.target.result}" alt="Preview">`; };
    reader.readAsDataURL(file);
  } else {
    preview.innerHTML = `<p style="color:var(--text-muted);font-size:0.85rem;">📄 ${escapeHtml(file.name)}</p>`;
  }
}

async function submitKYC(e) {
  e.preventDefault();
  if (!currentOrder?.id) {
    showToast('Missing application — track your order first', 'warning');
    return;
  }
  const form = e.target;
  const formData = new FormData(form);
  const btn = form.querySelector('button[type="submit"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Submitting...'; }

  try {
    await api(`/api/orders/${currentOrder.id}/kyc`, {
      method: 'POST',
      body: formData,
    });
    showToast('KYC submitted successfully', 'success');
    document.getElementById('success-details').innerHTML = `
      <div class="summary-row"><span>Reference</span><span style="font-family:monospace;">${escapeHtml(currentOrder.order_number)}</span></div>
      <div class="summary-row"><span>KYC</span><span>Submitted</span></div>
      <div class="summary-row"><span>Fee</span><span>Paid</span></div>
    `;
    showView('success');
    // restore success actions to track
    const actions = document.querySelector('#view-success .hero-actions');
    if (actions) {
      actions.innerHTML = `
        <button class="btn btn-primary" onclick="showView('track'); trackOrder();">Track Status</button>
        <button class="btn btn-outline" onclick="showView('home')">Home</button>
      `;
    }
  } catch (err) { /* handled */ }
  finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Submit KYC'; }
  }
}

async function trackOrder() {
  const orderId = document.getElementById('track-order-id').value.trim();
  if (!orderId) {
    showToast('Enter your reference ID', 'warning');
    return;
  }
  try {
    const order = await api(`/api/orders/track/${encodeURIComponent(orderId)}`);
    displayTrackResult(order);
  } catch (e) { /* handled */ }
}

async function adminLogin(e) {
  e.preventDefault();
  try {
    const result = await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({
        username: document.getElementById('admin-username').value,
        password: document.getElementById('admin-password').value,
      }),
    });
    adminToken = result.token;
    localStorage.setItem('nexorago_admin_token', adminToken);
    document.getElementById('admin-login').style.display = 'none';
    document.getElementById('admin-dashboard').style.display = 'block';
    loadAdminDashboard();
    showToast('Welcome', 'success');
  } catch (e) { /* handled */ }
}

async function logoutAdmin() {
  try {
    if (adminToken) await api('/api/admin/logout', { method: 'POST', body: '{}' });
  } catch (e) { /* ignore */ }
  adminToken = null;
  localStorage.removeItem('nexorago_admin_token');
  document.getElementById('admin-login').style.display = 'block';
  document.getElementById('admin-dashboard').style.display = 'none';
}

async function loadAdminDashboard() {
  try {
    const stats = await api('/api/admin/stats');
    document.getElementById('admin-stats').innerHTML = `
      <div class="admin-stat-card"><div class="number">${stats.totalOrders}</div><div class="label">Applications</div></div>
      <div class="admin-stat-card"><div class="number">${stats.pendingOrders}</div><div class="label">Pending</div></div>
      <div class="admin-stat-card"><div class="number">${stats.totalJobs || 0}</div><div class="label">Jobs</div></div>
      <div class="admin-stat-card"><div class="number">${stats.totalVisas || 0}</div><div class="label">Visas</div></div>
    `;
    loadAdminOrders();
  } catch (e) {
    document.getElementById('admin-login').style.display = 'block';
    document.getElementById('admin-dashboard').style.display = 'none';
  }
}

function showAdminTab(tab, btn) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('admin-orders').style.display = tab === 'orders' ? 'block' : 'none';
  const jobsPanel = document.getElementById('admin-jobs');
  if (jobsPanel) jobsPanel.style.display = tab === 'jobs' ? 'block' : 'none';
  document.getElementById('admin-visas').style.display = tab === 'visas' ? 'block' : 'none';
  if (tab === 'orders') loadAdminOrders();
  if (tab === 'jobs') loadAdminJobs();
  if (tab === 'visas') loadAdminVisas();
}

async function loadAdminOrders() {
  try {
    const orders = await api('/api/admin/orders');
    const container = document.getElementById('admin-orders');
    if (!orders.length) {
      container.innerHTML = '<p style="color:var(--text-muted);padding:1rem;">No applications yet.</p>';
      return;
    }
    container.innerHTML = `
      <div class="admin-toolbar">
        <span>${orders.length} application${orders.length === 1 ? '' : 's'}</span>
        <button type="button" class="btn btn-sm btn-outline" onclick="loadAdminOrders()">Refresh</button>
      </div>
      <table class="admin-table">
        <thead>
          <tr>
            <th>Ref</th>
            <th>Name</th>
            <th>Visa</th>
            <th>Job</th>
            <th>Status</th>
            <th>KYC</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${orders.map(o => `
            <tr>
              <td title="${escapeHtml(o.order_number)}">${escapeHtml((o.order_number || '').slice(0, 14))}…</td>
              <td>${escapeHtml(o.applicant_name)}</td>
              <td>${o.flag_emoji || ''} ${escapeHtml(o.country_name || '')}</td>
              <td>${escapeHtml(o.occupation || '—')}</td>
              <td><span class="status-badge status-${escapeHtml(o.order_status)}">${escapeHtml(o.order_status)}</span></td>
              <td><span class="status-badge status-${escapeHtml(o.kyc_status || 'n/a')}">${escapeHtml(o.kyc_status || 'n/a')}</span></td>
              <td class="admin-actions">
                <button type="button" class="btn btn-sm btn-primary" onclick="openAdminOrder('${escapeJs(o.id)}')">View / Manage</button>
                <button type="button" class="btn btn-sm btn-outline" onclick="copyTrackId('${escapeJs(o.order_number)}')">Copy ID</button>
                <button type="button" class="btn btn-sm btn-danger" onclick="deleteAdminOrder('${escapeJs(o.id)}', '${escapeJs(o.applicant_name)}')">Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (e) { /* handled */ }
}

function fieldRow(label, value) {
  const v = value == null || value === '' ? '—' : String(value);
  return `<div class="admin-field"><span class="admin-field-label">${escapeHtml(label)}</span><span class="admin-field-value">${escapeHtml(v)}</span></div>`;
}

function fileLink(filePath) {
  if (!filePath) return '—';
  const name = String(filePath).split(/[/\\\\]/).pop();
  return `<a href="/api/files/${encodeURIComponent(name)}" target="_blank" rel="noopener">${escapeHtml(name)}</a>`;
}

async function openAdminOrder(orderId) {
  try {
    const o = await api(`/api/admin/orders/${orderId}`);
    const modal = document.getElementById('admin-order-modal');
    const body = document.getElementById('admin-order-detail');
    document.getElementById('admin-modal-title').textContent =
      `${o.applicant_name || 'Application'} — ${o.order_number || ''}`;

    const kycBlocks = (o.kyc_submissions || []).map((k, i) => `
      <div class="admin-kyc-card">
        <h5>KYC #${i + 1} — ${escapeHtml(k.status)}</h5>
        <div class="admin-field-grid">
          ${fieldRow('Full name', k.full_name)}
          ${fieldRow('DOB', k.date_of_birth)}
          ${fieldRow('Nationality', k.nationality)}
          ${fieldRow('ID type', k.id_type)}
          ${fieldRow('ID number', k.id_number)}
          ${fieldRow('Submitted', k.submitted_at)}
          <div class="admin-field"><span class="admin-field-label">ID document</span><span class="admin-field-value">${fileLink(k.id_document_path)}</span></div>
          <div class="admin-field"><span class="admin-field-label">Selfie</span><span class="admin-field-value">${fileLink(k.selfie_path)}</span></div>
        </div>
      </div>
    `).join('') || '<p class="admin-muted">No KYC documents submitted yet.</p>';

    body.innerHTML = `
      <div class="admin-detail-actions">
        <label>Application status
          <select id="adm-order-status">
            <option value="pending" ${o.order_status === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="processing" ${o.order_status === 'processing' ? 'selected' : ''}>Reviewing</option>
            <option value="completed" ${o.order_status === 'completed' ? 'selected' : ''}>Approved (open KYC)</option>
            <option value="rejected" ${o.order_status === 'rejected' ? 'selected' : ''}>Rejected</option>
          </select>
        </label>
        <label>Payment
          <select id="adm-payment-status">
            <option value="n/a" ${o.payment_status === 'n/a' ? 'selected' : ''}>n/a</option>
            <option value="pending" ${o.payment_status === 'pending' ? 'selected' : ''}>pending</option>
            <option value="confirmed" ${o.payment_status === 'confirmed' ? 'selected' : ''}>confirmed</option>
            <option value="failed" ${o.payment_status === 'failed' ? 'selected' : ''}>failed</option>
          </select>
        </label>
        <label>KYC status
          <select id="adm-kyc-status">
            <option value="n/a" ${o.kyc_status === 'n/a' ? 'selected' : ''}>n/a</option>
            <option value="pending" ${o.kyc_status === 'pending' ? 'selected' : ''}>pending</option>
            <option value="submitted" ${o.kyc_status === 'submitted' ? 'selected' : ''}>submitted</option>
            <option value="verified" ${o.kyc_status === 'verified' ? 'selected' : ''}>verified</option>
            <option value="rejected" ${o.kyc_status === 'rejected' ? 'selected' : ''}>rejected</option>
          </select>
        </label>
        <button type="button" class="btn btn-sm btn-primary" onclick="saveAdminOrder('${escapeJs(o.id)}')">Save changes</button>
        <button type="button" class="btn btn-sm btn-outline" onclick="copyTrackId('${escapeJs(o.order_number)}')">Copy Track ID</button>
        ${o.order_status === 'completed' ? `<button type="button" class="btn btn-sm btn-outline" onclick="copyKycLink('${escapeJs(o.order_number)}')">Copy KYC link</button>` : ''}
        <button type="button" class="btn btn-sm btn-danger" onclick="deleteAdminOrder('${escapeJs(o.id)}', '${escapeJs(o.applicant_name)}')">Delete application</button>
      </div>

      <label class="admin-notes-label">Admin / KYC notes
        <textarea id="adm-kyc-notes" rows="2" placeholder="Internal notes or rejection reason">${escapeHtml(o.kyc_notes || '')}</textarea>
      </label>

      <h4 class="admin-section-title">Visa pathway</h4>
      <div class="admin-field-grid">
        ${fieldRow('Country', `${o.flag_emoji || ''} ${o.country_name || ''}`)}
        ${fieldRow('Visa type', o.visa_type)}
        ${fieldRow('Category', o.visa_category)}
        ${fieldRow('Track ID', o.order_number)}
        ${fieldRow('Submitted', o.created_at)}
        ${fieldRow('Updated', o.updated_at)}
        ${fieldRow('KYC fee', o.amount != null ? `$${o.amount}` : '—')}
        ${fieldRow('Card last4', o.card_last4)}
      </div>

      <h4 class="admin-section-title">Applicant details (full form)</h4>
      <div class="admin-field-grid">
        ${fieldRow('Full name', o.applicant_name)}
        ${fieldRow('Email', o.applicant_email)}
        ${fieldRow('Phone', o.applicant_phone)}
        ${fieldRow('Nationality', o.nationality)}
        ${fieldRow('Date of birth', o.date_of_birth)}
        ${fieldRow('Age', o.age)}
        ${fieldRow('Passport', o.passport_number)}
        ${fieldRow('ID type', o.id_type)}
        ${fieldRow('ID number', o.id_number)}
        ${fieldRow('Residence', o.residence)}
        ${fieldRow('Current city', o.current_city)}
        ${fieldRow('Preferred city', o.preferred_city)}
      </div>

      <h4 class="admin-section-title">Stay & work / finance</h4>
      <div class="admin-field-grid">
        ${fieldRow('Purpose', o.purpose)}
        ${fieldRow('Occupation', o.occupation)}
        ${fieldRow('Target job', o.target_job)}
        ${fieldRow('Job listing ID', o.job_id)}
        ${fieldRow('Employment', o.employment_status)}
        ${fieldRow('Work experience', o.work_experience)}
        ${fieldRow('Education', o.education)}
        ${fieldRow('Language', o.language)}
        ${fieldRow('Visa duration (days)', o.visa_duration)}
        ${fieldRow('Travel date', o.travel_date)}
        ${fieldRow('Net worth', o.net_worth)}
        ${fieldRow('Annual income', o.annual_income)}
        ${fieldRow('Trip funds', o.trip_funds)}
        ${fieldRow('User notes', o.notes)}
      </div>

      <h4 class="admin-section-title">KYC documents</h4>
      ${kycBlocks}
    `;

    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  } catch (e) { /* handled */ }
}

function closeAdminOrder() {
  const modal = document.getElementById('admin-order-modal');
  if (modal) {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  }
  document.body.style.overflow = '';
}

async function saveAdminOrder(orderId) {
  try {
    const body = {
      order_status: document.getElementById('adm-order-status')?.value,
      payment_status: document.getElementById('adm-payment-status')?.value,
      kyc_status: document.getElementById('adm-kyc-status')?.value,
      kyc_notes: document.getElementById('adm-kyc-notes')?.value ?? '',
    };
    await api(`/api/admin/orders/${orderId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    showToast('Application updated', 'success');
    loadAdminOrders();
    loadAdminDashboard();
    openAdminOrder(orderId);
  } catch (e) { /* handled */ }
}

async function deleteAdminOrder(orderId, name) {
  const ok = confirm(`Delete application for "${name || 'this user'}"?\n\nThis permanently removes the form, KYC files, and cannot be undone.`);
  if (!ok) return;
  try {
    await api(`/api/admin/orders/${orderId}`, { method: 'DELETE' });
    showToast('Application deleted', 'success');
    closeAdminOrder();
    loadAdminOrders();
    loadAdminDashboard();
  } catch (e) { /* handled */ }
}

async function updateOrderStatus(orderId, status) {
  if (!status) return;
  try {
    await api(`/api/admin/orders/${orderId}`, {
      method: 'PATCH',
      body: JSON.stringify({ order_status: status }),
    });
    if (status === 'completed') {
      showToast('Approved — KYC unlocked. Open View / Manage to copy KYC link.', 'success');
    } else {
      showToast('Updated', 'success');
    }
    loadAdminOrders();
    loadAdminDashboard();
  } catch (e) { /* handled */ }
}

function copyTrackId(orderNumber) {
  navigator.clipboard?.writeText(orderNumber)
    .then(() => showToast('Tracking ID copied', 'success'))
    .catch(() => prompt('Copy this Tracking ID:', orderNumber));
}

function copyKycLink(orderNumber) {
  const url = `${window.location.origin}/track?ref=${encodeURIComponent(orderNumber)}`;
  navigator.clipboard?.writeText(url)
    .then(() => showToast('KYC track link copied', 'success'))
    .catch(() => prompt('Copy this KYC link:', url));
}

function openTrackFromRef(ref) {
  const clean = String(ref || '').trim();
  if (!clean) return;
  const input = document.getElementById('track-order-id');
  if (input) input.value = clean;
  localStorage.setItem('nexorago_last_ref', clean);
  showView('track');
  // slight delay so track view is visible before fetch
  setTimeout(() => trackOrder(), 50);
}

function getRefFromUrl() {
  const params = new URLSearchParams(window.location.search);
  let ref = params.get('ref') || params.get('track');
  if (!ref && window.location.hash) {
    const hash = window.location.hash.replace(/^#/, '');
    const hp = new URLSearchParams(hash.includes('=') ? hash : `ref=${hash}`);
    ref = hp.get('ref') || hp.get('track') || (hash.startsWith('VSA-') ? hash : null);
  }
  return ref ? decodeURIComponent(ref).trim() : null;
}

async function loadAdminJobs() {
  try {
    const jobs = await api('/api/admin/jobs');
    const panel = document.getElementById('admin-jobs');
    if (!panel) return;
    panel.innerHTML = `
      <div class="admin-toolbar">
        <span>${jobs.length} jobs</span>
        <button type="button" class="btn btn-sm btn-primary" onclick="toggleJobForm()">+ Add job</button>
      </div>
      <div id="admin-job-form" class="admin-job-form" style="display:none;">
        <div class="form-row">
          <div class="form-group"><label>Title *</label><input id="nj-title" required></div>
          <div class="form-group"><label>Company *</label><input id="nj-company" required></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Country code *</label><input id="nj-code" placeholder="CA" required></div>
          <div class="form-group"><label>Country name *</label><input id="nj-cname" placeholder="Canada" required></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>City *</label><input id="nj-city" required></div>
          <div class="form-group"><label>Category *</label>
            <select id="nj-cat"><option>IT</option><option>Engineering</option><option>Healthcare</option><option>Hospitality</option><option>Driving</option><option>Care</option><option>Reception</option><option>Labour</option><option>Sales</option><option>Logistics</option><option>Product</option></select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Salary</label><input id="nj-salary" placeholder="CAD 80k–110k"></div>
          <div class="form-group"><label>Description *</label><input id="nj-desc" required></div>
        </div>
        <button type="button" class="btn btn-primary btn-sm" onclick="createAdminJob()">Save job</button>
      </div>
      <table class="admin-table">
        <thead><tr><th>Title</th><th>Company</th><th>Location</th><th>Category</th><th>Active</th><th></th></tr></thead>
        <tbody>
          ${jobs.map(j => `
            <tr>
              <td>${escapeHtml(j.title)}</td>
              <td>${escapeHtml(j.company)}</td>
              <td>${escapeHtml(j.country_name)} · ${escapeHtml(j.city)}</td>
              <td>${escapeHtml(j.category)}</td>
              <td>${j.active ? 'Yes' : 'No'}</td>
              <td class="admin-actions">
                <button type="button" class="btn btn-sm btn-outline" onclick="toggleAdminJob(${Number(j.id)}, ${j.active ? 0 : 1})">${j.active ? 'Disable' : 'Enable'}</button>
                <button type="button" class="btn btn-sm btn-danger" onclick="deleteAdminJob(${Number(j.id)})">Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (e) { /* handled */ }
}

function toggleJobForm() {
  const el = document.getElementById('admin-job-form');
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

async function createAdminJob() {
  try {
    const body = {
      title: document.getElementById('nj-title')?.value,
      company: document.getElementById('nj-company')?.value,
      country_code: document.getElementById('nj-code')?.value,
      country_name: document.getElementById('nj-cname')?.value,
      city: document.getElementById('nj-city')?.value,
      category: document.getElementById('nj-cat')?.value,
      salary_range: document.getElementById('nj-salary')?.value,
      description: document.getElementById('nj-desc')?.value,
    };
    await api('/api/admin/jobs', { method: 'POST', body: JSON.stringify(body) });
    showToast('Job added', 'success');
    loadAdminJobs();
    loadAdminDashboard();
  } catch (e) { /* handled */ }
}

async function toggleAdminJob(id, active) {
  try {
    await api(`/api/admin/jobs/${id}`, { method: 'PATCH', body: JSON.stringify({ active: !!active }) });
    loadAdminJobs();
  } catch (e) { /* handled */ }
}

async function deleteAdminJob(id) {
  if (!confirm('Delete this job listing?')) return;
  try {
    await api(`/api/admin/jobs/${id}`, { method: 'DELETE' });
    showToast('Job deleted', 'success');
    loadAdminJobs();
    loadAdminDashboard();
  } catch (e) { /* handled */ }
}

async function loadAdminVisas() {
  try {
    const visas = await api('/api/visas');
    document.getElementById('admin-visas').innerHTML = `
      <table class="admin-table">
        <thead><tr><th>Country</th><th>Type</th><th>Category</th><th>Processing</th></tr></thead>
        <tbody>
          ${visas.map(v => `
            <tr>
              <td>${v.flag_emoji} ${escapeHtml(v.country_name)}</td>
              <td>${escapeHtml(v.visa_type)}</td>
              <td>${escapeHtml(v.category)}</td>
              <td>${Number(v.processing_days)} days</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (e) { /* handled */ }
}

function initTiltEffect() {
  document.querySelectorAll('.visa-card').forEach(card => {
    if (card.dataset.tiltBound) return;
    card.dataset.tiltBound = '1';
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const rotateX = (e.clientY - rect.top - rect.height / 2) / (rect.height / 2) * -6;
      const rotateY = (e.clientX - rect.left - rect.width / 2) / (rect.width / 2) * 6;
      card.style.transform = `translateY(-6px) perspective(1200px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
    });
    card.addEventListener('mouseleave', () => { card.style.transform = ''; });
  });
}

function initScrollReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.visa-card, .step-card').forEach(el => {
    if (el.dataset.revealBound) return;
    el.dataset.revealBound = '1';
    el.style.opacity = '0';
    el.style.transform = 'translateY(24px)';
    el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    observer.observe(el);
  });
}

function refreshCardEffects() {
  initTiltEffect();
  initScrollReveal();
}

document.addEventListener('DOMContentLoaded', () => {
  if (isAdminSecretPath()) {
    unlockAdminGate();
    showView('admin');
    return;
  }

  const ref = getRefFromUrl();
  if (ref) {
    openTrackFromRef(ref);
  } else {
    showView('home');
    const last = localStorage.getItem('nexorago_last_ref');
    if (last) {
      const input = document.getElementById('track-order-id');
      if (input && !input.value) input.value = last;
    }
  }

  setTimeout(refreshCardEffects, 300);
  const trackInput = document.getElementById('track-order-id');
  if (trackInput) {
    trackInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') trackOrder();
    });
  }
});
