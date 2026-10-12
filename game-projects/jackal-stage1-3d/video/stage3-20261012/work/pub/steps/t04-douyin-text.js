// 抖音：标题、简介（含试玩入口，因为成片结尾说「入口在简介里」）、话题（只保留面板里能选中的）
const { path, sleep } = S; const t = S.vars.dy; const out = { topics: [] };
const know = t.getByText('我知道了', { exact: true }).first(); if (await know.isVisible().catch(() => false)) { await know.click(); await sleep(500); }
const TITLE = '一辆吉普单挑一艘战舰！赤色要塞3D第三关上线';
const LINES = ['小时候的赤色要塞，做成了 3D 网页版。第三关港口上线：炸闸门、冲栈桥，最后单挑一艘战舰。原作一共六关，下一关你想先看哪个？',
  '试玩（复制到浏览器打开）：https://www.zhengxiaohui.cn/html/game/jackal-stage1-3d/index.html'];
const TOPICS = ['赤色要塞', '独立游戏', '游戏开发', '怀旧游戏', '小霸王'];
const ti = t.locator('input[placeholder*="填写作品标题"]').first();
await ti.click(); await ti.fill(TITLE); await sleep(400); out.title = await ti.inputValue();
const ed = t.locator('.zone-container[contenteditable=true], .editor-kit-container[contenteditable=true]').first();
await ed.click(); await t.keyboard.press('Control+A'); await t.keyboard.press('Backspace'); await sleep(300);
for (let i = 0; i < LINES.length; i++) { await t.keyboard.insertText(LINES[i]); await sleep(300); await t.keyboard.press('Enter'); await sleep(250); }
for (const name of TOPICS) {
  await t.keyboard.type('#', { delay: 50 }); await sleep(400); await t.keyboard.insertText(name); await sleep(2200);
  const sug = await t.evaluate(() => [...document.querySelectorAll('[class*=mention-suggest] [class*=tag-], [class*=mention-suggest] [class*=item], [class*=hash-tag] [class*=item], [class*=suggest] [class*=name]')].filter(e => e.offsetParent).map(e => e.innerText.trim().split('\n')[0]).slice(0, 8));
  const exact = t.locator('[class*=mention-suggest] *, [class*=suggest] *').filter({ hasText: new RegExp('^#?' + name + '$') }).filter({ visible: true }).first();
  if (await exact.count()) { await exact.click(); await sleep(700); out.topics.push(name + ':picked'); }
  else { for (let k = 0; k < name.length + 1; k++) await t.keyboard.press('Backspace'); await sleep(300); out.topics.push(name + ':no-match ' + JSON.stringify(sug.slice(0, 4))); }
}
await sleep(600);
out.desc = await ed.innerText();
out.count = await t.evaluate(() => (document.body.innerText.match(/\d+\s*\/\s*1000/) || [''])[0]);
out.topicNodes = await ed.evaluate(e => [...e.querySelectorAll('[class*=mention], [data-mention], span[class*=tag], a')].map(x => x.innerText.trim()).filter(Boolean).slice(0, 10));
await t.screenshot({ path: path.join(S.OUT, 't04.png') });
return out;
