(function () {
    'use strict';

    var TOKEN_KEY = 'auth_token';
    var PAGE_SIZE = 30;

    var listEl = document.getElementById('gb-list');
    var loadingEl = document.getElementById('gb-loading');
    var emptyEl = document.getElementById('gb-empty');
    var loadMoreWrap = document.getElementById('gb-load-more-wrap');
    var loadMoreBtn = document.getElementById('gb-load-more');
    var submitBtn = document.getElementById('gb-submit');
    var contentInput = document.getElementById('gb-content');
    var guestNameInput = document.getElementById('gb-guest-name');
    var guestFields = document.getElementById('gb-guest-fields');
    var loginHint = document.getElementById('gb-login-hint');
    var loginNameEl = document.getElementById('gb-login-name');
    var statusEl = document.getElementById('gb-status');
    var charCountEl = document.getElementById('gb-char-count');

    var oldestId = 0;
    var hasMore = false;
    var loading = false;
    var submitting = false;
    var deleting = false;
    var loggedInUser = null;
    var isAdmin = false;

    function getAuthBaseUrl() {
        if (typeof siteConfig !== 'undefined' && siteConfig.apiBase) return siteConfig.apiBase;
        var isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        return isLocal ? 'http://127.0.0.1:8001' : window.location.origin + '/api';
    }

    function getToken() {
        return localStorage.getItem(TOKEN_KEY) || '';
    }

    function maskEmail(email) {
        if (!email || email.indexOf('@') === -1) return email || 'User';
        var parts = email.split('@');
        var local = parts[0];
        var domain = parts[1];
        if (local.length <= 2) return local[0] + '***@' + domain;
        return local.slice(0, 2) + '***@' + domain;
    }

    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }

    function formatTime(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        return d.toISOString().slice(0, 16).replace('T', ' ');
    }

    function checkIsAdmin(user) {
        if (!user) return false;
        var adminEmail = (typeof siteConfig !== 'undefined' && siteConfig.adminEmail) || 'admin@toolbasecamp.com';
        return user.role === 'admin' || (user.email || '').toLowerCase() === adminEmail.toLowerCase();
    }

    function setStatus(text, isError) {
        if (!statusEl) return;
        if (!text) {
            statusEl.className = 'hidden mb-4 rounded-lg px-4 py-3 text-sm';
            statusEl.textContent = '';
            return;
        }
        statusEl.className = 'mb-4 rounded-lg px-4 py-3 text-sm ' + (isError ? 'is-error' : 'is-success');
        statusEl.textContent = text;
    }

    function authFetch(path, options) {
        options = options || {};
        var headers = options.headers || {};
        var token = getToken();
        if (token) headers.Authorization = 'Bearer ' + token;
        options.headers = headers;
        return fetch(getAuthBaseUrl() + path, options).then(function (res) {
            if (typeof window.check502Error === 'function' && window.check502Error(res)) {
                throw new Error('Backend service unavailable');
            }
            return res;
        });
    }

    function renderDeleteButton() {
        if (!isAdmin) return '';
        return '<button type="button" class="gb-delete-btn" title="Delete message" aria-label="Delete message">' +
            '<i class="fas fa-trash-alt"></i></button>';
    }

    function renderMessage(msg) {
        var item = document.createElement('article');
        item.className = 'gb-item';
        item.dataset.id = String(msg.id);

        var badgeClass = msg.is_guest ? '' : ' is-user';
        var badgeText = msg.is_guest ? 'Guest' : 'Signed in';

        item.innerHTML =
            '<div class="gb-item-header">' +
                '<div class="gb-item-name">' +
                    escapeHtml(msg.sender_name) +
                    '<span class="gb-badge' + badgeClass + '">' + badgeText + '</span>' +
                '</div>' +
                '<div class="gb-item-actions">' +
                    '<time class="gb-item-time">' + escapeHtml(formatTime(msg.created_at)) + '</time>' +
                    renderDeleteButton() +
                '</div>' +
            '</div>' +
            '<div class="gb-item-content">' + escapeHtml(msg.content) + '</div>';

        return item;
    }

    function refreshDeleteButtons() {
        if (!listEl) return;
        listEl.querySelectorAll('.gb-item').forEach(function (item) {
            var actions = item.querySelector('.gb-item-actions');
            if (!actions) return;
            var existing = actions.querySelector('.gb-delete-btn');
            if (isAdmin && !existing) {
                actions.insertAdjacentHTML('beforeend', renderDeleteButton());
            } else if (!isAdmin && existing) {
                existing.remove();
            }
        });
    }

    function hideLoading() {
        if (loadingEl && loadingEl.parentNode) {
            loadingEl.parentNode.removeChild(loadingEl);
            loadingEl = null;
        }
    }

    function updateEmptyState() {
        var hasItems = listEl && listEl.querySelector('.gb-item');
        if (emptyEl) emptyEl.classList.toggle('hidden', !!hasItems);
    }

    function loadMessages(append) {
        if (loading) return;
        loading = true;
        if (loadMoreBtn) loadMoreBtn.disabled = true;

        var query = 'limit=' + PAGE_SIZE;
        if (append && oldestId > 0) query += '&before_id=' + oldestId;

        authFetch('/guestbook/messages?' + query)
            .then(function (res) {
                return res.json().then(function (data) {
                    if (!res.ok) throw new Error(data.detail || ('HTTP ' + res.status));
                    return data;
                });
            })
            .then(function (data) {
                hideLoading();
                var messages = data.messages || [];
                hasMore = !!data.has_more;

                if (!append && listEl) {
                    listEl.querySelectorAll('.gb-item').forEach(function (el) { el.remove(); });
                    oldestId = 0;
                }

                messages.forEach(function (msg) {
                    if (listEl) listEl.appendChild(renderMessage(msg));
                    if (!oldestId || msg.id < oldestId) oldestId = msg.id;
                });

                if (loadMoreWrap) loadMoreWrap.classList.toggle('hidden', !hasMore);
                updateEmptyState();
            })
            .catch(function (err) {
                hideLoading();
                if (!append) setStatus((err && err.message) || 'Failed to load messages. Please try again.', true);
            })
            .finally(function () {
                loading = false;
                if (loadMoreBtn) loadMoreBtn.disabled = false;
            });
    }

    function deleteMessage(messageId, itemEl) {
        if (deleting || !isAdmin || !messageId) return;
        if (!window.confirm('Delete this message?')) return;

        deleting = true;
        var btn = itemEl && itemEl.querySelector('.gb-delete-btn');
        if (btn) btn.disabled = true;

        authFetch('/guestbook/messages/' + messageId, { method: 'DELETE' })
            .then(function (res) {
                return res.json().then(function (data) {
                    if (!res.ok) throw new Error(data.detail || 'HTTP ' + res.status);
                    return data;
                });
            })
            .then(function () {
                if (itemEl && itemEl.parentNode) itemEl.parentNode.removeChild(itemEl);
                updateEmptyState();
                setStatus('Message deleted', false);
            })
            .catch(function (err) {
                setStatus((err && err.message) || 'Delete failed', true);
                if (btn) btn.disabled = false;
            })
            .finally(function () { deleting = false; });
    }

    function submitMessage() {
        if (submitting) return;
        var content = (contentInput && contentInput.value || '').trim();
        if (!content) {
            setStatus('Please enter a message', true);
            return;
        }

        submitting = true;
        if (submitBtn) submitBtn.disabled = true;
        setStatus('');

        var body = { content: content };
        if (!loggedInUser && guestNameInput) {
            body.guest_name = (guestNameInput.value || '').trim() || 'Guest';
        }

        authFetch('/guestbook/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
            .then(function (res) {
                return res.json().then(function (data) {
                    if (!res.ok) throw new Error(data.detail || 'HTTP ' + res.status);
                    return data;
                });
            })
            .then(function (data) {
                setStatus('Message posted', false);
                if (contentInput) contentInput.value = '';
                if (charCountEl) charCountEl.textContent = '0';
                if (data.message && listEl) {
                    hideLoading();
                    if (emptyEl) emptyEl.classList.add('hidden');
                    listEl.insertBefore(renderMessage(data.message), listEl.firstChild);
                }
            })
            .catch(function (err) {
                setStatus((err && err.message) || 'Failed to post message', true);
            })
            .finally(function () {
                submitting = false;
                if (submitBtn) submitBtn.disabled = false;
            });
    }

    function initAuthState() {
        var token = getToken();
        if (!token) {
            if (guestFields) guestFields.classList.remove('hidden');
            if (loginHint) loginHint.classList.add('hidden');
            return Promise.resolve();
        }

        return authFetch('/auth/me')
            .then(function (res) {
                return res.json().then(function (data) {
                    if (!res.ok) throw new Error(data.detail || 'HTTP ' + res.status);
                    return data;
                });
            })
            .then(function (data) {
                loggedInUser = data.user || null;
                isAdmin = checkIsAdmin(loggedInUser);
                var email = loggedInUser && loggedInUser.email;
                if (email) {
                    if (guestFields) guestFields.classList.add('hidden');
                    if (loginHint) loginHint.classList.remove('hidden');
                    if (loginNameEl) loginNameEl.textContent = maskEmail(email);
                }
                refreshDeleteButtons();
            })
            .catch(function () {
                loggedInUser = null;
                isAdmin = false;
                if (guestFields) guestFields.classList.remove('hidden');
                if (loginHint) loginHint.classList.add('hidden');
            });
    }

    function bindEvents() {
        if (contentInput && charCountEl) {
            contentInput.addEventListener('input', function () {
                charCountEl.textContent = String(contentInput.value.length);
            });
        }
        if (submitBtn) submitBtn.addEventListener('click', submitMessage);
        if (loadMoreBtn) loadMoreBtn.addEventListener('click', function () { loadMessages(true); });
        if (listEl) {
            listEl.addEventListener('click', function (e) {
                var btn = e.target.closest('.gb-delete-btn');
                if (!btn || !isAdmin) return;
                var item = btn.closest('.gb-item');
                if (!item) return;
                deleteMessage(item.dataset.id, item);
            });
        }
        if (contentInput) {
            contentInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    submitMessage();
                }
            });
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        bindEvents();
        initAuthState().finally(function () { loadMessages(false); });
    });
})();
