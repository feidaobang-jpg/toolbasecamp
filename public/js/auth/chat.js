/**
 * User ↔ admin private support chat (WebSocket + poll fallback).
 */
(function () {
  function tr(key) {
    if (typeof t === 'function') return t(key);
    return key;
  }

  function apiBase() {
    if (typeof siteConfig !== 'undefined' && siteConfig.apiBase) return siteConfig.apiBase;
    var host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'http://127.0.0.1:8001';
    return window.location.origin + '/api';
  }

  function token() {
    return localStorage.getItem('auth_token') || '';
  }

  function isAdminUser(user) {
    if (typeof window.tbIsAdminUser === 'function') return window.tbIsAdminUser(user);
    if (!user) return false;
    if (user.role === 'admin') return true;
    var adminEmail = (window.siteConfig && siteConfig.adminEmail) || '';
    var adminPhone = (window.siteConfig && siteConfig.adminPhone) || '';
    if (adminEmail && (user.email || '').toLowerCase() === adminEmail.toLowerCase()) return true;
    if (adminPhone && String(user.phone || '').trim() === String(adminPhone).trim()) return true;
    return false;
  }

  function wsUrl() {
    var base = apiBase();
    var u = base.replace(/^http/, 'ws') + '/chat/ws?token=' + encodeURIComponent(token());
    return u;
  }

  var meId = 0;
  var threadId = 0;
  var seen = {};
  var ws = null;
  var pollTimer = null;
  var statusEl = document.getElementById('chat-status');
  var logEl = document.getElementById('chat-log');
  var inputEl = document.getElementById('chat-input');
  var sendBtn = document.getElementById('chat-send');

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text || '';
  }

  function authHeaders() {
    return {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token()
    };
  }

  function appendMsg(m, scroll) {
    if (!m || !m.id || seen[m.id]) return;
    seen[m.id] = true;
    var mine = Number(m.senderId) === Number(meId);
    var row = document.createElement('div');
    row.className = 'chat-row ' + (mine ? 'chat-row--mine' : 'chat-row--theirs');
    var bubble = document.createElement('div');
    bubble.className =
      'max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ' +
      (mine ? 'chat-bubble-me' : 'chat-bubble-them');
    bubble.textContent = m.body || '';
    row.appendChild(bubble);
    logEl.appendChild(row);
    if (scroll !== false) logEl.scrollTop = logEl.scrollHeight;
  }

  function loadMessages() {
    return fetch(apiBase() + '/chat/messages?limit=50', {
      headers: authHeaders(),
      cache: 'no-store'
    })
      .then(function (r) {
        if (!r.ok) throw new Error('load');
        return r.json();
      })
      .then(function (data) {
        threadId = data.threadId || threadId;
        (data.messages || []).forEach(function (m) {
          appendMsg(m, false);
        });
        logEl.scrollTop = logEl.scrollHeight;
        return markRead();
      });
  }

  function markRead() {
    return fetch(apiBase() + '/chat/read', {
      method: 'POST',
      headers: authHeaders(),
      body: '{}'
    }).then(function () {
      if (typeof window.tbRefreshChatUnread === 'function') window.tbRefreshChatUnread();
    }).catch(function () {});
  }

  function send() {
    var body = (inputEl.value || '').trim();
    if (!body) return;
    sendBtn.disabled = true;
    fetch(apiBase() + '/chat/messages', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ body: body })
    })
      .then(function (r) {
        return r.json().then(function (data) {
          if (!r.ok) throw new Error(data.detail || 'send failed');
          return data;
        });
      })
      .then(function (data) {
        inputEl.value = '';
        if (data.message) appendMsg(data.message, true);
      })
      .catch(function (err) {
        if (typeof tbNotify === 'function') tbNotify(String(err.message || err));
        else alert(String(err.message || err));
      })
      .finally(function () {
        sendBtn.disabled = false;
      });
  }

  function connectWs() {
    if (!window.WebSocket) {
      startPoll();
      return;
    }
    try {
      ws = new WebSocket(wsUrl());
    } catch (e) {
      startPoll();
      return;
    }
    ws.onopen = function () {
      setStatus(tr('chat.online'));
      stopPoll();
    };
    ws.onclose = function () {
      setStatus(tr('chat.reconnecting'));
      startPoll();
      setTimeout(connectWs, 4000);
    };
    ws.onerror = function () {
      try { ws.close(); } catch (e) {}
    };
    ws.onmessage = function (ev) {
      var data;
      try { data = JSON.parse(ev.data); } catch (e) { return; }
      if (data.type === 'message' && data.message) {
        appendMsg(data.message, true);
        markRead();
      }
    };
  }

  function startPoll() {
    if (pollTimer) return;
    setStatus(tr('chat.polling'));
    pollTimer = setInterval(function () {
      fetch(apiBase() + '/chat/messages?limit=20', {
        headers: authHeaders(),
        cache: 'no-store'
      })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (!data) return;
          (data.messages || []).forEach(function (m) { appendMsg(m, true); });
          markRead();
        })
        .catch(function () {});
    }, 5000);
  }

  function stopPoll() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function showGate() {
    document.getElementById('chat-gate').classList.remove('hidden');
    document.getElementById('chat-app').classList.add('hidden');
    var next = encodeURIComponent(window.location.pathname || '/html/auth/chat.html');
    document.getElementById('chat-login').href = 'login.html?next=' + next;
  }

  function showApp() {
    document.getElementById('chat-gate').classList.add('hidden');
    document.getElementById('chat-app').classList.remove('hidden');
  }

  function boot() {
    var tok = token();
    if (!tok) {
      showGate();
      return;
    }
    fetch(apiBase() + '/auth/me', {
      headers: { Authorization: 'Bearer ' + tok, Accept: 'application/json' },
      cache: 'no-store'
    })
      .then(function (r) {
        if (r.status === 401) throw new Error('auth');
        return r.json();
      })
      .then(function (data) {
        var user = data.user || data;
        meId = Number(user.id || 0);
        if (isAdminUser(user)) {
          window.location.replace('../admin/private/chat-inbox.html');
          return;
        }
        showApp();
        return loadMessages().then(connectWs);
      })
      .catch(function () {
        showGate();
      });
  }

  if (sendBtn) sendBtn.addEventListener('click', send);
  if (inputEl) {
    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
