const rootEl = document.getElementById('excalidraw-root');
const errorBox = document.getElementById('error-box');
const loadingBox = document.getElementById('loading-box');

function tr(key) {
    return typeof window.t === 'function' ? window.t(key) : key;
}

function localeCode() {
    const lang = (typeof window.tbGetLocale === 'function' ? window.tbGetLocale() : 'en') || 'en';
    return lang.startsWith('zh') ? 'zh-CN' : 'en';
}

function showError(msg) {
    if (loadingBox) loadingBox.hidden = true;
    if (!errorBox) return;
    errorBox.textContent = msg;
    errorBox.classList.add('is-visible');
}

function hideLoading() {
    if (loadingBox) loadingBox.hidden = true;
}

async function initExcalidraw() {
    if (!rootEl) return;

    try {
        const React = await import('https://cdn.jsdelivr.net/npm/react@18.3.1/+esm');
        const ReactDOM = await import('https://cdn.jsdelivr.net/npm/react-dom@18.3.1/client/+esm');
        const ExcalidrawLib = await import('https://cdn.jsdelivr.net/npm/@excalidraw/excalidraw@0.18.0/+esm');

        const { Excalidraw } = ExcalidrawLib;
        const root = ReactDOM.createRoot(rootEl);
        root.render(React.createElement(Excalidraw, {
            langCode: localeCode(),
            UIOptions: {
                canvasActions: {
                    loadScene: true,
                    saveToActiveFile: true,
                    export: { saveFileToDisk: true },
                    toggleTheme: true
                }
            }
        }));

        hideLoading();
    } catch (err) {
        console.error(err);
        showError(tr('tools.excalidraw.loadError'));
    }
}

initExcalidraw();
