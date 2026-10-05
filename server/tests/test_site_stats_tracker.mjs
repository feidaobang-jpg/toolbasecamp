import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const source = fs.readFileSync(new URL('../../public/js/i18n.js', import.meta.url), 'utf8');

function boot({ header = '', path = '/games.html', excluded = false, blockedStorage = false } = {}) {
    const requests = [], nodes = new Map(), values = new Map();
    let ids = 0;
    const element = () => ({ setAttribute() {}, querySelector: () => null,
        appendChild(node) { nodes.set(node.id, node); },
        insertBefore(node) { nodes.set(node.id, node); }, querySelectorAll: () => [] });
    const row = element();
    const location = { hostname: 'test.local', origin: 'https://test.local', pathname: path };
    const window = { location, crypto: { randomUUID: () => `11111111-1111-4111-8111-${String(++ids).padStart(12, '0')}` } };
    const document = {
        readyState: 'complete', documentElement: {}, querySelectorAll: () => [],
        getElementById: id => nodes.get(id) || null, createElement: element,
        querySelector: selectors => header && selectors.split(', ').includes(`header .${header}`) ? row : null
    };
    vm.runInNewContext(source, { window, document, location,
        localStorage: {
            getItem(key) { if (blockedStorage) throw new Error('blocked'); return key === 'tb-stats-exclude' && excluded ? '1' : values.get(key); },
            setItem(key, value) { if (blockedStorage) throw new Error('blocked'); values.set(key, value); }
        },
        fetch(url, options) { requests.push({ url, ...options }); return Promise.resolve({ ok: true, json: () => ({}) }); }
    });
    return { requests, nodes, window };
}

test('page hits work once with new, legacy, or absent header', () => {
    for (const header of ['site-header-inner', 'max-w-7xl', '']) {
        const result = boot({ header });
        assert.equal(result.requests.length, 1, header);
        assert.ok(result.requests[0].url.endsWith('/stats/hit'));
        assert.equal(result.requests[0].keepalive, true);
        assert.equal(result.nodes.has('tb-site-stats'), !!header);
    }
});

test('admin pages and excluded browsers do not submit page hits', () => {
    for (const options of [{ path: '/html/admin/site-stats.html' }, { path: '/html/admin/private/home-pc/index.html' }, { excluded: true }]) {
        const result = boot(options);
        assert.equal(result.requests.filter(r => r.url.endsWith('/stats/hit')).length, 0);
        if (options.excluded) assert.equal(result.requests[0].method, 'GET');
    }
});

test('blocked storage still shares one browser ID between page hits and clicks', () => {
    const result = boot({ blockedStorage: true });
    const visitor = JSON.parse(result.requests[0].body).visitor_id;
    assert.equal(result.window.tbGetVisitorId(), visitor);
    assert.equal(result.window.tbGetVisitorId(), visitor);
});
