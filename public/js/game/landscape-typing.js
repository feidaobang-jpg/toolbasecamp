// 手机竖屏时游戏面板靠 CSS 旋转成“假横屏”，系统输入法仍按真实竖屏方向弹出，
// 键盘和面板方向对不上。聚焦文本框时尝试进入全屏并锁横屏，让系统真实转过来
//（键盘随之变横屏）；浏览器不支持或拒绝时提示用户手动横屏输入。
const COARSE_UA = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS|OpenHarmony/i;
function isTouch() {
	return (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || COARSE_UA.test(navigator.userAgent || '');
}
function showHint(text) {
	let el = document.getElementById('landscape-typing-hint');
	if (!el) {
		el = document.createElement('div');
		el.id = 'landscape-typing-hint';
		el.setAttribute('role', 'status');
		el.style.cssText = 'position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 12px);transform:translateX(-50%);z-index:2147483000;background:rgba(20,28,40,.92);color:#fff;font:14px/1.4 system-ui,sans-serif;padding:10px 16px;border-radius:10px;max-width:86vw;text-align:center;pointer-events:none;transition:opacity .3s;opacity:0';
		document.body.appendChild(el);
	}
	el.textContent = text;
	el.style.opacity = '1';
	clearTimeout(showHint.timer);
	showHint.timer = setTimeout(() => { el.style.opacity = '0'; }, 3000);
}
const HINT_TEXT = '键盘按竖屏方向弹出，建议先把手机转为横屏再输入';
export function installLandscapeTyping() {
	if (installLandscapeTyping.done) return;
	installLandscapeTyping.done = true;
	document.addEventListener('focusin', (e) => {
		const el = e.target;
		if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return;
		if (el.disabled || el.readOnly || /^(checkbox|radio|button|submit|file|range|color)$/.test(el.type || 'text')) return;
		if (window.innerWidth >= window.innerHeight || !isTouch()) return;
		const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
		if (fsEl) {
			// 已在全屏：只补锁方向，锁不上说明系统不允许，提示兜底
			try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => showHint(HINT_TEXT)); } catch { showHint(HINT_TEXT); }
			return;
		}
		const de = document.documentElement;
		const req = de.requestFullscreen || de.webkitRequestFullscreen;
		if (!req) { showHint(HINT_TEXT); return; }
		try {
			Promise.resolve(req.call(de, { navigationUI: 'hide' })).then(() => {
				try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}); } catch { /* 不支持方向锁，保持全屏横排 */ }
			}, () => showHint(HINT_TEXT));
		} catch { showHint(HINT_TEXT); }
	});
}
