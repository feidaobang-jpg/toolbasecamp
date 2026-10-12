// 抖音：打开旧视频 7694182043927760191 的编辑页（先看「编辑作品」跳到什么地址，再换成目标 ID），只读取现有说明
const { path, sleep, lib } = S; const t = S.vars.dy; const out = {};
const ID = '7694182043927760191';
await t.goto('https://creator.douyin.com/creator-micro/content/manage', { waitUntil: 'domcontentloaded' }); await sleep(7000);
const edit = t.getByText('编辑作品', { exact: true }).nth(1);   // 第 2 条（已发布的那条），第 1 条是审核中的新片
out.editCount = await t.getByText('编辑作品', { exact: true }).count();
await edit.click(); await sleep(6000);
out.sampleUrl = t.url();
const m = out.sampleUrl.match(/(\d{19})/);
if (!m) return out;
const url = out.sampleUrl.replace(m[1], ID);
await t.goto(url, { waitUntil: 'domcontentloaded' }); await sleep(8000);
out.url = t.url();
out.title = await t.locator('input[placeholder*="填写作品标题"]').first().inputValue().catch(() => null);
out.desc = await t.locator('.zone-container[contenteditable=true]').first().innerText().catch(() => null);
out.buttons = await t.evaluate(() => [...document.querySelectorAll('button')].filter(e => e.offsetParent && e.innerText.trim()).map(e => e.innerText.trim()).slice(-6));
lib.save('douyin-old-before.json', out);
await t.screenshot({ path: path.join(S.OUT, 't20.png') });
return out;
