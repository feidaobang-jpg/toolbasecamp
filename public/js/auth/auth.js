document.addEventListener('DOMContentLoaded', () => {
  const AUTH_BASE_URL = (typeof siteConfig !== 'undefined' && siteConfig.apiBase)
    ? siteConfig.apiBase
    : ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'http://127.0.0.1:8001'
      : `${window.location.origin}/api`);

  const tokenKey = 'auth_token';

  function setStatus(text, isError = false) {
    const el = document.getElementById('status');
    if (!el) return;
    if (!text) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    const baseClasses = ['rounded-lg', 'p-3', 'text-sm', 'flex', 'items-start', 'gap-2', 'border'];
    const errorClasses = ['bg-red-50', 'text-red-600', 'border-red-100'];
    const successClasses = ['bg-green-50', 'text-green-600', 'border-green-100'];
    el.className = '';
    el.classList.add(...baseClasses, ...(isError ? errorClasses : successClasses));
    const icon = isError ? '<i class="fas fa-exclamation-circle mt-0.5"></i>' : '<i class="fas fa-check-circle mt-0.5"></i>';
    el.innerHTML = `${icon}<span>${text}</span>`;
  }

  function setLoading(btn, isLoading, defaultText) {
    if (!btn) return;
    if (isLoading) {
      btn.dataset.originalText = btn.textContent;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Processing...';
      btn.classList.add('opacity-75', 'cursor-not-allowed');
    } else {
      btn.disabled = false;
      btn.textContent = btn.dataset.originalText || defaultText || 'Submit';
      btn.classList.remove('opacity-75', 'cursor-not-allowed');
    }
  }

  function setToken(token) {
    localStorage.setItem(tokenKey, token);
  }

  function clearToken() {
    localStorage.removeItem(tokenKey);
  }

  function translateError(msg) {
    if (!msg) return 'Unknown error';
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) return 'Network error. Please check your connection.';
    if (msg.includes('Backend service unavailable')) return 'Service unavailable';
    return msg;
  }

  async function postJson(path, body) {
    const res = await fetch(`${AUTH_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (typeof check502Error !== 'undefined' && check502Error(res)) {
      throw new Error('Backend service unavailable');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
    return data;
  }

  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const registerBtn = document.getElementById('btn-register');
  const loginBtn = document.getElementById('btn-login');
  const logoutBtn = document.getElementById('btn-logout');

  if (registerBtn) {
    const handleRegister = async () => {
      setStatus('');
      const email = (emailInput?.value || '').trim();
      const password = passwordInput?.value || '';
      if (!email) { setStatus('Please enter your email', true); return; }
      if (!password) { setStatus('Please enter a password', true); return; }

      setLoading(registerBtn, true);
      try {
        const data = await postJson('/auth/register', { email, password });
        if (data.token) setToken(data.token);
        setStatus('Account created. Redirecting...');
        setTimeout(() => { window.location.href = 'profile.html'; }, 1000);
      } catch (e) {
        setStatus(translateError(e.message || String(e)), true);
        setLoading(registerBtn, false, 'Sign up');
      }
    };
    registerBtn.addEventListener('click', handleRegister);
    emailInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleRegister(); });
    passwordInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleRegister(); });
  }

  if (loginBtn) {
    const handleLogin = async () => {
      setStatus('');
      const email = (emailInput?.value || '').trim();
      const password = passwordInput?.value || '';
      if (!email) { setStatus('Please enter your email', true); return; }
      if (!password) { setStatus('Please enter your password', true); return; }

      setLoading(loginBtn, true);
      try {
        const data = await postJson('/auth/login', { email, password });
        if (data.token) setToken(data.token);
        setStatus('Logged in. Redirecting...');
        setTimeout(() => { window.location.href = 'profile.html'; }, 1000);
      } catch (e) {
        setStatus(translateError(e.message || String(e)), true);
        setLoading(loginBtn, false, 'Log in');
      }
    };
    loginBtn.addEventListener('click', handleLogin);
    emailInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleLogin(); });
    passwordInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleLogin(); });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      clearToken();
      setStatus('Logged out');
      setTimeout(() => { window.location.href = 'login.html'; }, 1000);
    });
  }
});
