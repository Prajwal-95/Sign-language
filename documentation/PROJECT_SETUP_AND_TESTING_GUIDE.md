# Setup and Testing Guide — ISL-to-Speech

**Project root:** `F:\Final Project`
**Target platform:** Windows 11 (also works on other platforms with the
equivalent commands)
**Every command below was verified on this project.** Commands marked
**[not run]** were read from the source but not executed during the audit.

---

## 1. Prerequisites

| Requirement | Verified version | Notes |
|---|---|---|
| Windows | 11 | — |
| Python | **3.11.9** | Project `.venv` interpreter |
| Node.js | **22.23.1** | Required for `--experimental-strip-types` |
| npm | **10.9.8** | Ships with Node 22 |
| Browser | Chromium-based | Chrome 155 was used for all browser verification |
| Webcam | any `getUserMedia` device | Needed only for live recognition |
| Disk | ~450 MB extra | 416 MB of speech models + ~35 MB of wheel downloads |
| Network | required **once** | MediaPipe CDN + Hugging Face model download |

Python packages present in the project `.venv` **[V]**:

```
fastapi 0.115.6      uvicorn 0.32.1        pydantic 2.10.4
pydantic-settings 2.6.1                    numpy 1.26.4
torch 2.13.0+cpu     scikit-learn 1.5.2   matplotlib 3.9.2
mediapipe 0.10.14    opencv-contrib-python 4.10.0.84
kagglehub 1.0.2      websockets 17.0.1
```

### 1.1 Check your toolchain

```powershell
python --version
node --version
npm --version
```

---

## 2. Repository structure

```
F:\Final Project\
├── backend\                     FastAPI service  → port 8000
│   ├── .env                     configuration (git-ignored)
│   ├── .env.example             template  ⚠ see §5.2
│   ├── requirements.txt         ⚠ incomplete, see §5.3
│   ├── run.bat                  start helper
│   └── app\
├── frontend\                    React app       → port 5173
│   ├── package.json             scripts + dependencies
│   ├── node_modules\            (created by npm install)
│   ├── .env.local               optional config (git-ignored)
│   ├── src\                     application source
│   ├── tests\                   unit tests
│   ├── contrast-check.mjs       accessibility gate
│   └── tools\tts-service\       optional speech service → port 8765
├── ml\                          shared feature/sequence package
├── scripts\                     dataset prep + training
├── models\                      trained artefacts
├── dataset\seq\<SIGN>\          1,407 landmark sequences
└── documentation\               this documentation set
```

---

## 3. Backend setup

### 3.1 Use the existing environment (fastest)

```powershell
cd F:\Final Project
.\.venv\Scripts\Activate.ps1
```

If PowerShell blocks the activation script:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

### 3.2 Create a fresh environment

```powershell
cd F:\Final Project
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install scikit-learn matplotlib websockets
```

> **The last line is required and is missing from `backend/requirements.txt`
> [V].** `torch` is needed at inference time; `scikit-learn`, `matplotlib` and
> `websockets` are needed for training and verification. A clean machine
> following only the requirements file will fail to import `torch`.

### 3.3 Configuration

`backend/run.bat` creates `backend/.env` from `.env.example` on first run
**[S]**. You can also copy it manually:

```powershell
Copy-Item backend\.env.example backend\.env
```

Then **fix the model path** (§5.2):

```ini
MODEL_PATH=../models/word_model.pt
```

Confirm the model exists:

```powershell
Test-Path F:\Final Project\models\word_model.pt
# Expected: True
```

### 3.4 Start the backend

```powershell
cd F:\Final Project\backend
run.bat              # development, with --reload
# or
run.bat prod         # no auto-reload
```

Or directly:

```powershell
cd F:\Final Project\backend
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

> `backend/run.bat` binds `0.0.0.0`, exposing the backend on your LAN. Use
> `127.0.0.1` if you do not want that.

### 3.5 Verify the backend started

```powershell
curl.exe -s http://127.0.0.1:8000/health
```

Expected **[V]**:

```json
{"status":"ok","environment":"development","model_loaded":true,
 "num_classes":20,"seq_len":32,"model_path":"..\\models\\word_model.pt",
 "version":"0.3.0"}
```

Other checks:

```powershell
curl.exe -s http://127.0.0.1:8000/            # service banner
curl.exe -s http://127.0.0.1:8000/api/vocab   # 20 class names
curl.exe -s -o NUL -w "%{http_code}" http://127.0.0.1:8000/docs   # 200
```

---

## 4. Frontend setup

### 4.1 Install dependencies

```powershell
cd F:\Final Project\frontend
npm install
```

### 4.2 Optional configuration

```powershell
Copy-Item .env.example .env.local
```

Both variables are optional. Leave them empty to use the defaults. Never put
secrets in a `VITE_*` variable — they are inlined into the public bundle **[S]**.

### 4.3 Start the dev server

```powershell
cd F:\Final Project\frontend
npm run dev
```

Open **http://localhost:5173**. `vite.config.ts` sets `server.host: true`, so
the server is also reachable on your LAN address for phone testing **[S]**.

### 4.4 Verify the frontend started

- The Home page renders with the header, hero and pipeline sections.
- Navigating to `/translator` shows the camera panel with the status strip
  reading **"Camera off"** and the effect selector defaulting to **Off**.

---

## 5. Known setup traps

### 5.1 The trained model must be present

```
models\word_model.pt    853.36 KB   ← required
models\word_classes.json
```

If `/health` reports `model_loaded: false`, train it:

```powershell
cd F:\Final Project
.\.venv\Scripts\Activate.ps1
python scripts\prepare_word_dataset.py --source "<video dataset root>" --seq-len 32 --workers 4
python scripts\train_lstm.py --seq-len 32 --hidden 128 --epochs 60
```

**[not run]** — this writes to `models/` and `dataset/`.

### 5.2 `backend/.env.example` has the wrong model path

The example ships `MODEL_PATH=../models/model.pkl`, but the real checkpoint is
`models/word_model.pt` **[V]**. The live `backend/.env` on this machine is
already correct; a newly generated one will not be. Fix it manually.

### 5.3 `backend/requirements.txt` is incomplete

Missing `torch`, `scikit-learn`, `matplotlib`, `websockets` **[V]**. See §3.2.

### 5.4 MediaPipe downloads on first use

The first run of `/translator` fetches the MediaPipe WASM runtime and the
hand-landmark and face models from `cdn.jsdelivr.net` and
`storage.googleapis.com` **[S]**. Without a network connection this fails with
*"Could not load the hand-tracking model. Check your internet connection"*.

The portrait segmenter downloads its 0.24 MB model on first use of the effect.

---

## 6. Local speech service (Hindi and Kannada)

Windows 11 installs **no Hindi and no Kannada speech voice** — only `en-US` was
found in SAPI and OneCore **[V]**. Chrome supplies an online Hindi voice but
**zero** Kannada voices **[V]**. Without this service, Kannada cannot be spoken
at all.

### 6.1 One-time install

```powershell
cd F:\Final Project\frontend\tools\tts-service
install.bat
```

`install.bat` performs three steps **[S]**:

1. Creates `tools\tts-service\.venv`
2. Installs CPU PyTorch + `fastapi`, `uvicorn`, `transformers`, `numpy`
3. Runs `download_models.py` to cache the voice models into `tools\tts-service\models\`

Expect roughly 200 MB of wheels plus ~416 MB of cached models **[V]**.
`install.bat` prints "~290 MB"; the measured cache on this machine is larger.

### 6.2 Start the service

```powershell
cd F:\Final Project\frontend\tools\tts-service
run.bat
```

**Leave the window open.** Closing it puts Hindi and Kannada speech back into
the "service offline" state in the app **[S]**.

The startup banner reads:
`ISL local speech service — Health check: http://127.0.0.1:8765/health`

### 6.3 Verify the service

```powershell
curl.exe -s http://127.0.0.1:8765/health
```

The response reports `ok` plus an `engines` map for `en`, `hi` and `kn` **[S]**.

Synthesise a real clip:

```powershell
curl.exe -s -o test.wav -X POST http://127.0.0.1:8765/speak `
  -H "Content-Type: application/json" `
  -d '{"text":"\u0c8e\u0cae\u0cb8\u0ccd\u0c95\u0cbe\u0cb0","lang":"kn"}'
```

Then check the file is a real WAV (it should be a few tens of kilobytes, not
zero bytes):

```powershell
(Get-Item test.wav).Length
```

> The `\uXXXX` escapes above avoid depending on the console code page.

### 6.4 Configuration

`service.py` reads **[S]**:

| Variable | Default | Purpose |
|---|---|---|
| `TTS_HOST` | `127.0.0.1` | Bind address |
| `TTS_PORT` | `8765` | Bind port |
| `TTS_ALLOWED_ORIGINS` | empty | Extra allowed browser origins, comma-separated |
| `HF_HUB_OFFLINE` | unset | Set to `1` to force cached-only model use |

The service binds loopback only **and** rejects any non-loopback `Origin` header
with `403 origin not allowed` — verified **[V]**.

### 6.5 Optional alternate engines

`tts_engines.py` auto-detects **[S]**:

| Engine | Hindi | Kannada | Verdict |
|---|---|---|---|
| `facebook/mms-tts-{hin,kan,eng}` | yes | yes | **default** — the only option with both |
| Piper | `hi_IN` | **none** | better Hindi, unusable for Kannada |
| eSpeak NG | yes | yes | always available, formant quality, no download |

---

## 7. Running the complete application

Three terminals:

```powershell
# 1 — backend
cd F:\Final Project\backend
uvicorn app.main:app --host 127.0.0.1 --port 8000

# 2 — frontend
cd F:\Final Project\frontend
npm run dev

# 3 — speech service (optional; required for Kannada)
cd F:\Final Project\frontend\tools\tts-service
run.bat
```

Then open **http://localhost:5173/translator**, press **Start**, grant camera
permission, and sign.

### 7.1 Startup checklist

| Check | How | Expected |
|---|---|---|
| Backend up | `curl http://127.0.0.1:8000/health` | `model_loaded: true` |
| Frontend up | open http://localhost:5173 | Home page renders |
| Camera | Translator status strip | "Camera ready" |
| Model loaded | status strip | "Recognition active" |
| Backend connected | status strip | "Backend connected" |
| Speech service | `curl http://127.0.0.1:8765/health` | `ok: true` |
| Speech available | Controls card | no red speech banner |

---

## 8. Testing commands

### 8.1 Frontend unit tests

```powershell
cd F:\Final Project\frontend
npm test
```

Latest verified result **[V]**:

```
# tests 171
# suites 40
# pass 171
# fail 0
# duration_ms 8550.1316
```

The runner is Node's built-in test runner — `node --experimental-strip-types
--test tests/*.test.ts`. No jsdom and no test framework dependency.

### 8.2 Type checking

```powershell
npm run typecheck          # tsc --noEmit
```

Latest verified result **[V]**: exit code 0.

### 8.3 Production build

```powershell
npm run build              # tsc && vite build
```

Latest verified result **[V]**:

```
dist/index.html                 1.68 kB │ gzip:   0.89 kB
dist/assets/index-*.css        46.63 kB │ gzip:  10.08 kB
dist/assets/index-*.js        427.04 kB │ gzip: 133.30 kB
✓ built in 4.73s
```

Preview the built output:

```powershell
npm run preview               # http://localhost:4173
```

### 8.4 Accessibility contrast audit

```powershell
npm run check:contrast
```

Latest verified result **[V]**: `ALL CHECKS PASS`.

### 8.5 Speech service tests

```powershell
cd F:\Final Project\frontend\tools\tts-service
.\.venv\Scripts\python.exe -m unittest test_service -v
```

Latest verified result **[V]**: **14 tests, OK**. Covers the engine registry,
`model_present()`, per-language load locks and WAV encoding.

### 8.6 Backend tests

```powershell
cd F:\Final Project
.\.venv\Scripts\python.exe -m unittest discover -s backend\tests -t .
```

Latest verified result **[V]**: **`backend/tests/` contains only `__init__.py`,
so this discovers 0 tests.** There is no backend automated test suite.

### 8.7 Model verification (no service needed)

```powershell
cd F:\Final Project
.\.venv\Scripts\python.exe -c "import torch; c=torch.load('models/word_model.pt',map_location='cpu',weights_only=False); print({k:v for k,v in c.items() if k!='state_dict'})"
```

Expected **[V]**: `classes` (20 entries), `seq_len=32`, `input_size=128`,
`hidden=128`, `n_classes=20`.

### 8.8 Dataset verification

```powershell
.\.venv\Scripts\python.exe -c "import glob,numpy as np; fs=glob.glob('dataset/seq/*/*.npz'); print(len(fs), np.load(fs[0])['seq'].shape)"
```

Expected **[V]**: `1407 (32, 128)`.

---

## 9. Manual test procedure

Automated tests cannot cover a camera, so these steps are necessary.

### 9.1 Recognition

1. Open `/translator`, press **Start**, allow camera access.
2. Confirm "Camera ready" and "Recognition active".
3. Perform a sign, then **lower your hand** — the classification happens at the
   hand-lowering gesture, not while the sign is in progress.
4. Expect the sign card to fill and the sentence to grow by one word.
5. Press **Speak**. Expect audio in the selected language.

### 9.2 Language switching

1. Build a sentence with at least two signs.
2. Switch English → Hindi → Kannada → English.
3. Expect the **entire sentence** to re-render each time. If any part stays in
   the previous language, the sign-ID-first design has been broken.

### 9.3 Speech fallback

1. Close the speech-service window.
2. Wait ~5 seconds, then press **Speak** with Kannada selected.
3. Expect a specific "service offline" message with a start-instructions hint —
   **not** a generic warning.
4. Reopen the service. Within ~5 seconds the app should recover **without a page
   reload** (the controller re-probes every 4 s) **[V]**.

### 9.4 Portrait effects

1. Set the effect selector to **Portrait Blur**; drag the slider.
2. Confirm: the person stays sharp, the background softens, and the edge is
   feathered rather than hard-cut.
3. Confirm the **hand skeleton still tracks correctly** — it must be unaffected.
4. Set to **Remove Background**; confirm a uniform dark backdrop.
5. Set to **Off**; confirm the raw camera feed and no overlay canvas.
6. Stop the camera and confirm the segmentation model is released.

### 9.5 Calibration

1. Expand the sample collector, choose a sign, record.
2. Confirm `GET /api/sample-counts` increases for that sign.

> Calibration writes into `dataset/seq/`. **[not run]** during the audit.

### 9.6 Accessibility

1. Enable **high contrast** in Settings; reload.
2. Confirm no theme flash and that all text remains legible.
3. Tab through the translator controls; confirm a visible focus ring on each.
4. Run `npm run check:contrast`.

---

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `/health` shows `model_loaded: false` | `MODEL_PATH` wrong or file missing | Check `backend\.env` → `MODEL_PATH=../models/word_model.pt`; `Test-Path models\word_model.pt` |
| `ModuleNotFoundError: torch` | Incomplete requirements | `pip install torch --index-url https://download.pytorch.org/whl/cpu` |
| Backend exits at import | Wrong working directory | Must be started from `backend\`, or with `--app-dir` |
| "Could not load the hand-tracking model" | No network on first load | Connect once; the WASM and models are then browser-cached |
| "Permission denied" | Camera blocked | Click the padlock in the address bar → allow camera; reload |
| "Camera in use" / `NotReadableError` | Another app holds the device | Close Teams/Zoom/Meet; retry |
| "No camera found" | No device / blocked by policy | Check Device Manager; test in another browser |
| Backend offline, overlay still works | Backend down or wrong `ALLOWED_ORIGINS` | `curl /health`; add your origin to `ALLOWED_ORIGINS` |
| "Backend disconnected" after a network blip | **There is no auto-reconnect** | Press **Stop**, then **Start** |
| Wrong signs predicted | Gestures too similar, or low confidence | Improve lighting; keep both hands in frame; lower the hand decisively to end each sign |
| No signs ever detected | Buffer never reaches 12 usable frames | Keep the hand visible longer; improve lighting |
| Same sign repeats | Cooldown or track switch | 700 ms cooldown is intentional; press **Undo** |
| Kannada is silent | Speech service not running | `run.bat`; confirm `curl http://127.0.0.1:8765/health` |
| "Service offline" even though it runs | Origin rejected, or wrong port | The service binds `127.0.0.1`; check `TTS_PORT` and `VITE_LOCAL_TTS_URL` |
| "No voice for this language" | Browser has no voice and the service is down | Start the service; the app will not misuse an English voice for Kannada |
| "Press Speak once more" | The browser blocked autoplay `play()` | Interact with the page, then press Speak again |
| Portrait effect greyed out | Camera not active | Start the camera first |
| "Portrait model unavailable" | Segmenter download failed | Check network; retry |
| Segmentation looks bad / flickering | Poor lighting or fast movement | Better lighting; the EMA already smooths; hair edges are the known weak case |
| Effect isolates the wrong person | `selfie_segmenter` follows the most prominent person | **Known limitation** — it cannot prefer the most central person |
| Slow / stuttering | All inference is on the main thread | Close other tabs; use the Off effect; expect more on low-end hardware |
| `npm run build` type errors | A type regression | `npm run typecheck` for the full list |
| Port 8000 / 5173 / 8765 already in use | Another process | `netstat -ano \| findstr :8000`; change `PORT` or stop the process |

---

## 11. Retraining

```powershell
cd F:\Final Project
.\.venv\Scripts\Activate.ps1

# 1. Convert video -> sequences
python scripts\prepare_word_dataset.py --source "<video dataset root>" --seq-len 32 --workers 4

# 2. Train
python scripts\train_lstm.py --seq-len 32 --hidden 128 --epochs 60

# 3. Optionally enable augmentation
python scripts\train_lstm.py --augment

# 4. Restart the backend so the new checkpoint loads
```

**[not run]** during this audit — these commands overwrite `models/`.

Artefacts written: `word_model.pt`, `word_classes.json`, `word_metrics.json`,
`word_confusion_matrix.png`.

> `word_metrics.json` does **not** record the seed, flags, epoch count or
> hardware used. Adding that would make results reproducible — see the report's
> future-work table, item P1.

---

## 12. Command quick reference

```powershell
# ---- backend ----
cd F:\Final Project\backend
run.bat
curl.exe -s http://127.0.0.1:8000/health

# ---- frontend ----
cd F:\Final Project\frontend
npm install
npm run dev
npm test                 # 171 tests
npm run typecheck        # exit 0
npm run build            # 427.04 kB / 133.30 kB gzip
npm run check:contrast   # ALL CHECKS PASS
npm run preview

# ---- speech service ----
cd F:\Final Project\frontend\tools\tts-service
install.bat              # once
run.bat                  # leave open
curl.exe -s http://127.0.0.1:8765/health
.\.venv\Scripts\python.exe -m unittest test_service

# ---- training (optional) ----
cd F:\Final Project
.\.venv\Scripts\Activate.ps1
python scripts\prepare_word_dataset.py --source "<root>" --seq-len 32 --workers 4
python scripts\train_lstm.py --seq-len 32 --hidden 128 --epochs 60
```