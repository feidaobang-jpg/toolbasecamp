"""Local-only recording copy. Never changes the published game or gameplay values."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import shutil
import os

HERE = Path(__file__).resolve().parent
ROOT = next(p for p in HERE.parents if (p / 'public/html/game/starship_defense.html').exists())
CAP = HERE / 'capture'
RUNTIME = CAP / 'runtime'
RUNTIME.mkdir(parents=True, exist_ok=True)
for p in (ROOT / 'dist/toy/chongchao-qianshao/package').iterdir():
    if p.is_file():
        shutil.copy2(p, RUNTIME / p.name)
html = (RUNTIME / 'index.html').read_text(encoding='utf-8')
html = html.replace('</body>', '<script src="/capture-recorder.js"></script></body>')
(RUNTIME / 'index.html').write_text(html, encoding='utf-8')

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(HERE), **kwargs)

    def do_POST(self):
        names = {'/capture/sortie.webm', '/capture/sortie.json', '/capture/defense.webm', '/capture/defense.json'}
        if self.path not in names:
            self.send_error(400)
            return
        size = int(self.headers.get('Content-Length', '0'))
        if size <= 0 or size > 500_000_000:
            self.send_error(413)
            return
        (HERE / self.path.lstrip('/')).write_bytes(self.rfile.read(size))
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'saved')

print('Capture UI: http://127.0.0.1:8767/capture/runtime/index.html', flush=True)
ThreadingHTTPServer(('127.0.0.1', 8767), Handler).serve_forever()
