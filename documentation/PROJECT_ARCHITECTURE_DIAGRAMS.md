# Architecture Diagrams — ISL-to-Speech

Nine Mermaid diagrams describing the **as-built** system. Every relationship shown
here exists in the code; where the code is absent, the diagram is absent too.

Verified against: `backend/app/`, `ml/`, `scripts/`, `models/word_model.pt`,
`frontend/src/`.

---

## Diagram A — High-level system architecture

```mermaid
flowchart TB
    subgraph Browser["Browser (React + TypeScript, localhost:5173)"]
        CAM["Webcam stream<br/>getUserMedia 640x480"]
        MLVIS["MediaPipe Tasks Vision 0.10.14<br/>HandLandmarker + FaceDetector<br/>(WebAssembly, local)"]
        SEG["Portrait Mode<br/>ImageSegmenter selfie_segmenter<br/>(optional overlay)"]
        UI["React UI<br/>Translator / Settings / HowItWorks"]
        TR["Translation table<br/>20 signs x EN/HI/KN"]
        TTS["Speech controller<br/>provider chain"]
        BROWSERV["Provider 1: Web Speech API<br/>window.speechSynthesis"]
        LOCALV["Provider 2: local speech service<br/>http://127.0.0.1:8765"]
    end

    subgraph Backend["FastAPI backend (localhost:8000)"]
        API["REST + WebSocket API"]
        REC["WordRecognizer<br/>PredictSession per connection"]
        NN["SignGRU<br/>2x GRU(128) + MLP head"]
    end

    subgraph LocalService["Local speech service (optional)"]
        PY["Python + FastAPI + transformers"]
        MODELS["MMS VITS checkpoints<br/>mms-tts-hin / mms-tts-kan / mms-tts-eng"]
    end

    subgraph Cloud["Remote assets (first load only)"]
        CDNM["cdn.jsdelivr.net<br/>MediaPipe WASM"]
        MPSTORE["storage.googleapis.com<br/>hand_landmarker .task<br/>blaze_face_short_range .tflite<br/>selfie_segmenter .tflite"]
        HF["huggingface.co<br/>TTS voice models"]
    end

    CAM --> MLVIS
    CAM -.reads only.-> SEG
    MLVIS -->|"landmarks only"| REC
    SEG -.overlay canvas only.- UI
    MLVIS --> UI
    UI <--> TR
    UI --> TTS
    TTS --> BROWSERV
    TTS -.fallback.- LOCALV
    LOCALV --> PY --> MODELS
    UI <-->|"WebSocket /ws/predict<br/>+ GET /health, /api/vocab"| API
    API --> REC --> NN
    MLVIS -.CDN on first load.- CDNM
    MLVIS -.model download.- MPSTORE
    SEG -.model download.- MPSTORE
    PY -.one-time download.- HF
```

**Explanation.** Three processes, all local to one machine. The browser does all
computer vision; the backend only classifies pre-extracted landmarks; the speech
service is optional and exists solely to synthesise languages the operating
system cannot. Video pixels never leave the browser — only 21-point coordinates
cross the network.

---

## Diagram B — Complete sign-to-speech data flow

```mermaid
flowchart TB
    subgraph R1["1 · Capture and track"]
        direction LR
        A["Video frame<br/>videoRef, 640x480"] --> B["HandLandmarker<br/>detectForVideo, 2 hands"]
        B --> C["21 landmarks x x,y,z<br/>per hand, normalised 0..1"]
        C --> D["FaceDetector<br/>blaze_face_short_range"]
    end
    R1 --> E

    subgraph R2["2 · Choose the signer and send"]
        direction LR
        E["primaryUserTracker<br/>scores faces, builds torso region,<br/>associates hands"] --> F["JSON payload<br/>{ hands: [{handedness,<br/>handedness_score, landmarks}] }"]
        F --> G["PredictSession.feed<br/>buffers 128-d vectors"]
    end
    G --> H

    subgraph R3["3 · Classify once, at the sign boundary"]
        direction LR
        H["6 frames with no hand<br/>-> sign boundary"] --> I["resample to 32 frames"]
        I --> J["torch tensor (1, 32, 128)"]
        J --> K["SignGRU forward"]
    end
    K --> L

    subgraph R4["4 · Accept, translate, speak"]
        direction LR
        L["softmax over 20 classes<br/>argmax + confidence"] --> M{"conf >= 0.60<br/>and sign != STILL?"}
        M -->|"no"| O["discard"]
        M -->|"yes"| P["accepted sign ID<br/>appended to sentenceIdsRef"]
        P --> R["translateSentence ids, lang<br/>+ speechPlanForSentence"]
    end
    R --> S

    subgraph R5["5 · Produce sound"]
        direction LR
        S["TtsController.speak"] --> T{"provider supports lang?"}
        T -->|"Web Speech API has a voice"| U["utterance lang=hi-IN"]
        T -->|"no voice"| V["POST /speak to local service"]
        V --> Y["WAV bytes"]
        Y --> Z["HTMLAudioElement playback"]
        U --> Z
    end
```

**Explanation.** The decisive design choice is at step G: the backend predicts
**once per sign**, not once per frame. A sign is buffered while the hand is up
and classified when the hand is lowered, which removes mid-sign and
raise/lower-transition predictions — the largest source of wrong live output.

---

## Diagram C — Frontend component architecture

```mermaid
flowchart TB
    MAIN["main.tsx<br/>applyHighContrast before paint"] --> APP["App.tsx<br/>BrowserRouter"]
    APP -->|"path"| HOME["pages/Home.tsx"]
    APP -->|"path"| TRANS["pages/Translator.tsx"]
    APP -->|"path"| HOW["pages/HowItWorks.tsx"]
    APP -->|"path"| ABOUT["pages/About.tsx"]
    APP -->|"path"| DATA["pages/Dataset.tsx"]
    APP -->|"path"| SET["pages/Settings.tsx"]
    APP -->|"*"| NF["components/NotFoundPage.tsx"]
    APP --> HDR["layout/Header.tsx"] --> FTR["layout/Footer.tsx"]

    subgraph TR["Translator page"]
        WC["useWebcam"] --> VIDEOREF["videoRef"]
        SR["useSignRecognition"] --> RECUI["DetectedSignCard<br/>TranslationCard<br/>ControlsCard"]
        PE["usePortraitEffect"] --> PC["PortraitCanvas"]
        PC -.overlays.- VIDEOREF
        HO["HandOverlay"] -.overlays.- VIDEOREF
        DBG["PrimaryUserDebugOverlay"] -.overlays.- VIDEOREF
        CP["CameraPanel"] --> PC
        CP --> HO
        CP --> DBG
        RECUI --> CP
        TRANS --> WC
        TRANS --> SR
        TRANS --> PE
    end

    subgraph SVC["services"]
        API["api.ts REST"]
        WS["ws.ts PredictSocket"]
        TRJ["translation.ts"]
        LPH["latestHandler.ts"]
        PUT["primaryUserTracker.ts"]
        S1["speech/controller.ts"]
        S2["speech/browserProvider.ts"]
        S3["speech/localProvider.ts"]
        P1["portrait/portraitRenderer.ts"]
        P2["portrait/segmenter.ts"]
        P3["portrait/maskOps.ts"]
    end

    SR --> WS
    SR --> PUT
    SR --> S1
    S1 --> S2
    S1 --> S3
    PE --> P1
    P1 --> P2
    P1 --> P3
    TRANS --> TRJ
    SET --> API
    DATA --> API
```

**Explanation.** The page owns two hooks that each own one long-lived resource:
`useWebcam` owns the `MediaStream`, `useSignRecognition` owns the MediaPipe
models and the WebSocket. `usePortraitEffect` deliberately reads `videoRef`
but never writes to it, which is what keeps the recogniser on original pixels.

---

## Diagram D — Backend architecture

```mermaid
flowchart TB
    subgraph APP["backend/app"]
        MAIN["main.py<br/>FastAPI lifespan"]
        CFG["core/config.py<br/>pydantic-settings BaseSettings"]
        WSAPI["api/ws.py<br/>APIRouter /ws/predict"]
        RECAPI["api/record.py<br/>APIRouter /api/*"]
        RZ["services/recognizer.py<br/>WordRecognizer + PredictSession"]
    end

    subgraph ML["Shared ML package (project root /ml)"]
        FEA["features.py<br/>extract_two_hand_features -> 128-d"]
        SEQ["sequences.py<br/>resample_features -> 32"]
        VOC["vocabulary.py<br/>ISL_VOCAB (20)"]
    end

    subgraph ART["Artefacts"]
        CKPT["models/word_model.pt<br/>853 KB"]
        CLS["models/word_classes.json"]
        MET["models/word_metrics.json"]
        DS["dataset/seq/&lt;SIGN&gt;/*.npz"]
    end

    LIFESPAN["startup: construct WordRecognizer,<br/>load once into app.state"] --> MAIN
    CFG --> MAIN
    MAIN -->|"app.state.recognizer"| WSAPI
    MAIN --> RECAPI
    WSAPI -->|"one PredictSession per socket"| RZ
    RZ --> FEA
    RZ --> SEQ
    RZ -->|"imports SignGRU"| TRAIN["scripts/train_lstm.py<br/>class SignGRU"]
    CKPT --> RZ
    CLS --> RZ
    RECAPI --> VOC
    RECAPI --> FEA
    RECAPI --> SEQ
    RECAPI -->|"np.savez_compressed"| DS
    TRAIN -->|"torch.save"| CKPT
    TRAIN --> MET
```

**Explanation.** `app.state.recognizer` is created once in the FastAPI lifespan
handler, so the 217 k-parameter model is loaded once per process, not per
connection. Each WebSocket connection gets its own `PredictSession`, which is
what keeps two users from corrupting each other's sign buffers. The backend
reuses the same `ml.features` and `ml.sequences` functions as training, so the
inference feature format cannot drift from the training format.

---

## Diagram E — Machine-learning inference pipeline

```mermaid
flowchart TB
    subgraph C1["Normalise each hand to 64 dimensions"]
        direction TB
        IN["Landmark dict<br/>21 x 3 + handedness_score"] --> SEL["select_primary_hand<br/>(single-hand path only)"]
        SEL --> NORM["normalize_landmarks<br/>translate by wrist (idx 0)<br/>scale by ||middle_mcp - wrist||"]
        NORM --> FLAT["flatten 63 values"]
        FLAT --> HB["append handedness bit<br/>1=Right, 0=Left"]
    end

    subgraph C2["Concatenate, buffer, resample"]
        direction TB
        HB --> L["left half = 64-d"]
        HB --> R["right half = 64-d"]
        L --> CAT["concat -> 128-d float32"]
        R --> CAT
        CAT --> BUF["PredictSession buffer<br/>max 90 frames"]
        BUF -->|"hand down for 6 frames"| RS["resample_features(., 32)<br/>even sample, else edge-pad"]
        RS --> T["torch tensor (1, 32, 128)"]
    end

    subgraph C3["Two GRU layers, then the classification head"]
        direction TB
        T --> G1["GRU layer 1<br/>input 128 -> hidden 128"]
        G1 --> G2["GRU layer 2<br/>hidden 128 -> hidden 128"]
        G2 --> LAST["take last timestep (1, 128)"]
        LAST --> FC1["Linear 128 -> 128"]
        FC1 --> RELU["ReLU"]
        RELU --> DROP["Dropout p=0.3 (inference: identity)"]
        DROP --> FC2["Linear 128 -> 20"]
        FC2 --> SM["softmax(dim=0)"]
    end

    subgraph C4["Accept or reject"]
        direction TB
        SM --> ARG["argmax -> sign, confidence"]
        ARG --> THR{"confidence >= 0.60?<br/>and sign != STILL?"}
        THR -->|"yes"| OUT["accepted = true,<br/>sign reported to the client"]
        THR -->|"no"| REJ["accepted = false<br/>sign = null, confidence = 0"]
    end
```

**Explanation.** Normalisation is what makes the classifier distance- and
scale-invariant: subtracting the wrist removes translation, dividing by the
wrist-to-middle-knuckle distance removes scale. The two-hand concatenation
preserves the full signal of two-handed signs; an absent hand contributes a
zero half, which the network learns to read as "not present".

---

## Diagram F — Sequence diagram: camera input to spoken output

```mermaid
sequenceDiagram
    actor U as User
    participant CAM as Webcam
    participant HOOK as useSignRecognition
    participant MP as HandLandmarker
    participant PUT as primaryUserTracker
    participant WS as WebSocket
    participant BE as PredictSession (backend)
    participant GRU as SignGRU
    participant UI as TranslationCard
    participant TC as TtsController
    participant SP as Speech provider

    U->>CAM: raises hand, performs sign
    loop every animation frame
        HOOK->>MP: detectForVideo(video, ts)
        MP-->>HOOK: 21 landmarks x N hands
        HOOK->>PUT: processFrame(faceDetector, video, hands, ts)
        PUT-->>HOOK: PrimaryUserResult (primaryFace, primaryHands)
        HOOK->>WS: sendFrame(primaryHands)
        WS->>BE: {"hands":[...]}
        BE-->>WS: {sign:null, progress:0.x}
        WS-->>HOOK: progress (no prediction yet)
    end
    U->>CAM: lowers hand
    HOOK->>WS: sendFrame([])
    loop 6 empty frames
        WS->>BE: {"hands":[]}
        BE->>GRU: resample(32) + forward
        GRU-->>BE: logits over 20 classes
        BE-->>WS: {sign, confidence, accepted, ready:true}
        WS-->>HOOK: prediction
    end
    HOOK->>HOOK: accept if accepted && conf gate 700 ms
    HOOK->>UI: append sign ID to sentenceIdsRef, re-render
    UI-->>U: shows translated sentence
    opt auto-speak enabled
        HOOK->>TC: speak(text, lang, dedupeKey)
        TC->>SP: supportsLanguage(lang)?
        SP-->>TC: true
        TC->>SP: speak(text, lang)
        SP-->>U: audio output
        SP-->>TC: onEnded
    end
    U->>TC: presses Stop (optional)
    TC->>SP: stop()
```

**Explanation.** Note the asymmetry that the design deliberately introduces: the
frontend receives a `progress` value every frame but a prediction only once,
at the end of the sign. This keeps the GPU/CPU free and, more importantly,
stops the recogniser from committing to a sign before it is finished.

---

## Diagram G — Translation and text-to-speech workflow

```mermaid
flowchart TB
    subgraph T1["Translate from the stored sign IDs"]
        direction TB
        START["accepted sign ID<br/>e.g. HELLO"] --> LOOKUP["TRANSLATION_MAP.get id"]
        LOOKUP --> ROW["TranslationEntry<br/>{en, hi, kn}"]
        ROW --> LANG{"output language"}
        LANG -->|"en"| EN["Hello"]
        LANG -->|"hi"| HI["नमस्ते"]
        LANG -->|"kn"| KN["ನಮಸ್ಕಾರ"]
        EN --> SENT["sentence = ids.map(translateSign).join"]
        HI --> SENT
        KN --> SENT
    end

    subgraph T2["Choose a provider"]
        direction TB
        TAG["speechTag(lang)<br/>en-US / hi-IN / kn-IN"] --> CTRL["TtsController.speak(text, language)"]
        CTRL --> SEQN{"sequence superseded?"}
        SEQN -->|"yes"| SUP["return superseded, do not speak"]
        SEQN -->|"no"| PHASE["phase = generating"]
        PHASE --> P1{"BrowserTtsProvider<br/>supportsLanguage?"}
        P1 -->|"yes, a real voice exists"| UTT["SpeechSynthesisUtterance<br/>lang set, voice attached"]
        P1 -->|"no voice for hi/kn"| P2{"LocalTtsProvider<br/>/health says engine present?"}
        P2 -->|"no, service down"| ERR1["service-offline error + Retry"]
        P2 -->|"no, model missing"| ERR2["unsupported-language error"]
        P2 -->|"yes"| POST["POST /speak {text,lang,tag,rate,pitch}"]
    end

    subgraph T3["Play"]
        direction TB
        POST --> AUDIO["audio/wav bytes"]
        AUDIO --> BLOB["object URL + HTMLAudioElement.play()"]
        UTT --> SPK["speech"]
        BLOB --> SPK
        SPK --> END["onEnded -> phase = idle"]
    end
```

**Explanation.** Two crucial rules are enforced. First, translation always
derives from the stored sign IDs, never from a previously translated string, so
switching language re-renders the whole sentence correctly. Second, a voice is
never borrowed across languages — if no Kannada voice exists, nothing is
dispatched to the browser engine, because an English voice reading Kannada
script produces noise. The controller falls through to the offline service
instead.

---

## Diagram H — Portrait Mode rendering pipeline

```mermaid
flowchart TB
    subgraph P1["Read and refine the matte"]
        direction TB
        V["videoRef (never modified)"] --> READ["segmentForVideo(video, ts)<br/>throttled to 24 fps"]
        READ --> RAW["confidenceMasks[0]<br/>person probability at INPUT IMAGE size<br/>(measured 640x480, not 256x256)"]
        RAW --> RS["0. Resample to 256x256 working buffer<br/>area-average, resolution-independent"]
        RS --> M1["1. Temporal smoothing<br/>EMA alpha = 0.35"]
        M1 --> M2["2. Erode, radius 1 mask px<br/>separable min filter"]
        M2 --> M3["3. Box blur, radius 1<br/>separable mean, 2 passes"]
        M3 --> M4["4. Smoothstep edge contrast<br/>window 0.35 .. 0.65"]
        M4 --> COV{"coverage > 0.02?"}
        COV -->|"no"| PLAIN["draw plain video frame<br/>on the overlay canvas"]
        COV -->|"yes"| RGBA["alphaToRgba<br/>white pixels, alpha = matte"]
    end

    subgraph P2["Composite foreground and background"]
        direction TB
        RGBA --> MASKC["mask canvas 256x256"]
        MASKC --> FGC["foreground canvas, full resolution"]
        V --> FGC
        FGC --> DIN["globalCompositeOperation = 'destination-in'"]
        MASKC --> DIN
        DIN --> FGSHARP["sharp person"]
        V --> BGC["background canvas<br/>output / (3 + intensity*9)"]
        MODE{"mode"}
        MODE -->|"blur"| BLUR["ctx.filter = blur(1 + intensity*6 px)<br/>draw video small"]
        MODE -->|"remove"| FILL["fillRect BACKGROUND_REMOVAL_COLOR #241c18"]
        BLUR --> UPSCALE["draw scaled back up,<br/>imageSmoothingEnabled"]
        FILL --> OUTC["output canvas"]
        UPSCALE --> OUTC
        FGSHARP --> OUTC
    end

    subgraph P3["Stack above the untouched video"]
        direction TB
        OUTC --> MIRROR["CSS class video-mirror<br/>same transform as the video"]
        MIRROR --> STACK["z-order:<br/>video < portrait < hand skeleton<br/>< primary-user debug"]
    end
```

**Explanation.** The whole feature is one canvas between the video and the hand
skeleton. Because MediaPipe hand landmarks are read from the `<video>` element
and never from this canvas, the recogniser is structurally incapable of seeing
a blurred or segmented frame. Erosion at step 2 is what removes the halo: the
outermost ring of any segmentation mask is a mixture of person and background,
and showing it verbatim paints the old background onto the silhouette.

---

## Diagram I — Development and deployment topology

```mermaid
flowchart TB
    subgraph Dev["Development machine (the only arrangement actually run)"]
        direction LR
        B1["uvicorn app.main:app<br/>127.0.0.1:8000 --reload<br/>(backend/run.bat)"]
        B2["vite dev server<br/>0.0.0.0:5173 host:true<br/>(npm run dev)"]
        B3["local speech service<br/>127.0.0.1:8765<br/>(tools/tts-service/run.bat)"]
        B1 <-->|"ws:// + REST, CORS allow-list"| B2
        B2 -->|"POST /speak, GET /health"| B3
    end
    B2 -.->|"first load only"| B4["MediaPipe WASM + models<br/>CDN, browser-cached"]

    subgraph Prod["Production build path (declared, NOT deployed)"]
        direction LR
        P1["npm run build<br/>tsc && vite build"] --> P2["dist/<br/>static SPA"]
        P2 --> P3["vercel.json rewrite<br/>/(.*) -> /index.html"]
        P3 --> P4["public/_redirects<br/>/* /index.html 200"]
    end
```

**Explanation — read this honestly.** The production side of this diagram is a
**declared capability, not an observed deployment**. `vercel.json` and
`public/_redirects` configure an SPA-hosting target, and `vercel.json` contains
no hosting provider, no project id and no URL. Nothing in the repository
records that the application has ever been deployed. The development topology
on the left is the only arrangement that has actually been run.

When the frontend is served from an origin other than the backend, the operator
must add that origin to the backend's `ALLOWED_ORIGINS`, otherwise the browser
blocks the requests. When the frontend is built for production,
`API_BASE` falls back to `window.location.origin`, so a same-origin deployment
needs no hard-coded URL and an HTTPS deployment automatically derives `wss://`.

---

## Diagram J — Error-handling and degradation flow

```mermaid
flowchart TB
    START["operation"] --> Q1{"what failed?"}

    Q1 -->|"getUserMedia"| C1["permission-denied /<br/>no-camera / in-use / error"]
    C1 --> C1R["status pill + EmptyState with<br/>actionable text; retry button"]

    Q1 -->|"MediaPipe model load"| C2["status error +<br/>'Could not load the hand-tracking<br/>model. Check your internet connection'"]

    Q1 -->|"WebSocket"| C3["socketStatus error;<br/>Backend offline callout;<br/>camera and overlay keep working"]

    Q1 -->|"backend /health"| C4["Backend offline callout;<br/>recognition resumes when reachable"]

    Q1 -->|"TTS"| C5{"which stage?"}
    C5 -->|"no voice in browser"| D1["fall through to local service"]
    C5 -->|"local service down"| D2["service-offline:<br/>'Start it with tools\\tts-service\\run.bat'<br/>+ Retry button"]
    C5 -->|"no model on disk"| D3["unsupported-language:<br/>'run install.bat' + needsNetwork flag"]
    C5 -->|"HTTP != 200"| D4["request-failed with status code"]
    C5 -->|"play() rejected"| D5["playback-failed:<br/>'press Speak once more'"]
    C5 -->|"nothing to say"| D6["empty-text, no retry"]
    D2 --> D7["controller re-probes every 4 s<br/>so speech self-heals without reload"]

    Q1 -->|"segmentation"| C6{"stage?"}
    C6 -->|"model load failed"| E1["status 'unavailable'<br/>overlay canvas removed,<br/>raw feed shown + callout"]
    C6 -->|"3 consecutive frame failures"| E2["status 'degraded'<br/>plain frame drawn,<br/>loop continues to retry"]
    C6 -->|"coverage < 0.02"| E3["plain frame drawn;<br/>no solid backdrop painted"]

    Q1 --> OK["never claims audio it did not produce:<br/>SpeakOutcome.ok is false and<br/>TtsError carries the real reason"]
```

**Explanation.** Every failure path ends in an honest, specific message with a
concrete next step. The three TTS failure kinds are deliberately distinct —
`service-offline`, `unsupported-language` and `request-failed` require different
user actions, so collapsing them into one generic warning would be uninformative.
The system never reports success without audio: `SpeakOutcome.ok` is only true
when a provider actually returned a usable result.