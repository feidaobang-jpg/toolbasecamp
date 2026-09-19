#!/usr/bin/env node
/** Fail CI if Tailwind CDN or common utility classes appear in site HTML/JS. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const bad = [];

const TW_UTIL = /\b(bg-gray-|text-gray-|border-gray-|flex-1 flex|max-w-7xl|rounded-2xl border border-gray|grid grid-cols|space-y-[0-9]|md:grid|md:hidden|hover:bg-|inline-flex items-center gap-2 px-4|font-semibold text-gray|text-xs text-gray|text-sm text-gray|px-3 py-|rounded-full border border|tailwindcss\.js|tailwind\.config)\b/;

const SKIP_DIRS = new Set(['html/game', 'vendor']);

function shouldSkip(rel) {
  const parts = rel.split(/[/\\]/);
  if (parts[0] === 'html' && parts[1] === 'game') return true;
  if (SKIP_DIRS.has(parts[0])) return true;
  return false;
}

function walk(dir, rel = '') {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    const r = rel ? `${rel}/${name.name}` : name.name;
    if (name.isDirectory()) {
      if (!shouldSkip(r)) walk(p, r);
      continue;
    }
    if (name.name.endsWith('.html')) {
      const text = fs.readFileSync(p, 'utf8');
      if (/tailwindcss\.js/i.test(text)) bad.push(`${r} (tailwindcss.js)`);
      if (/\btailwind\.config\b/.test(text)) bad.push(`${r} (tailwind.config)`);
      if (TW_UTIL.test(text)) bad.push(`${r} (tailwind utility classes)`);
    }
    if (name.name === 'common_ui.js' || name.name.endsWith('-wallet.js') || name.name === 'chat-inbox.js') {
      const text = fs.readFileSync(p, 'utf8');
      if (TW_UTIL.test(text)) bad.push(`${r} (tailwind utility classes)`);
    }
  }
}

walk(ROOT);
if (bad.length) {
  console.error('Tailwind references found:\n' + [...new Set(bad)].map((x) => `  - ${x}`).join('\n'));
  process.exit(1);
}
console.log('OK: no Tailwind CDN or utility classes in site shell');
