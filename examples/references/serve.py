#!/usr/bin/env python3
"""Static HTTP server for the built references app (stdlib only).

Serves:
  /              → examples/references/dist/
  /examples/     → examples/
  /registries/   → registries/

Build first:  cd examples/references && npm run build
Run:          python3 examples/references/serve.py
"""
from __future__ import annotations

import argparse
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse


ROOT = Path(__file__).resolve().parents[2]
DIST = ROOT / "examples/references/dist"
EXAMPLES = ROOT / "examples"
REGISTRIES = ROOT / "registries"


def _safe_under(base: Path, rel: str) -> Path | None:
    if not rel or rel.startswith(".."):
        return None
    target = (base / rel).resolve()
    try:
        target.relative_to(base.resolve())
    except ValueError:
        return None
    return target if target.is_file() else None


class ReferencesHandler(SimpleHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        # Quieter default for local preview
        super().log_message(fmt, *args)

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        raw_path = unquote(parsed.path)

        if raw_path.startswith("/examples/"):
            rel = raw_path[len("/examples/") :].lstrip("/")
            path = _safe_under(EXAMPLES, rel)
            return self._send_file(path, "application/octet-stream")

        if raw_path.startswith("/registries/"):
            rel = raw_path[len("/registries/") :].lstrip("/")
            path = _safe_under(REGISTRIES, rel)
            return self._send_file(path, "application/octet-stream")

        rel = raw_path.lstrip("/") or "index.html"
        path = _safe_under(DIST, rel)
        if path is None and raw_path.rstrip("/") in ("", "/"):
            path = _safe_under(DIST, "index.html")
        return self._send_file(path, self._guess_type(rel))

    def _guess_type(self, rel: str) -> str:
        ext = Path(rel).suffix.lower()
        return {
            ".html": "text/html; charset=utf-8",
            ".js": "text/javascript; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".json": "application/json; charset=utf-8",
            ".wasm": "application/wasm",
            ".svg": "image/svg+xml",
            ".png": "image/png",
            ".ico": "image/x-icon",
        }.get(ext, "application/octet-stream")

    def _send_file(self, path: Path | None, content_type: str) -> None:
        if path is None or not path.is_file():
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        data = path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve built references dashboard")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8001)
    args = parser.parse_args()

    if not DIST.is_dir():
        raise SystemExit(
            f"Missing {DIST}. Run: cd examples/references && npm run build",
        )

    server = ThreadingHTTPServer((args.host, args.port), ReferencesHandler)
    print(f"Serving references from {DIST} at http://{args.host}:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
