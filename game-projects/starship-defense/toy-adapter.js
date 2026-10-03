/* Toy presentation adapter; gameplay remains the website game's implementation. */
(() => {
  const muteButton = document.getElementById('toyMute');
  let muted = false;
  function toggleMute() {
    muted = !muted;
    AudioSys.init();
    if (AudioSys.master) AudioSys.master.gain.value = muted ? 0 : 0.5;
    muteButton.textContent = muted ? '开启声音 M' : '静音 M';
    muteButton.setAttribute('aria-pressed', String(muted));
  }
  async function toggleFull() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else showMsg('当前浏览器不支持全屏，窗口模式仍可游玩', 3);
    } catch (_) { showMsg('当前页面无法进入全屏，窗口模式仍可游玩', 3); }
  }
  muteButton.onclick = toggleMute;
  document.getElementById('toyFull').onclick = toggleFull;
  // Enter starts a default soldier; R starts a wave or retries, Escape pauses.
  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    if (e.code === 'KeyM') toggleMute();
    else if (e.code === 'KeyF') toggleFull();
    else if (e.code === 'Enter' && Game.state === 'menu') document.getElementById('btnStart').click();
    else if (e.code === 'KeyR' && Game.state === 'prep' && !panelOpen) startBattle();
    else if (e.code === 'KeyR' && Game.state === 'over') restartLevel();
    else if (e.code === 'Escape') {
      if (panelOpen) closePanels();
      else togglePause();
    }
  });
  window.addEventListener('blur', () => {
    Input.keys = {}; Input.pressed = {};
    Input.joy.x = 0; Input.joy.y = 0; Input.joy.active = false;
    if (Game.state === 'prep' || Game.state === 'battle') togglePause();
  });
  const hint = document.querySelector('#menuMain .small');
  hint.innerHTML = '目标：保护基地，消灭每波来袭虫群。开局可直接点「准备完毕」挑战第一波。<br>' +
    'WASD 移动 · J 射击 · K/空格 冲刺 · U 无限手雷 · I 城门/载具 · H 医疗包 · O 商店 · L 建造<br>' +
    'C 镜头 · V 第一/第三人称 · X/1-9 换枪 · 直升机 Y 升 / H 降；手机按对应按钮，已购武器也可在商店点击装备。<br>' +
    'Enter 开始 · R 开战/失败重试 · P 暂停 · M 静音 · F 全屏 · 手机使用摇杆与动作键<br>' +
    '进度仅保存在当前浏览器；试玩版支持反复挑战，不需要充值。';
  document.getElementById('keysHint').textContent += ' · R开战/重试 · M静音 · F全屏';
})();
