// 投稿用的独立 Edge 窗口：Playwright 持久配置（已扫码登录的那份），脚本短时间运行，跑完即关。
// 不在这里保存或输出任何 Cookie / 令牌；csrf 只在页面内部取用。
const path = require('path'), fs = require('fs');
const { chromium } = require('../../../../node_modules/playwright');
const PROFILE = 'C:/Users/37818/AppData/Local/bili-publish-edge-profile';
const EP = path.resolve(__dirname, '..', '..');            // 本期目录
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });

async function open(opts = {}) {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    channel: 'msedge', headless: false, viewport: { width: 1440, height: 900 },
    args: ['--disable-blink-features=AutomationControlled', '--window-position=40,40', '--no-first-run', '--no-default-browser-check'], ...opts,
  });
  ctx.setDefaultTimeout(30000);
  return ctx;
}
const save = (name, data) => fs.writeFileSync(path.join(OUT, name), typeof data === 'string' ? data : JSON.stringify(data, null, 2), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
// 在已登录的 B 站页面里发请求（带 Cookie），只把响应 JSON 带回来
async function biliGet(page, url) { return page.evaluate(async u => (await fetch(u, { credentials: 'include' })).json(), url); }
async function biliPost(page, url, fields) {
  return page.evaluate(async ([u, f]) => {
    const csrf = (document.cookie.match(/bili_jct=([^;]+)/) || [])[1];
    const body = new URLSearchParams({ ...f, csrf }).toString();
    return (await fetch(u, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })).json();
  }, [url, fields]);
}
module.exports = { open, save, sleep, biliGet, biliPost, EP, OUT, PROFILE };
