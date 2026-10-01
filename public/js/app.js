// ── State ──
let currentVisa = null;
let currentOrder = null;
let formStep = 1;
let adminToken = localStorage.getItem('visago_admin_token') || null;

function showView(viewName) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const view = document.getElementById(`view-${viewName}`);
  if (view) view.classList.add('active');
  window.scrollTo(0, 0);

  const navLinks = document.getElementById('navLinks');
  if (navLinks) navLinks.classList.remove('open');

  if (viewName === 'home') loadPopularVisas();
  if (viewName === 'visas') loadAllVisas();
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
    try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text || 'Request failed' }; }

    if (!res.ok) {
      if (res.status === 401 && url.includes('/api/admin/') && !url.includes('/login')) {
        adminToken = null;
        localStorage.removeItem('visago_admin_token');
      }
      throw new Error(data.error || 'Request failed');
    }
    return data;
  } catch (err) {
    showToast(err.message, 'error');
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

function startApplication(visaId) {
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

  // restore hidden defaults after reset
  const setHidden = (name, val) => {
    const el = document.querySelector(`#apply-form [name="${name}"]`);
    if (el) el.value = val;
  };
  setHidden('residence', 'India');
  setHidden('employment_status', 'employed');
  setHidden('language', 'fluent');
  setHidden('trip_funds', '5k_10k');
  setHidden('notes', '');

  document.getElementById('apply-visa-label').textContent =
    `${currentVisa.flag_emoji} ${currentVisa.country_name} — ${currentVisa.visa_type}`;

  updateSummary();
  showView('apply');
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

    localStorage.setItem('visago_last_ref', currentOrder.order_number);

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
    localStorage.setItem('visago_admin_token', adminToken);
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
  localStorage.removeItem('visago_admin_token');
  document.getElementById('admin-login').style.display = 'block';
  document.getElementById('admin-dashboard').style.display = 'none';
}

async function loadAdminDashboard() {
  try {
    const stats = await api('/api/admin/stats');
    document.getElementById('admin-stats').innerHTML = `
      <div class="admin-stat-card"><div class="number">${stats.totalOrders}</div><div class="label">Applications</div></div>
      <div class="admin-stat-card"><div class="number">${stats.pendingOrders}</div><div class="label">Pending</div></div>
      <div class="admin-stat-card"><div class="number">${stats.processingOrders}</div><div class="label">Reviewing</div></div>
      <div class="admin-stat-card"><div class="number">${stats.completedOrders}</div><div class="label">Done</div></div>
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
  document.getElementById('admin-visas').style.display = tab === 'visas' ? 'block' : 'none';
  if (tab === 'orders') loadAdminOrders();
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
      <table class="admin-table">
        <thead>
          <tr>
            <th>Ref</th>
            <th>Name</th>
            <th>Visa</th>
            <th>Job</th>
            <th>Net Worth</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${orders.map(o => `
            <tr>
              <td title="${escapeHtml(o.order_number)}">${escapeHtml((o.order_number || '').slice(0, 14))}…</td>
              <td>${escapeHtml(o.applicant_name)}</td>
              <td>${o.flag_emoji} ${escapeHtml(o.country_name)}</td>
              <td>${escapeHtml(o.occupation || '—')}</td>
              <td>${escapeHtml(o.net_worth || '—')}</td>
              <td><span class="status-badge status-${escapeHtml(o.order_status)}">${escapeHtml(o.order_status)}</span></td>
              <td style="white-space:nowrap;">
                <select onchange="updateOrderStatus('${escapeHtml(o.id)}', this.value)" style="padding:0.25rem;font-size:0.8rem;">
                  <option value="">Update...</option>
                  <option value="pending">Pending</option>
                  <option value="processing">Reviewing</option>
                  <option value="completed">Approve (open KYC)</option>
                  <option value="rejected">Rejected</option>
                </select>
                ${o.order_status === 'completed' ? `<button type="button" class="btn btn-sm btn-outline" style="margin-left:0.35rem;" onclick="copyKycLink('${escapeHtml(o.order_number)}')">Copy KYC link</button>` : ''}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
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
      showToast('Approved — KYC unlocked. Copy KYC link to send to user.', 'success');
    } else {
      showToast('Updated', 'success');
    }
    loadAdminOrders();
    loadAdminDashboard();
  } catch (e) { /* handled */ }
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
  localStorage.setItem('visago_last_ref', clean);
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
  const ref = getRefFromUrl();
  if (ref) {
    openTrackFromRef(ref);
  } else {
    showView('home');
    const last = localStorage.getItem('visago_last_ref');
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
