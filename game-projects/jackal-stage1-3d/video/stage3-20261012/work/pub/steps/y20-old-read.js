// YouTube：只读，旧视频 9MwVi2fVMPo 的标题与说明现状
const { path, sleep, lib } = S; const y = S.vars.yt; const out = {};
await y.goto('https://studio.youtube.com/video/9MwVi2fVMPo/edit', { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(8000);
out.title = (await y.locator('#title-textarea #textbox').first().innerText().catch(() => '')).trim();
out.desc = (await y.locator('#description-textarea #textbox').first().innerText().catch(() => '')).replace(/\n+$/, '');
lib.save('yt-old-before.json', out);
return out;
