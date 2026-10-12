// 投稿窗口的驱动：开着同一个已登录窗口，按顺序执行 cmd/ 目录里的小脚本，结果写到 out/。
// 不开任何网络端口。放一个名为 STOP 的文件即关闭窗口退出；最长运行 100 分钟。
const fs = require('fs'), path = require('path');
const lib = require('./lib.cjs');
const CMD = path.join(__dirname, 'cmd'); fs.mkdirSync(CMD, { recursive: true });
const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
(async () => {
  for (const f of fs.readdirSync(CMD)) fs.unlinkSync(path.join(CMD, f));
  const ctx = await lib.open();
  const S = { ctx, page: ctx.pages()[0] || await ctx.newPage(), lib, fs, path, EP: lib.EP, OUT: lib.OUT, sleep: lib.sleep, vars: {} };
  console.log('ready', new Date().toISOString());
  const until = Date.now() + 100 * 60 * 1000;
  while (Date.now() < until && !fs.existsSync(path.join(CMD, 'STOP'))) {
    for (const f of fs.readdirSync(CMD).filter(f => f.endsWith('.js')).sort()) {
      const full = path.join(CMD, f); const code = fs.readFileSync(full, 'utf8'); fs.unlinkSync(full);
      let res;
      try { res = { ok: true, value: await new AsyncFunction('S', code)(S) }; }
      catch (e) { res = { ok: false, error: String((e && e.stack) || e).slice(0, 3000) }; }
      fs.writeFileSync(path.join(lib.OUT, f.replace(/\.js$/, '.json')), JSON.stringify(res, null, 1), 'utf8');
      console.log(f, res.ok ? 'ok' : 'ERR');
    }
    await lib.sleep(250);
  }
  await ctx.close().catch(() => { });
  console.log('closed');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
