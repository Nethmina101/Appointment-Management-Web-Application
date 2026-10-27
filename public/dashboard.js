/* dashboard.js — unified client + admin dashboard */
'use strict';

(async function () {
  // ── Route guard ──────────────────────────────────────────────
  const user = await window.auth.init();
  if (!user) { window.location.href = '/?expired=1'; return; }

  const isAdmin = user.role === 'admin';

  // ── DOM refs ─────────────────────────────────────────────────
  const pageTitle    = document.getElementById('page-title');
  const pageSubtitle = document.getElementById('page-subtitle');
  const userNameEl   = document.getElementById('user-name');
  const userAvatarEl = document.getElementById('user-avatar');
  const roleBadge    = document.getElementById('role-badge');
  const logoutBtn    = document.getElementById('logout-btn');
  const clientActions = document.getElementById('client-actions');
  const alertBox     = document.getElementById('alert-box');

  const appointmentsList = document.getElementById('appointments-list');
  const paginationEl     = document.getElementById('pagination');

  const filterStatus = document.getElementById('filter-status');
  const filterFrom   = document.getElementById('filter-from');
  const filterTo     = document.getElementById('filter-to');
  const filterSearch = document.getElementById('filter-search');

  // Stats
  const statPending   = document.getElementById('stat-pending');
  const statApproved  = document.getElementById('stat-approved');
  const statCompleted = document.getElementById('stat-completed');
  const statTotal     = document.getElementById('stat-total');

  // Book modal
  const bookModal    = document.getElementById('book-modal');
  const openBookBtn  = document.getElementById('open-book-btn');
  const closeModalBtn = document.getElementById('close-modal-btn');
  const cancelModalBtn = document.getElementById('cancel-modal-btn');
  const bookForm     = document.getElementById('book-form');
  const modalTitle   = document.getElementById('modal-title');
  const modalAlert   = document.getElementById('modal-alert');
  const apptTitle    = document.getElementById('appt-title');
  const titleErr     = document.getElementById('title-err');
  const apptDate     = document.getElementById('appt-date');
  const dateErr      = document.getElementById('date-err');
  const apptStartsAt = document.getElementById('appt-startsAt');
  const slotErr      = document.getElementById('slot-err');
  const slotGrid     = document.getElementById('slot-grid');
  const slotsLoading = document.getElementById('slots-loading');
  const apptDuration = document.getElementById('appt-duration');
  const apptNotes    = document.getElementById('appt-notes');
  const bookSubmitBtn = document.getElementById('book-submit-btn');
  const bookBtnText  = document.getElementById('book-btn-text');
  const bookSpinner  = document.getElementById('book-spinner');

  // Status modal (admin)
  const statusModal        = document.getElementById('status-modal');
  const closeStatusModalBtn = document.getElementById('close-status-modal');
  const cancelStatusBtn    = document.getElementById('cancel-status-btn');
  const statusForm       = document.getElementById('status-form');
  const newStatusSelect  = document.getElementById('new-status');
  const statusNote       = document.getElementById('status-note');
  const statusSubmitBtn  = document.getElementById('status-submit-btn');
  const statusBtnText    = document.getElementById('status-btn-text');
  const statusSpinner    = document.getElementById('status-spinner');
  const statusModalAlert = document.getElementById('status-modal-alert');

  // ── State ────────────────────────────────────────────────────
  let currentPage   = 1;
  let editingId     = null; // appointment id being rescheduled
  let statusTarget  = null; // appointment id for status change
  let searchDebounce = null;

  // ── Init UI ──────────────────────────────────────────────────
  userNameEl.textContent = user.name;
  userAvatarEl.textContent = user.name.charAt(0).toUpperCase();

  if (isAdmin) {
    pageTitle.textContent    = 'Admin Dashboard';
    pageSubtitle.textContent = `Logged in as ${user.name} · Admin`;
    roleBadge.textContent    = 'Admin';
    roleBadge.className      = 'badge badge-approved';
    roleBadge.classList.remove('hidden');
  } else {
    pageTitle.textContent    = 'My Appointments';
    pageSubtitle.textContent = `Hi ${user.name}, here are your upcoming appointments.`;
    clientActions.classList.remove('hidden');
    roleBadge.textContent    = 'Client';
    roleBadge.className      = 'badge badge-pending';
    roleBadge.classList.remove('hidden');
  }

  // ── Logout ───────────────────────────────────────────────────
  logoutBtn.addEventListener('click', async () => {
    logoutBtn.disabled = true;
    logoutBtn.textContent = 'Signing out…';
    await window.auth.logout();
  });

  // ── Set min date for filter-from ──────────────────────────────
  // (No min for filters — admin may look at past dates)

  // ── Load appointments ─────────────────────────────────────────
  async function loadAppointments() {
    appointmentsList.innerHTML = '<div class="loading-overlay"><span class="spinner"></span></div>';
    paginationEl.classList.add('hidden');

    const params = new URLSearchParams();
    params.set('page', currentPage);
    params.set('limit', 10);
    if (filterStatus.value)  params.set('status', filterStatus.value);
    if (filterFrom.value)    params.set('from', filterFrom.value);
    if (filterTo.value)      params.set('to', filterTo.value);
    if (filterSearch.value.trim()) params.set('search', filterSearch.value.trim());

    try {
      const data = await window.api.get(`/api/appointments?${params}`);
      renderAppointments(data.appointments, data.pagination);
      updateStats(data.appointments);
    } catch (err) {
      appointmentsList.innerHTML = `<div class="alert alert-error"><span>✕</span><span>${window.escapeHtml(err.message)}</span></div>`;
    }
  }

  // ── Update stat cards ─────────────────────────────────────────
  function updateStats(appts) {
    const counts = { pending: 0, approved: 0, completed: 0 };
    appts.forEach(a => { if (counts[a.status] !== undefined) counts[a.status]++; });
    statPending.textContent   = counts.pending;
    statApproved.textContent  = counts.approved;
    statCompleted.textContent = counts.completed;
    statTotal.textContent     = appts.length;
  }

  // ── Render appointment cards ──────────────────────────────────
  function renderAppointments(appts, pagination) {
    if (!appts.length) {
      appointmentsList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <h3>No appointments found</h3>
          <p>${isAdmin ? 'No appointments match your current filters.' : 'You have no appointments yet. Book one above!'}</p>
        </div>`;
      return;
    }

    appointmentsList.innerHTML = appts.map(appt => renderApptCard(appt)).join('');

    // Attach action listeners
    appointmentsList.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', handleAction);
    });

    // Pagination
    renderPagination(pagination);
  }

  function renderApptCard(appt) {
    const statusColors = {
      pending: 'var(--clr-pending)',
      approved: 'var(--clr-approved)',
      rejected: 'var(--clr-rejected)',
      completed: 'var(--clr-completed)',
      cancelled: 'var(--clr-cancelled)',
    };

    const canReschedule = !isAdmin && ['pending', 'approved'].includes(appt.status);
    const canCancel     = ['pending', 'approved'].includes(appt.status);
    const canUpdateStatus = isAdmin && ['pending', 'approved'].includes(appt.status);

    const clientInfo = isAdmin && appt.user
      ? `<span>👤 ${window.escapeHtml(appt.user.name)} <span class="text-xs text-muted">${window.escapeHtml(appt.user.email)}</span></span>`
      : '';

    const notesHtml = appt.notes
      ? `<p class="text-sm text-muted" style="margin-top:var(--sp-2);">${window.escapeHtml(appt.notes)}</p>`
      : '';

    const actions = [];
    if (canReschedule) {
      actions.push(`<button class="btn btn-secondary btn-sm" data-action="reschedule" data-id="${appt._id}" aria-label="Reschedule ${window.escapeHtml(appt.title)}">✏ Reschedule</button>`);
    }
    if (canCancel) {
      actions.push(`<button class="btn btn-danger btn-sm" data-action="cancel" data-id="${appt._id}" aria-label="Cancel ${window.escapeHtml(appt.title)}">✕ Cancel</button>`);
    }
    if (canUpdateStatus) {
      actions.push(`<button class="btn btn-primary btn-sm" data-action="status" data-id="${appt._id}" data-current="${appt.status}" aria-label="Update status for ${window.escapeHtml(appt.title)}">⟳ Update Status</button>`);
    }

    return `
      <article class="appt-card" style="--status-color:${statusColors[appt.status] || '#6366f1'}" data-appt-id="${appt._id}">
        <div class="appt-card-header">
          <div class="appt-title">${window.escapeHtml(appt.title)}</div>
          ${window.statusBadge(appt.status)}
        </div>
        <div class="appt-meta">
          ${clientInfo}
          <span>🗓 ${window.formatLocalDateTime(appt.startsAt)}</span>
          <span>⏱ ${appt.durationMinutes} minutes</span>
        </div>
        ${notesHtml}
        ${actions.length ? `<div class="appt-actions">${actions.join('')}</div>` : ''}
      </article>`;
  }

  // ── Action handler ────────────────────────────────────────────
  async function handleAction(e) {
    const btn    = e.currentTarget;
    const action = btn.dataset.action;
    const id     = btn.dataset.id;

    if (action === 'cancel') {
      const ok = await confirmAction('Cancel this appointment? This cannot be undone.', 'Yes, Cancel');
      if (!ok) return;
      try {
        await window.api.patch(`/api/appointments/${id}/cancel`);
        window.toast.success('Appointment cancelled.');
        loadAppointments();
      } catch (err) {
        window.toast.error(err.message);
      }
    }

    if (action === 'reschedule') {
      openBookModal(id);
    }

    if (action === 'status') {
      openStatusModal(id, btn.dataset.current);
    }
  }

  // ── Pagination ────────────────────────────────────────────────
  function renderPagination({ page, pages }) {
    if (pages <= 1) { paginationEl.classList.add('hidden'); return; }
    paginationEl.classList.remove('hidden');

    let html = '';
    html += `<button class="page-btn" ${page <= 1 ? 'disabled' : ''} data-page="${page - 1}" aria-label="Previous page">‹</button>`;
    for (let p = 1; p <= pages; p++) {
      html += `<button class="page-btn ${p === page ? 'active' : ''}" data-page="${p}" aria-label="Page ${p}" aria-current="${p === page ? 'page' : 'false'}">${p}</button>`;
    }
    html += `<button class="page-btn" ${page >= pages ? 'disabled' : ''} data-page="${page + 1}" aria-label="Next page">›</button>`;
    paginationEl.innerHTML = html;

    paginationEl.querySelectorAll('[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        currentPage = parseInt(btn.dataset.page);
        loadAppointments();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  // ── Filters ───────────────────────────────────────────────────
  [filterStatus, filterFrom, filterTo].forEach(el => {
    el.addEventListener('change', () => { currentPage = 1; loadAppointments(); });
  });

  filterSearch.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => { currentPage = 1; loadAppointments(); }, 400);
  });

  // ── Book modal ────────────────────────────────────────────────
  function openBookModal(rescheduleId = null) {
    editingId = rescheduleId;
    modalTitle.textContent = rescheduleId ? 'Reschedule Appointment' : 'Book Appointment';
    bookBtnText.textContent = rescheduleId ? 'Reschedule' : 'Book';
    bookForm.reset();
    slotGrid.innerHTML = '';
    apptStartsAt.value = '';
    clearAlert(modalAlert);
    clearFieldError(apptTitle, titleErr);
    clearFieldError(apptDate, dateErr);
    setMinDateToday(apptDate);
    bookModal.classList.remove('hidden');
    apptTitle.focus();
    document.body.style.overflow = 'hidden';
  }

  function closeBookModal() {
    bookModal.classList.add('hidden');
    document.body.style.overflow = '';
    editingId = null;
  }

  openBookBtn?.addEventListener('click', () => openBookModal());
  closeModalBtn.addEventListener('click', closeBookModal);
  cancelModalBtn.addEventListener('click', closeBookModal);
  bookModal.addEventListener('click', (e) => { if (e.target === bookModal) closeBookModal(); });

  // ── Slot picker ───────────────────────────────────────────────
  apptDate.addEventListener('change', async () => {
    apptStartsAt.value = '';
    slotGrid.innerHTML = '';
    slotErr.classList.add('hidden');

    const date = apptDate.value;
    if (!date) return;

    slotsLoading.classList.remove('hidden');
    try {
      const data = await window.api.get(`/api/appointments/availability?date=${date}`);
      slotsLoading.classList.add('hidden');

      if (!data.slots || data.slots.length === 0) {
        slotGrid.innerHTML = `<p class="text-sm text-muted" style="padding:var(--sp-2);">${data.message || 'No slots available for this day.'}</p>`;
        return;
      }

      slotGrid.innerHTML = data.slots.map(slot => {
        const local = new Date(slot).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        const utc   = new Date(slot).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
        return `<button type="button" class="slot-btn" data-iso="${slot}" aria-label="Select ${local}">${local}<br><span class="text-xs">${utc} UTC</span></button>`;
      }).join('');

      slotGrid.querySelectorAll('.slot-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          slotGrid.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          apptStartsAt.value = btn.dataset.iso;
          slotErr.classList.add('hidden');
        });
      });
    } catch (err) {
      slotsLoading.classList.add('hidden');
      slotGrid.innerHTML = `<p class="text-sm" style="color:var(--clr-error);padding:var(--sp-2);">Could not load slots: ${window.escapeHtml(err.message)}</p>`;
    }
  });

  // ── Book / reschedule form submit ─────────────────────────────
  bookForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert(modalAlert);

    let valid = true;
    const title    = apptTitle.value.trim();
    const startsAt = apptStartsAt.value;
    const duration = parseInt(apptDuration.value);
    const notes    = apptNotes.value.trim();

    if (!title || title.length < 3) {
      setFieldError(apptTitle, titleErr, 'Title must be at least 3 characters');
      valid = false;
    } else clearFieldError(apptTitle, titleErr);

    if (!apptDate.value) {
      setFieldError(apptDate, dateErr, 'Please select a date');
      valid = false;
    } else clearFieldError(apptDate, dateErr);

    if (!startsAt) {
      slotErr.textContent = 'Please select a time slot';
      slotErr.classList.remove('hidden');
      valid = false;
    } else slotErr.classList.add('hidden');

    if (!valid) return;

    setLoading(bookSubmitBtn, bookBtnText, bookSpinner, true);

    try {
      const body = { title, startsAt, durationMinutes: duration, notes };

      if (editingId) {
        await window.api.put(`/api/appointments/${editingId}`, body);
        window.toast.success('Appointment rescheduled!');
      } else {
        await window.api.post('/api/appointments', body);
        window.toast.success('Appointment booked!');
      }

      closeBookModal();
      currentPage = 1;
      loadAppointments();
    } catch (err) {
      showAlert(modalAlert, err.message, 'error');
    } finally {
      setLoading(bookSubmitBtn, bookBtnText, bookSpinner, false);
    }
  });

  // ── Status modal (admin) ──────────────────────────────────────
  function openStatusModal(id, currentStatus) {
    statusTarget = id;
    clearAlert(statusModalAlert);

    // Pre-select a sensible default
    if (currentStatus === 'pending') newStatusSelect.value = 'approved';
    else if (currentStatus === 'approved') newStatusSelect.value = 'completed';
    else newStatusSelect.value = 'approved';

    statusNote.value = '';
    statusModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    newStatusSelect.focus();
  }

  function closeStatusModal() {
    statusModal.classList.add('hidden');
    document.body.style.overflow = '';
    statusTarget = null;
  }

  closeStatusModalBtn.addEventListener('click', closeStatusModal);
  cancelStatusBtn.addEventListener('click', closeStatusModal);
  statusModal.addEventListener('click', (e) => { if (e.target === statusModal) closeStatusModal(); });

  statusForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert(statusModalAlert);
    if (!statusTarget) return;

    setLoading(statusSubmitBtn, statusBtnText, statusSpinner, true);
    try {
      await window.api.patch(`/api/appointments/${statusTarget}/status`, {
        status: newStatusSelect.value,
        note: statusNote.value.trim(),
      });
      window.toast.success(`Appointment marked as ${newStatusSelect.value}.`);
      closeStatusModal();
      loadAppointments();
    } catch (err) {
      showAlert(statusModalAlert, err.message, 'error');
    } finally {
      setLoading(statusSubmitBtn, statusBtnText, statusSpinner, false);
    }
  });

  // ── Keyboard: close modals with Escape ────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!bookModal.classList.contains('hidden'))   closeBookModal();
      if (!statusModal.classList.contains('hidden')) closeStatusModal();
    }
  });

  // ── Initial load ──────────────────────────────────────────────
  loadAppointments();
})();
