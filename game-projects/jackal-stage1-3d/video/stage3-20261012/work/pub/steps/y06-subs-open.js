// YouTube：打开字幕（翻译）页，只读看结构
const { path, sleep } = S; const y = S.vars.yt; const out = {};
await y.goto('https://studio.youtube.com/video/TT3uvOfYiVo/translations', { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(8000);
out.url = y.url();
out.text = await y.evaluate(() => (document.querySelector('ytcp-video-translations, #main, main') || document.body).innerText.replace(/\n+/g, ' | ').slice(0, 1500));
out.rows = await y.evaluate(() => [...document.querySelectorAll('ytgn-video-translation-row, .translation-row, tr')].filter(e => e.offsetParent).map(e => e.tagName + ' => ' + e.innerText.replace(/\n+/g, ' | ').slice(0, 160)).slice(0, 8));
out.buttons = await y.evaluate(() => [...document.querySelectorAll('ytcp-button, button')].filter(e => e.offsetParent && e.innerText.trim()).map(e => (e.id || '') + ':' + e.innerText.trim().slice(0, 20)).slice(0, 40));
await y.screenshot({ path: path.join(S.OUT, 'y06.png') });
return out;
