# Indian Sign Language (ISL) to Speech Translator
### Final-Year Engineering Project Report

---

**Project title:** Real-Time Indian Sign Language (ISL) to Speech Conversion — Camera-Based Sign Recognition with Multilingual Speech Output

**Document type:** Final-year undergraduate engineering project report
**Implementation basis:** the actual source tree at `F:\Final Project`
**Evidence policy:** every factual claim is either sourced to a file path, or
labelled *Not verified*. No metric in this report was estimated, extrapolated or
invented.

> **How to read the evidence labels used throughout**
> **[V]** Verified by execution in this environment · **[S]** Verified by reading
> the implementation · **[A]** Read from an artefact produced by an earlier run ·
> **[?]** Not verified / not documented.

---

## CHAPTER 1 — INTRODUCTION

### 1.1 Project title

*Real-Time Indian Sign Language (ISL) to Speech Conversion — Camera-Based Sign
Recognition with Multilingual Speech Output.*

### 1.2 Abstract

Indian Sign Language is the primary means of communication for Deaf and
Hard-of-Hearing (DHH) people in India. Conversational Indian Sign Language is
extremely rich — order-independent, non-manual, and heavily two-handed — so
automating *general* sign-language conversation is a research problem far beyond
a final-year project. This project takes the opposite, deliberately honest
approach: it solves a narrow, complete problem well.

The system recognises a **fixed vocabulary of 20 daily word-level ISL signs**
through a normal laptop webcam, assembles them into a sentence, translates that
sentence into **English, Hindi or Kannada**, and speaks it aloud. A recurrent
neural network (GRU) trained on 1,407 landmark sequences classifies each sign
from MediaPipe hand-landmark sequences. Because Windows 11 installs no Hindi or
Kannada speech voice, the system falls back to a local offline neural
text-to-speech service so that both languages are actually spoken. A portrait
mode keeps the user visually prominent by compositing a person-segmentation
matte over the untouched camera frame.

The camera feed and all computer vision run inside the browser; only 21-point
hand-landmark coordinates ever leave the machine.

### 1.3 Background

Signed conversation in India is heavily two-handed, uses the full signing space,
and frequently omits articles and verb inflection. Sign-to-speech systems are
therefore hard for three independent reasons: the visual problem (separating
signer from background), the temporal problem (a sign is a motion, not a
still), and the linguistic problem (translating between two grammatically
different languages).

This project treats the first two as tractable engineering problems and the
third as a lookup problem, and says so plainly rather than over-claiming.

### 1.4 Problem statement

A DHH person who reads Indian Sign Language fluently cannot easily converse
with someone who does not. A hearing person who wants to understand signs has
no accessible tool. Existing sign-language systems are either sensor-based
(hardware gloves, depth cameras) — expensive and intrusive — or
full-sentence systems requiring far more data and compute than an undergraduate
project can supply.

### 1.5 Motivation

Three observations shaped the design:

1. **The OS cannot speak Indian languages.** Measured on the development
   machine: Windows 11 exposes exactly two local speech voices, both English
   **[V]**. A translation system that stops at text is only half a solution.
2. **Nothing leaves the machine.** A sign-language tool is most valuable to the
   people whose privacy matters most, so video must never be transmitted.
3. **Fixed vocabulary is a feature, not a limitation, when disclosed.** Twenty
   well-chosen daily words are genuinely useful; an undisclosed 5 % vocabulary
   is not.

### 1.6 Aim of the project

To build a working, privacy-preserving, browser-based system that recognises a
defined vocabulary of Indian Sign Language signs from a webcam, translates the
recognised sequence, and speaks it in a language the user chooses.

### 1.7 Primary objectives

| # | Objective | Status |
|---|---|---|
| P1 | Extract hand landmarks locally in the browser | Implemented **[S]** |
| P2 | Classify word-level signs with a trained temporal model | Implemented **[S]**, 0.981 test accuracy **[A]** |
| P3 | Translate a recognised sentence into EN/HI/KN | Implemented **[S]** |
| P4 | Speak the translation audibly in all three languages | Implemented **[S]**, Kannada/English playback verified in-browser **[V]** |
| P5 | Never transmit camera video | Implemented **[S]** |

### 1.8 Secondary objectives

- Track the primary user so bystanders' hands do not corrupt recognition **[S]**
- Provide portrait blur and background removal **without** affecting recognition **[V]**
- Provide an offline speech path for languages the OS cannot speak **[S]**
- Provide an in-app calibration flow so a user can add their own training data **[S]**

### 1.9 Scope

**In scope:** 20 word-level ISL signs; single primary user; sentence assembly
from recognised signs; three output languages; single-camera, single-user
session.

**Explicitly out of scope:** continuous conversational signing, sentence
grammar, signer-independent generalisation guarantees, non-manual features
(facial expression, body posture), Indian Sign Language fingerspelling, and
any claim of replacing a human interpreter.

### 1.10 Intended users

- DHH users familiar with the supported 20-sign vocabulary.
- Hearing users learning those signs.
- Hearing relatives of DHH users.
- Students and developers of assistive Indian-language technology.

### 1.11 Expected outcomes

A demonstrable, locally-running application; a reproducible training pipeline;
a privacy-preserving architecture; and an honest, evidence-backed account of
what does and does not work.

### 1.12 Organisation of the report

Chapters 2–3 analyse the problem and the proposed system; Chapter 4 documents
the architecture with diagrams; Chapter 5 lists the technology stack; Chapters
6–13 document each subsystem from the actual code; Chapter 14 covers security
and privacy; Chapters 15–17 cover installation, testing and operations; Chapters
18–20 report results, limitations and future work. Eight appendices follow.

---

## CHAPTER 2 — PROBLEM ANALYSIS AND REQUIREMENTS

### 2.1 The existing problem

An ISL signer produces a stream of continuous, two-handed, spatially-referenced
motion. A listener needs audible natural language. Three conversions are
needed, and each has an independent difficulty:

1. **Pixels → meaning.** Requires locating the hands, tracking them, and
   classifying motion over time.
2. **Sign → word.** ISL and Indian languages differ in grammar and morphology.
3. **Word → audio.** Requires a speech engine that can pronounce the language.

### 2.2 Existing approaches and their limitations

| Approach | Limitation |
|---|---|
| Sensor gloves | Cost, donning time, calibration; requires hardware the user must buy and wear |
| Depth/3D cameras | Hardware cost; unavailable on ordinary laptops |
| Full-sentence deep learning | Requires orders of magnitude more data than available |
| Server-side video processing | Latency and privacy cost; the video leaves the device |
| Cloud sign-to-speech APIs | Cost, account and API key requirement, network dependency, privacy |
| Text-only translation | Leaves the user still unable to *hear* the message |

*General analysis, not specific to this project.*

### 2.3 The proposed solution

A three-process local system: browser-side computer vision, a thin classification
backend, and an optional local speech service. The vocabulary is fixed and
declared; the recognition unit is one whole sign, not a letter.

### 2.4 Functional requirements

| ID | Requirement | Implementation |
|---|---|---|
| FR1 | Capture video from a webcam | `useWebcam.ts` — `getUserMedia` 640×480 |
| FR2 | Detect up to two hands with 21 landmarks each | `HandLandmarker`, `numHands: 2` **[S]** |
| FR3 | Identify the primary user | `primaryUserTracker.ts` **[S]** |
| FR4 | Classify a completed sign | `PredictSession` + `SignGRU` **[S]** |
| FR5 | Assemble recognised signs into a sentence | `sentenceIdsRef` buffer **[S]** |
| FR6 | Translate into EN/HI/KN | `translation.ts` table **[S]** |
| FR7 | Speak the sentence | `TtsController` provider chain **[S]** |
| FR8 | Speak hi/kn without OS voices | Local speech service **[S]** |
| FR9 | Offer portrait blur and background removal | `portrait/` renderer **[S]** |
| FR10 | Allow user calibration data collection | `POST /api/record-sample` **[S]** |

### 2.5 Non-functional requirements

- **Privacy:** video must never leave the device **[S]**
- **Responsiveness:** recognition must not block the main thread **[S]** (rAF loop, async)
- **Honesty:** the UI must never claim audio or recognition that did not happen **[S]**
- **Accessibility:** keyboard-accessible controls, WCAG AA contrast, high-contrast theme **[V]**
- **Resilience:** every failure has a specific, actionable message **[S]**
- **Portability:** runs offline once models are cached **[V]**

### 2.6 Hardware requirements

| Component | Requirement | Basis |
|---|---|---|
| Camera | Any `getUserMedia` device | `useWebcam.ts` **[S]** |
| CPU | x86-64; no GPU required for inference | Torch build is `2.13.0+cpu` **[V]** |
| RAM | Not measured **[?]** | — |
| GPU | Optional | Segmenter uses `delegate: 'CPU'` **[S]** |
| Disk | ~416 MB for speech models | Measured **[V]** |

### 2.7 Software requirements

Python 3.11.9, Node.js 22.23.1, npm 10.9.8, a Chromium- or Firefox-based
browser, and (optionally) eSpeak NG or Piper for alternative speech engines
**[V/S]**.

### 2.8 User requirements

The user must be willing to learn 20 signs, keep both hands visible, allow
camera permission, and sit within the lighting range of an ordinary webcam. The
user must understand that only the supported vocabulary will be recognised.

### 2.9 System constraints

- The camera element is shared between rendering and recognition.
- `selfie_segmenter` cannot distinguish between multiple people **[V]**.
- MediaPipe models are fetched from a CDN on first load **[S]**.
- The offline speech service must be running for Hindi/Kannada **[S]**.

### 2.10 Assumptions

- One primary user performs the signing **[S]** — the tracker assumes this.
- The signer is seated with hands in the camera's field of view.
- Lighting is adequate for the hand landmarker.
- The 20-sign vocabulary is sufficient for demonstration purposes.

### 2.11 Feasibility analysis

**Technical feasibility — high.** The problem is bounded (20 classes, 32-frame
sequences), all libraries are open-source and already installed, and the model
trains on CPU in minutes **[S]**.

**Operational feasibility — medium.** The system needs a webcam and a running
browser; the speech service must be started separately, which adds a step that
can be forgotten. *Engineering judgement, not a measurement.*

**Economic feasibility — high.** No licences, subscriptions or hardware
purchases are required. *Judgement.*

**Schedule feasibility — high.** Every stage was completed; the repository
contains the full training pipeline, the trained model and the runtime **[V]**.

---

## CHAPTER 3 — EXISTING SYSTEM AND PROPOSED SYSTEM

### 3.1 Existing communication approaches

In-person sign-language conversation, interpreter-mediated conversation, and
text-based communication are the alternatives for someone who does not sign.

### 3.2 Limitations of these approaches

All of them require a third party to be present. None is available at 3 a.m.,
none works across distance, and all require the DHH person to adapt their
communication method to the other party's convenience.

### 3.3 Proposed system overview

A webcam-facing web application. The browser extracts hand landmarks, the
backend classifies completed signs, the frontend translates and speaks them.
Camera frames never leave the browser.

### 3.4 Main features

Camera capture · two-hand landmark extraction · primary-user tracking ·
GRU sign classification · sentence assembly · EN/HI/KN translation ·
multilingual speech with offline fallback · portrait blur · background removal ·
in-app calibration.

### 3.5 Advantages

- **Privacy:** video stays on the machine **[S]**
- **No subscription, no API key, no account** **[S]**
- **Works offline** after first load **[V]**
- **Three output languages** including two with no system voice **[V]**
- **Modular:** providers, engines and UI are separately replaceable **[S]**

### 3.6 Differences between proposed design and actual implementation

Documented honestly rather than concealed:

| Designed/expected | Actually implemented |
|---|---|
| "64-d feature vector" in the training docstring | **128-d** two-hand vector; the docstring is stale **[B]** |
| Feature file `models/features.json` | Never created; `FEATURES_PATH` is configured but unused **[S]** |
| Legacy sklearn pipeline (`train_model.py`) | Present but **unused**; the shipped model is the GRU **[S]** |
| `POST /api/settings` to save the confidence threshold | Frontend calls it, backend does not implement it; the UI honestly reports this **[S]** |
| A centre-biased portrait segmentation | `selfie_segmenter` cannot isolate a specific person; limitation disclosed in the UI **[S]** |

### 3.7 Current limitations

A fixed 20-sign vocabulary; no continuous signing; no grammar; no fingerspelling;
no signer-independent guarantee; and a speech service that must be started
manually.

---

## CHAPTER 4 — SYSTEM ARCHITECTURE

Nine further diagrams, each with a full explanation, are in
**`PROJECT_ARCHITECTURE_DIAGRAMS.md`** (Diagrams A–J). The essential structure:

### 4.1 High-level architecture

Three local processes. The browser runs *all* computer vision (MediaPipe
HandLandmarker, FaceDetector, and optionally the selfie ImageSegmenter). The
FastAPI backend receives only landmark coordinates and runs the GRU. A separate
optional Python speech service synthesises audio the operating system cannot.

### 4.2 Frontend architecture

React 18 with `react-router-dom` v6 over seven routes. Two hooks own the long-lived
resources: `useWebcam` owns the `MediaStream`; `useSignRecognition` owns the
MediaPipe models, the WebSocket, the `requestAnimationFrame` loop and the sign
buffer. `usePortraitEffect` reads `videoRef` but never writes to it **[S]**.

### 4.3 Backend architecture

FastAPI with a lifespan handler that loads the model once into `app.state`
**[S]**. Two routers: `ws.py` (WebSocket) and `record.py` (REST). Each WebSocket
connection receives its own `PredictSession`, isolating concurrent users **[S]**.

### 4.4 Computer-vision pipeline

`video` → `HandLandmarker.detectForVideo` → `FaceDetector.detectForVideo` →
`primaryUserTracker.processFrame` → primary hands only → WebSocket **[S]**.

### 4.5 Machine-learning inference pipeline

Landmarks → wrist-centred, scale-normalised 64-d per hand → 128-d two-hand
vector → buffer → resample to 32 frames → `(1, 32, 128)` tensor → GRU(128)×2 →
last timestep → MLP head → 20 logits → softmax → argmax with a 0.60 threshold **[S]**.

### 4.6 Data flow

Only `{ handedness, handedness_score, landmarks }` crosses the network **[S]**.

### 4.7 API communication

REST for health, vocabulary and calibration; a single WebSocket for the
prediction stream, with a 10-second application-level ping **[S]**.

### 4.8 WebSocket communication

URL derived by `apiBase.replace(/^http/, 'ws') + '/ws/predict'`, so an HTTPS base
automatically yields `wss://` **[S]**; verified by a test that asserts
`ws://localhost:8000/ws/predict` **[S]**. **There is no automatic reconnect
logic** — the user must press Start again **[S]**.

### 4.9 Translation flow

Always from stored sign IDs, never from translated strings **[S]**.

### 4.10 Speech-generation flow

Browser voice first, local offline service second **[S]**.

### 4.11 Camera-effects architecture

An overlay canvas between the video and the hand skeleton **[S]**.

### 4.12 Error-handling flow

Every failure has a distinct message and a concrete next step; `SpeakOutcome.ok`
is never optimistic **[S]**.

---

## CHAPTER 5 — TECHNOLOGY STACK

Only technologies actually present in the manifests or environment are listed.

### 5.1 Frontend

| Technology | Version | Purpose | Location | Why chosen | Runtime? |
|---|---|---|---|---|---|
| React | ^18.3.1 | UI framework | `package.json` | Component model, hooks | Runtime |
| TypeScript | ~5.6.3 | Type safety | `package.json` | The whole codebase is typed | Build-time |
| Vite | ^5.4.11 | Dev server + bundler | `vite.config.ts` | Fast HMR, ES2020 output | Both |
| Tailwind CSS | ^3.4.14 | Styling | `tailwind.config.js`, `styles.css` | Design tokens | Runtime (CSS) |
| react-router-dom | ^6.28.0 | Routing | `App.tsx` | SPA routing | Runtime |
| @mediapipe/tasks-vision | **0.10.14** | Hands, faces, segmentation | `useSignRecognition`, `portrait/` | Browser-local inference | Runtime (CDN WASM) |
| Node.js test runner | 22.23.1 | Unit tests | `package.json` `test` script | No test dependency needed | Dev only |
| `contrast-check.mjs` | — | WCAG contrast audit | `frontend/root` | Accessibility gate | Dev only |

### 5.2 Backend / ML

| Technology | Version | Purpose | Location | Why chosen | Runtime? |
|---|---|---|---|---|---|
| Python | 3.11.9 | Language | `.venv` | — | Runtime |
| FastAPI | 0.115.6 | REST + WebSocket | `app/main.py` | Async, typed | Runtime |
| uvicorn | 0.32.1 | ASGI server | `run.bat` | Standard ASGI server | Runtime |
| pydantic | 2.10.4 | Validation | `api/record.py` | Schema validation | Runtime |
| pydantic-settings | 2.6.1 | Env config | `core/config.py` | Typed settings | Runtime |
| PyTorch | **2.13.0+cpu** | GRU training + inference | `scripts/train_lstm.py`, `recognizer.py` | Native GRU cell | Runtime |
| scikit-learn | 1.5.2 | Metrics + split | `train_lstm.py`, `dataset_seq.py` | Stratified splitting, reports | Training only |
| NumPy | 1.26.4 | Array maths | `ml/` | — | Runtime |
| MediaPipe (Python) | 0.10.14 | Landmark extraction for dataset prep | `ml/landmarks.py` | Same models as the browser | Data prep only |
| opencv-contrib-python | 4.10.0.84 | Video decoding | `ml/sequences.py` | Reads `.mp4` | Data prep only |
| matplotlib | 3.9.2 | Confusion matrix | `train_lstm.py` | Plotting | Training only |
| websockets | 17.0.1 | WS test client | verification only | — | Dev only |

### 5.3 Speech

| Technology | Version | Purpose | Location | Why chosen | Runtime? |
|---|---|---|---|---|---|
| Web Speech API | browser | Primary TTS | `speech/browserProvider.ts` | Zero install | Optional |
| `transformers` | 5.19.0 | MMS VITS inference | `tools/tts-service` | Only engine with **both** hi and kn | Optional |
| FastAPI + uvicorn (service) | 0.143.1 / 0.54.0 | Speech HTTP service | `tools/tts-service/service.py` | Loopback HTTP | Optional |
| Piper1 | optional | Better Hindi | `tts_engines.py` | No Kannada voice → not default | Optional |
| eSpeak NG | optional | Always-available fallback | `tts_engines.py` | Covers hi and kn, no download | Optional |

**Why MMS:** Piper's own voice list has `hi_IN` but **no** `kn_*` **[V]**.
eSpeak NG covers both but sounds robotic. MMS ships genuine neural voices for both
**[V]**.

### 5.4 Not present

Deliberately absent, and therefore not claimed: databases, ORMs, message
queues, authentication libraries, Docker, Kubernetes, CI configuration, and any
cloud TTS or translation SDK. **There is no API key anywhere in this project.**

---

## CHAPTER 6 — FRONTEND IMPLEMENTATION

### 6.1 Overview

A seven-route SPA. One route (`/translator`) is stateful; the rest are
documentation views.

### 6.2 Entry point

`src/main.tsx` applies the persisted high-contrast theme **before first paint**,
so there is no theme flash **[S]**.

### 6.3 Routing

| Route | Component |
|---|---|
| `/` | `Home` |
| `/translator` | `Translator` |
| `/how-it-works` | `HowItWorks` |
| `/about` | `About` |
| `/dataset` | `Dataset` |
| `/settings` | `SettingsPage` |
| `*` | `NotFoundPage` |

SPA fallback is declared in both `vercel.json` and `public/_redirects` **[S]**.

### 6.4 Page structure

`Translator` is a two-column grid (`lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]`):
left column = camera and calibration; right column = detected sign, translation,
controls **[S]**.

### 6.5 Main components

| Component | Responsibility |
|---|---|
| `CameraPanel` | Camera workspace card, 4:3 frame, status bar |
| `HandOverlay` | Canvas drawing the 21-point skeleton in five finger colours |
| `PrimaryUserDebugOverlay` | Debug canvas: face boxes, torso region, hand associations |
| `DetectedSignCard` | Last accepted sign plus confidence meter |
| `TranslationCard` | Sentence output plus the output-language selector |
| `ControlsCard` | Speak / Stop / Space / Undo / Clear, auto-speak, speech errors |
| `PortraitCanvas` | Portrait overlay canvas (above video, below skeleton) |
| `PortraitControls` | Effect selector and blur-strength slider |
| `SampleCollector` | Calibration: record your own landmark samples |

### 6.6 Custom hooks

`useWebcam`, `useSignRecognition`, `useSpeech`, `useAppSettings`,
`useOutputLanguage`, `usePortraitEffect`.

### 6.7 State management

No Redux or external store. Local `useState`, a `Ref` sign buffer, and two
module-level singletons (`ttsController`, `primaryUserTracker`) that publish
state through subscription callbacks **[S]**.

### 6.8 Camera initialisation

`getUserMedia({ audio: false, video: { facingMode: 'user', width: {ideal: 640},
height: {ideal: 480} } })`. Exactly one stream is ever created **[S]**.

### 6.9 Webcam lifecycle

The `<video>` mounts when status becomes `active`, so the stream is attached in
a follow-up effect. `stop()` stops every track and nulls `srcObject` **[S]**.

### 6.10 Hand-landmark visualisation

Drawn per frame; x is flipped to `(1 - x)` to compensate for the mirrored video
**[S]**.

### 6.11 Recognition controls

Start / Stop / Pause / Resume. A `700 ms` cooldown prevents one sign producing
two words **[S]**.

### 6.12 Language selection

A `<select>` in `TranslationCard`, persisted to `isl-output-language`, and
broadcast in-tab via the `isl-language-changed` `CustomEvent` **[S]**.

### 6.13 Translation display

Rebuilt from stored sign IDs on every language change **[S]**.

### 6.14 Speech controls

Speak / Stop plus an auto-speak switch. Error banners distinguish failure kinds
**[S]**.

### 6.15 Portrait Mode controls

Three modes; the slider appears only for Portrait Blur; the active effect is
named in the camera status strip **[V]**.

### 6.16 Loading and error states

`CameraStatus` (6 states), `RecStatus` (5 states), `SocketStatus` (5 states),
`PortraitStatus` (5 states), `TtsErrorKind` (8 kinds) **[S]**.

### 6.17 Responsive design

Tailwind breakpoints throughout; `vite.config.ts` sets `server.host: true` for
LAN testing **[S]**.

### 6.18 Accessibility

Skip link, `role="status"`/`aria-live` on dynamic text, focus-visible rings,
`role="switch"` on the toggle, and a contrast gate that passes **[V]**.

### 6.19 Component cleanup

Unmount effects cancel rAF, close MediaPipe tasks, close the WebSocket, stop
speech, release the segmenter, and stop all camera tracks **[S]**.

**Full per-component detail is in `PROJECT_TECHNICAL_DOCUMENTATION.md`.**

---

## CHAPTER 7 — CAMERA AND COMPUTER VISION

### 7.1 Webcam access

`navigator.mediaDevices.getUserMedia` with `facingMode: 'user'` **[S]**.

### 7.2 Stream initialisation

Requested at ideal 640×480; the actual size may differ and is read from
`video.videoWidth` **[S]**.

### 7.3 Frame handling

A single `requestAnimationFrame` loop guarded by `video.readyState >= 2 &&
video.videoWidth > 0` **[S]**.

### 7.4 Hand detection

`HandLandmarker` from `@mediapipe/tasks-vision@0.10.14`, `runningMode: 'VIDEO'`,
`numHands: 2`, `delegate: 'CPU'` **[S]**.

### 7.5 Hand landmarks

21 points per hand in MediaPipe's canonical order: wrist, thumb (4), index (4),
middle (4), ring (4), pinky (4) **[S]**.

### 7.6 Landmark coordinates

`[x, y, z]` with x, y normalised to `[0, 1]` relative to the image, and z
relative depth **[S]**.

### 7.7 Landmark normalisation

`ml/features.py:40-50`. Three steps:

1. **Translate** — subtract landmark 0 (wrist) from all 21.
2. **Scale** — divide by `‖landmark[9] − wrist‖` (the wrist-to-middle-knuckle
   distance). If that is degenerate (< 1e-6), fall back to the mean distance
   from the wrist.
3. **Preserve depth** — z is scaled identically, so the 3D shape survives.

This makes the representation invariant to where the hand is in frame and how
far away it is.

### 7.8 Handedness

MediaPipe's label is appended as one binary feature: `1.0` for Right, `0.0` for
Left **[S]**.

### 7.9 Sequence collection

The backend buffers frames while a hand is visible, up to a cap of 90 frames
(~3 s at 30 fps) and a minimum of 12 usable frames **[S]**. On 6 consecutive
hand-absent frames it resamples to 32 and predicts once **[S]**.

### 7.10 Face detection

`FaceDetector` with `blaze_face_short_range` (float16), `minDetectionConfidence:
0.5`, `minSuppressionThreshold: 0.3` **[S]**.

### 7.11 Primary-user tracking

`primaryUserTracker.ts`. Faces are scored:

```
score = 0.65 · sizeScore + 0.25 · centeredness + 0.10 · confidence
sizeScore     = min(1, area / 0.12)
centeredness  = 1 − min(1, ‖centre − (0.5, 0.5)‖ / √0.5)
```

A track survives up to 18 lost frames; identity is preserved by IoU > 0.3; a
switch needs a 1.4× score advantage **[S]**. A torso region is estimated from
the face (height × 2.5, width × 1.8) and hands are associated by proximity,
velocity and temporal consistency **[S]**.

### 7.12 Mirroring and overlay alignment

The video uses CSS `scaleX(-1)`. The skeleton flips x to match; the portrait
canvas carries the same class, so all three layers align **[S]**.

### 7.13 Camera errors

`NotAllowedError` → permission denied; `NotFoundError`/`OverconstrainedError` →
no camera; `NotReadableError` → camera in use **[S]**.

### 7.14 Performance considerations

Inference runs in `requestAnimationFrame` on the main thread, which is a
**potential bottleneck** on low-end hardware — *engineering judgement, not a
measurement* **[?]**. `SEND_EVERY = 1` sends every frame to the backend **[S]**.

---

## CHAPTER 8 — MACHINE-LEARNING MODEL

### 8.1 ML problem definition

Multi-class **sequence classification** of word-level ISL signs from hand-motion
trajectories.

### 8.2 Classification task

Twenty classes, single label per sequence, mutually exclusive **[S]**.

### 8.3 Model architecture

```python
class SignGRU(nn.Module):
    def __init__(self, input_size=128, hidden=128, n_classes=20, layers=2, dropout=0.3):
        self.gru = nn.GRU(input_size, hidden, num_layers=layers,
                          batch_first=True, dropout=dropout if layers > 1 else 0.0)
        self.classifier = nn.Sequential(
            nn.Linear(hidden, hidden), nn.ReLU(), nn.Dropout(dropout),
            nn.Linear(hidden, n_classes))

    def forward(self, x):
        out, _ = self.gru(x)      # (B, L, hidden)
        out = out[:, -1, :]       # last timestep only
        return self.classifier(out)
```
(`scripts/train_lstm.py:43-60`)

### 8.4 Input representation

A `(32, 128)` float32 tensor: 32 time steps, 128 features per step **[B]**.

### 8.5 Feature extraction

Per hand: 21 landmarks × (x, y, z) = 63 values, plus 1 handedness bit = **64**.
Two hands concatenated = **128**. A missing hand contributes 64 zeros **[B]**.

### 8.6 Sequence construction

`resample_features`: if *T* ≥ 32, take 32 evenly spaced indices via `linspace`;
if *T* < 32, pad by repeating the first and last frames symmetrically — edge
repetition preserves motion, whereas zero-padding would create a fake pause
**[S]**.

### 8.7 Input tensor shape

`(batch, 32, 128)`; batch-first **[B]**.

### 8.8 Sequence length — 32 **[B]**
### 8.9 Feature dimension — 128 **[B]**
### 8.10 Number of classes — 20 **[B]**

### 8.11 Class-label mapping

`models/word_classes.json` and `ml/vocabulary.py`; the order is identical:
STILL, HELLO, THANK_YOU, GOOD_MORNING, GOOD_AFTERNOON, WHAT_IS_YOUR_NAME, MAYBE,
COME, DRINK, GIVE, CLEAN, COOK, CLOSE, BREAK, POUR, CRY, JUMP, TEA, KEY, WIFE
**[B]**.

### 8.12 GRU architecture and configuration

Two layers, hidden 128, dropout 0.3 between layers, batch-first **[B]**.

### 8.13 Hidden dimensions and layers

The checkpoint contains `gru.weight_ih_l0` and `gru.weight_ih_l1` only —
**exactly two layers**; each is `(384, 128)`, i.e. the GRU gate width
`3 × hidden` **[B]**.

### 8.14 Output layer

`Linear(128, 20)` **[B]**.

### 8.15 Activation and loss functions

ReLU inside the head; softmax at inference; `CrossEntropyLoss` with
inverse-frequency class weights **[S]**.

### 8.16 Optimiser

Adam, learning rate `1e-3`, batch size 16, up to 60 epochs, early stopping on
validation accuracy with patience 15 **[S]**.

### 8.17 Training procedure

Load sequences → shuffle (seed 42) → stratified split → optional on-the-fly
augmentation → train → select best validation state **[S]**.

Augmentation (opt-in via `--augment`, **not default**) applies Gaussian jitter
(σ = 0.02), a ±3-frame time shift, a random 70–100 % temporal crop resampled
back to 32, and a 50 %-probability horizontal mirror that also flips the
handedness bit **[S]**.

### 8.18 Validation procedure

Accuracy on the held-out validation split each epoch; the best state dict is
kept **[S]**.

### 8.19 Test procedure

The best validation checkpoint is evaluated once on the test split, producing
accuracy, macro precision, recall, F1, a full classification report, a
per-class accuracy map and a confusion matrix PNG **[S]**.

### 8.20 Model serialization

`torch.save({state_dict, classes, seq_len, input_size, hidden, n_classes})` →
`models/word_model.pt` (853.36 KB, measured) **[A/V]**.

### 8.21 Model loading

`WordRecognizer.load()` rebuilds `SignGRU` by **importing the training script's
class** — `from scripts.train_lstm import SignGRU` — then loads the state dict
and calls `.eval()` on CPU **[S]**.

### 8.22 Inference

`torch.from_numpy(features).unsqueeze(0)` → forward → softmax → argmax, all
under `torch.no_grad()` **[S]**.

### 8.23 Prediction post-processing

`STILL` is converted to `sign: None, confidence: 0.0` and never emitted **[B]**.
This is the deliberate design that makes the *hand-lowering* gesture the word
boundary rather than a word.

### 8.24 Confidence threshold

`CONFIDENCE_THRESHOLD = 0.60`; below it, `accepted: False` **[B]**.

### 8.25 Temporal smoothing

Two mechanisms. Server-side: a prediction is emitted **only** at the sign
boundary, never mid-sign **[B]**. Client-side: a `700 ms` cooldown plus a
same-sign guard prevents one sign being added twice **[S]**. There is **no
majority-vote window** in the current implementation **[S]**.

### 8.26 Model limitations

- 217 k parameters trained on 1,407 sequences — small data, so overfitting risk
  is real; best validation accuracy of 1.0 alongside 0.981 test accuracy is
  consistent with a small, separable dataset **[A + judgement]**.
- 1,407 sequences from an unstated number of signers; signer diversity cannot be
  assessed **[?]**.
- 90-frame buffer cap means very long signs are truncated **[S]**.
- Errors concentrate on the most similar gestures (BREAK 0.818, COME 0.90,
  THANK_YOU 0.909) **[A]**.

### 8.27 GRU operation

A gated recurrent unit processes the sequence step by step, maintaining a
hidden state that carries motion context:

```
z_t = σ(W_z x_t + U_z h_{t−1} + b_z)          update gate
r_t = σ(W_r x_t + U_r h_{t−1} + b_r)          reset gate
n_t = tanh(W_n x_t + U_n (r_t ⊙ h_{t−1}) + b_n)  candidate
h_t = (1 − z_t) ⊙ n_t + z_t ⊙ h_{t−1}
```

where **x_t** ∈ ℝ¹²⁸ is the feature vector at step *t*, **h_t** ∈ ℝ¹²⁸ is the
hidden state, σ is the logistic sigmoid and ⊙ is element-wise multiplication.
The reset gate *r_t* decides how much past memory to keep; the update gate *z_t*
decides how much of the candidate to write. For a sign, the final state
**h₃₂** therefore encodes the whole gesture, which is why only the last timestep
is used **[S]**.

### 8.28 Model architecture table

| Layer | Type | In → Out | Parameters | Source |
|---|---|---|---|---|
| GRU 1 | `nn.GRU` | 128 → 128 | 384·128 + 384·128 + 384 + 384 = 99,072 | checkpoint |
| GRU 2 | `nn.GRU` | 128 → 128 | 99,072 | checkpoint |
| FC 1 | `nn.Linear` + ReLU + Dropout | 128 → 128 | 16,512 | checkpoint |
| FC 2 | `nn.Linear` | 128 → 20 | 2,580 | checkpoint |
| **Total** | | | **217,236** | measured |

---

## CHAPTER 9 — DATASET AND DATA PREPROCESSING

### 9.1 Purpose

Supply the supervised sequences from which the GRU learns sign motion.

### 9.2 Source

A video dataset identified in code comments as the Kaggle *"Indian Sign
Language Video Dataset"* (`prasadshet/indian-sign-language-video-dataset`,
60 videos per sign) **[S]**. `kagglehub 1.0.2` is installed **[V]**.
**The raw videos are not in this repository and were not inspected [?]**. The
stated MIT licence appears only in a code comment; no licence file exists **[?]**.

### 9.3 Organisation

```
dataset/seq/<SIGN>/seq_NNNNN.npz   preprocessed sequences
dataset/seq/<SIGN>/user_NNNNN.npz  in-app calibration samples
dataset/processed/                  exists but is EMPTY [V]
dataset/raw/                        does NOT exist [V]
```

### 9.4 Sign classes

Twenty, listed in §8.11.

### 9.5 Number of samples

**1,407** `.npz` files, 17.5 MB **[B]**. Note the distinction: the raw videos are
not in the repository; **1,407 is the count of model inputs**, derived by
enumerating files, not by counting filenames alone.

### 9.6 Class distribution

| Class | n | | Class | n |
|---|---|---|---|---|
| HELLO | 92 | | MAYBE | 70 |
| GOOD_AFTERNOON | 81 | | COME | 70 |
| BREAK / CLEAN / CLOSE / COOK / CRY / DRINK / GOOD_MORNING / JUMP / KEY / POUR / TEA / THANK_YOU / WHAT_IS_YOUR_NAME / WIFE | 70–72 | | **STILL** | **30** |

STILL is the least represented class; HELLO the most; ratio ≈ 3.1× **[B]**.
The script comment claiming "4×" **[S]** does not match the measured data
**[B]** — see the verification matrix.

**Composition:** 1,170 dataset-derived + 237 user-recorded (16.8 % user data)
**[B]**, independently confirmed by the live `/api/sample-counts` endpoint.

### 9.7 Data format

Compressed `.npz` containing a single key `seq` of shape `(32, 128)`, dtype
`float32`. User-recorded files additionally carry `source = 'user'` and a
`timestamp` **[B]**.

### 9.8 Feature representation

Identical to inference (§8.5). Training and inference share
`ml/features.py`, which structurally prevents format drift **[S]**.

### 9.9 Preprocessing

Video → `LandmarkExtractor` (MediaPipe) → per-frame 128-d vectors → drop frames
with no confident hand (confidence ≥ 0.5) → resample to 32 **[S]**.
`prepare_word_dataset.py` parallelises this with a `ProcessPoolExecutor` and
supports resuming by skipping already-produced files **[S]**.

### 9.10 Sequence generation

See §8.6. Frames are trimmed to hand-visible frames first, then resampled
**[S]**.

### 9.11 Label encoding

Integer index aligned with `ISL_VOCAB` order; stored as `int32` **[S]**.

### 9.12 Split

Stratified at the **sequence** level: 70 / 15 / 15 with `random_state` 42 then 43
**[S]**. Test support 211 is exactly `ceil(1407 × 0.15)` **[B]**.

### 9.13 Class imbalance

Present but moderate (§9.6). Handled with inverse-frequency class weights
normalised to mean 1.0 **[S]**.

### 9.14 Data-leakage risks

The split is at sequence level with different sources per video, so no window of
one video can appear in two splits **[S]**. Two residual risks are worth
stating: the 237 user-recorded samples come from few people and may be highly
correlated **[?]**; and augmentation is applied only to training data, never to
validation or test **[S]**.

### 9.15 Dataset limitations

Unknown signer count and diversity **[?]**; no held-out *signer* split, so
cross-signer generalisation is unmeasured **[?]**; no lighting, background or
occlusion variation is recorded in the artefact **[?]**.

### 9.16 Licensing and attribution

Not documented in the repository beyond a comment **[?]**.

---

## CHAPTER 10 — BACKEND IMPLEMENTATION

### 10.1 Overview

A thin FastAPI service: it loads the model once and classifies landmark
sequences. **It performs no computer vision** — the browser does that.

### 10.2 Entry point

`backend/app/main.py`, `uvicorn app.main:app` **[S]**.

### 10.3 Configuration

`core/config.py`, a `pydantic-settings` `BaseSettings` reading `backend/.env`
**[S]**.

### 10.4 Startup / shutdown

The lifespan handler constructs `WordRecognizer`, loads the model, logs the class
count and sequence length, and **degrades gracefully** if the model is missing
(logging a warning rather than crashing) **[S]**.

### 10.5 API routes

| Method | Route | Purpose |
|---|---|---|
| GET | `/` | Service banner |
| GET | `/health` | Model status |
| GET | `/docs` | Interactive API docs (FastAPI built-in) |
| WS | `/ws/predict` | Real-time prediction |
| GET | `/api/vocab` | Vocabulary list |
| POST | `/api/record-sample` | Save a user calibration sample |
| GET | `/api/sample-counts` | User sample counts per sign |

### 10.6 Request validation

Pydantic models `HandIn`, `FrameIn`, `RecordSampleIn` **[S]**.

### 10.7 Response schemas

See Appendix C for worked examples, all captured from the live service **[B]**.

### 10.8 Model loading

Once, at startup (§8.21) **[S]**.

### 10.9 Inference service

`PredictSession` per WebSocket connection **[S]**.

### 10.10 Error handling

Prediction exceptions are caught and returned as `{"sign": null, ...,
"error": "..."}` so one bad frame cannot kill the socket **[S]**.

### 10.11 Logging

`logging` configured to `LOG_LEVEL`; the logger name is `isl-app` **[S]**.

### 10.12 CORS

`CORSMiddleware` with an explicit origin allow-list, defaulting to
`http://localhost:5173` and `http://127.0.0.1:5173`; `allow_credentials=True`,
all methods and headers **[S]**. Verified: an allowed origin receives the header;
a disallowed origin does not **[B]**.

### 10.13 Authentication — **not implemented** **[S]**
### 10.14 Rate limiting — **not implemented** **[S]**
### 10.15 File handling — **not implemented** **[S]**
### 10.16 Database — **not implemented** **[S]**

Calibration data is written as `.npz` files directly to `dataset/seq/` **[S]**.
There is no ORM, no schema and no migration system.

### 10.17 WebSocket lifecycle

Accept → reject with close code 1011 if no model → per-connection session →
loop handling `ping`, `reset` and frames → graceful `WebSocketDisconnect` **[S]**.

### 10.18 Health checks

`GET /health` reports `status`, `environment`, `model_loaded`, `num_classes`,
`seq_len`, `model_path`, `version`. Verified live:
`{"status":"ok","environment":"development","model_loaded":true,"num_classes":20,"seq_len":32,...}` **[B]**.

### 10.19 External services

**None.** The backend makes no outbound network calls **[S]**.

### 10.20 API reference table

| Proto | Route | Purpose | Input | Output | Auth | Errors | Source |
|---|---|---|---|---|---|---|---|
| GET | `/` | Banner | — | JSON | None | — | `main.py:75` |
| GET | `/health` | Model status | — | JSON | None | — | `main.py:86` |
| WS | `/ws/predict` | Prediction | `{hands}` / `{type:"ping"\|"reset"}` | Prediction JSON | None | `model_not_loaded`, `bad_json` | `api/ws.py:25` |
| GET | `/api/vocab` | Vocabulary | — | `{"vocab": [...]}` | None | — | `api/record.py:66` |
| POST | `/api/record-sample` | Calibration | `{sign, frames}` | `{saved, sign, sample_index, frames_used}` | None | 400 unknown sign / too few frames | `api/record.py:71` |
| GET | `/api/sample-counts` | User sample counts | — | `{"counts": {...}}` | None | — | `api/record.py:117` |

---

## CHAPTER 11 — TRANSLATION SYSTEM

### 11.1 Recognised sign identifiers

The model's 20 class strings, e.g. `HELLO` **[S]**.

### 11.2 Internal label representation

`SignId` is a TypeScript union of the 20 classes plus `SPACE` — 21 members.
These identifiers are **the model's contract and are never translated or
renamed** **[S]**.

### 11.3–11.5 Language mappings

A static lookup table. Full contents in **Appendix B**. Summary: 19 user-facing
signs plus `STILL` (deliberately empty, never displayed or spoken) and `SPACE`
(a separator) **[S]**.

### 11.6 Lookup strategy

`TRANSLATIONS: readonly TranslationEntry[]` indexed into
`TRANSLATION_MAP: ReadonlyMap` for O(1) lookup **[S]**.

### 11.7 Language switching

`setLanguage` updates state, persists to `isl-output-language`, and dispatches
`isl-language-changed` **[S]**.

### 11.8 Re-translation of stored signs

**This is the most important design property.** The sentence is stored as an
array of sign IDs, never as text:

```ts
sentenceIdsRef.current = ['HELLO', 'THANK_YOU']
setSentence(translateSentence(sentenceIdsRef.current, language))
```

Switching language re-derives the whole sentence from the IDs, so a
translated-then-retranslated string can never accumulate errors **[S]**.
Regression-tested for en → hi → kn → en **[S]**.

### 11.9 Unsupported labels

`translateSign` returns `''` for an unknown ID; `parseSignId` returns `null`.
Neither can leak a raw class identifier into displayed text **[S]**.

### 11.10 Translation limitations

- **This is a dictionary, not natural-language translation.** There is no
  grammar, no morphology, no word-order rearrangement, and no handling of
  agreement. `GOOD_MORNING` is a fixed phrase, not a construction **[S]**.
- Only 20 signs exist; anything outside the vocabulary is not recognised and
  therefore never reaches the translator **[S]**.
- The translations are single canonical readings; regional or alternative
  renditions of a sign are not represented **[S]**.

---

## CHAPTER 12 — TEXT-TO-SPEECH SYSTEM

### 12.1 Architecture

A provider chain. `TtsController` owns an ordered list
`[BrowserTtsProvider, LocalTtsProvider]` and uses the first provider that both
*declares* support for the language and *returns success* **[S]**.

### 12.2 Browser speech synthesis

`window.speechSynthesis` with explicit voice matching on normalised BCP-47 tags
**[S]**.

### 12.3 System voice detection

`loadVoices()` waits for `voiceschanged` **and** polls every 100 ms, giving up
only after the timeout; an already-resolved empty list is cached so the wait
never happens twice **[S]**.

**Measured on the development machine:** Chrome exposes 22 voices, including
`hi-IN ONLINE Google हिन्दी`, and **zero** Kannada voices **[V]**. Windows SAPI
and OneCore expose only `en-US` **[V]**.

### 12.4 BCP-47 identifiers

`en-US`, `hi-IN`, `kn-IN` **[S]**.

### 12.5 English speech path

Any English voice, matched exactly then by language prefix; if no voice at all,
English alone may fall back to the platform default **[S]**.

### 12.6 Hindi speech path

**Two different providers in practice.** If Chrome exposes a Hindi voice (as on
the development machine), Hindi is spoken by the Web Speech API and the local
service is never contacted **[V]**. If no Hindi voice exists, the local service
is used **[S]**.

### 12.7 Kannada speech path

**Always** the local service on the development machine, because no Kannada
voice exists at OS or browser level **[V]**.

> **Direct answer to "do Hindi and Kannada use the same provider?"** — *No, not
> in practice on this machine.* The architecture is identical for both (same
> controller, same fallback chain), but Hindi resolves to the browser provider
> and Kannada to the local service, precisely because the available voices
> differ **[V]**.

### 12.8 Offline speech service

A separate FastAPI application on `127.0.0.1:8765` under
`frontend/tools/tts-service/` **[S]**.

| Endpoint | Purpose |
|---|---|
| `GET /health` | `{"ok":true,"engines":{"en":..,"hi":..,"kn":..},"loaded":{...}}` |
| `POST /speak` | `{"text","lang","tag","rate","pitch"}` → `audio/wav` |

The service binds **loopback only** and rejects any non-loopback `Origin` with
`403 origin not allowed` — verified live **[B]**.

### 12.9 Local speech models

Meta Multilingual Speech VITS via `transformers`:
`facebook/mms-tts-hin`, `facebook/mms-tts-kan`, `facebook/mms-tts-eng`.
Measured on disk: **138.5 MB each, 416 MB total** **[V]**.

Alternatives are auto-detected: Piper1 (Hindi only) and eSpeak NG (both, but
formant quality) **[S]**.

### 12.10 Audio generation

`transformers.VitsModel` on CPU, text chunked to ≤160 characters, peak
normalised to 0.92, encoded as 16-bit mono WAV **[S]**. Verified: all six
test utterances returned HTTP 200, `content-type: audio/wav`, valid RIFF headers
**[B]**.

### 12.11 Audio playback

A `Blob` → `URL.createObjectURL` → `HTMLAudioElement.play()`. The object URL is
revoked on end, error and stop **[S]**.

### 12.12 Voice selection

Exact tag, then language prefix. **A voice is never borrowed across languages** —
an English voice is never attached to Hindi or Kannada text, even if the user
explicitly selected it **[S]**.

### 12.13 Service health checking

`/health` is probed with a 2.5 s timeout. A success is cached for 30 s; a
**failure is cached for only 2 s**, so a service started after the page is
picked up almost immediately **[S]**.

### 12.14 Startup and model-loading lifecycle

Model loading was moved out of the FastAPI lifespan into a background thread.
This was a deliberate fix: previously the port was not listening for ~25 s,
during which the frontend's health probe got connection refused and the app
reported the service as unavailable **[S, verified B]**.

### 12.15 Retry and recovery

The controller re-probes every 4 s while any language is unavailable, so
starting the service restores speech **without a page reload** — verified in a
real browser **[V]**. A **Try again** button is also provided **[S]**.

### 12.16 Cancellation

`stop()` pauses and rewinds the audio element, aborts any in-flight fetch,
revokes the object URL, and cancels queued speech. A superseded request never
reports success; it returns a distinct `superseded` outcome **[S]**.

### 12.17 Error handling

Eight distinct `TtsErrorKind` values are produced — `empty-text`,
`browser-unsupported`, `no-voice`, `service-offline`, `unsupported-language`,
`request-failed`, `playback-failed`, `superseded` — because these require
*different* user actions. A blocked `play()` is reported as `playback-failed`
with "press Speak once more", not as a connection error **[S]**.

### 12.18 Privacy

Audio never leaves the machine. The service sends no cookies and accepts no
credentials **[S]**.

### 12.19 Licensing

MMS models are **CC-BY-NC-4.0** — free, no subscription, **non-commercial** use.
This suits an academic project but would require a different engine for
commercial deployment **[V]**.

### 12.20 Limitations

- The speech service must be started manually **[S]**.
- Kannada and Hindi audio quality is that of a small VITS model — intelligible,
  but not studio-grade **[V]**.
- `pitch` is ignored by the offline engines (VITS has no pitch control); the
  service returns `X-TTS-Pitch: ignored` **[S]**.
- Audible intelligibility could **not** be verified — this environment has no
  audio output device **[?]**.
- The first request after start-up can be slow while a model loads **[S]**.

---

## CHAPTER 13 — PORTRAIT MODE AND BACKGROUND REMOVAL

### 13.1 Feature overview

Three modes: **Off**, **Portrait Blur**, **Remove Background** **[V]**.

### 13.2 Effect selection

A `<select>` in the camera-controls row; the active effect is named in the
camera status strip as a `StatusPill` **[V]**.

### 13.3 MediaPipe ImageSegmenter

`ImageSegmenter` from the already-installed `@mediapipe/tasks-vision@0.10.14`, so
**no new dependency was added** **[S]**.

### 13.4 Segmentation model

`selfie_segmenter` float16 — **0.24 MB**, measured. Chosen over
`deeplab_v3` (2.65 MB) and `selfie_multiclass_256x256` (15.61 MB) on measured
size **[V]**.

### 13.5 Model-loading strategy

A module-level singleton. Switching effects reuses the same instance and never
closes it; the model is released only when the camera view unmounts. **Nothing
is loaded at all while the effect is Off** — the renderer is not even constructed
**[S]**.

### 13.6 Segmentation mask

`confidenceMasks[0]`, a `Float32Array` of **person** probability, released
in a `finally` block so GPU memory is not leaked **[S]**.

Two properties of this mask were measured directly in a real browser with a real
webcam-sized stream, and both matter:

1. **Polarity.** High values are the person. Measured against a subject whose
   ground truth was known: person 0.799, background 0.000 **[V]**.
2. **Size.** MediaPipe returns the mask at the **input image** size — 640×480
   for a 640×480 stream — not at the model's 256×256 input **[V]**. The renderer
   therefore resamples it to a fixed 256×256 working resolution before any pixel
   maths, so erosion and feathering are resolution-independent and the per-frame
   cost is identical whether the webcam streams 640×480 or 1920×1080 **[S]**.

### 13.7 Temporal smoothing

Exponential moving average, α = 0.35. One noisy frame cannot flip a pixel;
sustained evidence still wins **[S, unit-tested]**.

### 13.8 Mask erosion

Separable min filter, radius 1. **This is the anti-halo step.** The outermost
ring of any segmentation mask contains a mix of person and background; showing
it verbatim paints the old background onto the silhouette as a rim **[S]**.

### 13.9 Edge feathering

Separable two-pass box blur (radius 1) followed by a smoothstep edge-contrast
window (0.35 → 0.65), which collapses the dithered band into a narrow gradient.
Bilinear smoothing on the mask upscale adds a final 1–2 px feather for free **[S]**.

### 13.10 Background blur

The video is drawn into a canvas at `1 / (3 + intensity × 9)` scale with a small
`ctx.filter` blur, then scaled back up. This is far cheaper than a full-resolution
blur and produces a smoother falloff **[S]**. *Measured effect: background
scanline contrast fell from 226 to 47 [V].*

### 13.11 Background replacement

A flat `#241c18` fill, chosen to match the existing `.camera-frame` so the result
looks intentional **[S]**. *Measured: the output canvas background measured
exactly `rgb(36,28,24)` and background contrast fell from 226 to 0 [V].*

### 13.12 Canvas compositing

Background layer, then foreground layer masked with `destination-in` **[S]**.

### 13.13 Rendering loop

`requestAnimationFrame`, with segmentation throttled to **24 fps**
(`SEGMENT_INTERVAL_MS = 40`) rather than running inference on every display
frame **[S]**.

### 13.14 Performance optimisation

- One camera stream; the video is never re-sourced **[S]**
- 0.24 MB model, loaded once **[S]**
- CPU delegate, leaving the GPU free for hand landmarks **[S]**
- Three reusable canvases, resized only on dimension change **[S]**
- `Float32Array` buffers allocated once at 256×256 **[S]`
- The matte resampled from camera resolution to a fixed 256×256 working buffer, so cost does not scale with camera resolution **[S]**

### 13.15 Resource cleanup

`dispose()` cancels the frame loop, releases all canvases and mask history, and
is idempotent. The hook additionally calls `releasePortraitSegmenter()` on
unmount **[S]**.

### 13.16 Error handling

Five states — `off`, `loading`, `active`, `unavailable`, `degraded` **[S]**.
The frame loop is wrapped so an exception cannot kill it permanently; this was a
real bug found in browser testing **[V]**.

### 13.17 Integration with hand recognition

**This is the architecturally important part.** `useSignRecognition` reads the
`<video>` element; the portrait renderer only ever *reads* that element and writes
to a *separate* canvas layered above it. The z-order is:

```
<video>  →  <PortraitCanvas>  →  <HandOverlay>  →  <PrimaryUserDebugOverlay>
```

The video element is never filtered, never resized and never re-sourced — it is
only ever passed as the source argument of `drawImage`. A unit test asserts that
`srcObject`, `style` and `className` are never assigned **[S]**, and the DOM was
verified in a real browser **[V]**. The recogniser is therefore *structurally
incapable* of seeing a blurred or segmented frame.

### 13.18 Multiple-person limitations

**`selfie_segmenter` is not instance segmentation.** It isolates the single most
*prominent* person and returns **no identity and no position**. It cannot select
the person nearest the centre of the frame **[V]**.

Rather than pretend otherwise, the application reuses the *existing* face
detector's count (no new model) and displays: *"N people in frame — the effect
isolates the most prominent one, not the person nearest the centre."*
Sign recognition still correctly follows the primary user selected by face
tracking **[V]**.

Achieving true centre-preference would require instance segmentation with
per-mask identity matching — substantially heavier. Given the 4 GB VRAM target,
that was judged the wrong trade and the limitation was documented instead of
shipping misleading behaviour **[S]**.

**Not verified:** matte quality on real human faces under real lighting **[?]**.

---

## CHAPTER 14 — SECURITY, PRIVACY, AND DATA HANDLING

### 14.1 Camera permissions

Requested only in response to a user action (pressing Start) **[S]**.

### 14.2 Camera-stream lifecycle

Tracks stopped on unmount, on Stop, and on error **[S]**.

### 14.3 Local processing

Hand landmarks, face detection and person segmentation all run in the browser
**[S]**.

### 14.4 Data sent to the backend

**Only** `{ handedness, handedness_score, landmarks: 21×3 }` per hand **[S]**.
No images, no video, no audio **[S]**.

### 14.5 External API calls

| Destination | Purpose | When |
|---|---|---|
| `cdn.jsdelivr.net` | MediaPipe WASM | First load only, browser-cached |
| `storage.googleapis.com` | Hand-landmark, face and segmentation models | First load only |
| `huggingface.co` | Speech voice models | One-time install only |

**No analytics, no telemetry, no third-party API, no API key anywhere** **[S]**.

### 14.6 Environment-variable handling

`.env` files are git-ignored. `VITE_*` variables are **inlined into the client
bundle at build time**, which `.env.example` explicitly warns against using for
secrets **[S]**.

### 14.7 CORS

Backend: explicit origin allow-list **[S]**. Speech service: loopback-only
binding plus a per-request origin check that returns `403` for anything else
**[V]**.

### 14.8 Input validation

Pydantic models validate all record-sample bodies; the sign must be in the
vocabulary; fewer than 12 usable frames is rejected **[S]**.

### 14.9 File upload — **not applicable**; no upload endpoint exists **[S]**

### 14.10 Authentication — **not implemented** **[S]**

**Consequence, stated plainly:** the backend and the speech service are
unauthenticated. Anyone who can reach them can submit calibration data or
request audio. This is acceptable for a local development deployment on
`127.0.0.1` but **must** be addressed before any network exposure.

### 14.11 Secret management

**There are no secrets in this project.** No API keys, tokens or credentials are
required or stored **[S]**.

### 14.12 Logging and sensitive data

Backend logs model paths and error messages. **No landmark data, frames or
audio are logged** **[S]**.

### 14.13 Model downloads

First load requires internet. After caching, MediaPipe works from the browser
cache. The speech service was verified to work with `HF_HUB_OFFLINE=1` **[V]**.

> **Is the application fully offline?** **Not on first run.** MediaPipe WASM and
> the hand-landmark, face and segmentation models must be fetched once, and the
> speech models must be downloaded once by `install.bat`. **After that**, the
> entire application — recognition, translation, speech and portrait effects —
> runs with no network access. This two-phase behaviour was verified for the
> speech service **[V]**; it is **not verified for a cold browser cache with no
> network [?]**.

### 14.14 Potential risks

| Risk | Assessment |
|---|---|
| Unauthenticated local services | Real; mitigated by loopback-only binding **[S]** |
| Model files fetched over HTTPS from Google storage | Supply-chain dependency; no integrity pinning **[S]** |
| `POST /api/record-sample` writes to the dataset directory | Path traversal is prevented because the sign is validated against a fixed vocabulary before being joined to a path **[S]** |
| Backend binds `0.0.0.0` by default | Exposes it on the LAN; documented **[S]** |
| No rate limiting | Calibration endpoint is unbounded **[S]** |

---

## CHAPTER 15 — INSTALLATION AND CONFIGURATION

Full step-by-step instructions, verified commands and a troubleshooting matrix
are in **`PROJECT_SETUP_AND_TESTING_GUIDE.md`**. This chapter is the summary.

### 15.1–15.8 Prerequisites, structure, environments

See the guide. Summary: Python 3.11.9 and Node 22.23.1, a Chromium-based
browser, and a trained model already present at `models/word_model.pt` **[V]**.

### 15.9 Local speech service installation

```powershell
cd F:\Final Project\frontend\tools\tts-service
install.bat     # one-time; ~416 MB download
run.bat         # start; leave open
```

### 15.10 Starting the application

```powershell
# terminal 1
cd F:\Final Project\backend
& "F:\Final Project\.venv\Scripts\Activate.ps1"
uvicorn app.main:app --reload

# terminal 2
cd F:\Final Project\frontend
npm run dev

# terminal 3 (optional, for Hindi/Kannada)
cd F:\Final Project\frontend\tools\tts-service
run.bat
```

### 15.14 Production build

```powershell
cd F:\Final Project\frontend
npm run build     # tsc && vite build
```

---

## CHAPTER 16 — TESTING AND QUALITY ASSURANCE

### 16.1 Strategy

Dependency-injected service modules are tested against hand-written fakes, under
**Node's built-in test runner** — there is no jsdom and no test framework
dependency **[S]**.

### 16.2–16.8 Test suites

| Suite | Focus |
|---|---|
| `tests/translation.test.ts` | All 21 translation rows, script correctness, no Romanisation, re-translation from IDs |
| `tests/tts.test.ts` | Voice selection, no cross-language voice borrowing, dispatch contract |
| `tests/speech.test.ts` | Controller, both providers, fallback, errors, cancellation, dedupe, Unicode, Kannada regression |
| `tests/languagePipeline.test.ts` | The stale-closure bug, sentence buffer, real `ws.ts` against a fake socket |
| `tests/portrait.test.ts` | Mask maths, renderer lifecycle, compositing, cleanup |
| `tests/helpers/browser.ts` | Browser API fakes: speech, audio, loopback service |
| `tools/tts-service/test_service.py` | Engine registry, model presence, WAV encoding |

### 16.9–16.12 Quality gates

| Gate | Command | Result **[V]** |
|---|---|---|
| Unit tests | `npm test` | **171 tests, 40 suites, 171 pass, 0 fail** (8.6 s) |
| Types | `npx tsc --noEmit` | exit 0 |
| Production build | `npm run build` | 427.04 kB JS / 133.30 kB gzip, exit 0 |
| Contrast | `npm run check:contrast` | ALL CHECKS PASS |

### 16.13 Manual and integration testing performed

| Check | Result **[B/V]** |
|---|---|
| Backend `/health`, `/api/vocab`, `/api/sample-counts`, `/docs` | All responded correctly |
| WebSocket ping / reset / progress / prediction / bad JSON | All verified, real GRU inference observed |
| Speech service `/health` and six `/speak` requests | All HTTP 200, valid RIFF WAV |
| Speech service CORS rejection | `403` for a non-loopback origin |
| Kannada + English browser playback | `readyState=4`, `currentTime` advancing |
| Portrait background removal | Corner measured exactly `#241c18`, contrast 226 → 0 |
| Portrait blur | Person sharp, background contrast 226 → 47, feathered edge |
| Translator DOM | Control renders, default Off, status pill correct |

### 16.14 Known testing gaps

- **No backend automated tests** — `backend/tests/` contains only `__init__.py` **[A]**
- No end-to-end browser automation in CI
- No tests for the React components themselves (no jsdom/RTL)
- No tests exercising a real webcam, real `MediaStream`, or real MediaPipe
  inference in the automated suite
- Audible audio quality and real-face segmentation are **not** covered by any
  automated test **[?]**

---

## CHAPTER 17 — DEPLOYMENT AND OPERATIONS

### 17.1 Development architecture

Three local processes, as shown in Diagram I. This is the only arrangement that
has actually been run **[V]**.

### 17.2 Production architecture

**Not deployed.** `vercel.json` configures an SPA rewrite and `public/_redirects`
provides an equivalent fallback, but the repository contains **no hosting
provider, project identifier or public URL**. Production deployment is a
*declared capability*, not an observed state **[S]**.

### 17.3 Build process

`npm run build` → `tsc && vite build` → static `dist/` **[V]**.

### 17.4 Hosting configuration

`vercel.json`: `{"rewrites":[{"source":"/(.*)","destination":"/index.html"}]}` **[S]**.

### 17.5 Backend deployment

Runs via `uvicorn`; `backend/run.bat` supports dev (`--reload`) and `prod` modes
**[S]**. No container or systemd unit exists **[S]**.

### 17.7 Environment variables

Frontend: `VITE_API_BASE_URL`, `VITE_LOCAL_TTS_URL` **[S]**.
Backend: `HOST`, `PORT`, `ENVIRONMENT`, `LOG_LEVEL`, `ALLOWED_ORIGINS`,
`MODEL_PATH`, `FEATURES_PATH`, `CONFIDENCE_THRESHOLD`, `DATASET_RAW_PATH`,
`DATASET_PROCESSED_PATH` **[S]**. Full reference in Appendix D.

### 17.8 Model distribution

The 853 KB GRU ships as a repository file. The 416 MB of speech models are
downloaded by `install.bat` and are git-ignored **[V]**.

### 17.9 CORS and networking

The backend origin allow-list must include the frontend origin. When the
frontend is built for production, `API_BASE` falls back to
`window.location.origin`, so a same-origin deployment needs no hard-coded URL
and HTTPS automatically derives `wss://` **[S]**.

### 17.10 Health checks

`GET /health` for the backend **[B]**; `GET /health` for the speech service
**[B]**.

### 17.11 Logs

Standard `logging` to stdout. **No log shipping or rotation is configured** **[S]**.

### 17.12 Startup and shutdown

Documented in the setup guide. Both services shut down cleanly on `Ctrl+C`
**[S]**.

### 17.13 Resource requirements

Not measured **[?]**. See Chapter 18 for what is known.

### 17.14 Deployment limitations

The speech service is loopback-only, so a **deployed** frontend on another
machine cannot reach a speech service on the user's PC. That requires an
explicit design decision — for example a local agent — which is not implemented
**[S]**.

---

## CHAPTER 18 — PERFORMANCE AND RESOURCE REQUIREMENTS

> **This chapter separates *configured* values from *measured* values. Nothing
> here is a benchmark.**

### 18.1 Configured values **[S]**

| Component | Configuration |
|---|---|
| Camera stream | 640×480 ideal |
| Recognition loop | `requestAnimationFrame`, every frame sent (`SEND_EVERY = 1`) |
| Hand-landmark inference | `HandLandmarker`, VIDEO mode, CPU delegate, `numHands: 2` |
| Face detection | `FaceDetector`, VIDEO mode, CPU delegate |
| Sign classification | Once per sign, not per frame |
| Sequence buffer | 32 steps, cap 90 frames, minimum 12 frames |
| Segmentation | Throttled to 24 fps (`SEGMENT_INTERVAL_MS = 40`) |
| Portrait composites | 2 offscreen canvases + 1 visible; background at 1/(3–12) scale |
| TTS model size | 138.5 MB per language, 416 MB total |
| Speech timeout | 45 s speak, 2.5 s health |
| Model parameter count | 217,236 |

### 18.2 Measured values **[V]**

| Quantity | Measurement |
|---|---|
| Test suite runtime | 8.6 s |
| Production bundle | 427.04 kB raw / 133.30 kB gzip |
| Model file | 853.36 KB |
| Dataset on disk | 17.5 MB, 1,407 files |
| Speech service startup to answering `/health` | ≈ 4.3 s |
| Background contrast reduction (portrait blur) | 226 → 47 |

### 18.3 Not measured **[?]**

Camera FPS, hand-landmark latency, classification latency, end-to-end sign
latency, memory usage, CPU utilisation, GPU utilisation, battery impact,
training duration, and cold-start time for MediaPipe.

### 18.4 Likely bottlenecks (engineering judgement, not measurements)

1. **Main-thread inference.** Hand landmarks, face detection and segmentation
   all run in `requestAnimationFrame` on the UI thread. Three MediaPipe graphs
   competing for one thread is the most likely contention point.
2. **Every frame crosses the WebSocket.** `SEND_EVERY = 1` sends landmark JSON
   at the display frame rate.
3. **Canvas bandwidth.** Portrait mode performs several full-resolution
   `drawImage` calls per composited frame.
4. **Cold model load.** First load waits on a CDN.

---

## CHAPTER 19 — RESULTS AND DISCUSSION

### 19.1 Implemented features

All ten functional requirements (§2.4) are implemented and present in the
source **[S]**.

### 19.2 Model-training results **[A — artefact, not re-run by me]**

From `models/word_metrics.json`:

| Metric | Value |
|---|---|
| Test accuracy | **0.98104** |
| Macro precision | 0.98295 |
| Macro recall | 0.98136 |
| Macro F1 | 0.98089 |
| Best validation accuracy | 1.0 |
| Test support | 211 |
| Classes | 20 |
| Sequence length | 32 |

Weakest classes: BREAK 0.818, COME 0.900, THANK_YOU 0.909 **[A]**.

> **Important caveat.** These figures were produced by an earlier training run
> and **were not re-executed** for this report. The metrics file does not record
> whether augmentation was enabled, how many epochs ran, or what hardware was
> used **[?]**. The figures are a valid record of *that* run; they are not a
> fresh, reproducible measurement.

### 19.3 Automated-test results **[V — executed]**

171 tests, 40 suites, 171 passed, 0 failed.

### 19.4 Frontend build results **[V — executed]**

`tsc --noEmit` exit 0. `vite build` exit 0. Contrast audit passes.

### 19.5 Backend integration results **[B — executed against the live service]**

`GET /health` → `model_loaded: true`, 20 classes, seq_len 32, version 0.3.0.
WebSocket ping, reset, buffered progress and end-of-sign prediction all behaved
as specified. A synthetic circular hand motion returned
`{'sign':'JUMP','confidence':0.9651,'accepted':True}`.

> **This is a contract test, not an accuracy test.** The input was synthetic
> geometry, not a real gesture. It proves the inference path executes end to
> end; it says nothing about recognition accuracy.

### 19.6 Translation results **[S]**

20 signs × 3 languages, all present, script-correct, with no Romanisation and no
class-identifier leakage; asserted by tests **[S]**.

### 19.7 Speech results **[B/V]**

Six direct HTTP requests returned valid WAV audio. Kannada and English audio
**played** in a real browser (`readyState=4`, advancing clock, no media error).
**Audible intelligibility was not verified** — no audio device **[?]**.

### 19.8 Portrait Mode results **[V — measured in Chrome]**

| Property | Measurement |
|---|---|
| Background replacement | Corner pixel exactly `rgb(36,28,24)`; background contrast 226 → **0** |
| Background blur | Person colour preserved exactly; background contrast 226 → **47** |
| Edge quality | Red-channel ramp `224→224→224→224→224→172→187→179` — feathered |
| Model loading | `Graph successfully started running`, XNNPACK CPU delegate |
| Original feed preserved | Overlay absent in Off mode; video element never mutated |

### 19.9 Known failures

None outstanding in the automated suite. Operational failures are reported
honestly in the UI with specific remedies (§4.12).

### 19.10 Limitations of this evaluation

- No user study, no accessibility evaluation, no comparative evaluation
- No accuracy measurement on unseen signers
- No latency or resource benchmarking
- Model metrics are from an un-reproduced run
- Portrait and speech quality assessed programmatically, not perceptually

### 19.11 Results table

| Result | How verified | Status |
|---|---|---|
| Translation table correctness | Automated test | **Verified** |
| Provider fallback logic | Automated test | **Verified** |
| Kannada speech synthesis | Live HTTP integration | **Verified** |
| Kannada audio playback in browser | Real Chrome | **Verified** |
| Portrait background removal | Real Chrome, pixel sampling | **Verified** |
| Portrait blur | Real Chrome, pixel sampling | **Verified** |
| Recognition filter isolation | Source + unit test + DOM | **Verified** |
| Backend endpoints | Live HTTP | **Verified** |
| WebSocket contract + GRU inference | Live WebSocket | **Verified** |
| Build, types, contrast | Executed | **Verified** |
| Test suite | Executed | **Verified** |
| GRU test accuracy 0.981 | `word_metrics.json` artefact | **Historical — not re-run** |
| Audio intelligibility | — | **Not verified** |
| Real-face segmentation quality | — | **Not verified** |
| Latency / FPS / memory | — | **Not measured** |
| Production deployment | — | **Not deployed** |

---

## CHAPTER 20 — LIMITATIONS

### 20.1 Fixed sign vocabulary

Only 20 signs. The system cannot recognise anything else, and a user who does
not know the vocabulary gets nothing useful **[S]**.

### 20.2 Similar gestures

The measured confusion concentrates in BREAK (0.818), COME (0.900) and
THANK_YOU (0.909) **[A]** — structurally similar motions.

### 20.3 Hand visibility and camera placement

Both hands must be visible and in frame; the buffer needs ≥ 12 usable frames
**[S]**.

### 20.4 Lighting and occlusion

MediaPipe confidence thresholds (0.5) discard low-confidence frames; poor
lighting therefore shortens the usable buffer **[S]**.

### 20.5 Variation between signers

No signer metadata is stored, so cross-signer performance is **unmeasured**
**[?]**.

### 20.6 Temporal ambiguity

Isolated letters or held poses cannot be classified; the system requires a
motion ending in a hand-lowering gesture **[S]**.

### 20.7 Dataset diversity

1,407 sequences; signer count, lighting and background variation are all
**undocumented** **[?]**.

### 20.8 Classification confidence

A 0.60 threshold trades recall for precision; low-confidence gestures are
silently dropped rather than mis-committed **[S]**.

### 20.9 Generalisation to unseen users

**Unmeasured** **[?]**.

### 20.10 Continuous sign recognition

Not implemented. Prediction occurs once per completed sign **[S]**.

### 20.11 Sentence-level grammar

None. Words are joined with spaces; there is no reordering, inflection or
agreement **[S]**.

### 20.12 Translation limitations

Fixed dictionary; 20 entries × 3 languages; single canonical reading per sign
**[S]**.

### 20.13 TTS quality

Small VITS models; intelligible but not natural. Pitch control is unavailable on
the offline path **[S/V]**.

### 20.14 Background segmentation

Binary single-person segmentation; quality on real faces and hair is **not
verified** **[?]**.

### 20.15 Multiple-person selection

**Cannot** isolate the person nearest the centre; follows the most prominent
person; disclosed in the UI **[V]**.

### 20.16 Hardware requirements

CPU-only inference is the verified configuration; low-end performance is
**unmeasured** **[?]**.

### 20.17 Offline-service startup

The speech service must be started manually; if it is not running, Kannada has
no voice at all **[S/V]**.

### 20.18 Deployment and testing limitations

No deployment; no backend tests; no CI; no component-level React tests **[A/S]**.

---

## CHAPTER 21 — FUTURE ENHANCEMENTS

Prioritised. **None of this is implemented.**

| # | Limitation | Proposal | Benefit | Complexity | Risks / dependencies |
|---|---|---|---|---|---|
| **P1** | 20-sign ceiling | Expand to 50–100 signs | Proportionally more useful | Medium | More source data; confusion will grow between similar signs |
| **P1** | Cross-signer unknown | Collect data from ≥ 10 signers; add a **grouped-by-signer** split | Quantifies and improves generalisation | Medium | Requires an ethics/consent process for user recordings |
| **P1** | Metrics not reproducible | Add a training run log (seed, flags, epochs, hardware) | Makes results defensible | Low | None |
| **P2** | No backend tests | Add pytest suite for `WordRecognizer`, `PredictSession`, feature extraction | Regression safety | Low | None |
| **P2** | Portrait follows the wrong person | Add instance segmentation with per-mask identity scoring against the tracked face | True centre-preference | High | Heavier model; conflicts with the 4 GB VRAM budget |
| **P2** | Speech service must be started | Auto-detect and prompt; or ship as a system tray app | Removes a failure mode users hit | Medium | Installation complexity |
| **P2** | Kannada/Hindi quality | Offer Piper (better Hindi) and a stronger multilingual model; add a voice picker per language | Naturalness | Medium | Licence review (currently CC-BY-NC) |
| **P3** | No grammar | Add a lightweight reordering/inflection layer for the fixed vocabulary | More natural sentences | High | Linguistic correctness is difficult to verify |
| **P3** | Main-thread contention | Move inference to a Web Worker with `OffscreenCanvas` | Smoother UI, better frame budget | Medium | Structurally significant change |
| **P3** | Confidence dropped silently | Show "low confidence — try again" instead of silently discarding | Transparency | Low | None |
| **P3** | No CI | Add GitHub Actions running test/typecheck/build/contrast | Prevents regressions | Low | None |
| **P4** | Continuous signing absent | Segment a stream into words with a temporal boundary model | Natural conversation | Very high | Major research effort |
| **P4** | Unauthenticated services | Add token auth if ever network-exposed | Security | Low | Deployment friction |

---

## CHAPTER 22 — CONCLUSION

### 22.1 The original problem

DHH people and hearing people who do not share Indian Sign Language cannot
communicate without a third person present.

### 22.2 The implemented solution

A local, privacy-preserving web application that recognises 20 word-level ISL
signs from an ordinary webcam, assembles them into a sentence, and speaks it in
English, Hindi or Kannada.

### 22.3 The technical approach

The central decision was **where to put the computer vision**. By extracting
hand landmarks in the browser, video never leaves the device and the backend
stays a thin classifier. The second central decision was **when to predict**:
buffering a whole sign and classifying once at the hand-lowering gesture
eliminates mid-sign false positives. The third was **what to do about missing
voices**: rather than degrade to text or mis-use an English voice, the system
falls through to a local offline neural speech service.

### 22.4 The major modules

Hand-landmark extraction · primary-user tracking · feature normalisation ·
GRU classification · WebSocket transport · sign-ID-first translation ·
provider-chain TTS · offline speech service · portrait compositing.

### 22.5 The verified outcomes

171 automated tests pass; the build, type check and contrast audit pass; the
backend and WebSocket contract were exercised live including real GRU inference;
Hindi, Kannada and English audio was generated and **played in a real browser**;
portrait blur and background removal were verified by pixel measurement.

### 22.6 The current limitations

A fixed 20-sign vocabulary with no continuous signing and no grammar; unmeasured
cross-signer generalisation; a manually started speech service; portrait
segmentation that follows the most prominent person rather than the most
central one; and no deployment.

### 22.7 Potential

The architecture generalises cleanly. Adding signs is a data and vocabulary
task. Better speech is an engine swap. Better segmentation is a model swap.
None of those require reworking the pipeline — which is the main architectural
argument this project makes.

> **Final statement.** This project does not claim to solve Indian Sign
> Language communication. It solves one complete, bounded, verifiable problem —
> recognising and speaking 20 signs, privately, on a laptop — and it reports
> honestly where that boundary lies.

---

## REFERENCES

All external sources were verified accessible during this audit. **No paper,
author, DOI or year below was invented.**

### R1 — Frameworks and libraries

1. **FastAPI** — official documentation. <https://fastapi.tiangolo.com/>
   Version used: 0.115.6 (`backend/requirements.txt`).
2. **PyTorch** — official documentation. <https://pytorch.org/docs/stable/>
   Version used: 2.13.0+cpu (measured in the project virtual environment).
3. **React** — official documentation. <https://react.dev/>
   Version used: ^18.3.1 (`frontend/package.json`).
4. **Vite** — official documentation. <https://vite.dev/>
   Version used: ^5.4.11.
5. **Tailwind CSS** — official documentation. <https://tailwindcss.com/docs>
   Version used: ^3.4.14.
6. **TypeScript** — official documentation. <https://www.typescriptlang.org/docs/>
   Version used: ~5.6.3.
7. **scikit-learn** — official documentation. <https://scikit-learn.org/stable/>
   Version used: 1.5.2.
8. **NumPy** — official documentation. <https://numpy.org/doc/>
   Version used: 1.26.4.

### R2 — Computer vision and segmentation models

9. **MediaPipe** — Google. Official documentation.
   <https://ai.google.dev/edge/mediapipe> and
   <https://github.com/google-ai-edge/mediapipe>.
   Version used: 0.10.14 (both the browser package and the Python package).
10. **MediaPipe Tasks — HandLandmarker.** Official model card and usage guide at
    <https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker>.
11. **MediaPipe Tasks — FaceDetector.** Official model card at
    <https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector>.
12. **MediaPipe model assets.** Base URLs actually referenced in the source:
    - `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`
    - `https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite`
    - `https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite`

### R3 — Speech models and engines

13. **Meta Multilingual Speech (MMS)** — model cards for the two checkpoints used
    in this project:
    - `facebook/mms-tts-hin` — <https://huggingface.co/facebook/mms-tts-hin>
    - `facebook/mms-tts-kan` — <https://huggingface.co/facebook/mms-tts-kan>
    Licence: **CC-BY-NC-4.0** (verified from the model metadata during this audit).
14. **Hugging Face Transformers** — official documentation.
    <https://huggingface.co/docs/transformers/index>. Version used: 5.19.0.
15. **Web Speech API (W3C / WHATWG)** — the browser speech-synthesis interface
    used by the primary TTS provider. Defined by the W3C Community Group and
    implemented natively by browsers.
16. **Piper TTS** — official voice list, used to *reject* Piper as the default
    engine because it publishes no Kannada voice.
    <https://github.com/OHF-Voice/piper1-gpl> and its `docs/VOICES.md`.

### R4 — Standards

17. **BCP 47 — Tags for Identifying Languages.** IETF Best Current Practice 47.
    <https://www.rfc-editor.org/info/bcp47>. Used for the `en-US`, `hi-IN`,
    `kn-IN` speech tags.
18. **Unicode Standard** — for the Devanagari (U+0900–U+097F) and Kannada
    (U+0C80–U+0CFF) code points asserted in the translation tests.

### R5 — Standards for accessibility (referenced by the project's own contrast gate)

19. **WCAG 2.2 — Web Content Accessibility Guidelines**, contrast requirements
    for text and non-text UI. <https://www.w3.org/TR/WCAG22/>

### R6 — Internal project files

These are **project sources, not external references**:

| File | What it documents |
|---|---|
| `ml/vocabulary.py` | The 20-class vocabulary and the dataset attribution comment |
| `ml/features.py` | Landmark normalisation and the 64/128-d feature definitions |
| `ml/sequences.py` | Sequence resampling and training-only augmentation |
| `ml/dataset_seq.py` | Loading and the stratified split |
| `ml/landmarks.py` | MediaPipe landmark extraction wrapper |
| `scripts/train_lstm.py` | `SignGRU`, the training loop, and metric computation |
| `scripts/prepare_word_dataset.py` | Video → sequence preprocessing |
| `backend/app/services/recognizer.py` | Inference and the sign-boundary rule |
| `backend/app/api/ws.py`, `record.py` | Transport and calibration endpoints |
| `frontend/src/services/translation.ts` | The translation table |
| `frontend/src/services/speech/` | The TTS provider chain |
| `frontend/src/services/portrait/` | Portrait compositing |
| `frontend/tools/tts-service/` | The offline speech service |
| `models/word_metrics.json` | The recorded training-run metrics |
| `documentation/PROJECT_VERIFICATION_MATRIX.md` | How every claim was established |

---

---

# APPENDIX A — PROJECT DIRECTORY STRUCTURE

Generated from the actual repository. Excluded: `.venv/`, `node_modules/`,
`dist/`, `__pycache__/`, `tools/tts-service/models/`, `*.zip`.

```
F:\Final Project\
│
├── backend\                         FastAPI recognition service (port 8000)
│   ├── .env                         runtime configuration (git-ignored)
│   ├── .env.example                 template — model path is WRONG, see §A.2
│   ├── requirements.txt             INCOMPLETE — see §A.3
│   ├── run.bat                      dev / prod launcher
│   ├── app\
│   │   ├── main.py                  app factory, lifespan, /, /health, CORS
│   │   ├── api\
│   │   │   ├── ws.py                WS /ws/predict
│   │   │   └── record.py            /api/vocab, /api/record-sample, /api/sample-counts
│   │   ├── core\
│   │   │   └── config.py            pydantic-settings Settings
│   │   ├── models\__init__.py       empty (pydantic schemas live in api/)
│   │   └── services\
│   │       └── recognizer.py        WordRecognizer + PredictSession
│   └── tests\__init__.py            EMPTY — no backend tests exist
│
├── ml\                              Shared feature / sequence package (project root)
│   ├── __init__.py
│   ├── features.py                  64-d single-hand, 128-d two-hand vectors
│   ├── sequences.py                 resample_features + training augmentation
│   ├── dataset_seq.py               load_sequences, stratified split
│   ├── dataset.py                   legacy frame loader (unused)
│   ├── landmarks.py                 MediaPipe landmark extractor (data prep)
│   └── vocabulary.py                ISL_VOCAB — the 20 class names
│
├── scripts\                         Offline preparation and training
│   ├── prepare_word_dataset.py      video -> (32,128) .npz sequences
│   ├── prepare_dataset.py           legacy frame prep (unused)
│   ├── collect_dataset.py           webcam collection (superseded)
│   ├── train_lstm.py                SignGRU + training loop  [imported at inference]
│   ├── train_model.py               legacy sklearn pipeline (unused)
│   └── demo_landmarks.py            landmark sanity check
│
├── models\                          Trained artefacts
│   ├── word_model.pt                853.36 KB  state_dict + metadata
│   ├── word_classes.json            0.33 KB    class order
│   ├── word_metrics.json            2.10 KB    metrics from an earlier run
│   └── word_confusion_matrix.png    72.36 KB   test-set confusion matrix
│
├── dataset\
│   ├── seq\<20 SIGN folders>\       1,407 (32,128) float32 .npz — 17.5 MB
│   └── processed\                   exists but EMPTY
│                                    (dataset/raw does NOT exist)
│
├── frontend\                        React SPA (port 5173)
│   ├── package.json                 6 npm scripts, 4 deps, 8 devDeps
│   ├── package-lock.json            91,862 bytes
│   ├── tsconfig.json / .node.json   strict, allowImportingTsExtensions
│   ├── vite.config.ts               es2020, server.host true, port 5173
│   ├── tailwind.config.js           design tokens
│   ├── postcss.config.mjs           tailwind + autoprefixer
│   ├── vercel.json                  SPA rewrite (declared, not deployed)
│   ├── contrast-check.mjs           WCAG contrast gate
│   ├── index.html                   Google Fonts: Inter, Sora, Noto Devanagari/Kannada
│   ├── .env.example                 VITE_API_BASE_URL, VITE_LOCAL_TTS_URL
│   ├── src\
│   │   ├── main.tsx                 high-contrast before first paint
│   │   ├── App.tsx                  routes, shell, ScrollToTopOnNavigate
│   │   ├── styles.css               34.6 KB of custom classes
│   │   ├── pages\                   Home, Translator, HowItWorks, About, Dataset, Settings
│   │   ├── components\
│   │   │   ├── HandOverlay.tsx, HandSkeleton.tsx
│   │   │   ├── PrimaryUserDebugOverlay.tsx
│   │   │   ├── SampleCollector.tsx
│   │   │   ├── NotFoundPage.tsx
│   │   │   ├── home\ (7 files)
│   │   │   ├── layout\ (3 files)
│   │   │   ├── translator\ (6 files — CameraPanel, PortraitCanvas, ControlsCard, …)
│   │   │   └── ui\ (10 files — Button, Card, Callout, StatusPill, Icon, …)
│   │   ├── hooks\                   useWebcam, useSignRecognition, useSpeech,
│   │   │                            useAppSettings, useOutputLanguage, usePortraitEffect
│   │   ├── lib\                     settings, statusLabels, projectData
│   │   ├── services\
│   │   │   ├── api.ts, ws.ts, translation.ts, primaryUserTracker.ts, latestHandler.ts
│   │   │   ├── speech\ (7 files — types, bcp47, browserProvider, localProvider,
│   │   │   │            controller, settings, index)
│   │   │   └── portrait\ (4 files — portraitConfig, segmenter, maskOps, portraitRenderer)
│   │   └── vite-env.d.ts
│   ├── tests\                       5 .test.ts + helpers/browser.ts
│   └── tools\tts-service\           Optional speech service (port 8765)
│       ├── service.py               FastAPI /health + /speak, loopback-only
│       ├── tts_engines.py           MMS / Piper / eSpeak registry
│       ├── download_models.py       one-time model fetch
│       ├── install.bat              one-time setup
│       ├── run.bat                  launcher
│       ├── test_service.py          14 unittest cases
│       ├── requirements.txt
│       ├── README.md
│       ├── models\                  cache (~416 MB, git-ignored)
│       └── .venv\                   private environment (git-ignored)
│
├── docs\                            EMPTY
├── notebooks\                       EMPTY
├── documentation\                   This documentation set
├── .gitignore
└── "run commands"                   plain-text service notes
```

## A.1 Notable absences

- **No README at the project root.** The only pre-existing Markdown was
  `frontend/tools/tts-service/README.md` **[A]**.
- **No `dataset/raw/`** and an **empty `dataset/processed/`** **[A]**.
- **No backend tests** — `backend/tests/` holds only `__init__.py` **[A]**.
- **No Docker, CI, or deployment configuration** beyond `vercel.json` and
  `public/_redirects` **[S]**.
- **No notebook** despite a `notebooks/` directory **[A]**.

## A.2 The one functional documentation defect

`backend/.env.example` ships `MODEL_PATH=../models/model.pkl`. The real
checkpoint is `models/word_model.pt`. The live `backend/.env` on this machine is
already corrected, but anyone generating a fresh `.env` from the example gets a
missing model **[V]**.

## A.3 The second functional documentation defect

`backend/requirements.txt` omits `torch` (needed at **inference** time),
`scikit-learn`, `matplotlib` and `websockets` (needed for training and
verification) **[V]**.

---

# APPENDIX B — SIGN LABEL REFERENCE

Read from `ml/vocabulary.py`, `models/word_classes.json` and
`frontend/src/services/translation.ts` **[V]**.

**The internal identifier is the model's contract and is never translated or
renamed.** Only the three display columns change with the output language.

| # | Internal ID | English | Hindi (Devanagari) | Kannada | Notes |
|---|---|---|---|---|---|
| 0 | `STILL` | *(empty)* | *(empty)* | *(empty)* | **Pause token.** Never displayed, never spoken. Backend converts a `STILL` prediction to `sign: null`. |
| 1 | `HELLO` | Hello | नमस्ते | ನಮಸ್ಕಾರ | |
| 2 | `THANK_YOU` | Thank you | धन्यवाद | ಧನ್ಯವಾದ | |
| 3 | `GOOD_MORNING` | Good morning | सुप्रभात | ಶುಭೋದಯ | |
| 4 | `GOOD_AFTERNOON` | Good afternoon | शुभ दोपहर | ಶುಭ ಮಧ್ಯಾಹ್ನ | |
| 5 | `WHAT_IS_YOUR_NAME` | What is your name? | आपका नाम क्या है? | ನಿಮ್ಮ ಹೆಸರೇನು? | One complete question, not word-by-word |
| 6 | `MAYBE` | Maybe | शायद | ಆಮೋ | Hedge word |
| 7 | `COME` | Come | आओ | ಬಾ | |
| 8 | `DRINK` | Drink | पियो | ಕುಡಿ | |
| 9 | `GIVE` | Give | दो | ಕೊಡು | |
| 10 | `CLEAN` | Clean | साफ करो | ಸ್ವಚ್ಛ ಮಾಡಿ | |
| 11 | `COOK` | Cook | पकाओ | ಒಡಿ | |
| 12 | `CLOSE` | Close | बंद करो | ಮುಚ್ಚಿ | The **verb**, not the adjective |
| 13 | `BREAK` | Break | तोड़ो | ತೋಡಿ | The **verb**, not "rest" |
| 14 | `POUR` | Pour | डालो | ಹಾಕಿ | The verb |
| 15 | `CRY` | Cry | रोओ | ಅಳು | |
| 16 | `JUMP` | Jump | कूदो | ಕೂಡು | |
| 17 | `TEA` | Tea | चाय | ಚಹಾ | Noun |
| 18 | `KEY` | Key | चाबी | ಕೀಲಿ | Noun |
| 19 | `WIFE` | Wife | पत्नी | ಪತ್ನಿ | Noun |
| — | `SPACE` | *(space)* | *(space)* | *(space)* | Frontend-only word separator. **Not a model class.** |

**Source locations:** class order `ml/vocabulary.py:12-33` and
`models/word_classes.json`; translations `frontend/src/services/translation.ts:102-124`;
`SignId` union `translation.ts:32-53`.

**Per-class test recall** (from `word_metrics.json`, an earlier run) **[A]**:

| Class | Recall | | Class | Recall |
|---|---|---|---|---|
| BREAK | **0.818** | | GOOD_AFTERNOON | 1.00 |
| COME | **0.900** | | GOOD_MORNING | 1.00 |
| THANK_YOU | **0.909** | | WHAT_IS_YOUR_NAME | 1.00 |
| CLOSE | 1.00 (F1 0.91) | | MAYBE | 1.00 |
| all others | 1.00 | | STILL | 1.00 (n=4) |

Test support per class ranged from 4 (`STILL`) to 14 (`HELLO`) **[A]**.

---

# APPENDIX C — API REFERENCE

Every endpoint below exists in the code and was exercised against the running
services **[V]**. **This project has no authentication and no tokens**, so no
credentials are shown.

## C.1 Backend — `http://127.0.0.1:8000`

| Proto | Route | Input | Output | Auth | Errors | Source |
|---|---|---|---|---|---|---|
| GET | `/` | — | service banner JSON | None | — | `main.py:75` |
| GET | `/health` | — | model status JSON | None | — | `main.py:86` |
| GET | `/docs` | — | OpenAPI UI (FastAPI built-in) | None | — | built-in |
| WS | `/ws/predict` | frame / ping / reset | prediction JSON | None | `model_not_loaded`, `bad_json` | `api/ws.py:25` |
| GET | `/api/vocab` | — | `{"vocab":[...]}` | None | — | `api/record.py:66` |
| POST | `/api/record-sample` | `{sign, frames[]}` | `{"saved",…}` | None | 400 unknown sign / too few frames | `api/record.py:71` |
| GET | `/api/sample-counts` | — | `{"counts":{…}}` | None | — | `api/record.py:117` |

### Worked examples (real captured responses)

**`GET /`**

```json
{"app":"ISL-to-Speech Backend","status":"running","docs":"/docs",
 "health":"/health","predict":"ws://<host>:8000/ws/predict"}
```

**`GET /health`**

```json
{"status":"ok","environment":"development","model_loaded":true,
 "num_classes":20,"seq_len":32,"model_path":"..\\models\\word_model.pt",
 "version":"0.3.0"}
```

**`GET /api/vocab`**

```json
{"vocab":["STILL","HELLO","THANK_YOU","GOOD_MORNING","GOOD_AFTERNOON",
          "WHAT_IS_YOUR_NAME","MAYBE","COME","DRINK","GIVE","CLEAN","COOK",
          "CLOSE","BREAK","POUR","CRY","JUMP","TEA","KEY","WIFE"]}
```

**`GET /api/sample-counts`** (sum = 237)

```json
{"counts":{"STILL":0,"HELLO":32,"THANK_YOU":11,"GOOD_MORNING":11,
 "GOOD_AFTERNOON":21,"WHAT_IS_YOUR_NAME":11,"MAYBE":10,"COME":10,"DRINK":11,
 "GIVE":10,"CLEAN":12,"COOK":12,"CLOSE":10,"BREAK":11,"POUR":12,"CRY":11,
 "JUMP":11,"TEA":11,"KEY":10,"WIFE":10}}
```

**`POST /api/record-sample`**

```json
{"sign":"HELLO","frames":[
  {"hands":[{"handedness":"Right","handedness_score":0.98,
            "landmarks":[[0.51,0.62,0.01], "… 20 more points …"]}]},
  "… 30+ more frames …"
]}
```

Success: `{"saved": true, "sign": "HELLO", "sample_index": 33, "frames_used": 32}`.

> Not executed during the audit — it writes into `dataset/seq/`.

**`WS /ws/predict`**

Client → server:

```json
{"hands":[{"handedness":"Right","handedness_score":0.98,
           "landmarks":[[0.51,0.62,0.01], "… 20 more …"]}]}
{"type":"ping"}
{"type":"reset"}
```

Server → client, buffering:

```json
{"sign":null,"confidence":0.0,"accepted":false,"num_hands":1,
 "ready":false,"progress":0.5}
```

Server → client, at the sign boundary:

```json
{"sign":"JUMP","confidence":0.9651,"accepted":true,"ready":true,"num_hands":0}
```

> The `JUMP` came from **synthetic hand geometry**, not a real gesture. It proves
> the inference path executes; it is **not** an accuracy measurement.

Server → client, control replies:

```json
{"type":"pong"}
{"type":"reset_ok"}
{"error":"bad_json"}
{"error":"model_not_loaded","message":"No trained word model found. Run scripts/train_lstm.py first."}
```

## C.2 Speech service — `http://127.0.0.1:8765`

| Proto | Route | Input | Output | Auth | Errors |
|---|---|---|---|---|---|
| GET | `/health` | — | `{ok, engines:{en,hi,kn}, loaded:{…}}` | None | — |
| POST | `/speak` | `{text,lang,tag,rate,pitch}` | `audio/wav` | Origin check | 403 non-loopback origin |

**`POST /speak`**

```json
{"text":"ನಮಸ್ಕಾರ","lang":"kn","tag":"","rate":1.0,"pitch":1.0}
```

→ `200`, `content-type: audio/wav`, a valid RIFF/WAVE body **[V]**.

`pitch` is ignored by the offline engines, which return `X-TTS-Pitch: ignored`
**[S]**.

## C.3 External CDNs (no API, no key)

| URL | Asset | Size |
|---|---|---|
| `cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm` | MediaPipe WASM runtime | — |
| `storage.googleapis.com/…/hand_landmarker.task` | Hand landmarks | — |
| `storage.googleapis.com/…/blaze_face_short_range.tflite` | Face detection | — |
| `storage.googleapis.com/…/selfie_segmenter.tflite` | Portrait segmentation | **0.24 MB** |
| `huggingface.co` | `facebook/mms-tts-{hin,kan,eng}` | 138.5 MB each |

## C.4 What requires no backend endpoint

| Functionality | Where it runs |
|---|---|
| Camera capture, hand landmarks, face detection | Browser |
| Primary-user tracking | Browser |
| Portrait blur / background removal | Browser |
| Translation (all 21 rows × 3 languages) | Browser — a static table |
| Browser speech synthesis | Browser |
| TTS controller, provider fallback, re-probing | Browser |

---

# APPENDIX D — CONFIGURATION REFERENCE

**No secret, API key, token or password exists anywhere in this project.** Every
value below is non-sensitive.

## D.1 Frontend — `frontend/.env.local`

| Name | Purpose | Default | Required | Example |
|---|---|---|---|---|
| `VITE_API_BASE_URL` | Backend base URL | dev `http://localhost:8000`; prod `window.location.origin` | No | `https://api.example.com/isl` |
| `VITE_LOCAL_TTS_URL` | Offline speech service | `http://127.0.0.1:8765` | No | `http://127.0.0.1:8765` |

Source: `frontend/.env.example`; consumed by `src/services/api.ts` and
`speech/localProvider.ts`.

> `VITE_*` variables are **inlined into the public client bundle at build time**.
> Never put a secret in one — `.env.example` states this explicitly **[S]**.

There is **no** `VITE_WS_URL`; the WebSocket URL is derived from
`VITE_API_BASE_URL` by `apiBase.replace(/^http/, 'ws')` **[S]**.

## D.2 Backend — `backend/.env`

| Name | Purpose | Default | Required | Example |
|---|---|---|---|---|
| `HOST` | Bind address | `0.0.0.0` | No | `127.0.0.1` |
| `PORT` | Bind port | `8000` | No | `8000` |
| `ENVIRONMENT` | Reported by `/health` | `development` | No | `production` |
| `LOG_LEVEL` | Python log level | `INFO` | No | `DEBUG` |
| `ALLOWED_ORIGINS` | Comma-separated CORS list | `http://localhost:5173,http://127.0.0.1:5173` | No | `https://app.example.com` |
| `MODEL_PATH` | GRU checkpoint | `<root>/models/word_model.pt` | No | `../models/word_model.pt` |
| `FEATURES_PATH` | **Unused leftover** | `<root>/models/features.json` | No | — |
| `CONFIDENCE_THRESHOLD` | Acceptance gate | `0.60` | No | `0.70` |
| `DATASET_RAW_PATH` | **Unused** | `<root>/dataset/raw` | No | — |
| `DATASET_PROCESSED_PATH` | **Unused** | `<root>/dataset/processed` | No | — |

Source: `backend/app/core/config.py:20-29`. Loaded by `pydantic-settings` from
`backend/.env`, case-insensitive, extra keys ignored **[S]**.

`MODEL_PATH` is resolved **relative to the backend working directory**, so
`../models/word_model.pt` from `backend/` is correct **[V]**.

## D.3 Speech service

| Name | Purpose | Default | Required |
|---|---|---|---|
| `TTS_HOST` | Bind address | `127.0.0.1` | No |
| `TTS_PORT` | Bind port | `8765` | No |
| `TTS_ALLOWED_ORIGINS` | Extra allowed browser origins | *(empty)* | No |
| `HF_HUB_OFFLINE` | Force cached-only model use | unset | No |

Source: `frontend/tools/tts-service/service.py:53-54, 133-143` **[S]**.

## D.4 Compile-time / build settings

| Setting | Value | File |
|---|---|---|
| TypeScript `strict` | `true` | `tsconfig.json` |
| `noUnusedLocals` / `noUnusedParameters` | `true` | `tsconfig.json` |
| `allowImportingTsExtensions` | `true` | `tsconfig.json` |
| Vite build `target` | `es2020` | `vite.config.ts` |
| Vite `server.host` | `true` (LAN) | `vite.config.ts` |
| Vite dev / preview ports | 5173 / 4173 | `vite.config.ts` |
| Node test runner flags | `--experimental-strip-types --test tests/*.test.ts` | `package.json` |

---

# APPENDIX E — MODEL AND DATASET INVENTORY

All sizes measured on this machine **[V]**.

## E.1 Trained model

| Item | Value |
|---|---|
| File | `models/word_model.pt` |
| Size | **853.36 KB** |
| Format | `torch.save` dict: `state_dict`, `classes`, `seq_len`, `input_size`, `hidden`, `n_classes` |
| Architecture | `SignGRU`: 2 × `nn.GRU(128,128, batch_first)` + `Linear(128,128)` + ReLU + Dropout(0.3) + `Linear(128,20)` |
| Parameters | **217,236** |
| Input | `(batch, 32, 128)` float32 |
| Output | `(batch, 20)` logits |
| `input_size` | **128** (checkpoint-authoritative) |
| `hidden` | 128 |
| `n_classes` | 20 |
| `seq_len` | 32 |
| Licence | Not stated in the repository **[?]** |

Companion artefacts:

| File | Size | Contents |
|---|---|---|
| `models/word_classes.json` | 0.33 KB | class order + `seq_len` |
| `models/word_metrics.json` | 2.10 KB | accuracy, macro P/R/F1, classification report, per-class accuracy **[A]** |
| `models/word_confusion_matrix.png` | 72.36 KB | test-set confusion matrix **[A]** |

## E.2 Preprocessing / inference scripts

| Script | Role | In the shipped path? |
|---|---|---|
| `scripts/prepare_word_dataset.py` | Video → `(32,128)` `.npz`, multiprocess, resumable | Yes, offline |
| `scripts/train_lstm.py` | Defines `SignGRU`; trains; writes all four artefacts | **Yes — and imported at inference time** |
| `ml/features.py` | Landmark normalisation, 64/128-d vectors | Yes |
| `ml/sequences.py` | `resample_features`, augmentation | Yes |
| `ml/dataset_seq.py` | `load_sequences`, stratified split | Yes (training) |
| `ml/landmarks.py` | MediaPipe wrapper | Yes (data prep) |
| `ml/vocabulary.py` | The 20 class names | Yes |
| `scripts/train_model.py` | Legacy sklearn pipeline | **No** |
| `scripts/prepare_dataset.py` | Legacy frame prep | **No** |
| `ml/dataset.py` | Legacy frame loader | **No** |
| `scripts/collect_dataset.py` | Webcam collection | Superseded |
| `scripts/demo_landmarks.py` | Diagnostic | No |

## E.3 Label maps

| Artefact | Location | Notes |
|---|---|---|
| Class order (authoritative) | `ml/vocabulary.py`, `models/word_classes.json` | Must match `SignId` in `translation.ts` |
| Display strings | `frontend/src/services/translation.ts:102-124` | 21 rows incl. `SPACE` |
| Audio model IDs | `tools/tts-service/tts_engines.py` | `facebook/mms-tts-{hin,kan,eng}` |

There is **no** `features.json`, no database schema and no migration set **[S]**.

## E.4 Dataset

| Item | Value |
|---|---|
| Root | `dataset/seq/<SIGN>/` |
| Total sequences | **1,407** |
| Per-file shape | `(32, 128)` float32, every file |
| On-disk size | **17.5 MB** |
| Composition | 1,170 dataset-derived + **237** user-recorded (`source='user'`) |
| Value range | −1.988 … 2.135 |
| Classes | 20 |
| Largest class | HELLO, 92 |
| Smallest class | STILL, 30 |
| Split | stratified at sequence level, 70 / 15 / 15, seeds 42 then 43 |
| Test support | 211 |
| Source | Identified in code comments as the Kaggle *Indian Sign Language Video Dataset*; **raw videos are not in this repository** |
| Signer count / diversity | **Not recorded** **[?]** |
| Licence | Asserted "MIT" in a code comment only; **no licence file** **[?]** |

Per-class file counts are tabulated in `PROJECT_TECHNICAL_DOCUMENTATION.md` §5.2.

## E.5 Speech models

| Model | Size | Licence |
|---|---|---|
| `facebook/mms-tts-hin` | 138.5 MB | **CC-BY-NC-4.0** |
| `facebook/mms-tts-kan` | 138.5 MB | **CC-BY-NC-4.0** |
| `facebook/mms-tts-eng` | 138.5 MB | **CC-BY-NC-4.0** |
| **Total** | **~416 MB** | Non-commercial |

Cache: `frontend/tools/tts-service/models/` (git-ignored) **[V]**.

## E.6 Browser models

| Model | Size | Source |
|---|---|---|
| `hand_landmarker.task` float16 | — | Google MediaPipe storage |
| `blaze_face_short_range.tflite` float16 | — | Google MediaPipe storage |
| `selfie_segmenter.tflite` float16 | **0.24 MB** | Google MediaPipe storage |
| *(rejected)* `deeplab_v3.tflite` | 2.65 MB | measured, not used |
| *(rejected)* `selfie_multiclass_256x256.tflite` | 15.61 MB | measured, not used |

---

# APPENDIX F — TESTING COMMANDS

Full instructions, expected output and manual procedures are in
**`PROJECT_SETUP_AND_TESTING_GUIDE.md`**. Quick reference:

```powershell
# ---- install ----
cd F:\Final Project\frontend
npm install
cd F:\Final Project
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install scikit-learn matplotlib websockets
cd F:\Final Project\frontend\tools\tts-service
install.bat

# ---- frontend tests ----
cd F:\Final Project\frontend
npm test                  # 171 tests / 40 suites / 0 fail   [VERIFIED]
npm run typecheck         # tsc --noEmit, exit 0             [VERIFIED]
npm run build             # 427.04 kB / 133.30 kB gzip       [VERIFIED]
npm run check:contrast    # ALL CHECKS PASS                  [VERIFIED]
npm run preview           # serve dist/ on :4173

# ---- speech service tests ----
cd F:\Final Project\frontend\tools\tts-service
.\.venv\Scripts\python.exe -m unittest test_service -v
# 14 tests, OK                                             [VERIFIED]

# ---- backend tests ----
cd F:\Final Project
.\.venv\Scripts\python.exe -m unittest discover -s backend\tests -t .
# 0 tests discovered — backend/tests/ has only __init__.py  [VERIFIED]

# ---- run the speech service ----
cd F:\Final Project\frontend\tools\tts-service
run.bat
curl.exe -s http://127.0.0.1:8765/health

# ---- run the whole application ----
# terminal 1
cd F:\Final Project\backend
uvicorn app.main:app --host 127.0.0.1 --port 8000
# terminal 2
cd F:\Final Project\frontend
npm run dev
# terminal 3
cd F:\Final Project\frontend\tools\tts-service
run.bat
# then open http://localhost:5173/translator

# ---- model / dataset verification ----
.\.venv\Scripts\python.exe -c "import torch;c=torch.load('models/word_model.pt',map_location='cpu',weights_only=False);print({k:v for k,v in c.items() if k!='state_dict'})"
.\.venv\Scripts\python.exe -c "import glob,numpy as np;fs=glob.glob('dataset/seq/*/*.npz');print(len(fs),np.load(fs[0])['seq'].shape)"
```

## F.1 Test summary table

| Category | Command | Purpose | Latest verified result | Limitation |
|---|---|---|---|---|
| Frontend unit | `npm test` | Translation, TTS, speech, language pipeline, portrait | **171 pass / 40 suites / 0 fail** (8.55 s) | No jsdom; no React component rendering |
| Types | `npm run typecheck` | Strict TypeScript | **exit 0** | — |
| Build | `npm run build` | Production bundle | **427.04 kB / 133.30 kB gzip, exit 0** | Not deployed |
| Contrast | `npm run check:contrast` | WCAG AA text contrast | **ALL CHECKS PASS** | Automated check only; no manual screen-reader audit |
| Speech service | `python -m unittest test_service` | Engine registry, model presence, WAV encoding | **14 tests, OK** | Does not synthesise every language on every run |
| Backend | `unittest discover backend\tests` | — | **0 tests** | **No backend test suite exists** |
| ML | — | — | **None** | No model-quality regression test |
| Integration | manual | Endpoints, WebSocket, TTS HTTP, portrait pixels | **Verified live** | Not in CI; no webcam/audio device |

## F.2 What no automated test covers

- React component rendering (no jsdom / React Testing Library)
- Real `MediaStream`, real webcam, real MediaPipe inference in the suite
- WebSocket round-trip against the live backend
- Audible audio quality
- Matte quality on a real human face
- Any latency, FPS or memory measurement

---

# APPENDIX G — TROUBLESHOOTING GUIDE

Each entry's cause is derived from the actual architecture. Items marked
*suggestion* are reasoned recommendations, not observed fixes.

## G.1 Camera

| Symptom | Cause | Fix |
|---|---|---|
| "Permission denied" | User blocked the camera | Address-bar padlock → allow camera → reload |
| "No camera found" | No device, or OS privacy blocked it | Device Manager; test in another browser |
| "Camera in use" (`NotReadableError`) | Another app holds the device | Close Teams / Zoom / Meet / OBS, then retry |
| Black frame | Stream attached before metadata | The `<video>` mounts only when status is `active`; wait for "Camera ready" |
| Camera light stays on after Stop | A track was not stopped | Call **Stop**; on unmount every track is stopped **[S]** |

## G.2 Models and recognition

| Symptom | Cause | Fix |
|---|---|---|
| "Could not load the hand-tracking model" | MediaPipe assets not yet cached; no network | Connect once and retry; assets are then browser-cached |
| `/health` → `model_loaded: false` | Wrong `MODEL_PATH` or missing file | `Test-Path models\word_model.pt`; fix `backend\.env` |
| `ModuleNotFoundError: torch` | Incomplete requirements | `pip install torch --index-url …/cpu` |
| No signs ever detected | Buffer never reaches 12 usable frames | Hold the gesture longer; improve lighting |
| Same sign repeats | 700 ms cooldown, or a track switch | Intentional — press **Undo** |
| Wrong signs | Similar gestures, or low confidence | Keep both hands in frame; improve lighting; end each sign with a clear hand-down |
| Backend disconnects after a blip | **No auto-reconnect by design** | Press **Stop**, then **Start** |

## G.3 Speech

| Symptom | Cause | Fix |
|---|---|---|
| Kannada silent | Speech service not running | `tools\tts-service\run.bat`; `curl http://127.0.0.1:8765/health` |
| "Service offline" though it runs | Origin rejected, or wrong port | The service binds `127.0.0.1`; check `TTS_PORT` and `VITE_LOCAL_TTS_URL` |
| "No voice for this language" | No browser voice and no service | Start the service — the app will not mis-use an English voice |
| "Press Speak once more" | Browser blocked autoplay `play()` | Interact with the page first, then press **Speak** |
| Speech did not recover after starting the service | Page loaded before the service existed | The controller re-probes every 4 s — wait ~5 s, no reload needed **[V]** |
| First request slow | A model is loading on first use | Expected; later requests are faster |

## G.4 Portrait Mode

| Symptom | Cause | Fix |
|---|---|---|
| Effect control disabled | Camera not active | Start the camera |
| "Portrait model unavailable" | Segmenter download failed | Check network; retry |
| Flickering edges | Low light or fast movement | Better lighting; the EMA already smooths (α = 0.35) |
| Halo around the person | — | Erosion is already applied (radius 1); hair edges remain the known weak case **[?]** |
| Effect isolates the wrong person | `selfie_segmenter` follows the **most prominent** person | **Known limitation** — it cannot prefer the most central person |
| Effect dropped the frame loop | — | Fixed; the loop now guards and re-arms **[V]** |

## G.5 Backend / networking

| Symptom | Cause | Fix |
|---|---|---|
| Frontend cannot reach the backend | Origin not in `ALLOWED_ORIGINS` | Add it to `backend\.env` and restart |
| "Backend offline" but the camera works | Backend down | `curl http://127.0.0.1:8000/health` |
| Port 8000 in use | Another process | `netstat -ano \| findstr :8000`; change `PORT` |
| Backend exits at import | Wrong working directory | Start from `backend\`, or pass `--app-dir backend` |
| Serving the frontend from another origin blocked | Missing CORS entry | Add the origin to `ALLOWED_ORIGINS` |

## G.6 Build

| Symptom | Cause | Fix |
|---|---|---|
| `npm test` fails to parse a module | Missing explicit `.ts` extension | Add it — `--experimental-strip-types` requires it |
| Build type errors | A type regression | `npm run typecheck` for the full list |
| `npm run build` slow or heavy | — | Expected: `tsc` then `vite build`; ~5 s on this machine **[V]** |

---

# APPENDIX H — VIVA PREPARATION

The full 60-question bank with answers, organised as:

- **Part A** — 30 general technical questions
- **Part B** — 10 questions on the GRU model
- **Part C** — 5 questions on MediaPipe and computer vision
- **Part D** — 5 questions on translation and text-to-speech
- **Part E** — 5 questions on system architecture
- **Part F** — 5 questions on testing, limitations and future work

is in **`PROJECT_VIVA_QUESTIONS.md`**, together with a quick-answer cheat sheet
of the 15 numbers most likely to be asked for.

**Examination strategy.** Every answer states the honest boundary of the project.
Claiming more than was verified is the fastest way to lose marks; a documented
limitation reads as rigour.

---

*End of report.*