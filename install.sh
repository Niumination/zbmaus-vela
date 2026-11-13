#!/usr/bin/env bash
# Instalasi zbmaus-vela pada satu VPS. Jalankan dari root repo.
set -euo pipefail
: "${NODE_DIR:?Set NODE_DIR ke folder bin Node.js (mis. $HOME/.local/node-vX/bin)}"
export PATH="$NODE_DIR:$PATH"

command -v node >/dev/null || { echo "node tidak ditemukan di NODE_DIR"; exit 1; }
command -v systemctl >/dev/null || { echo "butuh systemd (user session)"; exit 1; }

echo "==> install openmausbot@0.1.130"
npm install -g openmausbot@0.1.130

echo "==> salin services ke ~/zbmaus"
mkdir -p "$HOME/zbmaus"
cp -r services/. "$HOME/zbmaus/"
cp examples/*.env.example "$HOME/zbmaus/"
chmod 600 "$HOME/zbmaus/"*.env.example

echo "==> pasang unit systemd (user)"
mkdir -p "$HOME/.config/systemd/user"
cp systemd/*.service "$HOME/.config/systemd/user/"
systemctl --user daemon-reload

cat <<'EOF'

Selesai. Langkahmu selanjutnya:
 1. Edit ~/zbmaus/*.env.example -> simpan sebagai *.env (isi key asli, chmod 600)
 2. Edit ~/.config/systemd/user/ombnew.service: sesuaikan NODE_DIR & path start.sh
 3. systemctl --user enable --now 9router novnc-gate omb-relay-bridge ombnew
 4. loginctl enable-linger $USER
 5. Pasang Cloudflare Tunnel + drop-in http2 (systemd/cloudflared-http2.conf)
EOF
