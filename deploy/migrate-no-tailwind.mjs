#!/usr/bin/env node
/**
 * Strip Tailwind CDN from public HTML and apply semantic classes.
 * Usage: node deploy/migrate-no-tailwind.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const VER = 'nosTW1';

const TAILWIND_FILES = [
  'index.html',
  'games.html',
  'life.html',
  'music.html',
  'images.html',
  'about.html',
  'cool-sites.html',
  'top-up.html',
  'guestbook.html',
  'html/auth/login.html',
  'html/auth/register.html',
  'html/auth/profile.html',
  'html/auth/chat.html',
  'html/admin/private.html',
  'html/admin/site-stats.html',
  'html/admin/private/ai-wallet.html',
  'html/admin/private/chat-inbox.html',
  'html/admin/private/ladder-update.html',
  'html/admin/private/stickers.html',
  'html/admin/private/stock-picks.html',
  'html/admin/private/traditional-music.html',
];

function cssHref(file, name) {
  const depth = file.split('/').length - 1;
  const prefix = depth ? '../'.repeat(depth) : '';
  return `${prefix}css/${name}?v=${VER}`;
}

function extraCssFor(file) {
  if (file.startsWith('html/auth/')) return ['auth-form.css'];
  if (file.startsWith('html/admin/')) return ['admin-shell.css'];
  if (['about.html', 'top-up.html', 'guestbook.html'].includes(file)) return ['content-page.css'];
  return [];
}

function injectCss(html, file) {
  const shell = cssHref(file, 'site-shell.css');
  const extras = extraCssFor(file).map((n) => cssHref(file, n));
  const block = extras.map((h) => `  <link rel="stylesheet" href="${h}">`).join('\n');
  const shellLine = `  <link rel="stylesheet" href="${shell}">`;
  if (html.includes('site-shell.css')) return html;
  if (html.includes('css/base.css')) {
    return html.replace(
      /(<link rel="stylesheet" href="[^"]*css\/base\.css[^"]*">)/,
      `$1\n${shellLine}${extras.length ? '\n' + block : ''}`
    );
  }
  return html.replace('</head>', `${shellLine}\n${block}\n</head>`);
}

const REPLACEMENTS = [
  [/\s*<script src="[^"]*tailwindcss\.js[^"]*"><\/script>\s*/g, '\n'],
  [/\s*<script>\s*tailwind\.config[\s\S]*?<\/script>\s*/g, '\n'],
  [/class="bg-gray-50 text-gray-800 h-screen flex flex-col overflow-hidden"/g, 'class="site-page site-page--hub"'],
  [/class="bg-gray-50 text-gray-800 min-h-screen flex flex-col font-sans"/g, 'class="site-page"'],
  [/class="bg-white border-b border-gray-100 sticky top-0 z-50 backdrop-blur-md bg-opacity-90"/g, 'class="site-header site-header--sticky"'],
  [/class="bg-white border-b border-gray-100 sticky top-0 z-50"/g, 'class="site-header site-header--sticky"'],
  [/class="bg-white border-b border-gray-100 flex-shrink-0 z-40 relative"/g, 'class="site-header site-header--shrink"'],
  [/class="bg-white border-b border-gray-100"/g, 'class="site-header"'],
  [/class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-3 md:gap-8 min-w-0"/g, 'class="site-header-inner"'],
  [/class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3"/g, 'class="site-header-inner auth-header-inner"'],
  [/class="flex items-center gap-2 flex-shrink-0 min-w-0 max-w-\[58vw\] sm:max-w-none group"/g, 'class="site-brand"'],
  [/class="flex items-center gap-2 flex-shrink-0 group"/g, 'class="site-brand"'],
  [/class="flex items-center gap-2 flex-shrink-0 text-sm text-gray-600 hover:text-blue-600"/g, 'class="site-back-link"'],
  [/class="logo-text w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-md group-hover:bg-blue-700 transition-colors"/g, 'class="site-logo logo-text"'],
  [/class="site-name text-base sm:text-xl font-bold text-gray-900 tracking-tight truncate"/g, 'class="site-name site-title"'],
  [/class="site-name text-xl font-bold text-gray-900 tracking-tight"/g, 'class="site-name site-title"'],
  [/class="hidden md:flex items-center gap-8 text-\[15px\] font-medium text-gray-600"/g, 'class="site-nav-main"'],
  [/id="site-header-mobile-slot" class="flex items-center gap-1 flex-shrink-0 md:hidden ml-auto"/g, 'id="site-header-mobile-slot" class="site-header-mobile-slot"'],
  [/class="flex-1 flex overflow-hidden relative"/g, 'class="site-hub-layout"'],
  [/class="flex-1 flex flex-col w-0 overflow-hidden bg-gray-50"/g, 'class="site-main site-main--hub"'],
  [/class="flex-1 flex items-center justify-center p-4"/g, 'class="site-main site-main--center"'],
  [/class="flex-1 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 w-full"/g, 'class="site-main site-main--about"'],
  [/class="flex-1 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full"/g, 'class="site-main site-main--content"'],
  [/class="flex-1 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full"/g, 'class="admin-main"'],
  [/class="flex-1 px-4 sm:px-6 lg:px-8 py-6 w-full"/g, 'class="admin-main admin-main--wide"'],
  [/class="text-sm text-gray-500 hover:text-blue-600 transition-colors whitespace-nowrap"/g, 'class="auth-back-home"'],
  [/class="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden"/g, 'class="auth-card"'],
  [/class="p-8"/g, 'class="auth-card-body"'],
  [/class="text-center mb-8"/g, 'class="auth-head"'],
  [/class="text-2xl font-bold text-gray-900"/g, 'class="auth-head-title"'],
  [/class="text-gray-500 mt-2 text-sm"/g, 'class="auth-head-sub"'],
  [/class="space-y-5"/g, 'class="auth-form-stack"'],
  [/class="block text-sm font-medium text-gray-700 mb-1\.5"/g, 'class="auth-field-label"'],
  [/class="block text-sm font-medium text-gray-700 mb-1"/g, 'class="auth-field-label"'],
  [/class="relative"/g, 'class="auth-input-wrap"'],
  [/class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"/g, 'class="auth-input-icon"'],
  [
    /class="block w-full pl-10 pr-3 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all bg-gray-50 focus:bg-white"/g,
    'class="auth-input"',
  ],
  [/class="mt-1\.5 text-xs text-gray-400"/g, 'class="auth-field-hint"'],
  [/class="hidden rounded-lg p-3 text-sm flex items-start gap-2"/g, 'class="auth-status"'],
  [/class="text-center text-sm text-gray-500 mt-6"/g, 'class="auth-footer"'],
  [/class="text-blue-600 font-semibold hover:underline"/g, 'class="auth-footer-link"'],
  [/class="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 md:p-12"/g, 'class="about-card"'],
  [/class="text-center mb-10"/g, 'class="about-hero"'],
  [/class="w-24 h-24 bg-blue-100 rounded-2xl mx-auto mb-6 flex items-center justify-center"/g, 'class="about-logo-box"'],
  [/class="text-3xl font-bold text-blue-600"/g, 'class="about-logo-text"'],
  [/class="text-3xl font-bold text-gray-900 mb-4"/g, 'class="about-hero-title"'],
  [/class="text-lg text-gray-600 max-w-2xl mx-auto"/g, 'class="about-hero-lead"'],
  [/class="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-8"/g, 'class="about-feature-grid"'],
  [/class="p-5 bg-blue-50 rounded-xl"/g, 'class="about-feature about-feature--blue"'],
  [/class="p-5 bg-violet-50 rounded-xl"/g, 'class="about-feature about-feature--violet"'],
  [/class="p-5 bg-teal-50 rounded-xl"/g, 'class="about-feature about-feature--teal"'],
  [/class="p-5 bg-amber-50 rounded-xl"/g, 'class="about-feature about-feature--amber"'],
  [/class="p-5 bg-indigo-50 rounded-xl"/g, 'class="about-feature about-feature--indigo"'],
  [/class="p-5 bg-green-50 rounded-xl"/g, 'class="about-feature about-feature--green"'],
  [/class="p-5 bg-orange-50 rounded-xl sm:col-span-2"/g, 'class="about-feature about-feature--orange about-feature--span2"'],
  [/class="font-bold text-gray-900 mb-1"/g, 'class="about-feature-title"'],
  [/class="text-sm text-gray-600"/g, 'class="about-feature-desc"'],
  [/class="mb-8"/g, 'class="content-hero"'],
  [/class="text-2xl font-bold text-gray-900 flex items-center gap-3"/g, 'class="content-hero-title"'],
  [/class="w-1\.5 h-8 bg-blue-600 rounded-full"/g, 'class="content-hero-accent"'],
  [/class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-8"/g, 'class="content-section"'],
  [/class="text-base font-semibold text-gray-900 mb-4"/g, 'class="content-section-title"'],
  [
    /class="w-full rounded-lg border border-gray-200 px-4 py-2\.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"/g,
    'class="content-input"',
  ],
  [
    /class="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"/g,
    'class="content-textarea"',
  ],
  [/class="text-right text-xs text-gray-400 mt-1"/g, 'class="content-char-count"'],
  [/class="hidden mb-4 text-sm text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-4 py-3"/g, 'class="content-hint-box hidden"'],
  [/class="hidden mb-4 rounded-lg px-4 py-3 text-sm"/g, 'class="content-status hidden"'],
  [/class="text-base sm:text-lg font-bold text-gray-900 truncate"/g, 'class="admin-title"'],
  [/class="ml-auto flex items-center gap-3 text-sm min-w-0"/g, 'class="admin-header-actions"'],
  [/class="ml-auto flex items-center gap-3 text-sm"/g, 'class="admin-header-actions"'],
  [/class="text-gray-500 truncate"/g, 'class="admin-auth-label"'],
  [/class="text-gray-500"/g, 'class="admin-auth-label"'],
  [/class="text-blue-600 hover:underline hidden"/g, 'class="admin-login-link hidden"'],
  [/class="bg-white rounded-2xl border border-gray-100 p-8 text-center hidden"/g, 'class="admin-card admin-card--center hidden"'],
  [/class="text-gray-600 mb-4"/g, 'class="admin-gate-msg"'],
  [/class="tb-btn inline-flex"/g, 'class="tb-btn"'],
  [/class="hidden space-y-6"/g, 'class="admin-app hidden"'],
  [/class="text-xl font-bold text-gray-900"/g, 'class="admin-page-head-title"'],
  [/class="text-sm text-gray-500 mt-1"/g, 'class="admin-page-head-sub"'],
  [/class="space-y-6"/g, 'class="admin-app"'],
  [/class="max-w-lg mx-auto bg-white rounded-2xl border border-gray-100 p-8 text-center text-sm text-gray-500"/g, 'class="admin-card admin-card--center admin-card--narrow"'],
  [/class="max-w-lg mx-auto bg-white rounded-2xl border border-gray-100 p-8 text-center hidden"/g, 'class="admin-card admin-card--center admin-card--narrow hidden"'],
  [/class="ladder-update-wrap hidden max-w-2xl mx-auto space-y-6"/g, 'class="ladder-update-wrap admin-app hidden"'],
  [/class="space-y-3"/g, 'class="admin-form-stack"'],
  [/class="block text-sm"/g, 'class="admin-field"'],
  [/class="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"/g, 'class="admin-input"'],
  [/class="flex flex-col sm:flex-row gap-2"/g, 'class="admin-toolbar-row"'],
  [/class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"/g, 'class="admin-input"'],
  [/class="text-gray-600"/g, 'class="admin-field-label"'],
  [/class="mt-3 space-y-4" id="bg-groups"/g, 'class="instruct-bg-groups" id="bg-groups"'],
  [/class="grid grid-cols-2 gap-3 mt-3 hidden" id="bg-select-wrap"/g, 'class="instruct-bg-select-wrap hidden" id="bg-select-wrap"'],
  [/class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"/g, 'class="tb-select"'],
];

function migrateFile(rel) {
  const abs = path.join(ROOT, rel.replace(/\//g, path.sep));
  let html = fs.readFileSync(abs, 'utf8');
  for (const [re, rep] of REPLACEMENTS) {
    html = html.replace(re, rep);
  }
  if (rel.startsWith('html/admin/')) {
    html = html.replace(/class="site-page"/g, 'class="admin-page"');
    html = html.replace(/class="site-header site-header--sticky"/g, 'class="admin-header"');
    html = html.replace(/class="site-header-inner"/g, 'class="admin-header-inner"');
    html = html.replace(/class="site-back-link"/g, 'class="admin-back"');
  }
  html = injectCss(html, rel);
  html = html.replace(/\?v=minimax1/g, `?v=${VER}`);
  html = html.replace(/\?v=adminhub1/g, `?v=${VER}`);
  if (/tailwindcss\.js/i.test(html)) {
    throw new Error(`tailwind script remains: ${rel}`);
  }
  fs.writeFileSync(abs, html, 'utf8');
  console.log('ok', rel);
}

for (const f of TAILWIND_FILES) {
  migrateFile(f);
}
console.log('done', TAILWIND_FILES.length);
