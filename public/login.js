/* login.js — handles unified patient/admin login & registration */
'use strict';

(async function () {
  const urlParams = new URLSearchParams(window.location.search);
  const isLoggedOut = urlParams.get('loggedout') === '1';

  // ── Session Check ─────────────────────────────────────────────
  const sessionBanner   = document.getElementById('session-banner');
  const activeUserName  = document.getElementById('active-user-name');
  const activeUserRole  = document.getElementById('active-user-role');
  const activeUserAvatar= document.getElementById('active-user-avatar');
  const switchAccountBtn= document.getElementById('switch-account-btn');
  const alertBox        = document.getElementById('alert-box');

  if (isLoggedOut) {
    showAlert(alertBox, 'You have been signed out successfully.', 'success');
  }

  // Check current session
  const currentUser = await window.auth.init();
  if (currentUser && !isLoggedOut) {
    // Show session banner instead of hard-redirecting so user is never trapped
    sessionBanner.classList.remove('hidden');
    activeUserName.textContent = `Signed in as ${currentUser.name}`;
    activeUserRole.textContent = `Role: ${currentUser.role === 'admin' ? 'Administrator' : 'Patient'}`;
    activeUserAvatar.textContent = (currentUser.name || '?').charAt(0).toUpperCase();

    // If user arrived without requesting switch/stay, offer 1-click continue
    switchAccountBtn?.addEventListener('click', async () => {
      switchAccountBtn.disabled = true;
      switchAccountBtn.textContent = 'Signing out…';
      await window.auth.logout();
    });
  }

  // ── Tabs Switching ────────────────────────────────────────────
  const tabLogin  = document.getElementById('tab-login');
  const tabSignup = document.getElementById('tab-signup');
  const paneLogin = document.getElementById('pane-login');
  const paneSignup= document.getElementById('pane-signup');

  function setTab(mode) {
    clearAlert(alertBox);
    if (mode === 'signup') {
      tabLogin.classList.remove('active');
      tabLogin.setAttribute('aria-selected', 'false');
      tabSignup.classList.add('active');
      tabSignup.setAttribute('aria-selected', 'true');
      paneLogin.classList.add('hidden');
      paneSignup.classList.remove('hidden');
    } else {
      tabSignup.classList.remove('active');
      tabSignup.setAttribute('aria-selected', 'false');
      tabLogin.classList.add('active');
      tabLogin.setAttribute('aria-selected', 'true');
      paneSignup.classList.add('hidden');
      paneLogin.classList.remove('hidden');
    }
  }

  tabLogin.addEventListener('click', () => setTab('login'));
  tabSignup.addEventListener('click', () => setTab('signup'));

  if (urlParams.get('tab') === 'signup') {
    setTab('signup');
  }

  // ── Admin Demo Helper ─────────────────────────────────────────
  const fillAdminBtn = document.getElementById('fill-admin-btn');
  const loginEmail   = document.getElementById('login-email');
  const loginPass    = document.getElementById('login-password');

  fillAdminBtn?.addEventListener('click', () => {
    loginEmail.value = 'admin@example.com';
    loginPass.value  = 'AdminPass@123';
    clearFieldError(loginEmail, document.getElementById('login-email-error'));
    clearFieldError(loginPass, document.getElementById('login-password-error'));
    window.toast.info('Admin demo credentials filled!');
  });

  // ── Form 1: Login ─────────────────────────────────────────────
  const loginForm      = document.getElementById('login-form');
  const loginSubmitBtn = document.getElementById('login-submit-btn');
  const loginBtnText   = document.getElementById('login-btn-text');
  const loginSpinner   = document.getElementById('login-btn-spinner');
  const loginEmailErr  = document.getElementById('login-email-error');
  const loginPassErr   = document.getElementById('login-password-error');

  loginEmail.addEventListener('blur', () => {
    if (!loginEmail.value.trim()) {
      setFieldError(loginEmail, loginEmailErr, 'Email is required');
    } else if (!/\S+@\S+\.\S+/.test(loginEmail.value)) {
      setFieldError(loginEmail, loginEmailErr, 'Enter a valid email address');
    } else {
      clearFieldError(loginEmail, loginEmailErr);
    }
  });

  loginPass.addEventListener('blur', () => {
    if (!loginPass.value) {
      setFieldError(loginPass, loginPassErr, 'Password is required');
    } else {
      clearFieldError(loginPass, loginPassErr);
    }
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert(alertBox);

    let valid = true;
    const email    = loginEmail.value.trim();
    const password = loginPass.value;

    if (!email) { setFieldError(loginEmail, loginEmailErr, 'Email is required'); valid = false; }
    else if (!/\S+@\S+\.\S+/.test(email)) { setFieldError(loginEmail, loginEmailErr, 'Enter a valid email address'); valid = false; }
    else clearFieldError(loginEmail, loginEmailErr);

    if (!password) { setFieldError(loginPass, loginPassErr, 'Password is required'); valid = false; }
    else clearFieldError(loginPass, loginPassErr);

    if (!valid) return;

    setLoading(loginSubmitBtn, loginBtnText, loginSpinner, true);

    try {
      const data = await window.api.post('/api/auth/login', { email, password });
      window.toast.success(`Welcome back, ${data.user.name}!`);
      setTimeout(() => { window.location.href = '/dashboard.html'; }, 400);
    } catch (err) {
      showAlert(alertBox, err.message, 'error');
      setLoading(loginSubmitBtn, loginBtnText, loginSpinner, false);
    }
  });

  // ── Form 2: Patient Registration ──────────────────────────────
  const signupForm       = document.getElementById('signup-form');
  const signupSubmitBtn  = document.getElementById('signup-submit-btn');
  const signupBtnText    = document.getElementById('signup-btn-text');
  const signupSpinner    = document.getElementById('signup-btn-spinner');
  const signupName       = document.getElementById('signup-name');
  const signupNameErr    = document.getElementById('signup-name-error');
  const signupEmail      = document.getElementById('signup-email');
  const signupEmailErr   = document.getElementById('signup-email-error');
  const signupPass       = document.getElementById('signup-password');
  const signupPassErr    = document.getElementById('signup-password-error');
  const signupConfirm    = document.getElementById('signup-confirmPassword');
  const signupConfirmErr = document.getElementById('signup-confirm-error');

  signupName.addEventListener('blur', () => {
    const v = signupName.value.trim();
    if (!v) setFieldError(signupName, signupNameErr, 'Patient full name is required');
    else if (v.length < 2) setFieldError(signupName, signupNameErr, 'Name must be at least 2 characters');
    else clearFieldError(signupName, signupNameErr);
  });

  signupEmail.addEventListener('blur', () => {
    const v = signupEmail.value.trim();
    if (!v) setFieldError(signupEmail, signupEmailErr, 'Email is required');
    else if (!/\S+@\S+\.\S+/.test(v)) setFieldError(signupEmail, signupEmailErr, 'Enter a valid email address');
    else clearFieldError(signupEmail, signupEmailErr);
  });

  signupPass.addEventListener('blur', () => {
    const v = signupPass.value;
    if (!v) setFieldError(signupPass, signupPassErr, 'Password is required');
    else if (v.length < 8) setFieldError(signupPass, signupPassErr, 'Password must be at least 8 characters');
    else clearFieldError(signupPass, signupPassErr);
  });

  signupConfirm.addEventListener('blur', () => {
    const v = signupConfirm.value;
    if (!v) setFieldError(signupConfirm, signupConfirmErr, 'Please confirm your password');
    else if (v !== signupPass.value) setFieldError(signupConfirm, signupConfirmErr, 'Passwords do not match');
    else clearFieldError(signupConfirm, signupConfirmErr);
  });

  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert(alertBox);

    let valid = true;
    const name     = signupName.value.trim();
    const email    = signupEmail.value.trim();
    const password = signupPass.value;
    const confirm  = signupConfirm.value;

    if (!name || name.length < 2) { setFieldError(signupName, signupNameErr, 'Patient full name is required (min 2 chars)'); valid = false; }
    else clearFieldError(signupName, signupNameErr);

    if (!email || !/\S+@\S+\.\S+/.test(email)) { setFieldError(signupEmail, signupEmailErr, 'Enter a valid email'); valid = false; }
    else clearFieldError(signupEmail, signupEmailErr);

    if (!password || password.length < 8) { setFieldError(signupPass, signupPassErr, 'Password must be at least 8 characters'); valid = false; }
    else clearFieldError(signupPass, signupPassErr);

    if (password !== confirm) { setFieldError(signupConfirm, signupConfirmErr, 'Passwords do not match'); valid = false; }
    else clearFieldError(signupConfirm, signupConfirmErr);

    if (!valid) return;

    setLoading(signupSubmitBtn, signupBtnText, signupSpinner, true);

    try {
      const data = await window.api.post('/api/auth/signup', {
        name,
        email,
        password,
        confirmPassword: confirm,
      });
      window.toast.success(`Patient account created! Welcome, ${data.user.name}.`);
      setTimeout(() => { window.location.href = '/dashboard.html'; }, 500);
    } catch (err) {
      showAlert(alertBox, err.message, 'error');
      setLoading(signupSubmitBtn, signupBtnText, signupSpinner, false);
    }
  });
})();

