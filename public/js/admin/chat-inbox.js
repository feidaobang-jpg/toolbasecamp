/**
 * Admin support chat inbox (WebSocket + poll fallback).
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
    return apiBase().replace(/^http/, 'ws') + '/chat/ws?token=' + encodeURIComponent(token());
  }

  function authHeaders() {
    return {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token()
    };
  }

  var meId = 0;
  var activeThreadId = 0;
  var activeOwnerId = 0;
  var seen = {};
  var ws = null;
  var pollTimer = null;

  var bootEl = document.getElementById('boot-loading');
  var gateEl = document.getElementById('gate');
  var appEl = document.getElementById('app');
  var listEl = document.getElementById('thread-list');
  var logEl = document.getElementById('chat-log');
  var titleEl = document.getElementById('thread-title');
  var statusEl = document.getElementById('chat-status');
  var unreadEl = document.getElementById('inbox-unread');
  var composer = document.getElementById('composer');
  var inputEl = document.getElementById('chat-input');
  var sendBtn = document.getElementById('chat-send');

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text || '';
  }

  function showGate() {
    if (bootEl) bootEl.classList.add('hidden');
    if (gateEl) gateEl.classList.remove('hidden');
    if (appEl) appEl.classList.add('hidden');
  }

  function showApp() {
    if (bootEl) bootEl.classList.add('hidden');
    if (gateEl) gateEl.classList.add('hidden');
    if (appEl) appEl.classList.remove('hidden');
  }

  function appendMsg(m, scroll) {
    if (!m || !m.id || seen[m.id]) return;
    if (activeThreadId && Number(m.threadId) !== Number(activeThreadId)) return;
    seen[m.id] = true;
    var mine = Number(m.senderId) === Number(meId);
    var row = document.createElement('div');
    row.className = 'chat-row ' + (mine ? 'chat-row--mine' : 'chat-row--theirs');
    var bubble = document.createElement('div');
    bubble.className = mine ? 'chat-bubble-me' : 'chat-bubble-them';
    bubble.textContent = m.body || '';
    row.appendChild(bubble);
    logEl.appendChild(row);
    if (scroll !== false) logEl.scrollTop = logEl.scrollHeight;
  }

  function renderThreads(threads, unreadTotal) {
    if (unreadEl) {
      var n = Number(unreadTotal || 0);
      unreadEl.textContent = n > 0 ? tr('chat.unreadCount').replace('{n}', String(n)) : '';
    }
    if (!listEl) return;
    listEl.innerHTML = '';
    if (!threads || !threads.length) {
      listEl.innerHTML = '<p class="inbox-thread-empty">' + tr('chat.inboxEmpty') + '</p>';
      return;
    }
    threads.forEach(function (th) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'inbox-thread-btn' + (Number(th.threadId) === Number(activeThreadId) ? ' thread-active' : '');
      var unread = Number(th.unread || 0);
      btn.innerHTML =
        '<div class="inbox-thread-top">' +
          '<span class="inbox-thread-account">' + String(th.account || '') + '</span>' +
          (unread > 0
            ? '<span class="inbox-thread-badge">' + unread + '</span>'
            : '') +
        '</div>' +
        (th.loginAccount && th.nickname
          ? '<div class="inbox-thread-sub">' + String(th.loginAccount) + '</div>'
          : '') +
        '<div class="inbox-thread-preview">' +
          String(th.lastPreview || tr('chat.noPreview')) +
        '</div>';
      btn.addEventListener('click', function () {
        openThread(th);
      });
      listEl.appendChild(btn);
    });
  }

  function loadThreads() {
    return fetch(apiBase() + '/chat/admin/threads?page=1&page_size=50', {
      headers: authHeaders(),
      cache: 'no-store'
    })
      .then(function (r) {
        if (!r.ok) throw new Error('threads');
        return r.json();
      })
      .then(function (data) {
        renderThreads(data.threads || [], data.unreadTotal);
        if (typeof window.tbRefreshChatUnread === 'function') window.tbRefreshChatUnread();
        return data;
      });
  }

  function markRead(threadId) {
    return fetch(apiBase() + '/chat/admin/threads/' + threadId + '/read', {
      method: 'POST',
      headers: authHeaders(),
      body: '{}'
    }).then(function () {
      if (typeof window.tbRefreshChatUnread === 'function') window.tbRefreshChatUnread();
    }).catch(function () {});
  }

  function openThread(th) {
    activeThreadId = Number(th.threadId);
    activeOwnerId = Number(th.userId || 0);
    seen = {};
    logEl.innerHTML = '';
    titleEl.textContent = th.account || ('#' + activeThreadId);
    if (th.nickname && th.loginAccount) {
      titleEl.textContent = th.account + ' · ' + th.loginAccount;
    }
    composer.classList.remove('hidden');
    loadThreads();
    return fetch(apiBase() + '/chat/admin/threads/' + activeThreadId + '/messages?limit=50', {
      headers: authHeaders(),
      cache: 'no-store'
    })
      .then(function (r) {
        if (!r.ok) throw new Error('messages');
        return r.json();
      })
      .then(function (data) {
        (data.messages || []).forEach(function (m) {
          appendMsg(m, false);
        });
        logEl.scrollTop = logEl.scrollHeight;
        return markRead(activeThreadId).then(loadThreads);
      })
      .catch(function () {
        setStatus(tr('chat.loadFailed'));
      });
  }

  function send() {
    if (!activeThreadId) return;
    var body = (inputEl.value || '').trim();
    if (!body) return;
    sendBtn.disabled = true;
    fetch(apiBase() + '/chat/admin/threads/' + activeThreadId + '/messages', {
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
        loadThreads();
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
        var msg = data.message;
        if (activeThreadId && Number(msg.threadId) === Number(activeThreadId)) {
          appendMsg(msg, true);
          markRead(activeThreadId);
        }
        loadThreads();
      }
    };
  }

  function startPoll() {
    if (pollTimer) return;
    setStatus(tr('chat.polling'));
    pollTimer = setInterval(function () {
      loadThreads();
      if (!activeThreadId) return;
      fetch(apiBase() + '/chat/admin/threads/' + activeThreadId + '/messages?limit=20', {
        headers: authHeaders(),
        cache: 'no-store'
      })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (!data) return;
          (data.messages || []).forEach(function (m) { appendMsg(m, true); });
          markRead(activeThreadId);
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
        var label = document.getElementById('auth-label');
        if (label) label.textContent = user.display || user.phone || user.email || '';
        if (!isAdminUser(user)) {
          showGate();
          return;
        }
        showApp();
        return loadThreads().then(connectWs);
      })
      .catch(function () {
        showGate();
      });
  }

  var refreshBtn = document.getElementById('btn-refresh-threads');
  if (refreshBtn) refreshBtn.addEventListener('click', function () { loadThreads(); });
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
