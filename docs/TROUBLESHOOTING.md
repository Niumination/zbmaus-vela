# Troubleshooting zbmaus-vela

| Gejala | Penyebab | Solusi |
|---|---|---|
| Upload/request besar via domain hang atau 502 Cloudflare (>1–2 MB) | cloudflared jalan QUIC | pasang drop-in `systemd/cloudflared-http2.conf`, restart cloudflared |
| Domain terblock / challenge loop | Cloudflare Bot Fight Mode ON | matikan di dashboard Cloudflare |
| OMB jalan tapi bot tidak menjawab | 9Router mati / key salah | `curl -s 127.0.0.1:20128/v1/models -H "Authorization: Bearer $NINEROUTER_API_KEY"` → harus 200; cek `NINEROUTER_API_KEY` di env omb-serve |
| Fitur *skill review* gagal "Insufficient balance" | kredit akun OpenCode habis | top-up di console OpenCode, atau `features.skillReview=false` di config.json; chat utama tetap normal |
| Relay-bridge balas 202 "timeout waiting for bot reply" | bot lambat >`BRIDGE_WAIT_MS` atau thread belum completed | naikkan `BRIDGE_WAIT_MS`; cek `runtime.db.assignments` status run |
| relay-bridge error buka DB | `OMB_DATA_DIR` salah / DB dikunci | pastikan path benar; bridge membuka `readOnly: true` — jangan hilangkan flag |
| noVNC 401 meski key benar | cookie gate belum ter-set (akses langsung WS) | akses pertama lewat URL `?key=...` agar cookie di-set, lalu WS lolos |
| Service mati setelah logout SSH | linger off | `loginctl enable-linger $USER` |
| OMB OOM / lambat | MemoryHigh 800M terlampaui (peak produksi ~803M) | naikkan `MemoryMax` di unit atau kurangi bot aktif |
| Unit tidak terlihat | user units belum direload | `systemctl --user daemon-reload` |
