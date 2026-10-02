// Build Toy packages from the website sources; no gameplay fork and no upload.
// node game-projects/build-canvas-toy.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
for (const game of ['brick_breaker', 'sheepstack']) {
    const project = join(root, 'game-projects', game.replaceAll('_', '-'));
    const output = join(project, 'dist/toy-v1');
    const release = join(project, 'media-kit/releases/toy-v1');
    mkdirSync(output, { recursive: true });
    mkdirSync(release, { recursive: true });
    let html = readFileSync(join(root, 'public/html/game', game + '.html'), 'utf8');
    html = html.replace(/<script src="\.\.\/\.\.\/js\/game\/thumb-preview\.js"><\/script>/, '')
        .replace(/^window\.__tbThumbAutoStart = .*;\r?\n/m, '');
    // Toy embeds games in an iframe: focus the canvas after a user gesture so
    // keyboard controls reach the game rather than the outer platform page.
    html = html.replace('</body>', `<script>
const toyCanvas = document.querySelector('canvas');
toyCanvas.tabIndex = 0;
toyCanvas.addEventListener('pointerdown', () => {
    window.focus();
    toyCanvas.focus({ preventScroll: true });
});
</script>\n</body>`);
    const files = [];
    html = html.replace(/src="\.\.\/\.\.\/js\/game\/([^"?]+)(?:\?[^" ]*)?"/g, (_, name) => {
        const content = readFileSync(join(root, 'public/js/game', name));
        writeFileSync(join(output, name), content);
        files.push(name);
        return 'src="./' + name + '"';
    });
    writeFileSync(join(output, 'index.html'), html);
    files.push('index.html');
    for (const file of readdirSync(output)) {
        if (!files.includes(file)) throw new Error('Unexpected package file: ' + file);
    }
    const manifest = {
        source: 'public/html/game/' + game + '.html',
        files: Object.fromEntries(files.map(name => [name,
            createHash('sha256').update(readFileSync(join(output, name))).digest('hex')]))
    };
    writeFileSync(join(release, 'build.json'), JSON.stringify(manifest, null, 2) + '\n');
    console.log(output);
}
