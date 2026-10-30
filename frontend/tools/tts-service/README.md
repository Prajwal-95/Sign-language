# Local speech service (Hindi + Kannada)

A small offline text-to-speech service that runs **on your machine** and gives the
ISL-to-Speech frontend a real voice for Hindi (हिन्दी) and Kannada (ಕನ್ನಡ).

It is only needed when your operating system has no voice for those languages —
which is the default on Windows 11.

---

## Why this exists

Windows 11 installs only English *local* voices:

```powershell
Add-Type -AssemblyName System.Speech
(New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() |
  ForEach-Object { $_.VoiceInfo.Culture.Name }
```

The Web Speech API can only speak languages the OS exposes, so `utterance.lang =
"hi-IN"` produces nothing useful — in the old build it actually made Windows
read Kannada letters out with an English voice.

### Why Kannada needs this service but Hindi usually does not

Chrome ships a set of **online** Google voices that are not installed Windows
voices. On a typical machine they look like this:

```
en-US  LOCAL  Microsoft Zira - English (United States)
hi-IN  ONLINE Google हिन्दी
kn     (none)
```

So Hindi usually already "just works" through `speechSynthesis`, while **Kannada
has no voice at all** and depends completely on this service. That asymmetry is
why a missing service shows up as "Hindi fine, Kannada silent" rather than as
an obvious total failure.

You can list what your own browser exposes at `chrome://speech-synthesis` (or
Edge's `edge://speech-synthesis`).

The fix for both is to synthesise the audio ourselves instead of asking the OS
for it.

---

## What it uses

| Engine | Covers | Quality | Install |
| --- | --- | --- | --- |
| **mms** (default) — Meta Multilingual Speech, VITS | `hi`, `kn`, `en` | Neural, natural | ~416 MB downloaded once |
| `piper` (optional) — Piper1 | `hi` only | Neural, slightly better | Voice `.onnx` you supply |
| `espeak` (optional) — eSpeak NG | `hi`, `kn` | Robotic formants | Binary you supply |

**Why `mms` is the default.** Piper has no Kannada voice at all — its published
voice list covers `hi_IN`, `ml_IN`, `mr_IN`, `ne_NP`, `te_IN`, `ur_PK` but no
`kn`. eSpeak NG does cover both languages but sounds like a 1990s modem.
Meta's MMS checkpoints are the only option found that ships genuine neural
voices for **both** Hindi and Kannada, run on CPU, and are a plain `pip install`
away.

- **Licence:** CC-BY-NC-4.0 — free, no subscription, no account, no API key.
  Non-commercial use (this is a final-year project).
- **Requirement:** the models must be downloaded **once**. After that the
  service works with the network disconnected (verified — see below).

---

## Setup on Windows 11

1. Install Python 3.9+ from <https://www.python.org/downloads/> and tick
   **Add python.exe to PATH** during installation.
2. Open this folder (`frontend\tools\tts-service`) and double-click:

   ```bat
   install.bat
   ```

   It creates a private `.venv`, installs CPU PyTorch and the engine, then
   downloads the Hindi, Kannada and English voice models into `models\`.
   This step needs internet and takes a few minutes.

3. When it finishes, start the service:

   ```bat
   run.bat
   ```

   Leave that window open. You should see:

   ```
   ISL local speech service 1.0.0 on http://127.0.0.1:8765
   engines ready: {'en': 'mms', 'hi': 'mms', 'kn': 'mms'}
   ```

   The port opens in about **5 seconds**, immediately, and the three voice
   models finish loading in the background (`en ready in 2.1s`, and so on).
   You do **not** have to wait for warm-up before opening the app — the first
   Kannada request simply loads the model on demand and takes a few seconds.

4. Open the app at <http://localhost:5173> and select **हिन्दी · Hindi** or
   **ಕನ್ನಡ · Kannada** in the Output language selector. Press **Speak**.

If you start the service *after* the page is already open, the app notices
within a few seconds on its own — no reload needed.

The app finds the service automatically. You do not need to configure anything.
To use a different port, set `VITE_LOCAL_TTS_URL` in `.env.local`.

> **HTTPS deployments:** Chrome and Edge treat `http://127.0.0.1` as a
> trustworthy origin, so a page served over HTTPS can still call the service.
> If you host the app somewhere that blocks that, set `TTS_HOST` /
> `TTS_PORT` and update `VITE_LOCAL_TTS_URL` to match.

### Running the tests

```bat
.venv\Scripts\python.exe -m unittest test_service -v
```

These are fast and model-free: they cover text chunking, WAV encoding, and the
capability logic that decides whether `/health` may advertise a language.

---

## Verifying it works

```powershell
curl.exe -s http://127.0.0.1:8765/health
# {"ok":true,"engines":{"en":"mms","hi":"mms","kn":"mms"},...}

curl.exe -s -o hi.wav -H "Content-Type: application/json" `
  -d '{\"text\":\"नमस्ते\",\"lang\":\"hi\"}' http://127.0.0.1:8765/speak
```

`hi.wav` is a normal 16 kHz mono WAV you can play in any media player.

---

## API

### `GET /health`

```json
{
  "ok": true,
  "engines": { "en": "mms", "hi": "mms", "kn": "mms" },
  "loaded": { "en": true, "hi": true, "kn": false },
  "version": "1.0.0",
  "offline": true
}
```

`engines[lang]` is `null` when no voice model for that language is actually
installed on disk — it is never guessed from the library being importable. The
frontend reads this to decide what it can honestly claim it can speak.
`loaded` only reports warm-up progress; the service answers `/speak` either way,
loading a model on demand if needed.

### `POST /speak`

```jsonc
// request
{ "text": "नमस्ते धन्यवाद", "lang": "hi", "tag": "hi-IN", "rate": 1.0, "pitch": 1.0 }
```

Responds with `audio/wav`. Headers report what actually produced the audio:

| Header | Meaning |
| --- | --- |
| `X-TTS-Engine` | `mms`, `piper` or `espeak` |
| `X-TTS-Sample-Rate` | e.g. `16000` |
| `X-TTS-Pitch` | `ignored` — VITS and formant engines have no pitch control |

Error responses:

| Status | Meaning | Frontend behaviour |
| --- | --- | --- |
| `404` | No engine for that language | honest "unsupported language", no retry |
| `413` | Text produced more than 90 s of audio | honest failure |
| `500` / `503` | Synthesis failed | retryable error |

### Supported languages

`en`, `hi`, `kn`. Anything else returns `404` — the service never pretends.

---

## Security

- Binds to **127.0.0.1 only**, so nothing on the network can reach it.
- Rejects any browser `Origin` that is not a loopback address, so a random
  website cannot drive your machine. `403 origin not allowed` otherwise.
  To allow a production domain, set `TTS_ALLOWED_ORIGINS=https://your-app`.
- Accepts no credentials and reads no cookies.
- Caps input at 2000 characters and output at ~2 minutes of audio.
- Sends nothing anywhere: text never leaves the machine.

---

## Offline behaviour

Once `install.bat` has run, the service needs no internet. This was verified by
restarting the service with `HF_HUB_OFFLINE=1` and `TRANSFORMERS_OFFLINE=1`
and synthesising Hindi, Kannada and English successfully.

The **browser** provider still needs internet for the online "Natural" voices
that Chrome and Edge ship, but those are used only when they are actually
present and installed — the app does not depend on them.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| App says "local speech service is not running" | Start `run.bat`. Check `http://127.0.0.1:8765/health`. The app retries by itself every few seconds once the service is up. |
| Hindi works but Kannada does not | Expected if the service is down: Chrome has an online `hi-IN` voice but no Kannada voice at all. Check `chrome://speech-synthesis`. |
| App says the service has no Hindi/Kannada voice | Re-run `install.bat`, or `download_models.py`. `/health` reports `null` only when the checkpoint really is missing. |
| First request is very slow | Models are loading on demand. Watch the service window for `ready in Ns`. |
| `413 audio too long` | Clear or shorten the sentence. |
| Audio plays but sounds robotic | Install eSpeak NG or a Piper voice as an alternative engine. |

### Port already in use

If another program owns 8765, either stop it, or start the service elsewhere and
tell the app about it:

```bat
set TTS_PORT=8900
run.bat
```

```env
# frontend/.env.local
VITE_LOCAL_TTS_URL=http://127.0.0.1:8900
```

---

## Files

| File | Purpose |
| --- | --- |
| `service.py` | HTTP service (`/health`, `/speak`), CORS and size guards |
| `tts_engines.py` | Engine registry, model loading, text chunking, normalisation |
| `download_models.py` | One-off model download / warm-up |
| `install.bat` / `run.bat` | Windows setup and launch |
| `test_service.py` | Unit tests (`python -m unittest test_service`) |
| `models/` | Downloaded voice models — git-ignored, never bundled |
| `.venv/` | Private Python environment — git-ignored |