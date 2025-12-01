# Kelompok 4 – Fall Detection & Rehab Medic (MediaPipe JS)

Proyek web ini mengintegrasikan dua fitur berbasis MediaPipe untuk pengolahan pose manusia secara real‑time:
- Fall Detection (deteksi jatuh + HELP gesture)
- Rehab Medic (Bicep Curl Counter kiri/kanan)

Proyek ini dibuat untuk memenuhi tugas mata kuliah:
- Mata Kuliah: Workshop Kecerdasan Buatan
- Semester: 5
- Kampus: Politeknik Elektronika Negeri Surabaya (PENS)
- Jurusan: Teknologi Rekayasa Multimedia (TRM) – Semester 5
- Dosen Pengampu: Sritrusta Sukaridhoto, ST., Ph.D.

Kelompok 4:
- Ahmad Nur Fuady (5323600005)
- Armany Rizqullah Saputra (5323600029)
- Rafif Zaidan Nuhaa (5323600013)
- M. Bayu Iskandar (5323600025)

## Demo

- Live demo: https://mediapipefallandhelpdetection.netlify.app  
  Beri izin akses kamera saat diminta oleh browser.
- Demo video penggunaan (Trigger siren Bardi saat jatuh) : https://youtu.be/dThCuthprNU

## Ringkasan Fitur

- Dashboard halaman utama (index.html) dengan dua tombol:
  - Fall Detection: deteksi jatuh, sleeping (ROI ranjang), dan gesture bantuan (arms crossed / raise‑and‑hold) + notifikasi Telegram.
  - Rehab Medic: penghitung repetisi bicep curl kiri dan kanan, menampilkan sudut siku, stage (up/down), dan FPS.

- Implementasi MediaPipe:
  - Fall Detection: Pose Landmarker via `@mediapipe/tasks-vision` (Tasks Vision, `detectForVideo`).
  - Rehab Medic: Pose Landmarker (Tasks Vision) – single preview video, canvas overlay untuk skeleton + HUD (model fixed `pose_landmarker_full`).

- UI/UX:
  - Global stylesheet konsisten: `styles.css`.
  - Panel kontrol sederhana (threshold, smoothing) dan keyboard shortcut.

Catatan:
- Semua fitur (Fall Detection dan Rehab Medic) sudah terintegrasi di `index.html`.

## Cara Menjalankan (Lokal)

1. Clone repo ini.
2. Pastikan akses kamera diizinkan oleh browser.
3. Buka `index.html` langsung (klik dua kali) atau gunakan server lokal (disarankan):
   - VS Code Live Server, atau
   - Node http-server:
     ```bash
     npx http-server -p 8080
     # lalu buka http://localhost:8080
     ```
4. Pilih fitur di dashboard: Fall Detection atau Rehab Medic.
5. Izinkan akses kamera ketika diminta.

Penting:
- Beberapa browser mengharuskan HTTPS atau `localhost` agar `getUserMedia` (kamera) berfungsi.
- Disarankan gunakan Chrome/Edge versi terbaru.

## Fall Detection (Ringkas)

- Stack: MediaPipe Tasks Vision `PoseLandmarker` (`@mediapipe/tasks-vision@0.10.14`).
- Fitur:
  - Deteksi jatuh berdasarkan fitur postur (horizontal torso, posisi di ground, kecepatan tiba‑tiba, inaktivitas).
  - Sleeping gating via ROI (rotated rectangle): ketika postur horizontal berada di area ranjang, dianggap sleeping (aman).
  - HELP gesture:
    - Arms crossed (tangan menyilang di dada) sustained.
    - One-hand raise-and-hold (satu tangan di atas bahu dalam durasi tertentu).
  - Notifikasi Telegram (via proxy Cloudflare Worker atau direct API) dengan cooldown.
- Fitur ini terintegrasi di `index.html`.

## Rehab Medic (Bicep Curl Counter)

- Stack: MediaPipe Tasks Vision `PoseLandmarker` (fixed model: `pose_landmarker_full`).
- Arsitektur:
  - Elemen `<video>` sebagai preview utama.
  - `<canvas>` overlay untuk menggambar skeleton dan HUD (reps, stage, angle, FPS).
  - Loop: `detectForVideo(video, tMs)` sama seperti Fall Detection.
- Logika:
  - Hitung sudut siku kiri dan kanan: angle(shoulder–elbow–wrist).
  - Stage:
    - angle > downThreshold → stage = "down"
    - angle < upThreshold & stage == "down" → reps++ & stage = "up"
  - Smoothing sudut menggunakan EMA (exponential moving average) agar stabil.
- Kontrol (UI):
  - Up Threshold (derajat)
  - Down Threshold (derajat)
  - Min Detection Confidence (slider)
  - Min Tracking Confidence (slider)
  - Angle Smoothing (EMA α)
  - Tombol: Apply, Pause, Reset, Mirror On/Off, Debug On/Off
- Keyboard Shortcut:
  - Space: Pause/Resume
  - R: Reset
  - M: Mirror toggle
  - D: Debug toggle
- Fitur ini terintegrasi di `index.html`.

## Panduan Penggunaan Singkat

1. Buka `index.html`, pilih “Rehab Medic”.
2. Izinkan akses kamera.
3. Atur threshold sesuai kebutuhan:
   - Jika hitungan terlalu cepat, coba naikkan `upThreshold` (misal 40–45) atau turunkan `downThreshold` (misal 150–155).
   - Jika sulit terdeteksi, pastikan siku terlihat jelas di kamera, pencahayaan cukup, dan naikkan smoothing (α 0.40–0.50).
4. Tekan “Apply” setelah mengubah parameter.
5. Gunakan tombol “Mirror” jika arah gerakan terasa terbalik di layar.
6. Lihat panel statistik di sisi kanan (Rehab) atau panel di overlay untuk informasi cepat.

## Catatan Teknis

- Model & Wasm Files:
  - CDN: `@mediapipe/tasks-vision@0.10.14`.
  - Model pose: Google Cloud Storage (pose_landmarker_full/float16/1).

## Lisensi


Proyek ini dibuat untuk keperluan pembelajaran dan tugas akademik. Silakan gunakan/ubah seperlunya untuk kebutuhan non‑komersial dengan mencantumkan atribusi ke penulis dan sumber asli model MediaPipe.
