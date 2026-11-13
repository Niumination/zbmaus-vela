// omb-relay-bridge: sync bridge between zbmaus-humanoid live site and OMB webhook (async).
// POST /hooks/<endpointId> {message, state}
//   -> forwards to OMB ingress (8800), gets runId, then polls runtime.db assignments for the
//      run's thread and messages.db for the bot reply; returns it synchronously.
import http from "node:http";
import { DatabaseSync } from "node:sqlite";

const PORT = Number(process.env.BRIDGE_PORT || 8801);
const INGRESS_BASE = process.env.INGRESS_BASE || "http://127.0.0.1:8800";
const OMB_DIR = process.env.OMB_DATA_DIR || "/home/agentuser/.openmausbot-ombnew";
const BEARER = process.env.OMB_WEBHOOK_BEARER || "";
const WAIT_MS = Number(process.env.BRIDGE_WAIT_MS || 50000);

const runtime = new DatabaseSync(`${OMB_DIR}/runtime.db`, { readOnly: true });
const messages = new DatabaseSync(`${OMB_DIR}/messages.db`, { readOnly: true });

function threadForRun(runId) {
  const row = runtime.prepare("select assignee_thread_id, status from assignments where requester_run_id = ? order by rowid desc limit 1").get(runId);
  return row || null;
}
function botReply(threadId) {
  return messages.prepare(
    "select id, at, text from messages where thread_id = ? and role = 'bot' and kind = 'text' order by at desc limit 1"
  ).get(threadId) || null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ ok: true }));
  }
  const match = url.pathname.match(/^\/hooks\/(wh_[A-Za-z0-9_-]+)$/);
  if (req.method !== "POST" || !match) {
    res.writeHead(404, { "content-type": "application/json" });
    return res.end(JSON.stringify({ error: "not found" }));
  }
  let body = "";
  for await (const c of req) body += c;
  let payload;
  try { payload = JSON.parse(body || "{}"); } catch { payload = { message: body }; }
  if (!payload.message) {
    res.writeHead(400, { "content-type": "application/json" });
    return res.end(JSON.stringify({ error: "message required" }));
  }

  const fr = await fetch(`${INGRESS_BASE}/hooks/${match[1]}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${BEARER}` },
    body: JSON.stringify({ message: payload.message, state: payload.state || "idle" }),
  });
  const fwd = await fr.json().catch(() => ({}));
  if (!fr.ok) {
    res.writeHead(fr.status, { "content-type": "application/json" });
    return res.end(JSON.stringify({ error: fwd.error || "relay failed" }));
  }
  if (!fwd.runId || fwd.duplicate) {
    res.writeHead(202, { "content-type": "application/json" });
    return res.end(JSON.stringify(fwd));
  }

  const start = Date.now();
  while (Date.now() - start < WAIT_MS) {
    await new Promise((r) => setTimeout(r, 1500));
    const a = threadForRun(fwd.runId);
    if (a && a.status === "completed" && a.assignee_thread_id) {
      const reply = botReply(a.assignee_thread_id);
      if (reply) {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ reply: reply.text, runId: fwd.runId, threadId: a.assignee_thread_id }));
      }
    }
  }
  res.writeHead(202, { "content-type": "application/json" });
  res.end(JSON.stringify({ ...fwd, note: "timeout waiting for bot reply" }));
});

server.listen(PORT, "127.0.0.1", () => console.log(`omb-relay-bridge on ${PORT}`));
