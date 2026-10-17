"""Granite 4.0 350M (instruct, big-endian GGUF) behind a tiny HTTP server, on LinuxONE.

llama.cpp in IBM's image is built with zDNN, so its matrix multiplications can run on the NNPA.
Only reachable from the API container (no published port). One generation at a time.

POST /generate {"system": str, "user": str, "max_tokens": int} -> {"text", "seconds", "tokens"}
GET  /health
"""

import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from llama_cpp import Llama

MODEL = os.getenv("GRANITE_MODEL", "/models/granite-4.0-h-350m-bf16-be.gguf")
llm = Llama(model_path=MODEL, n_ctx=2048, n_threads=int(os.getenv("GRANITE_THREADS", "3")), verbose=False)
lock = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: dict):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path != "/health":
            return self._send(404, {"detail": "not found"})
        self._send(200, {"model": os.path.basename(MODEL), "busy": lock.locked()})

    def do_POST(self):
        if self.path != "/generate":
            return self._send(404, {"detail": "not found"})
        try:
            req = json.loads(self.rfile.read(int(self.headers.get("content-length", 0))))
            messages = [{"role": "system", "content": str(req["system"])}, {"role": "user", "content": str(req["user"])}]
            max_tokens = min(int(req.get("max_tokens", 160)), 300)
        except (ValueError, KeyError, TypeError):
            return self._send(400, {"detail": "send system, user, max_tokens"})

        with lock:
            started = time.perf_counter()
            out = llm.create_chat_completion(messages=messages, temperature=0, max_tokens=max_tokens)
        self._send(200, {
            "text": out["choices"][0]["message"]["content"].strip(),
            "seconds": round(time.perf_counter() - started, 2),
            "tokens": out["usage"]["completion_tokens"],
        })

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
