# Viva Preparation — ISL-to-Speech

**60 questions with concise, accurate answers, all grounded in the actual
implementation.**

A note on strategy: the most common way to lose marks in a viva is to claim more
than the project does. Every answer below deliberately includes the honest
boundary. Where something is unverified, the answer says so — that reads as rigour,
not weakness.

Answers marked **[V]** were verified by execution, **[S]** by reading the source,
**[A]** from a saved artefact, **[?]** not verified.

---

# PART A — General technical questions (30)

### Q1. Give a one-sentence description of your project.

A browser-based application that recognises 20 fixed Indian Sign Language (ISL)
word signs from a webcam, assembles them into a sentence, and speaks it aloud in
English, Hindi or Kannada. All computer vision runs locally in the browser; only
hand-landmark coordinates are sent to the backend. **[S]**

### Q2. Why is the project split into three processes instead of one?

Because they have different lifetimes and different failure modes. The browser
must own the camera and the MediaPipe models. The backend owns the trained
weights. The speech service is optional and can be absent — the app must still
work without it. Coupling them would mean a Python environment and a GPU-scale
model download for a user who only wants the UI. **[S]**

### Q3. Why run the computer vision in the browser instead of on the server?

Three reasons. **Privacy** — camera video never leaves the device, which matters
most for the users this tool serves. **Latency** — no upload of a video stream.
**Cost** — no video-processing server needed. The cost is that MediaPipe's WASM
build runs on the main thread, which is the pipeline's main performance risk.
**[S]**

### Q4. What exactly crosses the network?

Per hand, per frame: handedness label, handedness score, and 21 landmarks of
`[x, y, z]`. Nothing else — no images, no video, no audio. **[S]**

### Q5. What is the difference between a static-sign and a dynamic-sign model, and
which did you build?

A static-sign model classifies a single frame. A dynamic model classifies a
*sequence* of frames, so it can use motion. ISL signs like HELLO or THANK_YOU are
motion, so a static model cannot represent them. I built a dynamic model: a GRU
over 32-frame landmark sequences. **[S]**

### Q6. Why a GRU and not an LSTM?

Fewer parameters for a similar result on short sequences. A GRU has two gates
(reset, update); an LSTM has three (input, forget, output). At this model size
that is roughly a 25 % parameter saving for no practical accuracy loss. More
importantly, GRU trains more reliably on a small dataset like 1,407 sequences.
**[S]** — the accuracy comparison itself was not run **[?]**.

### Q7. Why not a Transformer?

Data volume. A Transformer needs far more data than 1,407 sequences to beat a
GRU; at this scale an attention model would overfit. The GRU has 217,236
parameters, which is proportionate to the dataset. **[S]**

### Q8. Explain the sign boundary. Why does the system wait for the hand to go
down?

Because predicting on every frame produces mid-sign garbage and duplicate
detections of a held pose. The backend buffers frames while a hand is visible and
classifies exactly once, after 6 consecutive frames with no hand. That single
decision eliminated the majority of wrong live output. **[V]**

### Q9. What is the `STILL` class for?

It is not a word — it is the pause gesture. The dataset contains a "Still"
motion; I kept the class so the model has a target for a neutral pose, and the
backend converts any `STILL` prediction into `sign: null, confidence: 0`. It is
never displayed and never spoken. Its translation rows are deliberately empty.
**[S]**

### Q10. How does the confidence threshold work?

`CONFIDENCE_THRESHOLD = 0.60` in `backend/.env`. A prediction below it is
returned with `accepted: false` and the frontend discards it. The trade-off is
precision over recall — a weak gesture is dropped silently rather than
mis-committed to the sentence. **[V]**

### Q11. How do you convert raw landmarks into features?

Three steps per hand: subtract the wrist (landmark 0) from all 21 points to
remove position; divide by the wrist-to-middle-knuckle distance to remove scale;
append the handedness as one bit. That is 21×3 + 1 = **64** values per hand, and
**128** for two hands concatenated. **[V]**

### Q12. Why normalise the landmarks at all?

So the model does not have to learn that a hand 2 m from the camera produces
smaller numbers. After normalisation the same gesture yields nearly the same
vector regardless of distance or screen position, which massively reduces the
variation the network must handle. **[S]**

### Q13. How do you handle a video shorter than 32 frames?

By repeating the edge frames symmetrically, not by zero-padding. Zero-padding
would create a fake "pause" in the middle of a motion, which the model would read
as a different gesture. Edge repetition preserves the trajectory shape. **[S]**

### Q14. What is primary-user tracking and why is it needed?

With more than one person in frame, MediaPipe returns every hand it sees. Feeding
a bystander's hands to the classifier corrupts the sequence. I run a face
detector, score each face by size, centredness and confidence, pick the primary
user, estimate a torso region, and only send hands associated with that person.
**[S]**

### Q15. How is the primary user selected exactly?

`score = 0.65·sizeScore + 0.25·centeredness + 0.10·confidence`. Identity is
preserved by IoU > 0.3, a track survives up to 18 lost frames, and switching the
primary user requires a 1.4× score advantage so it does not flicker between two
similar faces. **[S]**

### Q16. What happens if the primary user switches mid-sign?

The frontend detects the track-ID change and sends `{"type":"reset"}`, clearing the
backend buffer. Otherwise one "sequence" would contain motion from two different
people. **[S]**

### Q17. Explain the translation approach.

It is a dictionary, not natural-language translation. A table maps each of the 21
internal identifiers to an English, Hindi and Kannada string. There is no
grammar, no morphology and no reordering. Saying otherwise would be dishonest —
`GOOD_MORNING` is one fixed phrase, not a construction. **[S]**

### Q18. Why is the sentence stored as sign IDs rather than as text?

So that switching language re-derives the text from the IDs. If you stored the
translated string, a language switch would have to translate an already
translated string, which accumulates errors. Storing IDs means the English →
Hindi → Kannada → English round trip is lossless. **[S]**

### Q19. What happens if an unknown sign ID reaches the translator?

`translateSign` returns `''` and `parseSignId` returns `null`, so the caller
filters it out. A raw class identifier can never leak into displayed Hindi or
Kannada text. **[S]**

### Q20. How does the primary-user tracker interact with the portrait effect?

They are independent. The tracker uses a face detector; the portrait effect uses
a separate image segmenter. Recognition reads the `<video>` element directly, so
the composited canvas can never affect it. **[S]**

### Q21. How many MediaPipe models are loaded, and what are they?

Three, all from the same `@mediapipe/tasks-vision@0.10.14` package: the
`hand_landmarker.task` model, the `blaze_face_short_range.tflite` face model, and —
only when the portrait effect is not Off — the `selfie_segmenter.tflite` model at
0.24 MB. **[V]**

### Q22. Why is the CPU delegate used?

So hand-landmark inference and segmentation do not compete for the GPU, and so
the app works on machines without a usable GPU configuration. The target machine
has a GTX 1650 with 4 GB VRAM, where three graphs contending for the device would
be a worse trade than sharing the CPU. **[S]** — actual throughput was not
measured **[?]**.

### Q23. How did you decide the recognition sequence length?

32 frames. It covers roughly one second of motion at 30 fps, which matches the
duration of a single word-level sign, and it keeps the sequence tensor small
(32 × 128 floats). It is configurable via `--seq-len`. **[S]**

### Q24. Describe your error handling philosophy.

Every failure must produce a specific message and a concrete next step, and the
UI must never claim something that did not happen. `SpeakOutcome.ok` is only
true when a provider actually produced a result. The eight TTS error kinds exist
because they require *different* user actions — collapsing them into one generic
warning would be less useful. **[S]**

### Q25. How do you recover if the backend goes down?

Recognition stops, but the camera, the landmark overlay, the portrait effect and
the settings all keep working — the failure is contained. The UI shows a specific
"Backend offline" notice. There is deliberately **no automatic reconnect**: the
user presses Start again, which is more predictable than a socket retrying
silently. **[S]**

### Q26. Is there any authentication on your backend?

No. **[S]** That is acceptable for a loopback development deployment but must be
addressed before any network exposure, and I have documented it as a risk rather
than leaving it implicit.

### Q27. Where is your data stored?

There is no database. Calibration samples are written directly as compressed
`.npz` files into `dataset/seq/<SIGN>/user_<n>.npz`, with `source='user'` and a
timestamp, so the training pipeline picks them up on the next run. **[S]**

### Q28. How would you add a 21st sign?

Add it to `ml/vocabulary.py`, record or prepare its data, retrain, then add the
identifier and a translation row to `translation.ts`. Order matters — class
indices are positional, so inserting in the middle invalidates the old
checkpoint. **[S]**

### Q29. What were the two hardest bugs, and how did you find them?

Both were found only in a real browser, never in unit tests. First,
`putImageData` requires a genuine `ImageData` object — a plain object passed the
unit tests but threw on every real frame, leaving the portrait canvas blank.
Second, an exception inside the animation-frame callback killed the loop
permanently, so one bad frame froze the effect forever. Both are fixed, and the
loop now guards and re-arms. **[V]**

### Q30. What would you do first if you had one more week?

Add a training run log — seed, flags, epoch count, hardware — so the reported
metrics are reproducible. Right now `word_metrics.json` records the numbers but
not how they were produced, which is the weakest link in the project's
evaluable evidence. **[A]**

---

# PART B — The GRU model (10)

### Q31. Write the GRU update equations.

```
z_t = σ(W_z x_t + U_z h_{t−1} + b_z)                 update gate
r_t = σ(W_r x_t + U_r h_{t−1} + b_r)                 reset gate
n_t = tanh(W_n x_t + U_n (r_t ⊙ h_{t−1}) + b_n)     candidate
h_t = (1 − z_t) ⊙ n_t + z_t ⊙ h_{t−1}
```

**x_t** ∈ ℝ¹²⁸ is the feature vector at step *t*; **h_t** ∈ ℝ¹²⁸ is the hidden
state; σ is the logistic sigmoid; ⊙ is element-wise multiplication. **[S]**

### Q32. Explain the intuition behind the reset and update gates.

*r_t* decides how much of the past hidden state to forget when computing the
candidate — useful when a new gesture starts. *z_t* decides how much of that
candidate to write into the hidden state versus keeping the old state. Together
they let the network decide, per timestep, what to remember. **[S]**

### Q33. Give the exact architecture of your model.

```
Input      (batch, 32, 128)
GRU layer 1  input 128 → hidden 128
GRU layer 2  hidden 128 → hidden 128
  take output[:, -1, :]      → (batch, 128)
Linear 128 → 128, ReLU, Dropout 0.3
Linear 128 → 20
softmax(dim=0) at inference
```

**217,236 parameters**, verified by summing the checkpoint tensors. **[V]**

### Q34. How do you know there are exactly two GRU layers?

The checkpoint `state_dict` contains `gru.weight_ih_l0` and `gru.weight_ih_l1`
and nothing beyond — `l2` is absent. Each is `(384, 128)`, and 384 = 3 × 128 is
the GRU's reset/update/candidate gate width, confirming the hidden size. **[V]**

### Q35. Why take only the last timestep of the GRU output?

Because `h₃₂` has already accumulated information from the whole sequence through
the recurrence. Taking the last state is the standard sequence-classification
head and avoids adding parameters. **[S]**

### Q36. What are the input and output tensor shapes?

Input `(batch, 32, 128)` — 32 timesteps, 128 features, batch-first. Raw output
`(batch, 20)`, one logit per class. `input_size=128` is confirmed by the
checkpoint metadata. **[V]**

> **Note on a documentation discrepancy:** the training script's docstring says
> "input 64-d per frame". That is stale — 64 is the *single-hand* feature
> length; the shipped model consumes the 128-d two-hand vector. The checkpoint is
> authoritative. **[V]**

### Q37. How was the model trained?

Adam, learning rate 1e-3, batch size 16, up to 60 epochs, with early stopping on
validation accuracy at patience 15. Loss is `CrossEntropyLoss` with
inverse-frequency class weights normalised to mean 1.0, which handles the
`STILL` imbalance. **[S]**

### Q38. What does data augmentation do, and is it on by default?

When enabled with `--augment`, it applies Gaussian jitter (σ 0.02), a ±3-frame
time shift, a random 70–100 % temporal crop resampled back to 32, and a
50 %-probability horizontal mirror that also flips the handedness bit. **It is
opt-in, not default**, and it is applied only to the training split. **[S]**

### Q39. How do you know the model did not overfit or leak data?

The split is stratified at the **sequence** level, not the frame level, so no
window of one video can appear in two splits. Recorded results are 1.0 best
validation accuracy and 0.981 test accuracy, which is consistent with a small,
well-separated dataset rather than leakage. But I cannot rule out signer leakage,
because the dataset stores no signer metadata and there is no grouped-by-signer
split. **[A]** **[?]**

### Q40. What are the model's measured weaknesses?

Per-class recall from the saved metrics: BREAK 0.818, COME 0.900, THANK_YOU
0.909; everything else is at or near 1.0. These are structurally similar
gestures. Also, because the buffer caps at 90 frames, a sign performed very slowly
gets truncated. **[A]** **[S]**

---

# PART C — MediaPipe and computer vision (5)

### Q41. What are the 21 hand landmarks, and what does each coordinate mean?

21 points from wrist to each fingertip in MediaPipe's canonical order — wrist,
then four per finger (CMC, MCP, IP, TIP). **x** and **y** are normalised to
`[0,1]` relative to the image; **z** is depth relative to the wrist, in roughly
the same scale as x. So 21 × 3 = 63 values per hand. **[S]**

### Q42. What exactly does `handedness` mean, and can it be trusted?

MediaPipe's own handedness estimate, given as a label plus a confidence score. It
is appended to the feature vector as a single bit (1 = Right, 0 = Left). It is a
useful weak cue for two-handed signs but it is an estimate, not ground truth —
it can be wrong for certain hand orientations. **[S]**

### Q43. Which MediaPipe models do you use and why those?

`hand_landmarker` float16 for the 21 landmarks; `blaze_face_short_range` float16
for primary-user tracking; `selfie_segmenter` float16 (0.24 MB) for the portrait
effect. I measured the alternatives before choosing — `deeplab_v3` is 2.65 MB and
`selfie_multiclass_256x256` is 15.61 MB, for no benefit at this task. **[V]**

### Q44. Why do you resample sequences to a fixed length?

Because a neural network needs a fixed tensor shape. Resampling also normalises
speed: a slow signer and a fast signer produce the same 32-frame trajectory. **[S]**

### Q45. What does MediaPipe **not** do in your system?

It does not classify signs, and it does not segment by instance. In particular
`selfie_segmenter` returns one matte for the most prominent person with no
identity, so it cannot select the person nearest the centre of the frame. I
documented that in the UI rather than faking centre preference. **[V]**

---

# PART D — Translation and text-to-speech (5)

### Q46. Do Hindi and Kannada use the same speech provider?

Not on this machine. The architecture is identical — one controller, one
fallback chain — but Chrome exposes an online `hi-IN` voice, so Hindi resolves to
the browser provider, while there are **zero** Kannada voices anywhere, so
Kannada always resolves to the offline service. **[V]**

### Q47. Why did you not just use an English voice for Kannada?

Because it produces noise, not speech. The provider only attaches a voice when
its language matches; if no matching voice exists it reports `no-voice` and the
controller falls through. A visibly wrong result is worse than an honest error. **[S]**

### Q48. Why an offline speech service instead of a cloud API?

No account, no API key, no network dependency, no per-request cost, and no text
leaving the machine. The cost is 416 MB of downloaded models and a service that
must be started manually. **[S]**

### Q49. Why Meta MMS rather than Piper or eSpeak?

Because Piper publishes a `hi_IN` voice but **no** Kannada voice, and eSpeak
covers both but at formant quality. MMS ships genuine neural voices for Hindi and
Kannada, so it is the only single engine that covers both. **[V]**

### Q50. Why is your offline speech model licensed CC-BY-NC-4.0 a problem?

It is free for this academic project, but non-commercial. Any commercial
deployment would need a different engine. That is a licensing constraint on the
design, not an oversight. **[V]**

---

# PART E — System architecture (5)

### Q51. Why is the portrait effect a separate canvas instead of a CSS filter on
the video?

Three reasons. A CSS filter would blur the video element itself, and recognition
reads that element — so it would destroy the input. CSS cannot do segmentation.
And a separate canvas lets me control the z-order exactly: video, then portrait,
then the hand skeleton. **[S]**

### Q52. How do you guarantee the portrait effect cannot affect recognition?

Structurally, not by convention. `useSignRecognition` reads the `<video>`;
`portraitRenderer` only ever *reads* that element and writes to its own canvas. A
unit test asserts the video element's `srcObject`, `style` and `className` are
never assigned, and the DOM was verified in a real browser. The recogniser
therefore cannot see a blurred frame. **[V]**

### Q53. Why is there no CSS blur on the video for Portrait Blur?

Because "background blur" is not "blur everything". A real matte requires
knowing which pixels are the person. The renderer segments the person, keeps the
foreground at full sharpness, and renders the background separately at reduced
resolution with a blur. **[S]**

### Q54. How does the app handle multiple people in the portrait effect honestly?

It reuses the *existing* face detector's face count — no extra model — and
displays "N people in frame — the effect isolates the most prominent one, not the
person nearest the centre." Sign recognition still correctly follows the tracked
primary user. **[V]**

### Q55. What happens if the segmentation model fails to load?

The overlay canvas is removed, the raw camera feed is shown, the status becomes
`unavailable`, and a callout explains the failure. If segmentation fails on 3
consecutive frames after loading, the status becomes `degraded`, a plain frame is
drawn, and the loop keeps retrying. The camera and recognition are unaffected.
**[S]**

---

# PART F — Testing, limitations and future work (5)

### Q56. What testing did you actually do, and what does it not cover?

171 unit tests across 40 suites, a clean type check, a successful production
build, and a passing contrast audit — all run and passing. Plus live verification:
every backend endpoint, the WebSocket contract including real GRU inference, real
TTS synthesis for all three languages, Kannada playback in a real browser, and
pixel-level measurement of both portrait effects. **Not covered:** audible audio
quality (no audio device available), real-face matte quality (no webcam), React
component rendering (no jsdom), and any backend unit tests — `backend/tests/`
contains only `__init__.py`. **[V]**

### Q57. What is the single biggest limitation of your system?

The fixed 20-sign vocabulary with no continuous signing and no grammar. A user who
does not know those 20 signs gets nothing useful, and there is no mechanism to
compose longer utterances. Everything downstream — translation, speech — inherits
that ceiling. **[S]**

### Q58. How would you measure accuracy properly, given you have not?

Add a **grouped-by-signer** split so no signer appears in two splits, collect data
from at least ten signers, and report accuracy, macro precision, recall and F1
plus a confusion matrix on that split. Add a training run log so the result is
reproducible. The current 0.981 is a valid record of one run on a
sequence-level split, but it does not measure cross-signer generalisation. **[A]**

### Q59. What is your highest-priority future improvement, and why?

Cross-signer generalisation — collecting data from more signers and adding a
grouped split. It is the difference between a number that means something and a
number that does not, and it requires no architectural change. **[S]**

### Q60. What would you do differently if you started again?

Decide the sign-boundary rule earlier. Buffering a sign and classifying once at
the hand-lowering gesture was the single highest-value design decision in the
project, and I only arrived at it after seeing mid-sign false positives. I would
also write the training run log from the start, so every metric is reproducible. **[S]**

---

## Quick-answer cheat sheet

| Fact | Value | Class |
|---|---|---|
| Signs | 20 | V |
| Sequence length | 32 | V |
| Feature dimension | 128 (2 hands × 64) | V |
| Hidden size / layers | 128 / 2 | V |
| Parameters | 217,236 | V |
| Test accuracy | 0.98104 | A |
| Dataset sequences | 1,407 (1,170 + 237 user) | V |
| Ports | 8000 backend, 5173 frontend, 8765 speech | S |
| Test suites | 171 tests / 40 suites / 0 fail | V |
| Bundle | 427.04 kB (133.30 kB gzip) | V |
| Speech models | 138.5 MB each, 416 MB total | V |
| Segmenter model | 0.24 MB | V |
| Classes with no OS voice | Kannada (0 voices); Hindi has an online Chrome voice | V |