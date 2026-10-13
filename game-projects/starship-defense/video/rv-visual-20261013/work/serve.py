"""Local-only reproducible video capture server; no production game changes."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import json, re

WORK = Path(__file__).resolve().parent
ROOT = WORK.parents[4]
CAPTURE = WORK / 'capture'
CAPTURE.mkdir(exist_ok=True)
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)
    def do_GET(self):
        if self.path.startswith('/baseline/'):
            self.path = self.path[len('/baseline'):]
            part = self.path.split('?')[0]
            baseline = 'before-game.compat.js' if part.endswith('/game.compat.js') else 'before-index.html' if part.endswith('/starship-defense/index.html') else None
            if baseline:
                data = (WORK/'sources'/baseline).read_bytes()
                self.send_response(200)
                self.send_header('Content-Type', ('text/javascript' if baseline.endswith('.js') else 'text/html') + '; charset=utf-8')
                self.send_header('Content-Length', str(len(data)))
                self.end_headers(); self.wfile.write(data); return
        super().do_GET()
    def do_POST(self):
        name = self.path.removeprefix('/capture/')
        if not self.path.startswith('/capture/') or not re.fullmatch(r'[a-z0-9-]+\.(webm|json|png)', name):
            self.send_error(400); return
        data = self.rfile.read(int(self.headers['Content-Length']))
        (CAPTURE/name).write_bytes(data)
        self.send_response(200); self.end_headers(); self.wfile.write(b'ok')
    def log_message(self, fmt, *args):
        if args and ('POST' in str(args[0]) or '404' in str(args)):
            super().log_message(fmt, *args)

if __name__ == '__main__':
    print(f'Video workspace: {ROOT}', flush=True)
    ThreadingHTTPServer(('127.0.0.1', 8837), Handler).serve_forever()
