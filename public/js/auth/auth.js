document.addEventListener('DOMContentLoaded', () => {
  const AUTH_BASE_URL = (typeof siteConfig !== 'undefined' && siteConfig.apiBase)
    ? siteConfig.apiBase
    : ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'http://127.0.0.1:8001'
      : `${window.location.origin}/api`);

  const tokenKey = 'auth_token';

  function tr(key, params) {
    return typeof t === 'function' ? t(key, params) : key;
  }

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
      btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>' + tr('auth.processing');
      btn.classList.add('opacity-75', 'cursor-not-allowed');
    } else {
      btn.disabled = false;
      btn.textContent = btn.dataset.originalText || defaultText || tr('auth.loginBtn');
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
    if (!msg) return tr('auth.unknownError');
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) return tr('auth.networkError');
    if (msg.includes('Backend service unavailable')) return tr('auth.serviceUnavailable');
    return msg;
  }

  function apiErrorDetail(data) {
    if (!data || data.detail == null) return '';
    if (typeof data.detail === 'string') return data.detail;
    if (Array.isArray(data.detail)) {
      return data.detail.map(function (d) { return d.msg || d.message || String(d); }).join('; ');
    }
    return String(data.detail);
  }

  function getSafeNextUrl() {
    const params = new URLSearchParams(window.location.search);
    const next = (params.get('next') || '').trim();
    if (!next) return '';
    if (next.startsWith('http://') || next.startsWith('https://') || next.startsWith('//')) return '';
    if (next.startsWith('/')) return next;
    return '';
  }

  function redirectAfterAuth() {
    const next = getSafeNextUrl();
    if (next) {
      window.location.href = next;
      return;
    }
    window.location.href = 'profile.html';
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
    if (!res.ok) throw new Error(apiErrorDetail(data) || `HTTP ${res.status}`);
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
      if (!email) { setStatus(tr('auth.enterEmail'), true); return; }
      if (!password) { setStatus(tr('auth.enterPassword'), true); return; }

      setLoading(registerBtn, true);
      try {
        const data = await postJson('/auth/register', { email, password });
        if (data.token) setToken(data.token);
        setStatus(tr('auth.accountCreated'));
        setTimeout(() => { redirectAfterAuth(); }, 1000);
      } catch (e) {
        setStatus(translateError(e.message || String(e)), true);
        setLoading(registerBtn, false, tr('auth.registerBtn'));
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
      if (!email) { setStatus(tr('auth.enterEmail'), true); return; }
      if (!password) { setStatus(tr('auth.enterPassword'), true); return; }

      setLoading(loginBtn, true);
      try {
        const data = await postJson('/auth/login', { email, password });
        if (data.token) setToken(data.token);
        setStatus(tr('auth.loggedIn'));
        setTimeout(() => { redirectAfterAuth(); }, 1000);
      } catch (e) {
        setStatus(translateError(e.message || String(e)), true);
        setLoading(loginBtn, false, tr('auth.loginBtn'));
      }
    };
    loginBtn.addEventListener('click', handleLogin);
    emailInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleLogin(); });
    passwordInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleLogin(); });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      clearToken();
      setStatus(tr('auth.loggedOut'));
      setTimeout(() => { window.location.href = 'login.html'; }, 1000);
    });
  }
});
