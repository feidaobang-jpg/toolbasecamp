// B 站：只读，当前表单状态 + 截图
const { page, path, sleep } = S;
await sleep(500);
const st = await page.evaluate(() => {
  const vis = e => !!e.offsetParent;
  return {
    title: (document.querySelector('input[placeholder="请输入稿件标题"]') || {}).value,
    statement: (document.querySelector('input[placeholder="请选择符合您视频内容的创作声明"]') || {}).value,
    tags: [...document.querySelectorAll('.label-item-v2-container')].filter(vis).map(e => e.innerText.trim()),
    tagArea: (document.querySelector('.tag-container, [class*=tag-wrp], .video-tag') || { innerText: '' }).innerText.slice(0, 300).replace(/\n+/g, ' | '),
    topic: [...document.querySelectorAll('[class*=topic]')].filter(vis).map(e => (e.className.toString().slice(0, 50) + ' => ' + e.innerText.trim().slice(0, 80)).replace(/\n+/g, ' | ')).slice(0, 12),
    desc: [...document.querySelectorAll('.ql-editor')].map(e => e.innerText.slice(0, 200)),
    type: (document.querySelector('.video-human-type, [class*=type-select], .select-controller') || { innerText: '' }).innerText.slice(0, 80),
    dialogs: [...document.querySelectorAll('[class*=dialog], [class*=modal]')].filter(vis).map(e => e.className.toString().slice(0, 60) + ' => ' + e.innerText.trim().slice(0, 100).replace(/\n+/g, ' | ')).slice(0, 6),
  };
});
await page.screenshot({ path: path.join(S.OUT, 'b05.png'), fullPage: true }).catch(() => page.screenshot({ path: path.join(S.OUT, 'b05.png') }));
return st;
