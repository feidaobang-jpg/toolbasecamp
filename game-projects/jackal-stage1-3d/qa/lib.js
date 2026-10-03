const { chromium } = require('playwright');
const BASE = process.env.JK_BASE || 'http://127.0.0.1:8766/html/game/jackal-stage1-3d/index.html';
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail === undefined ? null : detail });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : ''));
}
async function snap(page) { return page.evaluate(() => __JK_TEST__.snapshot()); }
async function waitFor(page, fn, timeout = 8000, step = 60) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { const s = await snap(page); if (fn(s)) return s; await page.waitForTimeout(step); }
  return null;
}
// 本机：JK_CHANNEL=msedge 用系统 Edge（免下载 Chromium），JK_GPU=1 改用真显卡而不是 SwiftShader
const GL_ARGS = process.env.JK_GPU ? ['--autoplay-policy=no-user-gesture-required'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'];
async function launch(opts = {}) { return chromium.launch({ args: GL_ARGS, ...(process.env.JK_CHANNEL ? { channel: process.env.JK_CHANNEL } : {}), ...opts }); }
module.exports = { BASE, results, check, snap, waitFor, launch, GL_ARGS };
