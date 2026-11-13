// token-gate reverse proxy for noVNC (HTTP + WebSocket upgrade), upstream 127.0.0.1:6080
import http from "node:http";
import net from "node:net";

const PORT = Number(process.env.GATE_PORT || 6081);
const UPSTREAM_HOST = "127.0.0.1";
const UPSTREAM_PORT = 6080;
const KEY = process.env.GATE_KEY || ""; // required

function authorized(req, url) {
  if (!KEY) return false;
  const u = new URL(req.url, "http://x");
  if (u.searchParams.get("key") === KEY) return true;
  const cookie = req.headers.cookie || "";
  return cookie.split(/;\s*/).some((c) => c === `gate=${KEY}`);
}

function proxyPlain(req, res) {
  const p = http.request({ host: UPSTREAM_HOST, port: UPSTREAM_PORT, path: req.url, method: req.method, headers: req.headers }, (ur) => {
    res.writeHead(ur.statusCode, ur.headers);
    ur.pipe(res);
  });
  p.on("error", () => { try { res.writeHead(502); res.end("upstream error"); } catch {} });
  req.pipe(p);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (authorized(req, url)) {
    // strip key from query before forwarding
    if (url.searchParams.get("key")) { url.searchParams.delete("key"); req.url = url.pathname + (url.search || ""); }
    // set cookie so websocket handshake later carries it
    if (!(req.headers.cookie || "").includes(`gate=${KEY}`)) {
      res.setHeader("Set-Cookie", `gate=${KEY}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`);
    }
    proxyPlain(req, res);
  } else {
    res.writeHead(401, { "content-type": "text/html" });
    res.end('<html><body><h3>Access denied</h3><p>Tambahkan ?key=<GATE_KEY> di URL.</p></body></html>');
  }
});

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, "http://x");
  const ok = authorized(req, url) || (req.headers.cookie || "").includes(`gate=${KEY}`);
  if (!ok) { socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n"); socket.destroy(); return; }
  const up = net.connect(UPSTREAM_PORT, UPSTREAM_HOST, () => {
    const headers = { ...req.headers };
    if (url.searchParams.get("key")) { url.searchParams.delete("key"); }
    const path = url.pathname + (url.search || "");
    let raw = `${req.method} ${path} HTTP/1.1\r\n`;
    for (const [k, v] of Object.entries(headers)) { if (k.toLowerCase() !== "cookie" || true) raw += `${k}: ${v}\r\n`; }
    raw += "\r\n";
    up.write(raw);
    if (head && head.length) up.write(head);
    up.pipe(socket);
    socket.pipe(up);
  });
  up.on("error", () => socket.destroy());
});

server.listen(PORT, "127.0.0.1", () => console.log(`gate proxy on ${PORT} -> ${UPSTREAM_PORT}`));
