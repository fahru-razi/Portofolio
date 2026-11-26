import { api } from './api_client.js';
import { $, setBusy } from './ui_kit.js';

const form = $('#loginForm');
const errorBox = $('#loginError');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.hidden = true;
  const { email, password } = Object.fromEntries(new FormData(form));
  if (!email || !password) {
    errorBox.textContent = 'Isi email dan kata sandi.';
    errorBox.hidden = false;
    return;
  }
  const button = $('#loginBtn');
  setBusy(button, true, 'Memeriksa...');
  try {
    await api.post('/api/auth/login', { email, password });
    location.assign('/');
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.hidden = false;
    setBusy(button, false);
  }
});
