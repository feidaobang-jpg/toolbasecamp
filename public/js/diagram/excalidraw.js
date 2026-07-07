import React from 'https://esm.sh/react@19.0.0';
import ReactDOM from 'https://esm.sh/react-dom@19.0.0/client';
import * as ExcalidrawLib from 'https://esm.sh/@excalidraw/excalidraw@0.18.0?deps=react@19.0.0,react-dom@19.0.0';

const { Excalidraw } = ExcalidrawLib;
const rootEl = document.getElementById('excalidraw-root');
const errorBox = document.getElementById('error-box');

function tr(key) {
    return typeof window.t === 'function' ? window.t(key) : key;
}

function localeCode() {
    const lang = (typeof window.tbGetLocale === 'function' ? window.tbGetLocale() : 'en') || 'en';
    return lang.startsWith('zh') ? 'zh-CN' : 'en';
}

function showError(msg) {
    if (!errorBox) return;
    errorBox.textContent = msg;
    errorBox.classList.add('is-visible');
}

try {
    const root = ReactDOM.createRoot(rootEl);
    root.render(React.createElement(Excalidraw, { langCode: localeCode() }));
} catch (err) {
    showError(tr('tools.excalidraw.loadError'));
    console.error(err);
}
