# Technical Documentation — ISL-to-Speech

**Project root:** `F:\Final Project`
**Purpose:** implementation-level reference. The academic report
(`PROJECT_COMPLETE_REPORT.md`) explains *why* the system is designed this way;
this document explains *what each file does*, in enough detail to maintain,
extend or debug it.

**Evidence labels** used inline: `[S]` read from source · `[B]` verified against
the running service · `[A]` read from an artefact of an earlier run ·
`[?]` not verified.

---

## 1. Repository map

```
F:\Final Project\
├── backend/                     FastAPI recognition service
├── ml/                          shared feature / sequence / vocabulary package
├── scripts/                     dataset preparation + training scripts
├── models/                      trained artefacts (.pt, .json, .png)
├── dataset/                     landmark sequences (.npz)
├── docs/                        EMPTY
├── notebooks/                   EMPTY
├── documentation/               these deliverables
├── .venv/                       project Python environment
├── .gitignore
└── "run commands"               plain-text service start notes
```

There is **no README at the project root** `[A]`. The only Markdown file that
existed in the repository before this audit was
`frontend/tools/tts-service/README.md` `[A]`.

### 1.1 Directory purposes

| Directory | Purpose | Populated? |
|---|---|---|
| `backend/app/api` | HTTP + WebSocket routers | yes |
| `backend/app/core` | Pydantic settings | yes |
| `backend/app/services` | `WordRecognizer`, `PredictSession` | yes |
| `backend/tests` | backend tests | **only `__init__.py`** `[A]` |
| `ml` | feature extraction, sequences, split, vocabulary, landmarks | yes |
| `scripts` | dataset prep and model training | yes |
| `models` | `word_model.pt`, `word_classes.json`, `word_metrics.json`, confusion matrix PNG | yes |
| `dataset/seq` | 1,407 `(32,128)` sequences `[B]` | yes |
| `dataset/processed` | legacy output dir | **empty** `[A]` |
| `dataset/raw` | legacy frame-level samples | **does not exist** `[A]` |
| `docs` | — | **empty** `[A]` |
| `notebooks` | — | **empty** `[A]` |

---

## 2. Backend module reference

### 2.1 `backend/app/main.py`

Application factory. Responsibilities, in order:

1. Configures `logging` from `settings.LOG_LEVEL`, logger name `isl-app`.
2. `lifespan` handler constructs `WordRecognizer(model_path, confidence_threshold)`
   and stores it on `app.state.recognizer`. If the model cannot load it logs a
   warning and continues — **it does not raise** `[S]`.
3. Registers `CORSMiddleware` with `settings.allowed_origins_list`,
   `allow_credentials=True`, all methods, all headers `[S]`.
4. Includes `ws_router` and `record_router`.
5. Declares `GET /` (service banner) and `GET /health` `[S]`.

`GET /health` is the frontend's liveness probe. It answers even when the model
failed to load — it reports that fact rather than erroring `[S]`.

### 2.2 `backend/app/core/config.py`

```python
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=<backend>/.env, case_sensitive=False, extra="ignore")
    HOST, PORT, ENVIRONMENT, LOG_LEVEL, ALLOWED_ORIGINS
    MODEL_PATH, FEATURES_PATH, CONFIDENCE_THRESHOLD
    DATASET_RAW_PATH, DATASET_PROCESSED_PATH
```

`allowed_origins_list` is a property that splits `ALLOWED_ORIGINS` on commas and
trims whitespace `[S]`.

> `FEATURES_PATH` is configured but **never read** by any code path `[S]`. It is
> a leftover from an earlier feature-vector (scikit-learn) design.

### 2.3 `backend/app/services/recognizer.py`

Two classes.

**`WordRecognizer`** — process-wide singleton.

| Method | Behaviour |
|---|---|
| `available` | True once `load()` succeeded |
| `load()` | Reads `word_classes.json`, rebuilds `SignGRU` from the checkpoint metadata, `load_state_dict`, `.eval()` |
| `_predict_seq(seq)` | `(L,128) float32` → tensor `(1,L,128)` → forward under `no_grad` → softmax → argmax |

Model construction imports the class from the training script
(`from scripts.train_lstm import SignGRU`) so the architecture cannot drift
between training and serving `[S]`.

**`PredictSession`** — one per WebSocket connection.

Constants read from the source `[S]`:

| Constant | Value | Meaning |
|---|---|---|
| `MIN_FRAMES` | 12 | minimum usable frames to attempt a prediction |
| `MAX_BUFFER` | 90 | buffer cap (~3 s at 30 fps) |
| `EMPTY_FRAMES_TO_END` | 6 | consecutive hand-absent frames = sign boundary |

`feed(hands)` logic `[S]`:

1. If no hands → increment the empty counter. On reaching 6, if the buffer holds
   ≥ 12 frames, resample to 32, predict, and **clear the buffer**.
2. If hands → reset the empty counter, extract 128-d features, append.
3. Return `{"sign", "confidence", "accepted", "ready", "num_hands", "progress"}`.
4. `progress` = `len(buffer) / 32`, clamped, so the client can show fill state.
5. `ready` is True only on the boundary prediction.
6. If the argmax class is `STILL`, return `sign=None, confidence=0.0,
   accepted=False` — the pause token never becomes a word `[B]`.
7. `accepted` additionally requires `confidence >= CONFIDENCE_THRESHOLD` `[B]`.

### 2.4 `backend/app/api/ws.py`

Route `WS /ws/predict` `[S]`:

- Accepts the socket, then checks `app.state.recognizer`.
- If unavailable, sends `{"error": "model_not_loaded", "message": ...}` and
  closes with code 1011 `[S]`.
- Message handling: `{"type":"ping"}` → `{"type":"pong"}`;
  `{"type":"reset"}` → `{"type":"reset_ok"}`; anything else is parsed as a frame.
- Unparseable JSON → `{"error":"bad_json"}` and the loop continues `[B]`.
- Prediction exceptions are caught and returned as
  `{"sign": null, ..., "error": "..."}` `[S]`.
- `WebSocketDisconnect` exits the loop cleanly `[S]`.

### 2.5 `backend/app/api/record.py`

Pydantic models `HandIn`, `FrameIn`, `RecordSampleIn` `[S]`.

| Route | Behaviour |
|---|---|
| `GET /api/vocab` | `{"vocab": ISL_VOCAB}` |
| `POST /api/record-sample` | Validates `sign` against the vocabulary, builds the same 128-d features via `extract_two_hand_features`, resamples to 32, writes `dataset/seq/<SIGN>/user_<index>.npz` with `source='user'` and a timestamp |
| `GET /api/sample-counts` | Counts `user_*.npz` per sign |

Path-traversal safety: the sign is checked against the fixed vocabulary list
**before** being joined into a path `[S]`.

> `POST /api/record-sample` mutates the dataset. It was **not** executed during
> this audit, to avoid modifying project data `[S]`.

---

## 3. Shared ML package (`ml/`)

### 3.1 `ml/features.py`

```python
WRIST_IDX = 0
MIDDLE_MCP_IDX = 9
```

- `select_primary_hand(hands)` — prefers MediaPipe's `"Right"` label, else the
  highest `handedness_score`; single-hand input passes through `[S]`.
- `normalize_landmarks(landmarks)` — subtracts the wrist, divides by
  `‖landmark[9] − wrist‖`; falls back to the mean wrist distance if that is
  degenerate (< 1e-6) `[S]`.
- `extract_features(...)` → **64-d**: 21 × 3 + 1 handedness bit `[S]`.
- `extract_two_hand_features(...)` → **128-d**: left-hand 64 ‖ right-hand 64.
  An absent hand contributes 64 zeros `[B]`.

This module is imported by **both** `scripts/prepare_word_dataset.py` and the
live backend, so the training and inference feature formats cannot diverge
`[S]`.

### 3.2 `ml/sequences.py`

- `video_to_sequence(extractor, video_path, seq_len=32, min_confidence=0.5,
  min_hand_frames=10, frame_step=1)` — decodes with OpenCV, drops frames without
  a confident hand, then resamples `[S]`.
- `resample_features(features, seq_len)` — `linspace` sampling when *T* ≥ *L*;
  symmetric edge repetition when *T* < *L* `[S]`.
- Training-only augmentation helpers (jitter σ 0.02, ±3-frame shift, 70–100 %
  temporal crop, 50 % horizontal mirror with the handedness bit flipped) `[S]`.

### 3.3 `ml/dataset_seq.py`

- `load_sequences(seq_dir, vocab)` → `(X, y, labels, seq_len)` `[S]`.
- `split_sequences(X, y, test=0.15, val=0.15, seed=42)` — stratified at the
  **sequence** level; the validation split is taken from the remaining pool with
  seed 43 `[S]`.

### 3.4 `ml/vocabulary.py`

The 20-entry `ISL_VOCAB` list, plus the dataset-attribution comment. This is the
authoritative class order; `models/word_classes.json` must match `[S]`.

### 3.5 `ml/landmarks.py`

The single source of truth for MediaPipe hand-landmark extraction used by
dataset preparation. `NUM_LANDMARKS = 21`, `LANDMARK_DIMS = 3`, and the named
`LANDMARK_NAMES` list in MediaPipe's canonical order `[S]`.

### 3.6 `ml/dataset.py`

Legacy frame-level loader for the retired scikit-learn pipeline. **Not used by
the shipped GRU path** `[S]`.

---

## 4. Scripts

| Script | Purpose | Used by the shipped system? |
|---|---|---|
| `scripts/prepare_word_dataset.py` | Video dataset → `(32,128)` `.npz` sequences; `ProcessPoolExecutor`; resumable | Yes, offline |
| `scripts/collect_dataset.py` | Webcam landmark collection | Superseded by `POST /api/record-sample` |
| `scripts/train_lstm.py` | Defines `SignGRU`, trains, evaluates, writes all four artefacts | Yes — **and imported at inference time** |
| `scripts/train_model.py` | Legacy scikit-learn classifier on 64-d features | **No** — vestigial |
| `scripts/demo_landmarks.py` | Sanity-check landmark extraction on a video | Diagnostic |
| `scripts/prepare_dataset.py` | Legacy frame-level preparation | **No** |

`scripts/train_lstm.py` CLI `[S]`:

```
--seq-len 32  --hidden 128  --epochs 60  --batch 16  --lr 1e-3
--test 0.15   --val 0.15     --seed 42   --augment (off by default)
```

Artefacts written: `word_model.pt`, `word_classes.json`, `word_metrics.json`,
`word_confusion_matrix.png` `[S]`.

---

## 5. Model and dataset inventory

### 5.1 Model files (verified sizes)

| File | Size | Contents |
|---|---|---|
| `models/word_model.pt` | **853.36 KB** | `state_dict`, `classes`, `seq_len=32`, `input_size=128`, `hidden=128`, `n_classes=20` |
| `models/word_classes.json` | 0.33 KB | Class order + `seq_len` |
| `models/word_metrics.json` | 2.10 KB | Metrics from an earlier run `[A]` |
| `models/word_confusion_matrix.png` | 72.36 KB | Test-set confusion matrix `[A]` |

Checkpoint `state_dict` shapes `[B]`:

```
gru.weight_ih_l0  (384, 128)   gru.weight_hh_l0  (384, 128)
gru.bias_ih_l0    (384,)        gru.bias_hh_l0    (384,)
gru.weight_ih_l1  (384, 128)   gru.weight_hh_l1  (384, 128)
gru.bias_ih_l1    (384,)        gru.bias_hh_l1    (384,)
classifier.0.weight (128, 128)  classifier.0.bias   (128,)
classifier.3.weight  (20, 128)  classifier.3.bias    (20,)
total parameters: 217,236
```

### 5.2 Dataset inventory

**1,407** files under `dataset/seq/<SIGN>/`, every one exactly `(32, 128)`
`float32`, 17.5 MB total `[B]`.

| Class | Files | | Class | Files |
|---|---|---|---|---|
| HELLO | 92 | | CLEAN | 72 |
| GOOD_AFTERNOON | 81 | | POUR | 72 |
| BREAK | 71 | | COOK | 72 |
| CRY | 71 | | MAYBE | 70 |
| DRINK | 71 | | COME | 70 |
| GOOD_MORNING | 71 | | GIVE | 70 |
| JUMP | 71 | | KEY | 70 |
| TEA | 71 | | WIFE | 70 |
| THANK_YOU | 71 | | CLOSE | 70 |
| WHAT_IS_YOUR_NAME | 71 | | **STILL** | **30** |

Composition `[B]`: **1,170** dataset-derived + **237** user-recorded
(`source='user'`), independently confirmed by the live `/api/sample-counts`.

Sequence value range observed: `−1.988 … 2.135` `[B]`.

### 5.3 Speech model files (measured on disk)

| Checkpoint | Size |
|---|---|
| `facebook/mms-tts-hin` | 138.5 MB |
| `facebook/mms-tts-kan` | 138.5 MB |
| `facebook/mms-tts-eng` | 138.5 MB |
| **Total** | **~416 MB** |

Cache location: `frontend/tools/tts-service/models/` `[V]`.

### 5.4 Licences

| Component | Licence | Evidence |
|---|---|---|
| MMS TTS checkpoints | **CC-BY-NC-4.0** — free, **non-commercial** | verified from model metadata `[V]` |
| Source ISL video dataset | asserted "MIT" in `ml/vocabulary.py:3` comment only | **no licence file in repo** `[?]` |

---

## 6. Frontend module reference

### 6.1 Entry and routing

`src/main.tsx` — applies persisted high-contrast **before first paint**, then
renders `<StrictMode><BrowserRouter><App/></BrowserRouter></StrictMode>`. Throws
if `#root` is missing `[S]`.

`src/App.tsx` — shell: skip link → backdrop → `ScrollToTopOnNavigate` → `Header`
→ `<main id="main-content">` → `Footer` `[S]`.

Routes `[S]`:

| Path | Component |
|---|---|
| `/` | `pages/Home.tsx` |
| `/translator` | `pages/Translator.tsx` |
| `/how-it-works` | `pages/HowItWorks.tsx` |
| `/about` | `pages/About.tsx` |
| `/dataset` | `pages/Dataset.tsx` |
| `/settings` | `pages/Settings.tsx` |
| `*` | `components/NotFoundPage.tsx` |

### 6.2 Pages

| File | Purpose |
|---|---|
| `Home.tsx` | 0.7 KB — assembles the seven `components/home/*` sections |
| **`Translator.tsx`** | 17.3 KB — **the only stateful page**; wires all three hooks and the canvas stack |
| `HowItWorks.tsx` | Explains the pipeline |
| `About.tsx` | Project background |
| `Dataset.tsx` | Vocabulary + live sample counts via `/api/sample-counts` |
| `Settings.tsx` | Rate, pitch, voice, confidence, auto-speak, high-contrast, backend settings |

### 6.3 Component inventory

| File | Responsibility | Key props |
|---|---|---|
| `components/HandOverlay.tsx` | Canvas drawing the 21-point skeleton | `landmarksRef`, `videoRef` |
| `components/HandSkeleton.tsx` | Pure bone/finger colour definitions | — |
| `components/PrimaryUserDebugOverlay.tsx` | Face boxes, torso region, hand association lines | `primaryUserResult`, `videoRef` |
| `components/SampleCollector.tsx` | Calibration recorder (`TARGET_FRAMES = 40`, `MIN_FRAMES = 14`) `[S]` | `collectHandsRef` |
| `components/NotFoundPage.tsx` | 404 | — |
| `layout/Header.tsx`, `Footer.tsx`, `Brand.tsx` | Navigation and branding | — |
| `home/*.tsx` (7 files) | Marketing/explanatory sections | — |
| `translator/CameraPanel.tsx` | 4:3 camera frame + status strip; hosts the canvas stack | many |
| `translator/DetectedSignCard.tsx` | Last accepted sign + confidence meter | `detectedSign`, `confidence` |
| `translator/TranslationCard.tsx` | Sentence output + language `<select>` | `sentence`, `language`, `setLanguage` |
| `translator/ControlsCard.tsx` | Speak/Stop/Space/Undo/Clear, auto-speak, speech errors | — |
| `translator/PortraitCanvas.tsx` | The portrait overlay `<canvas>` | `ref`, `mode` |
| `translator/PortraitControls.tsx` | Effect `<select>` + blur slider | `mode`, `setMode`, `intensity` |
| `ui/*.tsx` (10 files) | `Button`, `Callout`, `Card`, `ConfirmDialog`, `EmptyState`, `Form`, `Icon`, `PageHeader`, `StatusPill` | — |

### 6.4 Hooks

**`useWebcam.ts`** — owns the single `MediaStream`.

- Request: `{ audio: false, video: { facingMode: 'user', width: {ideal:640},
  height: {ideal:480} } }` `[S]`.
- `CameraStatus`: `idle | requesting | active | denied | unavailable | error`.
- Error mapping `[S]`: `NotAllowedError` → `denied`; `NotFoundError` /
  `OverconstrainedError` → `unavailable`; `NotReadableError` → `error`.
- `stop()` stops **every** track and nulls `srcObject` `[S]`.
- The `<video>` element only mounts once status is `active`, so the stream is
  attached in a follow-up effect `[S]`.

**`useSignRecognition.ts`** (13.8 KB) — the recognition engine hook.

Owns: `HandLandmarker`, `FaceDetector`, `PredictSocket`, the rAF loop and the
sign buffer.

Constants `[S]`:

| Constant | Value |
|---|---|
| `WASM_URL` | `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm` |
| `LANDMARKER_URL` | `…/hand_landmarker/float16/1/hand_landmarker.task` |
| face model | `…/blaze_face_short_range/float16/1/blaze_face_short_range.tflite` |
| `COOLDOWN_MS` | 700 |
| `SEND_EVERY` | 1 — **the inline comment says "every 2nd frame", which is stale** |

Model options `[S]`: `runningMode: 'VIDEO'`, `numHands: 2`, `delegate: 'CPU'`;
face detector `minDetectionConfidence: 0.5`, `minSuppressionThreshold: 0.3`.

Per-frame sequence in `loop()` `[S]`:

1. Guard `video.readyState >= 2 && video.videoWidth > 0`.
2. `lm.detectForVideo(video, performance.now())`.
3. Build `allHands`; store **all** hands in `landmarksRef` for drawing.
4. `await primaryUserTracker.processFrame(fd, video, allHands, ts)`.
5. If the tracker switched primary user, `socket.sendReset()` — so a sequence is
   never a mix of two people `[S]`.
6. `socket.sendFrame(primaryHands)` — **only the primary user's hands** `[S]`.
7. `collectHandsRef.current?.(primaryHands)` for the calibration recorder.

Prediction handling `onPrediction` `[S]`:

- Ignores anything when `runningRef` is false, or when `pred.error` is set.
- Accepts only `pred.accepted && pred.sign` — i.e. **only at a sign boundary**.
- Guards: same sign as last accepted → ignore; within `COOLDOWN_MS` → ignore.
- Stores the **class ID**, never text; the displayed word is derived on render.
- Auto-speak uses `speechPlanForSign` and a `dedupeKey` of
  `` `${language}:${signId}` `` `[S]`.

**Stale-closure fix.** `PredictSocket` stores its callback permanently, so the
socket is built with `createLatestHandler(onPrediction)` — a stable dispatcher
that forwards to the newest handler. Without it, changing the output language
mid-session would keep speaking English `[S]`. This is documented in
`services/latestHandler.ts` and is covered by `tests/languagePipeline.test.ts`.

**`useSpeech.ts`** — binds `ttsController` to React; exposes phase, provider,
per-language availability, error, `retry()`.

**`useAppSettings.ts`** / `lib/settings.ts` — persists `AppSettings` under
`isl-settings`, broadcasts `isl-settings-changed`, applies `data-theme` on
`<html>`.

`DEFAULT_SETTINGS` `[S]`: `rate: 1`, `pitch: 1`, `highContrast: false`,
`autoSpeak: false`, `confidenceThreshold: 0.5`, `voice: 'auto'`.

> `confidenceThreshold` (default **0.5**) is a client-side display setting. The
> value that actually gates acceptance is the backend's
> `CONFIDENCE_THRESHOLD = 0.60` `[B]`. The Settings page is honest about this.

**`useOutputLanguage.ts`** — `isl-output-language` persistence +
`isl-language-changed` `CustomEvent` for same-tab subscribers `[S]`.

**`usePortraitEffect.ts`** (5.1 KB) — binds `PortraitRenderer` to React,
persists mode + intensity to localStorage, calls `releasePortraitSegmenter()` on
unmount `[S]`.

### 6.5 Services

**`api.ts`** — `API_BASE` resolution order `[S]`:

1. `VITE_API_BASE_URL`
2. `http://localhost:8000` when `import.meta.env.DEV`
3. `window.location.origin` in production

Functions: `checkBackendHealth(timeoutMs = 3000)` (with `AbortController`),
`fetchVocab()`, `fetchSampleCounts()`, `recordSample()` `[S]`.

**`ws.ts`** — `PredictSocket` class.

- URL: `apiBase.replace(/^http/, 'ws') + '/ws/predict'` `[S]`. An HTTPS base
  therefore yields `wss://` automatically, with no second configuration
  variable.
- `PING_INTERVAL_MS = 10_000`; `{"type":"ping"}` every 10 s, `{"type":"pong"}`
  ignored `[S]`.
- `SocketStatus`: `idle | connecting | open | closed | error`.
- `send()` silently no-ops unless `readyState === OPEN` `[S]`.
- **No automatic reconnect** — the user presses Start again `[S]`.

**`primaryUserTracker.ts`** (14.9 KB) — module-level singleton with
`processFrame`, `reset`, `getTrackInfo`.

Scoring `[S]`:

```
score     = 0.65 · sizeScore + 0.25 · centeredness + 0.10 · confidence
sizeScore = min(1, area / 0.12)
centeredness = 1 − min(1, ‖centre − (0.5, 0.5)‖ / √0.5)
```

Tracking `[S]`: IoU > 0.3 preserves identity; a track survives up to 18 lost
frames; switching the primary user requires a **1.4×** score advantage. A torso
region is estimated from the face box (height × 2.5, width × 1.8) and hands are
associated by proximity, velocity and temporal consistency.

**`translation.ts`** — see Chapter 11 / Appendix B. Full table inline in the
report; the file holds `TRANSLATIONS` (21 entries including `SPACE`),
`TRANSLATION_MAP`, `parseSignId`, `translateSign`, `translateSentence`,
`speechPlanForSign`, `speechPlanForSentence`, `TTS_LANGUAGE`
(`en-US`/`hi-IN`/`kn-IN`) `[S]`.

**`speech/`** — five modules plus `index.ts`:

| File | Role |
|---|---|
| `types.ts` | `TtsProvider`, `SpeakRequest`, `SpeakOutcome`, `TtsError`, `SpeechState`, and the **8** `TtsErrorKind` values |
| `bcp47.ts` | Tag normalisation and comparison |
| `browserProvider.ts` | Web Speech API provider |
| `localProvider.ts` | Offline service provider |
| `controller.ts` | Provider chain, re-probing, cancellation |
| `settings.ts` | rate/pitch/voice resolution |
| `index.ts` | Public surface |

`TtsErrorKind` `[S]`: `empty-text`, `browser-unsupported`, `no-voice`,
`service-offline`, `unsupported-language`, `request-failed`, `playback-failed`,
`superseded`.

Controller constants `[S]`: `RECHECK_INTERVAL_MS = 4_000`;
`FAILURE_BACKOFF_MS = 2_000` in `localProvider.ts`; success health cached 30 s,
failure cached only 2 s; speak timeout 45 s, health timeout 2.5 s.

Provider order `[S]`:

```ts
providers = [new BrowserTtsProvider(), new LocalTtsProvider()]
```

**`portrait/`** — four modules:

| File | Role |
|---|---|
| `portraitConfig.ts` | Modes, model URLs, tuning constants |
| `segmenter.ts` | Lazy singleton `ImageSegmenter` + `releasePortraitSegmenter()`. Returns **person** probability (measured: person 0.799 / background 0.000) at the **input image** size — 640×480 for a 640×480 stream, not the model's 256×256 |
| `maskOps.ts` | Pure pixel maths, all unit-tested |
| `portraitRenderer.ts` | Compositing + rAF loop |

`portraitConfig.ts` constants `[S]`:

| Constant | Value |
|---|---|
| `PortraitMode` | `'off' \| 'blur' \| 'remove'` |
| `SEGMENTER_MODEL_URL` | `…/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite` (0.24 MB) |
| `MASK_SIZE` | 256 — the **working** matte resolution, not the model's input size |
| `MASK_TEMPORAL_RESPONSE` | 0.35 (EMA α) |
| `MASK_ERODE_RADIUS` | 1 |
| `MASK_FEATHER_RADIUS` | 1 |
| `MASK_EDGE_LOW` / `HIGH` | 0.35 / 0.65 |
| `SEGMENT_INTERVAL_MS` | 40 (≈ 24 fps) |
| `SEGMENT_FAILURE_LIMIT` | 3 |
| `DEFAULT_INTENSITY` | 0.55 |
| `BACKGROUND_REMOVAL_COLOR` | `#241c18` |

`maskOps.ts` functions `[S]`: `temporalSmooth`, `erode`, `boxBlur`,
`applyEdgeContrast`, `resampleAlpha` (area-average, camera resolution → the
fixed 256×256 working buffer), `backgroundDownscale` (`1/(3 + t·9)`),
`backgroundBlurPx` (`1 + t·6`).

> `portraitRenderer.ts` receives its browser dependencies through
> `browserRendererDeps()`. `createImageData` **must** return a genuine
> `ImageData` instance — a plain object threw on every frame in a real browser
> while passing unit tests. This is a documented trap `[V]`.

**`tts.ts`** — a one-line re-export shim kept so historical import paths keep
working `[S]`.

### 6.6 Library modules

`lib/settings.ts` (documented above), `lib/statusLabels.ts` — pure label/tone
mappers for `CameraStatus`, `SocketStatus`, `RecStatus`; `lib/projectData.ts` —
static content constants for the explanatory pages `[S]`.

---

## 7. API reference with captured examples

All examples below are **real responses captured from the running services**
`[B]`. No tokens exist in this project, so none are shown.

### 7.1 `GET /` — service banner

```json
{"app":"ISL-to-Speech Backend","status":"running","docs":"/docs",
 "health":"/health","predict":"ws://<host>:8000/ws/predict"}
```

### 7.2 `GET /health`

```json
{"status":"ok","environment":"development","model_loaded":true,
 "num_classes":20,"seq_len":32,"model_path":"..\\models\\word_model.pt",
 "version":"0.3.0"}
```

When the model is absent the same route returns `model_loaded: false` rather
than an error `[S]`.

### 7.3 `GET /api/vocab`

```json
{"vocab":["STILL","HELLO","THANK_YOU","GOOD_MORNING","GOOD_AFTERNOON",
          "WHAT_IS_YOUR_NAME","MAYBE","COME","DRINK","GIVE","CLEAN","COOK",
          "CLOSE","BREAK","POUR","CRY","JUMP","TEA","KEY","WIFE"]}
```

### 7.4 `GET /api/sample-counts`

```json
{"counts":{"STILL":0,"HELLO":32,"THANK_YOU":11,"GOOD_MORNING":11,
  "GOOD_AFTERNOON":21,"WHAT_IS_YOUR_NAME":11,"MAYBE":10,"COME":10,
  "DRINK":11,"GIVE":10,"CLEAN":12,"COOK":12,"CLOSE":10,"BREAK":11,
  "POUR":12,"CRY":11,"JUMP":11,"TEA":11,"KEY":10,"WIFE":10}}
```

(Sum = **237**, matching the 237 `user_*.npz` files on disk `[B]`.)

### 7.5 `POST /api/record-sample`

Request:

```json
{"sign":"HELLO","frames":[{"hands":[{"handedness":"Right",
  "handedness_score":0.98,"landmarks":[[0.5,0.6,0.01], "… 21 points total"]}]}]}
```

Success response shape `[S]`: `{"saved": true, "sign": "...", "sample_index": n,
"frames_used": 32}`.

Errors `[S]`: HTTP 400 for an unknown sign or fewer than 12 usable frames.

> Not executed during this audit — it writes into the dataset `[S]`.

### 7.6 `WS /ws/predict`

Client → server, one frame:

```json
{"hands":[{"handedness":"Right","handedness_score":0.98,
           "landmarks":[[0.51,0.62,0.01], "… 21 points …"]}]}
```

Keep-alive: `{"type":"ping"}` → `{"type":"pong"}`.
Reset: `{"type":"reset"}` → `{"type":"reset_ok"}`.

Server → client while buffering (observed `[B]`):

```json
{"sign":null,"confidence":0.0,"accepted":false,"num_hands":1,
 "ready":false,"progress":0.5}
```

Server → client at the sign boundary (observed `[B]`):

```json
{"sign":"JUMP","confidence":0.9651,"accepted":true,"ready":true,"num_hands":0}
```

> That `JUMP` came from **synthetic circular hand geometry**, not a real gesture.
> It proves the inference path executes; it is **not** an accuracy result.

Server → client on malformed input `[B]`:

```json
{"error":"bad_json"}
```

Server → client when no model is loaded `[S]`:

```json
{"error":"model_not_loaded",
 "message":"No trained word model found. Run scripts/train_lstm.py first."}
```

### 7.7 Speech service — `GET /health`

Shape `[S]`: `{"ok": true, "engines": {"en": …, "hi": …, "kn": …},
"loaded": {…}}`.

### 7.8 Speech service — `POST /speak`

Request `[S]`: `{"text": "…", "lang": "kn", "tag": "…", "rate": 1.0,
"pitch": 1.0}`.
Response: `200` with `content-type: audio/wav` and a valid RIFF/WAVE body `[B]`.
`pitch` is ignored by the offline engines, which respond
`X-TTS-Pitch: ignored` `[S]`.

A non-loopback `Origin` is rejected with `403 origin not allowed` `[B]`.

---

## 8. Configuration reference

### 8.1 Frontend (`frontend/.env.local`, from `.env.example`)

| Variable | Purpose | Default | Required |
|---|---|---|---|
| `VITE_API_BASE_URL` | Backend base URL | dev `http://localhost:8000`, prod current origin | No |
| `VITE_LOCAL_TTS_URL` | Offline speech service address | `http://127.0.0.1:8765` | No |

Both are **optional**. `.env.example` warns that everything in a `VITE_*`
variable is inlined into the client bundle and must never hold a secret `[S]`.

There is no separate `VITE_WS_URL`; the WebSocket URL is derived from
`VITE_API_BASE_URL` `[S]`.

### 8.2 Backend (`backend/.env`, from `.env.example`)

| Variable | Purpose | Default | Required |
|---|---|---|---|
| `HOST` | Bind address | `0.0.0.0` | No |
| `PORT` | Bind port | `8000` | No |
| `ENVIRONMENT` | Reported by `/health` | `development` | No |
| `LOG_LEVEL` | Python log level | `INFO` | No |
| `ALLOWED_ORIGINS` | Comma-separated CORS allow-list | `http://localhost:5173,http://127.0.0.1:5173` | No |
| `MODEL_PATH` | GRU checkpoint | `<root>/models/word_model.pt` | No |
| `FEATURES_PATH` | **Unused leftover** | `<root>/models/features.json` | No |
| `CONFIDENCE_THRESHOLD` | Acceptance threshold | `0.60` | No |
| `DATASET_RAW_PATH` | Unused by the shipped path | `<root>/dataset/raw` | No |
| `DATASET_PROCESSED_PATH` | Unused by the shipped path | `<root>/dataset/processed` | No |

> **`.env.example` is stale.** It ships `MODEL_PATH=../models/model.pkl`, but the
> real checkpoint is `models/word_model.pt`. The live `backend/.env` has already
> been corrected; anyone creating a fresh `.env` from the example will get a
> missing model `[S]`.

`MODEL_PATH` is resolved **relative to the backend working directory**, so
`../models/word_model.pt` from `backend/` resolves correctly `[B]`.

### 8.3 Speech service

| Setting | Purpose | Default |
|---|---|---|
| Host | Bind address | `127.0.0.1` (loopback only) |
| Port | Bind port | `8765` |
| `HF_HUB_OFFLINE` | Force offline model use | unset |
| `TTS_ENGINES` | Engine preference order | auto-detected |

`service.py` binds loopback only and additionally rejects any non-loopback
`Origin` header `[B]`.

### 8.4 Runtime constants summary

| Constant | Value | File |
|---|---|---|
| Camera resolution | 640×480 ideal | `useWebcam.ts` |
| `COOLDOWN_MS` | 700 | `useSignRecognition.ts` |
| `SEND_EVERY` | 1 | `useSignRecognition.ts` |
| `PING_INTERVAL_MS` | 10,000 | `ws.ts` |
| Sequence length | 32 | checkpoint |
| Buffer cap / minimum | 90 / 12 | `recognizer.py` |
| Sign-boundary frames | 6 | `recognizer.py` |
| `RECHECK_INTERVAL_MS` | 4,000 | `controller.ts` |
| `FAILURE_BACKOFF_MS` | 2,000 | `localProvider.ts` |
| `SEGMENT_INTERVAL_MS` | 40 | `portraitConfig.ts` |
| `DEFAULT_INTENSITY` | 0.55 | `portraitConfig.ts` |

---

## 9. Workflows

### 9.1 Adding a new sign

1. Add the class to `ml/vocabulary.py` **in the intended order**.
2. Record or prepare video data for it and run `prepare_word_dataset.py`.
3. Retrain: `python scripts\train_lstm.py`.
4. Add the identifier to the `SignId` union and a row to `TRANSLATIONS` in
   `frontend/src/services/translation.ts` `[S]`.
5. `npm test` — the translation suite asserts every class has a row in all three
   scripts `[S]`.

> Order matters. Appending to `ISL_VOCAB` is safe; inserting in the middle
> invalidates a previously trained checkpoint, because class indices are
> positional.

### 9.2 Adding a language

1. Add the code to `Language` in `translation.ts`, and a `TTS_LANGUAGE` entry `[S]`.
2. Add the column to `TranslationEntry` and every `TRANSLATIONS` row `[S]`.
3. Add a speech provider that declares the language, or extend the local service
   with an engine that can speak it `[S]`.
4. Extend the translation test suite's script assertions `[S]`.

### 9.3 Retraining from scratch

```powershell
cd F:\Final Project
.\.venv\Scripts\Activate.ps1
python scripts\prepare_word_dataset.py --source "<video dataset root>" --seq-len 32 --workers 4
python scripts\train_lstm.py --seq-len 32 --hidden 128 --epochs 60
```

Then restart the backend so the new checkpoint is loaded.

> `backend/requirements.txt` does **not** list `torch`, `scikit-learn`,
> `matplotlib` or `websockets`, all of which the training and verification paths
> need. The project `.venv` has them installed `[V]`; a clean machine following
> only the requirements file will fail at import `[S]`.

---

## 10. Known defects and inconsistencies found during the audit

Application source was **not modified**. These are recorded so a maintainer can
decide.

| # | File | Issue | Severity |
|---|---|---|---|
| 1 | `scripts/train_lstm.py:6` | Docstring says "input 64-d per frame"; the checkpoint is 128 | Doc only |
| 2 | `ml/dataset_seq.py:4`, `ml/sequences.py:7-8` | Same stale "64-d" claim | Doc only |
| 3 | `useSignRecognition.ts:35` | `SEND_EVERY = 1` with a comment claiming every 2nd frame | Doc only |
| 4 | `backend/.env.example` | `MODEL_PATH` points at a non-existent `model.pkl` | **Functional** |
| 5 | `backend/requirements.txt` | Omits `torch`, `scikit-learn`, `matplotlib`, `websockets` | **Functional** |
| 6 | `ml/vocabulary.py:3` | "60 videos each" is not reconcilable with the sequence counts | Doc only |
| 7 | `scripts/train_lstm.py:152` | "STILL has ~4× more samples"; measured ratio ≈ 3.1× against HELLO, ≈ 1.3× against the mid-sized classes | Doc only |
| 8 | `backend/app/core/config.py` | `FEATURES_PATH`, `DATASET_RAW_PATH`, `DATASET_PROCESSED_PATH` are unused | Dead config |
| 9 | `settings.confidenceThreshold` (default 0.5) | Client setting that does not gate acceptance; the backend's 0.60 does | Potential confusion |
| 10 | `ml/import`-time `sys.path` mutation | `ml/*.py` and `backend/.../recognizer.py` insert the project root into `sys.path` at import time | Fragile but functional |
| 11 | `Prediction` TS interface | Does not declare the `ready` / `progress` fields the backend actually sends | Harmless |
| 12 | `backend/tests/` | Contains only `__init__.py` | Test gap |

---

## 11. Test suite reference

Runner: `node --experimental-strip-types --test tests/*.test.ts` — Node's built-in
test runner, **no jsdom, no React Testing Library** `[S]`. Browser APIs are
hand-shimmed in `tests/helpers/browser.ts` (speech synthesis, audio element, a
loopback speech-service fake).

| File | Coverage |
|---|---|
| `translation.test.ts` | All 21 rows, script correctness, no Romanisation, re-translation from IDs |
| `tts.test.ts` | Voice selection, no cross-language borrowing, dispatch contract |
| `speech.test.ts` | Controller, both providers, fallback, all error kinds, cancellation, dedupe, Kannada regression |
| `languagePipeline.test.ts` | Stale-closure regression, sentence buffer, real `ws.ts` against a fake socket |
| `portrait.test.ts` | Mask maths, renderer lifecycle, compositing, cleanup; queue-based `requestFrame` + `drive()` harness |

Node-runner constraints that shape the test code `[S]`: relative imports in
tested modules need explicit `.ts` extensions (`allowImportingTsExtensions` is
already enabled in `tsconfig.json`), and TypeScript parameter properties are not
supported by `--experimental-strip-types`.

The portrait harness is queue-based because `requestAnimationFrame` is injected;
`drive()` drains the queued frames deterministically.

---

## 12. Cross-references

| Question | Where to look |
|---|---|
| Why is the architecture like this? | `PROJECT_COMPLETE_REPORT.md`, Chapters 4, 8, 13 |
| Diagrams | `PROJECT_ARCHITECTURE_DIAGRAMS.md`, Diagrams A–J |
| Every sign's three translations | `PROJECT_COMPLETE_REPORT.md`, Appendix B |
| How do I run it? | `PROJECT_SETUP_AND_TESTING_GUIDE.md` |
| What is proven and what is not? | `PROJECT_VERIFICATION_MATRIX.md` |
| Examiner questions | `PROJECT_VIVA_QUESTIONS.md` |