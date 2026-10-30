# Verification Matrix — ISL-to-Speech

**Project root:** `F:\Final Project`
**Document purpose:** every technical claim made in the report is classified here by
*how* it was established, so a reviewer can separate measured fact from
source-code reading from inference.

**Evidence classes used**

| Class | Meaning |
|---|---|
| **A — Executed** | I ran the command/tool in this environment and recorded the result. |
| **B — Service integration** | Verified against the real running service over its real protocol. |
| **C — Browser** | Verified in real Chrome 155 driven over the DevTools Protocol. |
| **D — Source-read** | Established by reading the actual implementation. Not executed. |
| **E — Artifact** | Read from a persisted file produced by an earlier run (e.g. `word_metrics.json`). |
| **F — Not verified** | Cannot be established from source or artefacts. Explicitly unknown. |

---

## 1. Machine-learning model

| Claim | Class | Evidence |
|---|---|---|
| Architecture is a 2-layer GRU + MLP head | **D** | `scripts/train_lstm.py:43-60` (`class SignGRU`) |
| Input size is **128** per frame, not 64 | **B** | `models/word_model.pt` checkpoint key `input_size: 128`; `backend/app/services/recognizer.py:113` feeds `(1, L, 128)` |
| Hidden size 128, 2 layers, dropout 0.3 | **B** | Checkpoint `hidden: 128`; `state_dict` contains `gru.weight_ih_l0` and `gru.weight_ih_l1` only (2 GRU layers) |
| GRU gate width is `3 × hidden = 384` | **B** | `gru.weight_ih_l0` shape `(384, 128)` |
| Head is `Linear(128,128) → ReLU → Dropout → Linear(128,20)` | **B** | `classifier.0.weight (128,128)`, `classifier.3.weight (20,128)` |
| **217,236** trainable parameters | **B** | `sum(p.numel() for p in state_dict.values())` |
| Sequence length 32 | **B** | Checkpoint `seq_len: 32`; live `GET /health` → `"seq_len": 32` |
| 20 output classes | **B** | Checkpoint `n_classes: 20`; live `GET /health` → `"num_classes": 20` |
| Test accuracy **0.981042654028436** | **E** | `models/word_metrics.json` — written by an earlier training run, **not re-run by me** |
| Test macro precision 0.9830 / recall 0.9814 / F1 0.9809 | **E** | Same file |
| Best validation accuracy 1.0; test support 211 | **E** | Same file |
| Weakest classes: BREAK 0.818, COME 0.90, THANK_YOU 0.909 | **E** | `per_class_accuracy` in the same file |
| Confidence threshold 0.60 | **B** | `backend/.env` `CONFIDENCE_THRESHOLD`; `backend/app/core/config.py:27` |
| `STILL` is suppressed and never emitted as a sign | **B** | `backend/app/services/recognizer.py:121-124`; observed over WebSocket |
| No prediction is produced mid-sign | **B** | `PredictSession.feed` returns `ready: False` until the hand lowers; observed live |
| Optimiser Adam, lr 1e-3, batch 16, ≤60 epochs, patience 15 | **D** | `scripts/train_lstm.py:93-99, 159` |
| Inverse-frequency class weights | **D** | `scripts/train_lstm.py:154-158` |
| Augmentation is **opt-in** (`--augment`), not default | **D** | `scripts/train_lstm.py:100, 145` |
| Test-set confusion matrix PNG exists | **E** | `models/word_confusion_matrix.png`, 72.36 KB |
| Training duration, GPU used, hyper-parameter search | **F** | Not recorded anywhere in the repository |
| Whether the saved metrics came from a run with or without `--augment` | **F** | The metrics file does not record the flag |

## 2. Dataset

| Claim | Class | Evidence |
|---|---|---|
| **1,407** landmark sequences | **B** | `glob('dataset/seq/*/*.npz')` → 1407; also 1,407 reported by `load_sequences` path |
| Every sequence is `(32, 128) float32` | **B** | Counter over all 1,407 files → single shape `{ (32,128): 1407 }` |
| 1,170 dataset-derived + **237** user-recorded | **B** | `np.load(...)['source']`; independently confirmed by live `GET /api/sample-counts` → total 237 |
| Total on-disk size 17.5 MB | **A** | Directory sum |
| Per-class counts: STILL 30, HELLO 92, GOOD_AFTERNOON 81, others 70–72 | **B** | File counts per `dataset/seq/<SIGN>/` |
| Split is stratified at **sequence** level, seed 42 / 43 | **D** | `ml/dataset_seq.py:80-97` |
| Default split 70 / 15 / 15 | **D** | `scripts/train_lstm.py:97-98` |
| Test support of 211 is consistent with a 15 % stratified split | **B** | 1407 × 0.15 = 211.05; matches `classification_report` support column |
| Source dataset is the Kaggle "Indian Sign Language Video Dataset" (`prasadshet/...`) | **D** | Named in `ml/vocabulary.py:3` and `scripts/prepare_word_dataset.py:5`. **The raw videos are not in this repository**, so the dataset contents were not inspected. |
| Licence of the source dataset | **F** | `ml/vocabulary.py` asserts "MIT license" in a comment; no licence file is present |
| `dataset/raw/` does not exist | **A** | `Test-Path` → False |
| `dataset/processed/` exists but is empty | **A** | 0 files |
| Frames-per-video, signer count, signer demographics | **F** | Not derivable from the `.npz` artefacts |
| Class imbalance magnitude beyond STILL | **B** | HELLO 92 vs KEY 70 — a 1.31× ratio, milder than the script comment's "4×" claim for a different distribution |

## 3. Backend

| Claim | Class | Evidence |
|---|---|---|
| FastAPI app serves 3 HTTP routes + 1 WebSocket | **B** | `backend/app/main.py`, `api/record.py`, `api/ws.py`; all exercised live |
| `GET /health` returns `model_loaded: true`, 20 classes, seq_len 32, version 0.3.0 | **B** | Live response captured |
| `GET /api/vocab` returns the 20 class names | **B** | Live response captured |
| `GET /api/sample-counts` returns per-sign user sample counts | **B** | Live response captured |
| `GET /docs` returns HTTP 200 | **B** | Live `curl` |
| `POST /api/record-sample` writes `dataset/seq/<SIGN>/user_NNNNN.npz` | **D** | `backend/app/api/record.py:101-107` — **not executed** (it would mutate the dataset) |
| WebSocket `/ws/predict` implements ping/pong and reset | **B** | `{"type":"pong"}` and `{"type":"reset_ok"}` observed |
| WebSocket returns progress while buffering, then predicts on hand-down | **B** | Observed `progress: 0.5` mid-stream, then a prediction after 6 empty frames |
| GRU inference actually executes over the socket | **B** | Observed `{'sign':'JUMP','confidence':0.9651,'accepted':True}` |
| Malformed JSON is reported, not fatal | **B** | `{"error":"bad_json"}` returned, connection remained open |
| The model is loaded once at startup and shared | **D** | `main.py:27-53`, `app.state.recognizer` |
| CORS restricts origins to a configured list | **B** | Allowed origin received `access-control-allow-origin`; a disallowed origin received none |
| Sign boundaries use 6 consecutive hand-absent frames | **D** | `recognizer.py:162` |
| Buffer capped at 90 frames, minimum 12 usable frames | **D** | `recognizer.py:150-151` |
| **No authentication, no rate limiting, no database** | **D** | No such code exists in `backend/` |
| **No backend automated tests** | **A** | `backend/tests/` contains only `__init__.py` |

## 4. Frontend

| Claim | Class | Evidence |
|---|---|---|
| React 18.3.1, TypeScript ~5.6.3, Vite 5.4.11, Tailwind 3.4.14, react-router-dom ^6.28.0, @mediapipe/tasks-vision 0.10.14 | **D** | `frontend/package.json` |
| `npm test` → **171 tests, 40 suites, 0 failures** | **A** | Executed this session |
| `npx tsc --noEmit` → exit 0 | **A** | Executed this session |
| `npm run build` → 427.04 kB JS / 133.30 kB gzip, exit 0 | **A** | Executed this session |
| `npm run check:contrast` → ALL CHECKS PASS | **A** | Executed this session |
| Test runner is Node's built-in runner; **no jsdom** | **D** | `package.json` script; browser APIs hand-shimmed in `tests/helpers/browser.ts` |
| `<video>` is never filtered or re-sourced by Portrait Mode | **D + B** | Source read; asserted by a unit test; DOM-verified with the overlay absent in Off mode |
| Portrait control renders Off / Portrait Blur / Remove Background | **C** | DOM inspection of the live `/translator` route |
| Default portrait mode is `off` | **C** | `<select>` value was `off` on load |
| Portrait status pill reads "Portrait off" | **C** | DOM inspection |
| Video element receives 21 landmarks × 3 axes, two hands | **D** | `useSignRecognition.ts` payload construction |
| `SEND_EVERY = 1` (every frame sent) while the comment says "every 2nd frame" | **D** | `useSignRecognition.ts:39-42` — **stale comment**, flagged in the report |
| Frame rate actually achieved | **F** | No instrumentation or benchmark exists |
| Browser/device matrix tested | **F** | Not documented |

## 5. Portrait Mode / Background Removal

| Claim | Class | Evidence |
|---|---|---|
| Model is MediaPipe `selfie_segmenter` float16, 0.24 MB | **D** | `portraitConfig.ts`; size confirmed by HTTP HEAD |
| Alternatives rejected on measured size: deeplab_v3 2.65 MB, selfie_multiclass 15.61 MB | **B** | HTTP HEAD against the MediaPipe CDN |
| Model loads and runs in a real browser | **C** | Chrome console: `Graph successfully started running`, `XNNPACK delegate for CPU`, `segmentation_postprocessor_gl.cc` |
| Background Removal replaces the background exactly | **C** | Output canvas corner sampled `rgb(36,28,24)` = `#241c18`; background scanline contrast 226 → **0** |
| Portrait Blur keeps the person sharp and softens the background | **C** | Head sampled at the exact source colour `rgb(224,176,128)`; background scanline contrast 226 → **47** |
| The silhouette edge is feathered, not hard-cut | **C** | Red-channel ramp across the edge: `224→224→224→224→224→172→187→179` |
| Matte quality on a real human face | **F** | No webcam available; verified only with a synthetic matte and synthetic video |
| End-to-end accuracy of segmentation on real people | **F** | Not measured |

## 6. Text-to-speech

| Claim | Class | Evidence |
|---|---|---|
| Provider order is **browser first, local offline service second** | **D** | `services/speech/controller.ts` `providers = [new BrowserTtsProvider(), new LocalTtsProvider()]` |
| Chrome on the dev machine exposes an **online** `hi-IN` voice and **no** Kannada voice | **C** | Voice list read from `chrome://speech-synthesis` equivalent: `hi-IN ONLINE Google हिन्दी`; `kn` count = 0 |
| Windows 11 SAPI/OneCore expose only `en-US` voices | **A** | `System.Speech` enumeration and `HKLM\...\Speech_OneCore\Voices\Tokens` registry read |
| MMS models `facebook/mms-tts-hin` and `facebook/mms-tts-kan` both exist and synthesise | **A** | Direct synthesis; both produced non-silent WAV |
| Generated audio is voiced, normalised, speech-band | **A** | RMS/duty/spectral-centroid/zero-crossing analysis of the produced WAVs |
| Kannada audio **played** in a real browser | **C** | `readyState=4`, `currentTime` advancing 0.65–0.66 s, `paused=false`, no media error |
| Audible intelligibility of the Hindi/Kannada audio | **F** | No audio output device in this environment |
| Local service binds 127.0.0.1 only and rejects non-loopback origins | **B** | `403 origin not allowed` observed |
| Model checkpoint files: `mms-tts-hin` 138.5 MB, `mms-tts-kan` 138.5 MB, `mms-tts-eng` 138.5 MB | **A** | Disk measurement; total 416 MB |
| Service model cache is `tools/tts-service/models/` | **A** | Directory listing |
| Offline operation (`HF_HUB_OFFLINE=1`) | **A** | Service restarted offline and synthesised all three languages |

## 7. Documentation-level discrepancies found

These are real inconsistencies in the source tree, documented rather than fixed
(source code was not modified):

| Location | Stale text | Actual |
|---|---|---|
| `scripts/train_lstm.py:6` | "input 64-d per frame" | `input_size = 128` in the checkpoint |
| `ml/dataset_seq.py:4` | "one (SEQ_LEN, 64) feature sequence" | every file is `(32, 128)` |
| `ml/sequences.py:7-8` | "(L frames) ... 64-d" | two-hand mode is the default and is 128-d |
| `backend/.env.example` | `MODEL_PATH=../models/model.pkl` | actual file is `models/word_model.pt`; the live `backend/.env` is already correct |
| `backend/requirements.txt` | lists 8 packages | omits `torch`, `scikit-learn`, `matplotlib`, `websockets`, which the training script needs |
| `useSignRecognition.ts:39` | `// send every 2nd frame (~30 msg/s)` | `SEND_EVERY = 1` sends every frame |
| `ml/vocabulary.py:3` | "60 videos each" | the class counts in `dataset/seq/` are 30–92 sequences per sign; the mapping from videos to sequences is not recorded |
| `scripts/train_lstm.py:152` | "STILL has ~4× more samples than words" | measured ratio is ≈ 1.3× against the largest class |

## 8. Explicitly not verified

The following were **not** established and must not be asserted in submission:

1. Model accuracy on new, unseen signers.
2. Any latency, FPS, memory or CPU-usage figure for the browser pipeline.
3. Training time, training hardware, number of epochs actually run.
4. Any user study, accessibility evaluation or deployment status.
5. Whether the application has ever been deployed publicly.
6. Real-world matte quality for portrait/background removal on human subjects.
7. Audible intelligibility of the synthesised Hindi and Kannada audio.
8. Security penetration testing, compliance certification, or audit.
9. Behaviour on Safari, Firefox, or mobile browsers.
10. The licence actually governing the source video dataset.