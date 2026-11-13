# Konfigurasi Bots (bots.json)

Bot didefinisikan di `bots.json` di dalam data dir OMB (`OMB_DATA_DIR`, default `~/.openmausbot`). File ini **runtime — tidak di-commit** (berisi konteks/soul pribadi tiap bot). Repo ini menyediakan skema + contoh di `examples/bots.example.json`.

## Skema per bot (field yang relevan)

| Field | Tipe | Fungsi |
|---|---|---|
| `id` | UUID v4 | identitas bot (jangan diubah setelah dibuat; dirujuk thread & assignment) |
| `name` | string | nama pendek, unik |
| `title` | string | label di UI |
| `description` | string | deskripsi singkat + batasan perilaku |
| `soul` | string (markdown) | **inti kepribadian bot**: peran, invarian, aturan format, larangan. Bagian terpenting — tulis spesifik & punya daftar "tidak boleh" eksplisit |
| `color` | enum | warna avatar (mis. red/blue/green) |
| `modelSelection` | object | `{instanceId, model}` — engine & model dari config `instances` (mis. `openaiCompat` + nama model via 9Router) |
| `notifications` | bool | notifikasi turn |
| `autoApprove` / `approvePeerComms` | bool | gate tindakan & komunikasi antar-bot (default `false` — aman) |
| `mcpServers` | list/null | server MCP khusus bot |
| `tasks`, `resumeCursors`, `threadId`, `soulHash`, `soulDrift` | — | state runtime, dikelola OMB sendiri; jangan tulis manual |

Bot spesial: satu bot dengan `defaultBot: true` berperan chief-of-staff (punya akses `browser`, `computer`, `replyStyle`).

## Contoh bot minimal

Lihat `examples/bots.example.json`:

```json
[
  {
    "id": "<uuid4-baru>",
    "name": "Peneliti",
    "title": "Asisten Riset",
    "description": "Merangkum hasil pencarian, konsisten, ringkas.",
    "soul": "# Peneliti\n\nKamu asisten riset. Aturan:\n- Selalu sebutkan sumber\n- Jangan mengarang angka\n- Jawaban maksimal 300 kata",
    "color": "blue",
    "modelSelection": { "instanceId": "<id-instance-openaiCompat>", "model": "nama-model-dari-9router" },
    "notifications": true,
    "autoApprove": false,
    "approvePeerComms": false,
    "mcpServers": null
  }
]
```

## Cara menambah bot

1. Edit `bots.json` di data dir (OMB juga bisa membuat bot dari UI — lebih aman karena `id`, `soulHash`, thread langsung benar).
2. Restart OMB: `systemctl --user restart ombnew`.
3. `modelSelection.instanceId` harus cocok dengan key di `config.json → instances` (mis. `openaiCompat` → `openai-compat-<uuid>` di config produksi); `model` harus tersedia di 9Router (`curl 127.0.0.1:20128/v1/models`).

## Praktik yang terbukti di instance produksi

- **Soul spesifik > umum**: bot spesialis satu repo/topik dengan daftar larangan eksplisit jauh lebih patuh daripada persona umum.
- `autoApprove: false` untuk semua bot kecuali kamu paham risikonya — ini gerbang tindakan otomatis.
- Hindari data pribadi (NIP, kredensial, path privat) di `soul` bila bot bisa diakses orang lain.
- Peer-comms antar-bot biarkan nonaktif default; aktifkan per pasangan yang memang butuh.
