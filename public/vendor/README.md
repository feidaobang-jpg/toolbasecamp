# Local vendor assets

Self-hosted copies so hub/auth pages do not wait on overseas CDNs.

- `tailwindcss.js` — **已废弃**，勿在 HTML 中引用（样式见 `css/site-shell.css` 等）
- `font-awesome/` — Font Awesome 6.0.0 CSS + woff2 webfonts

Update by re-downloading from the upstream CDN URLs when bumping versions.

Note: the Play-CDN `console.warn` about production use is stripped from this local snapshot.
