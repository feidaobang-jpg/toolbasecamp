/**
 * News portal → main site stats (toolbasecamp.com/api).
 * Page hit + lightweight feature event. Volume is tiny.
 */
(function () {
  'use strict';
  var API = 'https://toolbasecamp.com/api';
  var EXCLUDE_KEY = 'tb-stats-exclude';
  var TOKEN_KEY = 'auth_token';
  var VID_KEY = 'tb-visitor-id';

  function excluded() {
    try {
      return localStorage.getItem(EXCLUDE_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function visitorId() {
    try {
      var id = localStorage.getItem(VID_KEY);
      if (id && /^[0-9a-f-]{36}$/i.test(id)) return id.toLowerCase();
      id = uuid();
      localStorage.setItem(VID_KEY, id);
      return id;
    } catch (e) {
      return uuid();
    }
  }

  function headers() {
    var h = { 'Content-Type': 'application/json', Accept: 'application/json' };
    try {
      var t = localStorage.getItem(TOKEN_KEY) || '';
      if (t) h.Authorization = 'Bearer ' + t;
    } catch (e) { /* ignore */ }
    return h;
  }

  function post(path, body) {
    try {
      fetch(API + path, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(body || {}),
        credentials: 'omit',
        cache: 'no-store',
        keepalive: true,
        mode: 'cors'
      }).catch(function () { /* ignore */ });
    } catch (e) { /* ignore */ }
  }

  if (excluded()) return;

  post('/stats/hit', { visitor_id: visitorId() });

  var eventName = 'portal.news';
  try {
    var path = (location.pathname || '/').replace(/\/+/g, '/');
    if (path.indexOf('/articles/') >= 0) eventName = 'portal.news.article';
    else if (/\/page\/\d+\.html$/.test(path)) eventName = 'portal.news.list';
  } catch (e) { /* ignore */ }
  post('/stats/event', { name: eventName });
})();
