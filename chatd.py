"""Local desk for the profile page. One process, the Wire index, then Jev."""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from personal.desk import INDEX_PATH, REPO, ask, build, load_env, open_index

load_env(REPO / ".env")
INDEX = open_index()
COUNT = build(INDEX)
HOST = "127.0.0.1"
PORT = 4322


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path.split("?")[0] != "/health":
            self._send(404, {"error": "not found"})
            return
        self._send(200, {"ok": True, "documents": COUNT, "index": str(INDEX_PATH)})

    def do_POST(self) -> None:
        if self.path.split("?")[0] != "/ask":
            self._send(404, {"error": "not found"})
            return
        length = int(self.headers.get("Content-Length") or "0")
        if length <= 0 or length > 8_000:
            self._send(400, {"error": "bad request"})
            return
        try:
            payload = json.loads(self.rfile.read(length).decode())
        except json.JSONDecodeError:
            self._send(400, {"error": "bad request"})
            return
        question = payload.get("question") if isinstance(payload, dict) else None
        if not isinstance(question, str) or not question.strip():
            self._send(400, {"error": "bad request"})
            return
        lang = payload.get("lang") if isinstance(payload, dict) else None
        if lang not in ("en", "de"):
            lang = "en"
        self._send(200, ask(INDEX, question[:400], lang))

    def log_message(self, fmt: str, *args: object) -> None:
        return

    def _send(self, status: int, body: dict[str, object]) -> None:
        raw = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


def main() -> None:
    print(f"profile desk listening on http://{HOST}:{PORT} documents={COUNT}", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
