# Keamanan & Backup

## Prinsip

- **Kredensial tidak pernah masuk git.** Semua key/token hanya di `*.env` (chmod 600) di server, atau secret store pribadimu.
- Semua service listen di **127.0.0.1**; satu-satunya pintu publik adalah Cloudflare Tunnel.
- `novnc-gate` wajib `GATE_KEY` kuat (24+ hex char); tanpa key service menolak semua akses.
- `relay-bridge` hanya menerima path `/hooks/wh_<id>` dan mem-forward dengan Bearer — tanpa Bearer valid, ingress OMB menolak.
- Runtime OMB (`OMB_DATA_DIR`) berisi memory percakapan bot — sensitif; jangan diekspos ke publik.

## Checklist sebelum push ke repo ini

```bash
grep -rEn "[a-f0-9]{64}|api[_-]?key|secret|password|bearer" --include="*" . \
  | grep -viE "example|ganti-dengan|<secret>|docs/"
```
Harus kosong (atau hanya template).

## Backup yang disarankan

- **Runtime** (`$OMB_DATA_DIR`): snapshot berkala (SQLite/DuckDB — aman di-copy saat idle; kalau hidup 24/7, gunakan `sqlite3 .backup` atau backup VPS-level).
- **Repo ini**: setup & config template saja — recoverable penuh dari git.
- Contoh pola di produksi: backup kecil harian + full mingguan split terenkripsi ke cloud drive (keep-3).

## Rotasi

- `GATE_KEY`: rotasi tiap ganti perangkat akses VNC.
- `OMB_WEBHOOK_BEARER`: rotasi jika webhook id pernah bocor di log.
- `NINEROUTER_API_KEY`: ikuti kebijakan provider.
