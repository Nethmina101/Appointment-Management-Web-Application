/* login.js — handles login page logic */
'use strict';

(async function () {
  // Already logged in → redirect to dashboard
  const user = await window.auth.init();
  if (user) {
    window.location.href = '/dashboard.html';
    return;
  }

  const form      = document.getElementById('login-form');
  const alertBox  = document.getElementById('alert-box');
  const submitBtn = document.getElementById('submit-btn');
  const btnText   = document.getElementById('btn-text');
  const spinner   = document.getElementById('btn-spinner');
  const emailInput = document.getElementById('email');
  const emailErr   = document.getElementById('email-error');
  const passInput  = document.getElementById('password');
  const passErr    = document.getElementById('password-error');

  // Inline validation on blur
  emailInput.addEventListener('blur', () => {
    if (!emailInput.value.trim()) {
      setFieldError(emailInput, emailErr, 'Email is required');
    } else if (!/\S+@\S+\.\S+/.test(emailInput.value)) {
      setFieldError(emailInput, emailErr, 'Enter a valid email');
    } else {
      clearFieldError(emailInput, emailErr);
    }
  });

  passInput.addEventListener('blur', () => {
    if (!passInput.value) {
      setFieldError(passInput, passErr, 'Password is required');
    } else {
      clearFieldError(passInput, passErr);
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert(alertBox);

    let valid = true;
    const email    = emailInput.value.trim();
    const password = passInput.value;

    if (!email) { setFieldError(emailInput, emailErr, 'Email is required'); valid = false; }
    else if (!/\S+@\S+\.\S+/.test(email)) { setFieldError(emailInput, emailErr, 'Enter a valid email'); valid = false; }
    else clearFieldError(emailInput, emailErr);

    if (!password) { setFieldError(passInput, passErr, 'Password is required'); valid = false; }
    else clearFieldError(passInput, passErr);

    if (!valid) return;

    setLoading(submitBtn, btnText, spinner, true);

    try {
      const data = await window.api.post('/api/auth/login', { email, password });
      window.toast.success(`Welcome back, ${data.user.name}!`);
      setTimeout(() => { window.location.href = '/dashboard.html'; }, 500);
    } catch (err) {
      showAlert(alertBox, err.message, 'error');
      setLoading(submitBtn, btnText, spinner, false);
    }
  });
})();
