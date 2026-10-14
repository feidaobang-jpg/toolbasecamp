# 枪火集结 0.4.0：抗战战役·李家坡重做，三章全部换新（2026-10-14）

用户说「做第二章李家坡」，确认方案后回复「都按推荐，开始做吧」。按 v0.6.0 时定下的约定：三章都重做完后删掉旧的抗战战役，大厅入口直接进亮剑战役页面。

- 抗战战役第二章换成重做版「李家坡」（亮剑战役 v0.7.0）：强攻受挫、夜里挖交通壕、拂晓手榴弹雨、张大彪突击队、决战山崎。喊话 19 句截自《亮剑》第 3、4 集原声（未取得授权，用户知情后选择）。
- 删掉旧的抗战战役：`resistance-campaign.js`、`resistance-ui.js`、`resistance-assets.js`、`game.js` 里接它们的代码、`index.html` 里只给它用的样式。大厅只留「抗战战役 · 亮剑三章」一个入口，直达 `liangjian/index.html`。
- 旧抗战存档键 `chongchao-resistance-checkpoint-v1` 不再读写（网站上与虫潮围城同域共用）。

开发与验收细节见 `game-projects/liangjian-pingan/media-kit/releases/v0.7.0/notes.md`；渠道状态见同目录 `handoff.json`（发布后写入）。
