/* ============================================================
   app.js — shared utilities loaded on every page
   ============================================================ */

'use strict';

// ── API helper ────────────────────────────────────────────────
window.api = {
  async request(method, path, body = null) {
    const opts = {
      method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(path, opts);

    // Session expired
    if (res.status === 401) {
      const data = await res.json().catch(() => ({}));
      // If we're not already on an auth page, redirect
      if (!window.location.pathname.endsWith('index.html') &&
          window.location.pathname !== '/' &&
          !window.location.pathname.endsWith('signup.html')) {
        window.location.href = '/?expired=1';
        return;
      }
      throw Object.assign(new Error(data.message || 'Unauthorised'), { status: 401, data });
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg = data.details ? data.details.join('; ') : (data.message || 'Request failed');
      throw Object.assign(new Error(msg), { status: res.status, data });
    }
    return data;
  },

  get:    (path)       => window.api.request('GET',    path),
  post:   (path, body) => window.api.request('POST',   path, body),
  put:    (path, body) => window.api.request('PUT',    path, body),
  patch:  (path, body) => window.api.request('PATCH',  path, body),
  delete: (path)       => window.api.request('DELETE', path),
};

// ── Session helpers ────────────────────────────────────────────
window.auth = {
  user: null,

  async init() {
    try {
      const data = await window.api.get('/api/auth/me');
      window.auth.user = data.user;
      return data.user;
    } catch {
      window.auth.user = null;
      return null;
    }
  },

  async logout() {
    await window.api.post('/api/auth/logout').catch(() => {});
    window.location.href = '/';
  },
};

// ── Toast notifications ────────────────────────────────────────
window.toast = {
  show(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const colorMap = {
      success: 'var(--clr-success)',
      error:   'var(--clr-error)',
      warning: 'var(--clr-warning)',
      info:    'var(--clr-primary-400)',
    };

    const iconMap = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };

    const el = document.createElement('div');
    el.className = 'toast';
    el.style.setProperty('--toast-color', colorMap[type] || colorMap.info);
    el.setAttribute('role', 'status');
    el.innerHTML = `<span style="font-size:1.1em;">${iconMap[type] || '•'}</span><span>${escapeHtml(message)}</span>`;
    container.appendChild(el);

    setTimeout(() => {
      el.classList.add('toast-out');
      setTimeout(() => el.remove(), 400);
    }, duration);
  },
  success: (m) => window.toast.show(m, 'success'),
  error:   (m) => window.toast.show(m, 'error'),
  warning: (m) => window.toast.show(m, 'warning'),
  info:    (m) => window.toast.show(m, 'info'),
};

// ── Alert area ─────────────────────────────────────────────────
window.showAlert = function (box, message, type = 'error') {
  if (!box) return;
  const iconMap = { error: '✕', success: '✓', info: 'ℹ', warning: '⚠' };
  box.innerHTML = `<div class="alert alert-${type}"><span>${iconMap[type] || '•'}</span><span>${escapeHtml(message)}</span></div>`;
};

window.clearAlert = function (box) {
  if (box) box.innerHTML = '';
};

// ── Field error helpers ────────────────────────────────────────
window.setFieldError = function (inputEl, errorEl, message) {
  if (inputEl)  inputEl.classList.add('is-invalid');
  if (errorEl)  { errorEl.textContent = message; errorEl.classList.remove('hidden'); }
};

window.clearFieldError = function (inputEl, errorEl) {
  if (inputEl)  inputEl.classList.remove('is-invalid');
  if (errorEl)  { errorEl.textContent = ''; errorEl.classList.add('hidden'); }
};

// ── Loading button ─────────────────────────────────────────────
window.setLoading = function (btn, textEl, spinnerEl, loading) {
  btn.disabled = loading;
  if (textEl)    textEl.classList.toggle('hidden', loading);
  if (spinnerEl) spinnerEl.classList.toggle('hidden', !loading);
};

// ── Date/time utilities ────────────────────────────────────────
window.formatLocalDateTime = function (isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
};

window.formatLocalDate = function (isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
};

window.formatLocalTime = function (isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  });
};

// ── Escape HTML to prevent XSS ─────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
window.escapeHtml = escapeHtml;

// ── Badge HTML ─────────────────────────────────────────────────
window.statusBadge = function (status) {
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return `<span class="badge badge-${status}" aria-label="Status: ${label}">${label}</span>`;
};

// ── Confirmation dialog ────────────────────────────────────────
window.confirmAction = function (message, okLabel = 'Confirm', dangerous = true) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('confirm-modal');
    const msgEl   = document.getElementById('confirm-message');
    const okBtn   = document.getElementById('confirm-ok');
    const cancelBtn = document.getElementById('confirm-cancel');
    if (!overlay) { resolve(true); return; }

    msgEl.textContent = message;
    okBtn.textContent = okLabel;
    okBtn.className = `btn ${dangerous ? 'btn-danger' : 'btn-primary'}`;

    overlay.classList.remove('hidden');
    okBtn.focus();

    const done = (result) => {
      overlay.classList.add('hidden');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    };
    const onOk     = () => done(true);
    const onCancel = () => done(false);

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
  });
};

// ── Min date for date inputs (today) ──────────────────────────
window.setMinDateToday = function (inputEl) {
  const today = new Date();
  // ISO date string YYYY-MM-DD
  const yyyy = today.getFullYear();
  const mm   = String(today.getMonth() + 1).padStart(2, '0');
  const dd   = String(today.getDate()).padStart(2, '0');
  inputEl.min = `${yyyy}-${mm}-${dd}`;
};

// ── Session-expired notice ─────────────────────────────────────
if (new URLSearchParams(window.location.search).get('expired') === '1') {
  document.addEventListener('DOMContentLoaded', () => {
    const box = document.getElementById('alert-box');
    if (box) window.showAlert(box, 'Your session expired. Please sign in again.', 'warning');
  });
}
