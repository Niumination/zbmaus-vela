# Konfigurasi instance (template tanpa nilai rahasia)

Dokumen ini merekam konfigurasi aktual instance zbmaus di VPS zb-vela per 13 Nov 2026, digenerikkan agar bisa direplikasi.

## ombnew (OMB utama)

- Paket: `openmausbot@0.1.130` (npm global; upstream milind-soni/OpenMausBot — upstream terbaru 0.1.154, belum diupgrade)
- Unit: `systemd/ombnew.service` — `ExecStart: bash services/omb-serve.sh`, `MemoryMax=1G`, `MemoryHigh=800M` (peak produksi ~803M), restart on-failure 5s
- Env unit: `PATH`, `HOME`, `OMB_DUCKDB_DIR`, log append ke `/tmp/omb-serve.log`
- `services/omb-serve.sh` mengekspor `NINEROUTER_API_KEY` (dibaca dari secret store, di produksi: `$HOME/.hermes/.env`), `OMB_DATA_DIR=$HOME/.openmausbot-ombnew`, lalu `openmausbot serve --port 8799 --no-pair`
- `config.json` OMB (di data dir):
  - `openaiCompat: { key, url: http://127.0.0.1:20128/v1 }` → engine utama lewat 9Router
  - `features: { browser: false, skillReview: true }`
  - instances/drivers tersedia: grok, kimi, droid, cursor, claude, codex, chatgpt, antigravity, opencodeGo, openaiCompat, mistral, cerebras, groq, meta, deepseek, museCode (catatan: `skillReview` butuh kredit akun OpenCode background — jika habis, review gagal 3× lalu give up; chat utama tidak terpengaruh)
- Bot ID aktif produksi: 4 bot (lihat `bots.json` di data dir — runtime, tidak direpo)

## novnc-gate

- `services/novnc-gate.mjs` — token gate untuk noVNC :6080, listen 127.0.0.1:6081
- Auth: query `?key=GATE_KEY` atau cookie `gate=GATE_KEY` (di-set otomatis agar WebSocket upgrade lolos; HttpOnly, SameSite=Strict, Max-Age 7 hari)
- Env (`novnc-gate.env`): `GATE_PORT=6081`, `GATE_KEY=<secret>`
- Changelog kecil di repo ini: blok upgrade mengirim header apa adanya (loop cookie sengaja `|| true` — cookie diforward ke upstream websockify)

## omb-relay-bridge

- `services/relay-bridge.mjs` — POST `/hooks/wh_<id>` `{message, state}` → forward ke OMB ingress `:8800` dengan Bearer → dapat `runId` → poll `runtime.db.assignments` (readOnly) sampai `completed` → ambil reply terakhir bot dari `messages.db` → JSON `{reply, runId, threadId}`
- Timeout tunggu: `BRIDGE_WAIT_MS=50000` (poll tiap 1,5 s); DB dibuka `readOnly: true` (aman dijalankan berdampingan dengan OMB)
- Env unit: `BRIDGE_PORT=8801`, `INGRESS_BASE=http://127.0.0.1:8800`, `OMB_DATA_DIR`, + `relay-bridge.env` (`OMB_WEBHOOK_BEARER=<secret>`)
- Dipakai oleh zbmaus-humanoid (:3001) untuk chat sinkron dari web

## 9Router

- Unit: `systemd/9router.service` — `/usr/local/bin/9router -H 127.0.0.1 -p 20128 --no-browser --skip-update`
- Hanya listen loopback; satu-satunya jalur model AI OMB

## Cloudflare Tunnel

- Config: `tunnel: zb-humanoid-quick`, ingress zbmaus→8799, pipatung→3100, niudrive→5173, api→4000 (map lengkap ekosistem ada di repo `ecosystem-config`)
- **Drop-in wajib** `systemd/cloudflared-http2.conf`: `--protocol http2` — tanpa ini QUIC membuat request/upload besar >1–2 MB hang atau 502 (terverifikasi 13 Nov: upload 19 MB ≈ 6 s dengan http2)
- Cloudflare Bot Fight Mode harus **OFF** (memblock fetch ke domain)

## ZB-humanoid (terkait, repo terpisah)

- `Niumination/zbmaus-humanoid` — memanggil relay-bridge; token agent-nya di env unit (`ZB_HUMANOID_AGENT_TOKEN`), bukan di repo ini

## Monitoring cepat

```bash
systemctl --user status ombnew novnc-gate omb-relay-bridge 9router
curl -s http://127.0.0.1:8799/ -o /dev/null -w '%{http_code}\n'   # UI
curl -s http://127.0.0.1:8801/health                              # bridge
tail -f /tmp/omb-serve.log                                        # log OMB
```
