# PROMPT — Instalasi OpenMausBot (OMB) + 9Router di Server Baru

> Prompt ini diserahkan kepada **Hermes Agent yang berjalan di server tujuan**.
> Server tujuan diasumsikan identik dengan server referensi: **Ubuntu 24.04 LTS, x86_64, 2 vCPU / 8 GB RAM, 50 GB disk, akses root/sudo, user non-root biasa (contoh: `agentuser`)**.
> Jalankan langkah demi langkah secara berurutan. Jangan melewati langkah verifikasi. Kredensial TIDAK PERNAH dicetak ke chat/log — simpan di file chmod 600.

## Konteks arsitektur (apa yang akan dibangun)

```
Browser/webhook → Cloudflare Tunnel → :8799 OMB (openmausbot serve)
                                        ├─ engine openaiCompat → :20128 9Router (AI gateway)
                                        ├─ data dir ~/.openmausbot (SQLite/DuckDB)
:6081 novnc-gate (token-gate proxy) → :6080 noVNC/websockify   [opsional]
:8801 omb-relay-bridge → :8800 OMB ingress (webhook sinkron untuk zbmaus-humanoid)
```

Referensi resmi: repo publik **`Niumination/zbmaus-vela`** (paket setup + unit systemd + docs) dan repo privat **`Niumination/zbmaus-vela-secrets`** (kredensial & state, jika pemilik memberi akses).

---

## FASE 0 — Prasyarat & clone repo

```bash
# 0.1 Verifikasi lingkungan
lsb_release -ds                  # Ubuntu 24.04.x LTS
[ "$(uname -m)" = x86_64 ] && echo arch-ok
free -h | awk 'NR==2{print "RAM:", $2}'   # ≥ 7 GB
df -h / | awk 'NR==2{print "disk-avail:", $4}'  # ≥ 15 GB
loginctl show-user $USER -p Linger       # catat nilainya (akan di-enable nanti)

# 0.2 Node.js 24 (pola server referensi: node binari lokal di ~/.local)
NODE_VER=24.11.1
mkdir -p ~/.local
curl -fsSL https://nodejs.org/dist/v${NODE_VER}/node-v${NODE_VER}-linux-x64.tar.xz \
  | tar -xJ -C ~/.local/
export NODE_DIR="$HOME/.local/node-v${NODE_VER}-linux-x64/bin"
$NODE_DIR/node -v            # v24.11.1

# 0.3 Clone repo setup (publik)
git clone https://github.com/Niumination/zbmaus-vela ~/zbmaus-vela
# Jika pemilik memberi akses repo secrets (state & kredensial produksi):
# git clone https://github.com/Niumination/zbmaus-vela-secrets ~/zbmaus-vela-secrets
```

## FASE 1 — 9Router (AI gateway)

```bash
# 1.1 Instal 9router global (server referensi: v0.5.111; npm terbaru ≥ itu boleh)
sudo mkdir -p /usr/local/lib/node_modules
sudo npm install -g --prefix /usr/local 9router
/usr/local/bin/9router --version

# 1.2 Unit systemd user
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/9router.service <<'EOF'
[Unit]
Description=9Router AI gateway (user service)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/9router -H 127.0.0.1 -p 20128 --no-browser --skip-update
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF

# 1.3 Start + verifikasi
systemctl --user daemon-reload
systemctl --user enable --now 9router
sleep 3 && systemctl --user is-active 9router
curl -s -o /dev/null -w "9router http: %{http_code}\n" http://127.0.0.1:20128/

# 1.4 WAJIB: daftarkan provider AI & buat API key
#  9Router punya web UI di :20128. Tanpa akses browser di server, buka tunnel sementara
#  atau minta pemilik menyelesaikan langkah ini interaktif:
#    a. Buka UI 9Router (http://<ip>:20128 via SSH port-forward: ssh -L 20128:127.0.0.1:20128 <server>)
#    b. Tambahkan provider & API key provider yang dimiliki pemilik (mis. satu provider OpenAI-compatible)
#    c. Buat API key gateway (format sk-...) — ini NINEROUTER_API_KEY
#    d. Simpan ke secret store:
echo 'NINEROUTER_API_KEY=<dari-langkah-1.4c>' >> ~/.hermes/.env   # jika Hermes sudah terpasang
chmod 600 ~/.hermes/.env
#  Verifikasi key:
curl -s -H "Authorization: Bearer $(grep ^NINEROUTER_API_KEY ~/.hermes/.env | cut -d= -f2-)" \
  http://127.0.0.1:20128/v1/models | head -c 200   # harus JSON daftar model
```

**Perhatian 9Router:** bind SELALU `127.0.0.1` (jangan 0.0.0.0 ke publik). Folder data `~/.9router` berisi `jwt-secret`, `machine-id`, `auth/cli-secret` — chmod 600 otomatis; jangan pernah di-copy ke repo.

## FASE 2 — OpenMausBot (OMB)

```bash
# 2.1 Instal openmausbot global (PIN versi 0.1.130 — teruji; upstream 0.1.154 belum divalidasi)
npm install -g --prefix "$HOME/.local/node-v24.11.1-linux-x64" openmausbot@0.1.130
export PATH="$NODE_DIR:$PATH"
openmausbot --version || openmausbot -v

# 2.2 Siapkan direktori
mkdir -p ~/zb/omb-new ~/.openmausbot

# 2.3 start.sh (pembungkus service)
cat > ~/zb/omb-new/start.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
export PATH="$NODE_DIR:$PATH"
# NINEROUTER_API_KEY dibaca dari ~/.hermes/.env (atau set langsung di environment unit)
[ -f "$HOME/.hermes/.env" ] && KEY=$(grep '^NINEROUTER_API_KEY=' "$HOME/.hermes/.env" | cut -d= -f2-) && export NINEROUTER_API_KEY="$KEY"
: "${NINEROUTER_API_KEY:?NINEROUTER_API_KEY belum diset}"
export OMB_DATA_DIR="${OMB_DATA_DIR:-$HOME/.openmausbot}"
export OMB_DUCKDB_DIR="${OMB_DUCKDB_DIR:-$(dirname "$(dirname "$(command -v openmausbot)")")/lib}"
exec openmausbot serve --port "${OMB_PORT:-8799}" --no-pair
EOF
chmod 755 ~/zb/omb-new/start.sh
# sesuaikan NODE_DIR di dalam start.sh bila perlu (export NODE_DIR=... sebelum KEY)

# 2.4 Unit systemd (ambil dari repo publik; sesuaikan path jika perlu)
cp ~/zbmaus-vela/systemd/ombnew.service ~/.config/systemd/user/
# Edit unit: pastikan Environment=PATH memuat NODE_DIR dan ExecStart menunjuk ~/zb/omb-new/start.sh
systemctl --user daemon-reload
systemctl --user enable --now ombnew
sleep 3 && systemctl --user is-active ombnew
curl -s -o /dev/null -w "OMB http: %{http_code}\n" http://127.0.0.1:8799/   # 200

# 2.5 Konfigurasi engine OMB → 9Router
#  Aman: konfigurasi lewat UI OMB (:8799, onboarding), pilih engine "OpenAI-compatible":
#    URL  : http://127.0.0.1:20128/v1
#    Key  : isi NINEROUTER_API_KEY
#  Alternatif headless: set config.json minimal di ~/.openmausbot lalu restart:
python3 - <<'EOF'
import json, os, urllib.request
# ambil key dari env hermes
key=[l.split('=',1)[1].strip() for l in open(os.path.expanduser('~/.hermes/.env')) if l.startswith('NINEROUTER_API_KEY')][0]
p=os.path.expanduser('~/.openmausbot/config.json')
try: c=json.load(open(p))
except Exception: c={}
c.setdefault('openaiCompat', {'key': key, 'url':'http://127.0.0.1:20128/v1'})
c.setdefault('features', {'browser': False})
json.dump(c, open(p,'w'), indent=1)
os.chmod(p, 0o600)
print('config.json siap')
EOF
systemctl --user restart ombnew

# 2.6 Verifikasi end-to-end
journalctl --user -u ombnew -n 20 --no-pager     # tidak ada error fatal
ls ~/.openmausbot/                                # runtime.db, messages.db mulai terbentuk
```

## FASE 3 — omb-relay-bridge (webhook sinkron) [opsional tapi disarankan]

```bash
cp ~/zbmaus-vela/services/relay-bridge.mjs ~/zb/omb-new/
cp ~/zbmaus-vela/systemd/omb-relay-bridge.service ~/.config/systemd/user/
# Bearer untuk ingress OMB: buat dari UI OMB (webhooks) atau:
openssl rand -hex 24 > ~/zb/omb-new/relay-bridge.env   # isi: OMB_WEBHOOK_BEARER=<nilai>
# (aktifkan webhook di UI OMB: buat endpoint, catat id wh_..., samakan bearer)
systemctl --user daemon-reload && systemctl --user enable --now omb-relay-bridge
curl -s http://127.0.0.1:8801/health    # {"ok":true}
```

## FASE 4 — noVNC token-gate [opsional — hanya jika ada kebutuhan remote desktop]

```bash
# butuh noVNC/websockify berjalan di :6080 (instal terpisah bila perlu)
cp ~/zbmaus-vela/services/novnc-gate.mjs ~/zb/omb-new/
openssl rand -hex 24 > ~/zb/omb-new/novnc-gate.env   # isi: GATE_PORT=6081 & GATE_KEY=<nilai>
cp ~/zbmaus-vela/systemd/novnc-gate.service ~/.config/systemd/user/
systemctl --user daemon-reload && systemctl --user enable --now novnc-gate
```

## FASE 5 — Cloudflare Tunnel + domain

```bash
# 5.1 cloudflared terpasang & tunnel dibuat (cloudflared tunnel login/create — butuh auth pemilik domain)
# 5.2 WAJIB: drop-in http2 — TANPA INI request/upload >1–2 MB akan hang/502 (bug QUIC terverifikasi)
sudo mkdir -p /etc/systemd/system/cloudflared.service.d
sudo tee /etc/systemd/system/cloudflared.service.d/override.conf > /dev/null <<'EOF'
[Service]
ExecStart=
ExecStart=/usr/bin/cloudflared --no-autoupdate --protocol http2 tunnel run --token-file /etc/cloudflared/token
EOF
sudo systemctl daemon-reload && sudo systemctl restart cloudflared

# 5.3 Ingress (sesuaikan hostname & domain milikmu) — contoh pola server referensi:
#   zbmaus.<domain>  → http://localhost:8799
#   (opsional) ombrelay.<domain> → http://localhost:8801 ; opencraft.<domain> → http://localhost:6081
# 5.4 Cloudflare dashboard: matikan Bot Fight Mode (mem-block fetch legit dari VPS)
# 5.5 Verifikasi dari luar:
curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" https://<hostname-zbmaus>/
```

## FASE 6 — Bot & finishing

```bash
# 6.1 Linger agar service hidup setelah logout
sudo loginctl enable-linger $USER

# 6.2 Buat bot dari UI OMB (schema lengkap: docs/BOTS.md di repo publik).
#  Praktik: soul spesifik per topik + larangan eksplisit; autoApprove=false; peer-comms nonaktif default.
# 6.3 Jangan commit secrets. Audit sebelum push apa pun ke repo:
grep -rEn "[a-f0-9]{40,}|sk-[A-Za-z0-9]|Bearer [A-Za-z0-9._-]{10,}" ~/zbmaus-vela --include="*" | grep -v example || echo BERSIH
```

## Checklist verifikasi akhir

- [ ] `systemctl --user is-active 9router ombnew` → keduanya `active`
- [ ] `curl 127.0.0.1:20128/v1/models` dengan Bearer key → 200 JSON
- [ ] `curl 127.0.0.1:8799/` → 200 (UI OMB)
- [ ] Chat uji dari UI OMB dijawab bot (engine openaiCompat → 9Router bekerja)
- [ ] `https://<hostname>/` dari luar → 200 via tunnel http2
- [ ] Uji upload/file besar via domain >2 MB tidak hang (bukti http2 aktif)
- [ ] `~/.hermes/.env`, `~/.openmausbot/config.json`, `*.env` semuanya chmod 600
- [ ] Linger aktif

## Aturan keselamatan (WAJIB dipatuhi Hermes di server tujuan)

1. **Kredensial tidak pernah dicetak** ke chat, log, commit, atau screenshot — tampilkan hanya prefix 3 karakter bila perlu konfirmasi.
2. Jangan pernah bind 9Router/OMB ke 0.0.0.0 tanpa autentikasi.
3. Jangan auto-push ke repo GitHub mana pun tanpa persetujuan eksplisit pemilik; audit kebocoran dulu.
4. Jangan upgrade openmausbot melampaui 0.1.130 tanpa pengujian (upstream bergerak cepat).
5. cloudflared WAJIB `--protocol http2` (jangan dihapus drop-in-nya).
6. Jika langkah gagal: hentikan, laporkan error apa adanya, jangan mengarang status sukses.
```
