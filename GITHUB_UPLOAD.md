# Obsidian Futures V6.18.11 — GitHub Ready

Bundle ini sudah dirapikan dan hanya berisi file runtime/deployment yang diperlukan. File versi lama, README historis, snippet, dan file percobaan dihapus agar upload via GitHub tidak melewati batas 100 file.

## Upload ke GitHub
1. Ekstrak ZIP ini.
2. Di repository `Obsidian-futures`, pilih **Add file → Upload files**.
3. Pilih **seluruh isi folder hasil ekstrak**, bukan file ZIP-nya.
4. Commit changes.
5. Vercel akan mengambil perubahan dari repository jika repository sudah terhubung ke Vercel.

## File utama
- `index.html`
- `app-v6.18.11.js`
- `api/index.js`
- `index.js`
- `package.json`
- `vercel.json`
- `manifest.webmanifest`
- `sw.js`
- `icons/*`

Jangan mengunggah `.env` atau API secret ke GitHub. Gunakan Environment Variables di Vercel.
