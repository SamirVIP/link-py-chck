from http.server import BaseHTTPRequestHandler
import json
import urllib.request
import urllib.parse
import concurrent.futures

class handler(BaseHTTPRequestHandler):

    def do_GET(self):
        self._send_json(200, {
            "message": "API is running."
        })

    def do_POST(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length == 0:
                self._send_json(400, {"error": "Empty body"})
                return

            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))

            template = data.get('template', '')
            words = data.get('words', [])

            if not template or not words:
                self._send_json(400, {"error": "Missing template or words"})
                return

            def check_word(word):
                w = str(word).strip()
                url = template.replace('(Word)', urllib.parse.quote(w))
                status_code = 0
                working = False
                try:
                    req = urllib.request.Request(url, method='HEAD')
                    req.add_header('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')
                    with urllib.request.urlopen(req, timeout=4) as response:
                        status_code = response.status
                        working = (status_code == 200)
                except urllib.error.HTTPError as e:
                    status_code = e.code
                    working = (status_code == 200)
                except Exception:
                    status_code = 0
                return {"word": w, "url": url, "status": status_code, "working": working}

            with concurrent.futures.ThreadPoolExecutor(max_workers=50) as executor:
                results = list(executor.map(check_word, words))

            self._send_json(200, {"results": results})

        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def _send_json(self, code, obj):
        body = json.dumps(obj).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-type', 'application/json')
        self._cors()
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)
