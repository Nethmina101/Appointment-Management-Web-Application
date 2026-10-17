/* signup.js — handles signup page logic */
'use strict';

(async function () {
  // Already logged in → redirect
  const user = await window.auth.init();
  if (user) { window.location.href = '/dashboard.html'; return; }

  const form       = document.getElementById('signup-form');
  const alertBox   = document.getElementById('alert-box');
  const submitBtn  = document.getElementById('submit-btn');
  const btnText    = document.getElementById('btn-text');
  const spinner    = document.getElementById('btn-spinner');

  const fields = {
    name:    { input: document.getElementById('name'),            err: document.getElementById('name-error') },
    email:   { input: document.getElementById('email'),           err: document.getElementById('email-error') },
    pass:    { input: document.getElementById('password'),        err: document.getElementById('password-error') },
    confirm: { input: document.getElementById('confirmPassword'), err: document.getElementById('confirm-error') },
  };

  // Blur validators
  fields.name.input.addEventListener('blur', () => {
    const v = fields.name.input.value.trim();
    if (!v) setFieldError(fields.name.input, fields.name.err, 'Name is required');
    else if (v.length < 2) setFieldError(fields.name.input, fields.name.err, 'Name must be at least 2 characters');
    else clearFieldError(fields.name.input, fields.name.err);
  });

  fields.email.input.addEventListener('blur', () => {
    const v = fields.email.input.value.trim();
    if (!v) setFieldError(fields.email.input, fields.email.err, 'Email is required');
    else if (!/\S+@\S+\.\S+/.test(v)) setFieldError(fields.email.input, fields.email.err, 'Enter a valid email');
    else clearFieldError(fields.email.input, fields.email.err);
  });

  fields.pass.input.addEventListener('blur', () => {
    const v = fields.pass.input.value;
    if (!v) setFieldError(fields.pass.input, fields.pass.err, 'Password is required');
    else if (v.length < 8) setFieldError(fields.pass.input, fields.pass.err, 'Password must be at least 8 characters');
    else clearFieldError(fields.pass.input, fields.pass.err);
  });

  fields.confirm.input.addEventListener('blur', () => {
    const v = fields.confirm.input.value;
    if (!v) setFieldError(fields.confirm.input, fields.confirm.err, 'Please confirm your password');
    else if (v !== fields.pass.input.value) setFieldError(fields.confirm.input, fields.confirm.err, 'Passwords do not match');
    else clearFieldError(fields.confirm.input, fields.confirm.err);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert(alertBox);

    let valid = true;
    const name     = fields.name.input.value.trim();
    const email    = fields.email.input.value.trim();
    const password = fields.pass.input.value;
    const confirm  = fields.confirm.input.value;

    if (!name || name.length < 2) { setFieldError(fields.name.input, fields.name.err, 'Name must be at least 2 characters'); valid = false; }
    else clearFieldError(fields.name.input, fields.name.err);

    if (!email || !/\S+@\S+\.\S+/.test(email)) { setFieldError(fields.email.input, fields.email.err, 'Enter a valid email'); valid = false; }
    else clearFieldError(fields.email.input, fields.email.err);

    if (!password || password.length < 8) { setFieldError(fields.pass.input, fields.pass.err, 'Password must be at least 8 characters'); valid = false; }
    else clearFieldError(fields.pass.input, fields.pass.err);

    if (password !== confirm) { setFieldError(fields.confirm.input, fields.confirm.err, 'Passwords do not match'); valid = false; }
    else clearFieldError(fields.confirm.input, fields.confirm.err);

    if (!valid) return;

    setLoading(submitBtn, btnText, spinner, true);

    try {
      const data = await window.api.post('/api/auth/signup', { name, email, password, confirmPassword: confirm });
      window.toast.success(`Account created! Welcome, ${data.user.name}.`);
      setTimeout(() => { window.location.href = '/dashboard.html'; }, 600);
    } catch (err) {
      showAlert(alertBox, err.message, 'error');
      setLoading(submitBtn, btnText, spinner, false);
    }
  });
})();
