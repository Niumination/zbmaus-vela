# zbmaus-vela — Paket Setup & Konfigurasi OpenMausBot (OMB)

Paket lengkap untuk menjalankan **OpenMausBot (OMB)** + lingkungan pendukungnya pada satu VPS, siap dipakai orang lain. Tidak ada data runtime atau kredensial di dalam repo — semua rahasia diisi lewat file `.env` milikmu sendiri.

## Arsitektur

```
                        Cloudflare Tunnel (http2)
                                 │
   zbmaus.domain.tld ────────────┤──► :8799  OMB UI (openmausbot serve)
   opencraft.domain.tld ─────────┤──► :6081  noVNC token gate ──► :6080 websockify/noVNC
   ombrelay.domain.tld ──────────┤──► :8801  relay-bridge ──► :8800 OMB ingress
   (zb-humanoid :3001 → memanggil relay-bridge /hooks/<id> untuk chat sinkron)
                                 │
                    :20128  9Router (AI gateway, engine openaiCompat OMB)
```

Komponen:

| Komponen | Port | Sumber | Fungsi |
|---|---|---|---|
| `ombnew.service` | 8799 | paket npm `openmausbot` | UI bot + ingress webhook :8800 + memory (SQLite/DuckDB di `OMB_DATA_DIR`) |
| `novnc-gate.service` | 6081→6080 | `services/novnc-gate.mjs` | Reverse proxy noVNC dengan token gate (?key= → cookie, WebSocket-safe) |
| `omb-relay-bridge.service` | 8801 | `services/relay-bridge.mjs` | Jembatan webhook async→sinkron: POST /hooks/<id>, poll DB runtime & messages, balas JSON |
| `9router.service` | 20128 | binary `9router` | Gateway model AI (OpenAI-compatible) yang dipakai OMB |

## Prasyarat

- Linux + systemd user session (`loginctl enable-linger $USER`)
- Node.js ≥ 20 (set `NODE_DIR` ke folder bin Node-mu)
- `npm install -g openmausbot` (versi teruji: **0.1.130**; upstream: milind-soni/OpenMausBot)
- `9router` terpasang di `/usr/local/bin` (atau sesuaikan unit-nya)
- noVNC/websockify berjalan di :6080 (opsional — hanya untuk gate opencraft)
- Domain + Cloudflare Tunnel. **PENTING:** gunakan `--protocol http2` pada cloudflared (QUIC membuat upload/request besar >1–2 MB hang/502). Contoh drop-in ada di `systemd/cloudflared-http2.conf`.

## Instalasi

```bash
# 1. Node & OMB
export NODE_DIR="$HOME/.local/node-v24.11.1-linux-x64/bin"
npm install -g openmausbot@0.1.130

# 2. Salin service
cp -r services ~/zbmaus && cp -r systemd ~/.config/systemd/user/
systemctl --user daemon-reload

# 3. Kredensial (tidak pernah di-commit)
cp examples/*.env.example ~/zbmaus/
# edit tiap .env: isi key/token
chmod 600 ~/zbmaus/*.env

# 4. Jalankan
systemctl --user enable --now 9router novnc-gate omb-relay-bridge ombnew
```

## Kredensial yang dibutuhkan

| Variabel | Dipakai oleh | Cara dapat |
|---|---|---|
| `NINEROUTER_API_KEY` | omb-serve.sh → engine openaiCompat | console 9Router |
| `GATE_KEY` | novnc-gate | buat sendiri (mis. `openssl rand -hex 24`) |
| `OMB_WEBHOOK_BEARER` | relay-bridge → OMB ingress | dari OMB (webhook endpoint id + bearer) |

Detail tiap layanan, pemecahan masalah, dan peta domain: lihat `docs/`.

## Instalasi di server lain

Prompt hand-off lengkap untuk Hermes Agent di server tujuan (instalasi OMB + 9Router + tunnel, langkah demi langkah): [`docs/INSTALL-PROMPT.md`](docs/INSTALL-PROMPT.md).

## Yang TIDAK ada di repo ini (disengaja)

- `OMB_DATA_DIR` (runtime: bots, memory, messages, browser profiles) — milik instance
- File `.env` / `.key` berisi nilai asli
- Database SQLite/DuckDB

Backup runtime disarankan via snapshot berkala folder data (contoh kebijakan backup VPS ada di `docs/BACKUP.md`).
