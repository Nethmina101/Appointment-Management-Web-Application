/* dashboard.js — unified patient + admin dashboard */
'use strict';

(async function () {
  // ── Route guard ──────────────────────────────────────────────
  const user = await window.auth.init();
  if (!user) { window.location.href = '/?expired=1'; return; }

  const isAdmin  = user.role === 'admin';
  const isDoctor = user.role === 'doctor';

  // ── DOM refs ─────────────────────────────────────────────────
  const pageTitle    = document.getElementById('page-title');
  const pageSubtitle = document.getElementById('page-subtitle');
  const userNameEl   = document.getElementById('user-name');
  const userAvatarEl = document.getElementById('user-avatar');
  const roleBadge    = document.getElementById('role-badge');
  const logoutBtn    = document.getElementById('logout-btn');

  // ── State ────────────────────────────────────────────────────
  let currentPage     = 1;
  let editingId       = null;
  let statusTarget    = null;
  let searchDebounce  = null;
  let editingUserId   = null; // for user CRUD
  let doctorPage      = 1;
  let patientPage     = 1;
  let doctorDebounce  = null;
  let patientDebounce = null;
  let analyticsChartInstance = null;

  // ── Init UI ──────────────────────────────────────────────────
  userNameEl.textContent = user.name;
  userAvatarEl.textContent = user.name.charAt(0).toUpperCase();

  if (isAdmin) {
    pageTitle.textContent    = 'Admin Dashboard';
    pageSubtitle.textContent = `Logged in as ${user.name} · Administrator`;
    roleBadge.textContent    = 'Admin';
    roleBadge.className      = 'badge badge-approved';
    roleBadge.classList.remove('hidden');
    document.getElementById('admin-section').classList.remove('hidden');
    initAdmin();
  } else if (isDoctor) {
    pageTitle.textContent    = 'Doctor Portal';
    pageSubtitle.textContent = `Welcome, Dr. ${user.name}${user.specialization ? ' · ' + user.specialization : ''}`;
    roleBadge.textContent    = 'Doctor';
    roleBadge.className      = 'badge badge-completed';
    roleBadge.classList.remove('hidden');
    document.getElementById('doctor-section').classList.remove('hidden');
    initDoctor();
  } else {
    pageTitle.textContent    = 'My Appointments';
    pageSubtitle.textContent = `Hi ${user.name}, here are your upcoming appointments.`;
    roleBadge.textContent    = 'Patient';
    roleBadge.className      = 'badge badge-pending';
    roleBadge.classList.remove('hidden');
    document.getElementById('patient-section').classList.remove('hidden');
    initPatient();
  }

  // ── Logout ───────────────────────────────────────────────────
  logoutBtn.addEventListener('click', async () => {
    logoutBtn.disabled = true;
    logoutBtn.textContent = 'Signing out…';
    await window.auth.logout();
  });

  // ════════════════════════════════════════════════════════════════
  //  ADMIN DASHBOARD
  // ════════════════════════════════════════════════════════════════
  function initAdmin() {
    const adminTabBtns = document.querySelectorAll('.admin-tab-btn');
    const panes = {
      appointments: document.getElementById('admin-pane-appointments'),
      doctors:      document.getElementById('admin-pane-doctors'),
      patients:     document.getElementById('admin-pane-patients'),
    };

    // Tab switching
    adminTabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        adminTabBtns.forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        Object.values(panes).forEach(p => p.classList.add('hidden'));
        const tabName = btn.id.replace('admin-tab-', '');
        panes[tabName].classList.remove('hidden');

        if (tabName === 'doctors') loadDoctors();
        else if (tabName === 'patients') loadPatients();
      });
    });

    // Load analytics
    loadAnalytics();
    // Load appointments
    loadAdminAppointments();

    // Appointment filters
    const filterStatus = document.getElementById('filter-status');
    const filterFrom   = document.getElementById('filter-from');
    const filterTo     = document.getElementById('filter-to');
    const filterSearch = document.getElementById('filter-search');

    [filterStatus, filterFrom, filterTo].forEach(el => {
      el.addEventListener('change', () => { currentPage = 1; loadAdminAppointments(); });
    });
    filterSearch.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => { currentPage = 1; loadAdminAppointments(); }, 400);
    });

    // Doctor search
    document.getElementById('doctor-search').addEventListener('input', () => {
      clearTimeout(doctorDebounce);
      doctorDebounce = setTimeout(() => { doctorPage = 1; loadDoctors(); }, 400);
    });

    // Patient search
    document.getElementById('patient-search').addEventListener('input', () => {
      clearTimeout(patientDebounce);
      patientDebounce = setTimeout(() => { patientPage = 1; loadPatients(); }, 400);
    });

    // Add Doctor button
    document.getElementById('add-doctor-btn').addEventListener('click', () => openUserModal());

    // User modal handlers
    initUserModal();
  }

  // ── Load Analytics ───────────────────────────────────────────
  async function loadAnalytics() {
    try {
      const data = await window.api.get('/api/admin/analytics');

      document.getElementById('astat-today-bookings').textContent = data.todayBookings;
      document.getElementById('astat-today-doctors').textContent  = data.todayDoctorCount;
      document.getElementById('astat-total-patients').textContent = data.totalPatients;
      document.getElementById('astat-total-doctors').textContent  = data.totalDoctors;
      document.getElementById('astat-pending').textContent        = data.statusBreakdown.pending;
      document.getElementById('astat-completed-today').textContent = data.completedToday;
      document.getElementById('astat-upcoming').textContent       = data.upcomingCount;
      document.getElementById('astat-total-appointments').textContent = data.totalAppointments;

      // Recent appointments
      renderRecentAppointments(data.recentAppointments);

      // Chart
      renderAnalyticsChart(data.monthlyStats);
    } catch (err) {
      window.toast.error('Failed to load analytics: ' + err.message);
    }
  }

  // ── Render Recent Appointments ───────────────────────────────
  function renderRecentAppointments(appointments) {
    const container = document.getElementById('recent-appointments-list');
    if (!appointments || !appointments.length) {
      container.innerHTML = '<div class="empty-state" style="padding:var(--sp-6);"><p class="text-muted">No recent appointments</p></div>';
      return;
    }

    container.innerHTML = appointments.map(appt => {
      const patientName = appt.user ? window.escapeHtml(appt.user.name) : 'Unknown';
      const doctorName = appt.doctor ? window.escapeHtml(appt.doctor.name) : 'Not assigned';
      return `
        <div class="recent-item">
          <div class="recent-item-left">
            <span class="recent-item-title">${window.escapeHtml(appt.title)}</span>
            <span class="text-xs text-muted">Patient: ${patientName} · Doctor: ${doctorName}</span>
          </div>
          <div class="recent-item-right">
            <span class="text-xs text-muted">${window.formatLocalDateTime(appt.startsAt)}</span>
            ${window.statusBadge(appt.status)}
          </div>
        </div>`;
    }).join('');
  }

  // ── Analytics Chart ──────────────────────────────────────────
  function renderAnalyticsChart(monthlyStats) {
    const canvas = document.getElementById('analytics-chart');
    if (!canvas || typeof Chart === 'undefined') {
      // Retry after Chart.js loads
      setTimeout(() => renderAnalyticsChart(monthlyStats), 500);
      return;
    }

    const months = [];
    const patientCounts = [];
    const doctorCounts = [];

    // Build last 6 months labels
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      months.push(label);
      patientCounts.push(0);
      doctorCounts.push(0);
    }

    // Fill data from stats
    monthlyStats.forEach(s => {
      const d = new Date(s._id.year, s._id.month - 1, 1);
      const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      const idx = months.indexOf(label);
      if (idx !== -1) {
        if (s._id.role === 'patient') patientCounts[idx] = s.count;
        else if (s._id.role === 'doctor') doctorCounts[idx] = s.count;
      }
    });

    if (analyticsChartInstance) {
      analyticsChartInstance.destroy();
    }

    analyticsChartInstance = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: months,
        datasets: [
          {
            label: 'Patients Registered',
            data: patientCounts,
            backgroundColor: 'rgba(99, 102, 241, 0.7)',
            borderColor: 'rgba(99, 102, 241, 1)',
            borderWidth: 1,
            borderRadius: 6,
          },
          {
            label: 'Doctors Registered',
            data: doctorCounts,
            backgroundColor: 'rgba(34, 197, 94, 0.7)',
            borderColor: 'rgba(34, 197, 94, 1)',
            borderWidth: 1,
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { color: '#94a3b8', font: { family: 'Inter', size: 12 }, padding: 16, usePointStyle: true },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { color: '#64748b', stepSize: 1, font: { family: 'Inter' } },
            grid: { color: 'rgba(255,255,255,0.05)' },
          },
          x: {
            ticks: { color: '#64748b', font: { family: 'Inter' } },
            grid: { display: false },
          },
        },
      },
    });
  }

  // ── Admin Appointments ───────────────────────────────────────
  async function loadAdminAppointments() {
    const listEl = document.getElementById('appointments-list');
    const pagEl  = document.getElementById('pagination');
    listEl.innerHTML = '<div class="loading-overlay"><span class="spinner"></span></div>';
    pagEl.classList.add('hidden');

    const params = new URLSearchParams();
    params.set('page', currentPage);
    params.set('limit', 10);
    const filterStatus = document.getElementById('filter-status');
    const filterFrom   = document.getElementById('filter-from');
    const filterTo     = document.getElementById('filter-to');
    const filterSearch = document.getElementById('filter-search');
    if (filterStatus.value) params.set('status', filterStatus.value);
    if (filterFrom.value)   params.set('from', filterFrom.value);
    if (filterTo.value)     params.set('to', filterTo.value);
    if (filterSearch.value.trim()) params.set('search', filterSearch.value.trim());

    try {
      const data = await window.api.get(`/api/appointments?${params}`);
      renderAdminAppointments(data.appointments, data.pagination, listEl, pagEl);
    } catch (err) {
      listEl.innerHTML = `<div class="alert alert-error"><span>✕</span><span>${window.escapeHtml(err.message)}</span></div>`;
    }
  }

  function renderAdminAppointments(appts, pagination, listEl, pagEl) {
    if (!appts.length) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <h3>No appointments found</h3>
          <p>No appointments match your current filters.</p>
        </div>`;
      return;
    }

    listEl.innerHTML = appts.map(appt => renderApptCard(appt, true)).join('');
    listEl.querySelectorAll('[data-action]').forEach(btn => btn.addEventListener('click', handleAction));
    renderPagination(pagination, pagEl, (p) => { currentPage = p; loadAdminAppointments(); });
  }

  // ── Doctors Management ───────────────────────────────────────
  async function loadDoctors() {
    const listEl = document.getElementById('doctors-list');
    const pagEl  = document.getElementById('doctors-pagination');
    listEl.innerHTML = '<div class="loading-overlay"><span class="spinner"></span></div>';
    pagEl.classList.add('hidden');

    const params = new URLSearchParams();
    params.set('role', 'doctor');
    params.set('page', doctorPage);
    params.set('limit', 10);
    const search = document.getElementById('doctor-search').value.trim();
    if (search) params.set('search', search);

    try {
      const data = await window.api.get(`/api/admin/users?${params}`);
      renderUserList(data.users, data.pagination, listEl, pagEl, 'doctor');
    } catch (err) {
      listEl.innerHTML = `<div class="alert alert-error"><span>✕</span><span>${window.escapeHtml(err.message)}</span></div>`;
    }
  }

  // ── Patients Management ──────────────────────────────────────
  async function loadPatients() {
    const listEl = document.getElementById('patients-list');
    const pagEl  = document.getElementById('patients-pagination');
    listEl.innerHTML = '<div class="loading-overlay"><span class="spinner"></span></div>';
    pagEl.classList.add('hidden');

    const params = new URLSearchParams();
    params.set('role', 'patient');
    params.set('page', patientPage);
    params.set('limit', 10);
    const search = document.getElementById('patient-search').value.trim();
    if (search) params.set('search', search);

    try {
      const data = await window.api.get(`/api/admin/users?${params}`);
      renderUserList(data.users, data.pagination, listEl, pagEl, 'patient');
    } catch (err) {
      listEl.innerHTML = `<div class="alert alert-error"><span>✕</span><span>${window.escapeHtml(err.message)}</span></div>`;
    }
  }

  function renderUserList(users, pagination, listEl, pagEl, type) {
    if (!users.length) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">${type === 'doctor' ? '🩺' : '👥'}</div>
          <h3>No ${type}s found</h3>
        </div>`;
      return;
    }

    listEl.innerHTML = users.map(u => {
      const specLine = u.specialization ? `<span class="text-xs text-muted">Specialization: ${window.escapeHtml(u.specialization)}</span>` : '';
      const phoneLine = u.phone ? `<span class="text-xs text-muted">📞 ${window.escapeHtml(u.phone)}</span>` : '';
      const joined = window.formatLocalDate(u.createdAt);

      return `
        <article class="user-card" data-user-id="${u._id}">
          <div class="user-card-left">
            <div class="user-avatar" style="width:40px;height:40px;font-size:16px;">${u.name.charAt(0).toUpperCase()}</div>
            <div>
              <div class="user-card-name">${window.escapeHtml(u.name)}</div>
              <div class="text-xs text-muted">${window.escapeHtml(u.email)}</div>
              ${specLine}
              ${phoneLine}
            </div>
          </div>
          <div class="user-card-right">
            <span class="text-xs text-muted">Joined ${joined}</span>
            <div class="user-card-actions">
              <button class="btn btn-secondary btn-sm" data-user-action="edit" data-user-id="${u._id}" data-name="${window.escapeHtml(u.name)}" data-email="${window.escapeHtml(u.email)}" data-role="${u.role}" data-spec="${window.escapeHtml(u.specialization || '')}" data-phone="${window.escapeHtml(u.phone || '')}">✏ Edit</button>
              <button class="btn btn-danger btn-sm" data-user-action="delete" data-user-id="${u._id}" data-name="${window.escapeHtml(u.name)}">✕ Delete</button>
            </div>
          </div>
        </article>`;
    }).join('');

    listEl.querySelectorAll('[data-user-action]').forEach(btn => {
      btn.addEventListener('click', handleUserAction);
    });

    renderPagination(pagination, pagEl, (p) => {
      if (type === 'doctor') { doctorPage = p; loadDoctors(); }
      else { patientPage = p; loadPatients(); }
    });
  }

  async function handleUserAction(e) {
    const btn    = e.currentTarget;
    const action = btn.dataset.userAction;
    const id     = btn.dataset.userId;

    if (action === 'edit') {
      openUserModal(id, {
        name:  btn.dataset.name,
        email: btn.dataset.email,
        role:  btn.dataset.role,
        specialization: btn.dataset.spec,
        phone: btn.dataset.phone,
      });
    }

    if (action === 'delete') {
      const ok = await confirmAction(`Delete ${btn.dataset.name}? This will also remove their appointments.`, 'Yes, Delete');
      if (!ok) return;
      try {
        await window.api.delete(`/api/admin/users/${id}`);
        window.toast.success('User deleted.');
        loadDoctors();
        loadPatients();
        loadAnalytics();
      } catch (err) {
        window.toast.error(err.message);
      }
    }
  }

  // ── User CRUD Modal ──────────────────────────────────────────
  function initUserModal() {
    const modal     = document.getElementById('user-modal');
    const closeBtn  = document.getElementById('close-user-modal');
    const cancelBtn = document.getElementById('cancel-user-btn');
    const form      = document.getElementById('user-form');
    const roleSelect = document.getElementById('user-role');

    closeBtn.addEventListener('click', closeUserModal);
    cancelBtn.addEventListener('click', closeUserModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeUserModal(); });

    // Show/hide doctor-specific fields based on role
    roleSelect.addEventListener('change', () => {
      const isDoctor = roleSelect.value === 'doctor';
      document.getElementById('specialization-group').style.display = isDoctor ? '' : 'none';
      document.getElementById('phone-group').style.display = isDoctor ? '' : 'none';
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlert(document.getElementById('user-modal-alert'));

      const name    = document.getElementById('user-fullname').value.trim();
      const email   = document.getElementById('user-email').value.trim();
      const password = document.getElementById('user-password').value;
      const role    = roleSelect.value;
      const spec    = document.getElementById('user-specialization').value.trim();
      const phone   = document.getElementById('user-phone').value.trim();

      // Validate
      let valid = true;
      if (!name || name.length < 2) {
        setFieldError(document.getElementById('user-fullname'), document.getElementById('user-fullname-err'), 'Name is required (min 2 chars)');
        valid = false;
      } else clearFieldError(document.getElementById('user-fullname'), document.getElementById('user-fullname-err'));

      if (!email || !/\S+@\S+\.\S+/.test(email)) {
        setFieldError(document.getElementById('user-email'), document.getElementById('user-email-err'), 'Valid email is required');
        valid = false;
      } else clearFieldError(document.getElementById('user-email'), document.getElementById('user-email-err'));

      if (!editingUserId && (!password || password.length < 8)) {
        setFieldError(document.getElementById('user-password'), document.getElementById('user-password-err'), 'Password required (min 8 chars)');
        valid = false;
      } else clearFieldError(document.getElementById('user-password'), document.getElementById('user-password-err'));

      if (!valid) return;

      setLoading(document.getElementById('user-submit-btn'), document.getElementById('user-btn-text'), document.getElementById('user-spinner'), true);

      try {
        const body = { name, email, role };
        if (password) body.password = password;
        if (role === 'doctor') {
          body.specialization = spec;
          body.phone = phone;
        }

        if (editingUserId) {
          await window.api.put(`/api/admin/users/${editingUserId}`, body);
          window.toast.success('User updated successfully.');
        } else {
          await window.api.post('/api/admin/users', body);
          window.toast.success('User created successfully.');
        }

        closeUserModal();
        loadDoctors();
        loadPatients();
        loadAnalytics();
      } catch (err) {
        showAlert(document.getElementById('user-modal-alert'), err.message, 'error');
      } finally {
        setLoading(document.getElementById('user-submit-btn'), document.getElementById('user-btn-text'), document.getElementById('user-spinner'), false);
      }
    });
  }

  function openUserModal(userId = null, userData = null) {
    editingUserId = userId;
    const modal = document.getElementById('user-modal');
    const title = document.getElementById('user-modal-title');
    const btnText = document.getElementById('user-btn-text');
    const passHint = document.getElementById('password-hint');
    const roleSelect = document.getElementById('user-role');

    clearAlert(document.getElementById('user-modal-alert'));

    if (userId && userData) {
      title.textContent = 'Edit User';
      btnText.textContent = 'Save Changes';
      passHint.textContent = '(leave blank to keep unchanged)';
      document.getElementById('user-fullname').value  = userData.name;
      document.getElementById('user-email').value  = userData.email;
      document.getElementById('user-password').value = '';
      roleSelect.value = userData.role;
      document.getElementById('user-specialization').value = userData.specialization || '';
      document.getElementById('user-phone').value = userData.phone || '';
    } else {
      title.textContent = 'Add Doctor';
      btnText.textContent = 'Create';
      passHint.textContent = '(min 8 characters)';
      document.getElementById('user-form').reset();
      roleSelect.value = 'doctor';
    }

    // Toggle doctor fields
    const isDoctor = roleSelect.value === 'doctor';
    document.getElementById('specialization-group').style.display = isDoctor ? '' : 'none';
    document.getElementById('phone-group').style.display = isDoctor ? '' : 'none';

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    document.getElementById('user-fullname').focus();
  }

  function closeUserModal() {
    document.getElementById('user-modal').classList.add('hidden');
    document.body.style.overflow = '';
    editingUserId = null;
  }

  // ════════════════════════════════════════════════════════════════
  //  DOCTOR DASHBOARD
  // ════════════════════════════════════════════════════════════════
  function initDoctor() {
    // Fill doctor profile card
    document.getElementById('doctor-display-name').textContent = `Dr. ${user.name}`;
    document.getElementById('doctor-display-spec').textContent = user.specialization || 'General Practitioner';
    document.getElementById('doctor-display-email').textContent = user.email;
    const phoneEl = document.getElementById('doctor-display-phone');
    if (user.phone) {
      phoneEl.textContent = `📞 ${user.phone}`;
      phoneEl.classList.remove('hidden');
    } else {
      phoneEl.classList.add('hidden');
    }

    const filterStatus = document.getElementById('doctor-filter-status');
    const filterFrom   = document.getElementById('doctor-filter-from');
    const filterTo     = document.getElementById('doctor-filter-to');
    const filterSearch = document.getElementById('doctor-filter-search');

    let doctorApptPage = 1;
    let doctorApptDebounce = null;

    [filterStatus, filterFrom, filterTo].forEach(el => {
      el.addEventListener('change', () => { doctorApptPage = 1; loadDoctorAppointments(); });
    });
    filterSearch.addEventListener('input', () => {
      clearTimeout(doctorApptDebounce);
      doctorApptDebounce = setTimeout(() => { doctorApptPage = 1; loadDoctorAppointments(); }, 400);
    });

    loadDoctorAppointments();

    async function loadDoctorAppointments() {
      const listEl = document.getElementById('doctor-appointments-list');
      const pagEl  = document.getElementById('doctor-pagination');
      listEl.innerHTML = '<div class="loading-overlay"><span class="spinner"></span></div>';
      pagEl.classList.add('hidden');

      const params = new URLSearchParams();
      params.set('page', doctorApptPage);
      params.set('limit', 10);
      if (filterStatus.value) params.set('status', filterStatus.value);
      if (filterFrom.value)   params.set('from', filterFrom.value);
      if (filterTo.value)     params.set('to', filterTo.value);
      if (filterSearch.value.trim()) params.set('search', filterSearch.value.trim());

      try {
        const data = await window.api.get(`/api/appointments?${params}`);
        updateDoctorStats(data.appointments);
        renderDoctorAppointments(data.appointments, data.pagination, listEl, pagEl);
      } catch (err) {
        listEl.innerHTML = `<div class="alert alert-error"><span>✕</span><span>${window.escapeHtml(err.message)}</span></div>`;
      }
    }

    function updateDoctorStats(appts) {
      const todayStr = new Date().toISOString().slice(0, 10);
      let todayCount = 0;
      let pendingCount = 0;
      let approvedCount = 0;
      let completedCount = 0;

      appts.forEach(a => {
        const apptDateStr = new Date(a.startsAt).toISOString().slice(0, 10);
        if (apptDateStr === todayStr && ['pending', 'approved'].includes(a.status)) todayCount++;
        if (a.status === 'pending') pendingCount++;
        if (a.status === 'approved') approvedCount++;
        if (a.status === 'completed') completedCount++;
      });

      document.getElementById('dstat-today').textContent     = todayCount;
      document.getElementById('dstat-pending').textContent   = pendingCount;
      document.getElementById('dstat-approved').textContent  = approvedCount;
      document.getElementById('dstat-completed').textContent = completedCount;
    }

    function renderDoctorAppointments(appts, pagination, listEl, pagEl) {
      if (!appts.length) {
        listEl.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">🩺</div>
            <h3>No appointments found</h3>
            <p>No patient bookings match your filter criteria.</p>
          </div>`;
        return;
      }

      listEl.innerHTML = appts.map(appt => renderDoctorApptCard(appt)).join('');

      listEl.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', handleAction);
      });

      renderPagination(pagination, pagEl, (p) => {
        doctorApptPage = p;
        loadDoctorAppointments();
      });
    }

    function renderDoctorApptCard(appt) {
      const statusColors = {
        pending: 'var(--clr-pending)',
        approved: 'var(--clr-approved)',
        rejected: 'var(--clr-rejected)',
        completed: 'var(--clr-completed)',
        cancelled: 'var(--clr-cancelled)',
      };

      const patientName  = appt.user ? window.escapeHtml(appt.user.name) : 'Anonymous Patient';
      const patientEmail = appt.user ? window.escapeHtml(appt.user.email) : '';
      const notesHtml    = appt.notes ? `<p class="text-sm text-muted" style="margin-top:var(--sp-2);"><strong>Patient Notes:</strong> ${window.escapeHtml(appt.notes)}</p>` : '';

      const actions = [];
      if (['pending', 'approved'].includes(appt.status)) {
        actions.push(`<button class="btn btn-primary btn-sm" data-action="status" data-id="${appt._id}" data-current="${appt.status}" aria-label="Update status for ${window.escapeHtml(appt.title)}">⟳ Update Status</button>`);
        actions.push(`<button class="btn btn-danger btn-sm" data-action="cancel" data-id="${appt._id}" aria-label="Cancel appointment">✕ Cancel</button>`);
      }

      return `
        <article class="appt-card" style="--status-color:${statusColors[appt.status] || '#6366f1'}" data-appt-id="${appt._id}">
          <div class="appt-card-header">
            <div>
              <div class="appt-title">${window.escapeHtml(appt.title)}</div>
              <div class="text-xs text-muted" style="margin-top:2px;">👤 Patient: <strong>${patientName}</strong> (${patientEmail})</div>
            </div>
            ${window.statusBadge(appt.status)}
          </div>
          <div class="appt-meta">
            <span>🗓 ${window.formatLocalDateTime(appt.startsAt)}</span>
            <span>⏱ ${appt.durationMinutes} minutes</span>
          </div>
          ${notesHtml}
          ${actions.length ? `<div class="appt-actions">${actions.join('')}</div>` : ''}
        </article>`;
    }

    window._loadDoctorAppointments = loadDoctorAppointments;
  }

  // ════════════════════════════════════════════════════════════════
  //  PATIENT DASHBOARD
  // ════════════════════════════════════════════════════════════════
  function initPatient() {
    const filterStatus = document.getElementById('patient-filter-status');
    const filterFrom   = document.getElementById('patient-filter-from');
    const filterTo     = document.getElementById('patient-filter-to');
    const filterSearch = document.getElementById('patient-filter-search');

    const openBookBtn  = document.getElementById('open-book-btn');
    const bookModal    = document.getElementById('book-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const cancelModalBtn = document.getElementById('cancel-modal-btn');
    const bookForm     = document.getElementById('book-form');
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
    const apptDoctor   = document.getElementById('appt-doctor');
    const doctorErr    = document.getElementById('doctor-err');
    const modalTitle   = document.getElementById('modal-title');
    const modalAlert   = document.getElementById('modal-alert');
    const bookSubmitBtn = document.getElementById('book-submit-btn');
    const bookBtnText  = document.getElementById('book-btn-text');
    const bookSpinner  = document.getElementById('book-spinner');

    // Stats
    const statPending   = document.getElementById('stat-pending');
    const statApproved  = document.getElementById('stat-approved');
    const statCompleted = document.getElementById('stat-completed');
    const statTotal     = document.getElementById('stat-total');

    loadPatientAppointments();
    loadDoctorOptions();

    // Filters
    [filterStatus, filterFrom, filterTo].forEach(el => {
      el.addEventListener('change', () => { currentPage = 1; loadPatientAppointments(); });
    });
    filterSearch.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => { currentPage = 1; loadPatientAppointments(); }, 400);
    });

    // Load doctors for booking dropdown
    async function loadDoctorOptions() {
      try {
        const data = await window.api.get('/api/appointments/doctors');
        apptDoctor.innerHTML = '<option value="">-- Select a Doctor --</option>';
        data.doctors.forEach(doc => {
          const specLabel = doc.specialization ? ` (${doc.specialization})` : '';
          apptDoctor.innerHTML += `<option value="${doc._id}">Dr. ${window.escapeHtml(doc.name)}${specLabel}</option>`;
        });
      } catch (err) {
        console.warn('Could not load doctors:', err.message);
      }
    }

    // Load appointments
    async function loadPatientAppointments() {
      const listEl = document.getElementById('patient-appointments-list');
      const pagEl  = document.getElementById('patient-pagination');
      listEl.innerHTML = '<div class="loading-overlay"><span class="spinner"></span></div>';
      pagEl.classList.add('hidden');

      const params = new URLSearchParams();
      params.set('page', currentPage);
      params.set('limit', 10);
      if (filterStatus.value) params.set('status', filterStatus.value);
      if (filterFrom.value)   params.set('from', filterFrom.value);
      if (filterTo.value)     params.set('to', filterTo.value);
      if (filterSearch.value.trim()) params.set('search', filterSearch.value.trim());

      try {
        const data = await window.api.get(`/api/appointments?${params}`);
        updatePatientStats(data.appointments);
        renderPatientAppointments(data.appointments, data.pagination, listEl, pagEl);
      } catch (err) {
        listEl.innerHTML = `<div class="alert alert-error"><span>✕</span><span>${window.escapeHtml(err.message)}</span></div>`;
      }
    }

    function updatePatientStats(appts) {
      const counts = { pending: 0, approved: 0, completed: 0 };
      appts.forEach(a => { if (counts[a.status] !== undefined) counts[a.status]++; });
      statPending.textContent   = counts.pending;
      statApproved.textContent  = counts.approved;
      statCompleted.textContent = counts.completed;
      statTotal.textContent     = appts.length;
    }

    function renderPatientAppointments(appts, pagination, listEl, pagEl) {
      if (!appts.length) {
        listEl.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">📋</div>
            <h3>No appointments found</h3>
            <p>You have no appointments yet. Book one above!</p>
          </div>`;
        return;
      }

      listEl.innerHTML = appts.map(appt => renderApptCard(appt, false)).join('');
      listEl.querySelectorAll('[data-action]').forEach(btn => btn.addEventListener('click', handleAction));
      renderPagination(pagination, pagEl, (p) => { currentPage = p; loadPatientAppointments(); });
    }

    // ── Book modal ──────────────────────────────────────────────
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
      clearFieldError(apptDoctor, doctorErr);
      setMinDateToday(apptDate);
      bookModal.classList.remove('hidden');
      apptDoctor.focus();
      document.body.style.overflow = 'hidden';
    }

    function closeBookModal() {
      bookModal.classList.add('hidden');
      document.body.style.overflow = '';
      editingId = null;
    }

    openBookBtn.addEventListener('click', () => openBookModal());
    closeModalBtn.addEventListener('click', closeBookModal);
    cancelModalBtn.addEventListener('click', closeBookModal);
    bookModal.addEventListener('click', (e) => { if (e.target === bookModal) closeBookModal(); });

    // ── Slot picker — reload when date OR doctor changes ────────
    async function loadSlots() {
      apptStartsAt.value = '';
      slotGrid.innerHTML = '';
      slotErr.classList.add('hidden');

      const date = apptDate.value;
      if (!date) return;

      slotsLoading.classList.remove('hidden');
      try {
        let url = `/api/appointments/availability?date=${date}`;
        if (apptDoctor.value) url += `&doctor=${apptDoctor.value}`;

        const data = await window.api.get(url);
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
    }

    apptDate.addEventListener('change', loadSlots);
    apptDoctor.addEventListener('change', () => { if (apptDate.value) loadSlots(); });

    // ── Book / reschedule form submit ───────────────────────────
    bookForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlert(modalAlert);

      let valid = true;
      const title    = apptTitle.value.trim();
      const startsAt = apptStartsAt.value;
      const duration = parseInt(apptDuration.value);
      const notes    = apptNotes.value.trim();
      const doctorId = apptDoctor.value;

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
        if (doctorId) body.doctor = doctorId;

        if (editingId) {
          await window.api.put(`/api/appointments/${editingId}`, body);
          window.toast.success('Appointment rescheduled!');
        } else {
          await window.api.post('/api/appointments', body);
          window.toast.success('Appointment booked!');
        }

        closeBookModal();
        currentPage = 1;
        loadPatientAppointments();
      } catch (err) {
        showAlert(modalAlert, err.message, 'error');
      } finally {
        setLoading(bookSubmitBtn, bookBtnText, bookSpinner, false);
      }
    });

    // Expose openBookModal for reschedule action
    window._openBookModal = openBookModal;

    // Keyboard: close modals with Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!bookModal.classList.contains('hidden')) closeBookModal();
      }
    });
  }

  // ════════════════════════════════════════════════════════════════
  //  SHARED HELPERS
  // ════════════════════════════════════════════════════════════════

  function renderApptCard(appt, showAdmin) {
    const statusColors = {
      pending: 'var(--clr-pending)',
      approved: 'var(--clr-approved)',
      rejected: 'var(--clr-rejected)',
      completed: 'var(--clr-completed)',
      cancelled: 'var(--clr-cancelled)',
    };

    const canReschedule = !showAdmin && ['pending', 'approved'].includes(appt.status);
    const canCancel     = ['pending', 'approved'].includes(appt.status);
    const canUpdateStatus = showAdmin && ['pending', 'approved'].includes(appt.status);

    const clientInfo = showAdmin && appt.user
      ? `<span>👤 ${window.escapeHtml(appt.user.name)} <span class="text-xs text-muted">${window.escapeHtml(appt.user.email)}</span></span>`
      : '';

    const doctorInfo = appt.doctor
      ? `<span>🩺 Dr. ${window.escapeHtml(appt.doctor.name)}${appt.doctor.specialization ? ' · ' + window.escapeHtml(appt.doctor.specialization) : ''}</span>`
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
          ${doctorInfo}
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
        if (isAdmin) { loadAdminAppointments(); loadAnalytics(); }
        else if (isDoctor && typeof window._loadDoctorAppointments === 'function') window._loadDoctorAppointments();
        else if (typeof window._loadPatientAppointments === 'function') window._loadPatientAppointments();
        else window.location.reload();
      } catch (err) {
        window.toast.error(err.message);
      }
    }

    if (action === 'reschedule') {
      if (window._openBookModal) window._openBookModal(id);
    }

    if (action === 'status') {
      openStatusModal(id, btn.dataset.current);
    }
  }

  // ── Pagination helper ─────────────────────────────────────────
  function renderPagination({ page, pages }, el, callback) {
    if (pages <= 1) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');

    let html = '';
    html += `<button class="page-btn" ${page <= 1 ? 'disabled' : ''} data-page="${page - 1}" aria-label="Previous page">‹</button>`;
    for (let p = 1; p <= pages; p++) {
      html += `<button class="page-btn ${p === page ? 'active' : ''}" data-page="${p}" aria-label="Page ${p}" aria-current="${p === page ? 'page' : 'false'}">${p}</button>`;
    }
    html += `<button class="page-btn" ${page >= pages ? 'disabled' : ''} data-page="${page + 1}" aria-label="Next page">›</button>`;
    el.innerHTML = html;

    el.querySelectorAll('[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        callback(parseInt(btn.dataset.page));
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  // ── Status modal (admin) ──────────────────────────────────────
  const statusModal        = document.getElementById('status-modal');
  const closeStatusModalBtn = document.getElementById('close-status-modal');
  const cancelStatusBtn    = document.getElementById('cancel-status-btn');
  const statusForm         = document.getElementById('status-form');
  const newStatusSelect    = document.getElementById('new-status');
  const statusNote         = document.getElementById('status-note');
  const statusSubmitBtn    = document.getElementById('status-submit-btn');
  const statusBtnText      = document.getElementById('status-btn-text');
  const statusSpinner      = document.getElementById('status-spinner');
  const statusModalAlert   = document.getElementById('status-modal-alert');

  function openStatusModal(id, currentStatus) {
    statusTarget = id;
    clearAlert(statusModalAlert);
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
      if (isAdmin) { loadAdminAppointments(); loadAnalytics(); }
      else if (isDoctor && typeof window._loadDoctorAppointments === 'function') window._loadDoctorAppointments();
      else if (typeof window._loadPatientAppointments === 'function') window._loadPatientAppointments();
    } catch (err) {
      showAlert(statusModalAlert, err.message, 'error');
    } finally {
      setLoading(statusSubmitBtn, statusBtnText, statusSpinner, false);
    }
  });

  // ── Keyboard: close modals with Escape ────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!statusModal.classList.contains('hidden')) closeStatusModal();
      if (!document.getElementById('user-modal').classList.contains('hidden')) closeUserModal();
    }
  });
})();
