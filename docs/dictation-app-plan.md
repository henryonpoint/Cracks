# Sayso — a personal Wispr Flow

> **Working name:** Sayso (rename freely). **Status:** Phase 0/1 Mac scaffold lives in [`sayso/`](../sayso/README.md); iPhone not started.
> **Goal:** hold one key on the Mac, or press the Action Button on iPhone, speak, and get clean,
> intelligently formatted text where your cursor is. Built the cheapest way that still feels great.

---

## 1. The one-paragraph answer

Build two small native Swift apps that share one Swift package, with **no backend server at all**.
Speech-to-text runs **on-device and free** using Apple's `SpeechAnalyzer` (macOS 26 / iOS 26+),
which streams partial results in about 0.3–0.5 s. The only cloud call is the "make it read well"
step, which sends the *text* (never the audio) to **Claude Haiku 4.5**, costing a few cents a day.
The Mac app is a menu-bar app with a global push-to-talk key that pastes into whatever app is
focused. The iPhone app is driven by an App Intent so the Action Button, Back Tap, Control Center,
and Siri all trigger it, with a keyboard extension as a second entry point. Running cost is roughly
**$10–15/month all-in** (of which $8.25 is the Apple Developer Program), versus $12–15/month for
Wispr Flow Pro, and you own the data, the dictionary, and the behaviour.

---

## 2. What it does (product spec)

### Mac
| Feature | Behaviour |
|---|---|
| One button | Hold a configurable key (default **Right Option**; Fn also supported). Release to finish. Double-tap to lock in hands-free mode for long dictation. |
| Live feedback | A small floating pill near the cursor or at the bottom of the screen shows a waveform and the words as they're recognised. |
| Result | Cleaned text is inserted at the cursor of the frontmost app (Slack, Mail, Xcode, Chrome, Notes, terminal). |
| App-aware tone | The frontmost app's bundle ID picks a style: casual in Slack/iMessage, complete sentences in Mail/Docs, plain ASCII and no smart quotes in Xcode/Terminal/VS Code. |
| Cleanup | Removes fillers ("um", "like", repeats), applies self-corrections ("Tuesday, no, Wednesday" becomes "Wednesday"), adds punctuation and paragraphs, expands your dictionary (names, product terms, acronyms). |
| Spoken commands | "new paragraph", "scratch that", "all caps X", "in quotes". Kept deliberately small. |
| Raw mode | Toggle to skip the LLM entirely: zero cost, zero extra latency, exactly what you said. |
| History | Local searchable log of every dictation (raw + clean + target app). Copy or re-insert from the menu bar. |
| Privacy | Audio never leaves the machine. Only transcript text goes to the Claude API, and only when cleanup is on. |

### iPhone
| Feature | Behaviour |
|---|---|
| One button | **Action Button** (or Back Tap, Control Center, lock-screen widget, Siri) runs a `Dictate` App Intent that opens a full-screen recording sheet. |
| Result, path A | Cleaned text is copied to the clipboard and a banner says "Copied". Works in every app, including ones that block third-party keyboards. |
| Result, path B | A **Sayso keyboard** with one big mic key. Tapping it hops to the app to record, then returns and inserts the text directly into the field. (iOS keyboards cannot use the microphone; every dictation keyboard does this hop.) |
| Share sheet | "Send to…" any app, or straight into Cracks via its capture endpoint for spoken notes. |
| Sync | Dictionary and history sync through your private iCloud database (CloudKit, free). |

### Latency budget (what "feels like Wispr" means)
| Stage | Target |
|---|---|
| Key down to first live words on screen | < 0.5 s |
| Key up to final on-device transcript | < 0.3 s |
| Final transcript to cleaned text (Claude Haiku, streamed) | 0.5–0.9 s for a 15-second utterance |
| Key up to text in the field | **≈ 1 s** with cleanup, ≈ 0.3 s in raw mode |

---

## 3. Architecture

```
 ┌──────────────── Mac (menu bar app) ────────────────┐   ┌────────── iPhone app ──────────┐
 │ Hotkey (CGEventTap) ─► AudioCapture (AVAudioEngine)│   │ App Intent / Action Button     │
 │        │                       │                    │   │        │                       │
 │   HUD panel ◄──── partials ────┤                    │   │  Record sheet ◄── partials ────┤
 │                                ▼                    │   │                       ▼        │
 │                  ┌─────────────────────────┐       │   │        ┌─────────────────────┐ │
 │                  │      DictationCore      │       │   │        │    DictationCore    │ │
 │                  │  (shared Swift package) │       │   │        └─────────────────────┘ │
 │                  └─────────────────────────┘       │   │   Clipboard / keyboard ext.    │
 │  Paste (NSPasteboard + ⌘V, clipboard restored)     │   └────────────────────────────────┘
 └────────────────────────────────────────────────────┘
                                 │
        DictationCore pipeline:  ▼
   audio ─► Transcriber (on-device Apple SpeechAnalyzer; WhisperKit fallback)
         ─► Cleaner (Claude Haiku 4.5 over HTTPS  |  Apple Foundation Models on-device  |  passthrough)
         ─► Inserter (Mac: paste / type;  iOS: clipboard / keyboard extension)
         ─► History + Dictionary store (SwiftData, App Group, CloudKit sync)
```

### Components

| Layer | Choice | Why this is the cheap, good choice |
|---|---|---|
| Language / UI | Swift 6, SwiftUI, one Xcode workspace, two app targets + one shared package | Both targets are Apple; nothing cross-platform buys you anything here, and native is the only way to get a global hotkey, paste, App Intents and a keyboard extension. |
| Speech-to-text | **Apple `SpeechAnalyzer` + `SpeechTranscriber`** (macOS 26 / iOS 26+), on-device, streaming | $0, private, no network dependency, ~0.3–0.5 s to first partial, model shared across apps once downloaded. |
| STT fallback | **WhisperKit** or **FluidAudio Parakeet** (CoreML, on-device) | Also $0. Use if Apple's model struggles with your voice/accent or for pre-26 machines. Swappable behind a `Transcriber` protocol. |
| STT cloud option | Deepgram Nova-3 streaming, opt-in switch only | ~$0.0077/min. Only if you later want best-in-class accuracy for noisy rooms. Not in the default build. |
| Cleanup ("intelligence") | **Claude Haiku 4.5** via raw HTTPS (`URLSession`), streaming, no thinking | Fast, cheap, and this task (edit text, don't generate) doesn't need a bigger model. Quality dial: switch to `claude-sonnet-5` per-app or for a "rewrite" command. |
| Cleanup, free tier | Apple **Foundation Models** framework (on-device, macOS 26 / iOS 26+) | $0 and offline. Good enough for punctuation and filler removal; weaker on self-corrections and tone. Ship as the fallback when offline. |
| Storage | SwiftData in an App Group container; CloudKit private DB for sync | Free, no server, works for keyboard extension via the shared container. |
| Secrets | Anthropic API key in Keychain, entered once in Settings | For personal use, no proxy needed. Add a tiny Cloudflare Worker proxy only if you ever hand the app to other people. |
| Distribution | Mac: local build, Developer ID signed. iOS: install via Xcode or TestFlight. | Apple Developer Program ($99/yr) is required for TestFlight, App Groups, CloudKit and a keyboard extension on a real device. |

### Mac-specific mechanics
- **Hotkey:** `CGEvent.tapCreate` listening for `flagsChanged` (Right Option / Fn) and key events. Needs **Accessibility** and **Input Monitoring** permissions. Disable Apple's built-in "Press Fn to dictate" in System Settings to avoid a fight over the key.
- **Insertion:** write to `NSPasteboard`, post `⌘V` via `CGEvent`, then restore the previous clipboard after ~300 ms. Fallback for apps where paste misbehaves (some terminals, secure fields): type the text as `CGEvent` keystrokes, or set the value through the Accessibility API on the focused element.
- **Context:** `NSWorkspace.shared.frontmostApplication.bundleIdentifier` → style hint. Optionally read the focused element's role via AX to detect "code editor" vs "chat box".
- **HUD:** a non-activating `NSPanel` (so focus never leaves the target app) hosting a SwiftUI view.
- **Signing gotcha:** macOS ties Accessibility permission to the app's code signature. Sign every local build with the same Developer ID certificate or you will re-grant permission after each build.

### iPhone-specific mechanics
- **Trigger:** one `AppIntent` (`DictateIntent`) with `openAppWhenRun = true`. That single intent lights up Action Button, Shortcuts, Back Tap, Control Center toggle, lock-screen widget and Siri.
- **Recording:** `AVAudioSession` in `.record` mode with the `audio` background mode so a hop back to another app doesn't kill an in-flight cleanup.
- **Keyboard extension:** one mic key. On tap it opens the container app via URL scheme; the app records, writes the result to the App Group, and returns to the previous app. The keyboard reads the result in `viewWillAppear` and calls `textDocumentProxy.insertText`. Needs "Allow Full Access" for the shared container.
- **Clipboard path is primary.** Apple blocks mic access in keyboards, so the app-hop is unavoidable for in-place insertion. Action Button → clipboard → paste is fewer taps and works everywhere, including apps that block custom keyboards.

---

## 4. The cleanup call

Keep the model on a short leash: it edits, it never answers. Plain text in, plain text out.

**System prompt (draft):**
```
You clean up dictated speech into written text. Output ONLY the cleaned text, nothing else.
Rules:
- Preserve the speaker's meaning, words and order. Do not answer, summarise, or add content.
- Remove fillers (um, uh, like, you know), false starts and repeated words.
- Apply self-corrections: "Tuesday, no, Wednesday" -> "Wednesday".
- Add punctuation, capitalisation and paragraph breaks. Numbers as digits unless conversational.
- Spoken commands: "new paragraph", "new line", "scratch that" (drop the previous sentence),
  "in quotes ...", "all caps ...".
- Use the personal dictionary for names and terms exactly as spelled there.
- Match the target style: {style_hint}
- If the transcript is empty or only noise, output nothing.
Personal dictionary: {dictionary}
```

**Style hints by bundle ID (examples):**
| Bundle ID prefix | Hint |
|---|---|
| `com.tinyspeck.slackmacgap`, `com.apple.MobileSMS`, `com.hnc.Discord` | Casual chat. Short sentences, no closing signature. |
| `com.apple.mail`, `com.google.Chrome` (Gmail/Docs tab) | Complete sentences, proper paragraphs. |
| `com.apple.dt.Xcode`, `com.microsoft.VSCode`, `com.googlecode.iterm2`, `com.apple.Terminal` | Plain ASCII, straight quotes, no trailing period on single-line commands. |
| default | Neutral, clear prose. |

**Request shape** (Swift has no official Anthropic SDK, so call the REST API directly):
```
POST https://api.anthropic.com/v1/messages
x-api-key: <keychain>   anthropic-version: 2023-06-01
{
  "model": "claude-haiku-4-5",
  "max_tokens": 1024,
  "stream": true,
  "system": "<prompt above with dictionary + style hint>",
  "messages": [{ "role": "user", "content": "<raw transcript>" }]
}
```
Stream `content_block_delta` events and append into the HUD; insert when the stream ends.
No thinking, no tools. Keep `max_tokens` at roughly 2× the transcript length so a runaway
response can never paste a wall of text.

**Guardrails worth building on day one**
- If the model output is > 1.5× the transcript length or < 0.3×, fall back to the raw transcript.
- If the API call takes > 2.5 s or fails, insert the raw transcript and show a subtle "raw" badge.
- Never send audio; never log transcripts anywhere but the local history store.

---

## 5. Cost model

Assumptions: average dictation ≈ 40 words (≈ 60 tokens in, 60 out), system prompt + dictionary
≈ 700 tokens (below Haiku's cacheable minimum, so priced uncached).

| Item | Light use (30/day) | Heavy use (150/day) |
|---|---|---|
| Speech-to-text (Apple on-device) | $0 | $0 |
| Cleanup, Claude Haiku 4.5 ($1 in / $5 out per M tokens) | ≈ $1.0/mo | ≈ $5/mo |
| Cleanup, Claude Sonnet 5 instead ($2 / $10) | ≈ $2/mo | ≈ $10/mo |
| Cleanup, Apple Foundation Models (on-device) | $0 | $0 |
| Cloud STT if you opt in (Deepgram Nova-3, ~$0.0077/min) | ≈ $2/mo | ≈ $12/mo |
| Apple Developer Program | $8.25/mo | $8.25/mo |
| Hosting / servers | $0 | $0 |
| **Total, default build** | **≈ $9/mo** | **≈ $13/mo** |
| Wispr Flow Pro, for comparison | $12–15/mo | $12–15/mo |

Honest read: the dollar savings are modest. What you actually buy is unlimited usage, on-device
audio privacy, your own dictionary and prompts, a Cracks integration, and no vendor lock-in. The
real cost is your build time, which is why the plan below is ordered to give you a daily driver
after the first weekend.

---

## 6. Build plan

Effort assumes evenings/weekends with Claude Code writing most of the Swift. Phase 0 is the whole
loop end-to-end so you use it from day two.

| Phase | Scope | Done when | Effort |
|---|---|---|---|
| **0. Mac loop** | Menu bar app, push-to-talk hotkey, `AVAudioEngine` capture, `SpeechAnalyzer` streaming, paste via clipboard + ⌘V with restore. No LLM, no UI beyond a pill. | You dictate a Slack message end-to-end. | 1 weekend |
| **1. Make it smart** | Claude Haiku cleanup with streaming, style hints by app, personal dictionary, raw-mode toggle, guardrails/fallbacks, history window, Settings (hotkey, API key in Keychain, launch at login), Developer ID signing. | You stop opening Wispr Flow. | 1 week |
| **2. iPhone** | iOS target on the same package, `DictateIntent` + Action Button setup screen, recording sheet with live words, clipboard result, history, CloudKit sync of dictionary/history, "Send to Cracks" share action. | Action Button → speak → paste anywhere. | 1 week |
| **3. Polish** | iOS keyboard extension with the app-hop, spoken commands, snippets ("insert my address"), on-device Foundation Models fallback when offline, WhisperKit fallback transcriber, menu-bar stats (words/day, $ spent). | Feature parity with what you use in Wispr. | 3–5 days |
| **4. Optional** | Meeting/ambient mode on Mac (Core Audio process taps to transcribe system audio + mic, summarised into Cracks), cloud STT toggle, multi-language, TestFlight for friends (then add a key-proxy Worker). | Only if you want it. | as needed |

### Suggested repo layout (new repo, e.g. `henryonpoint/sayso`)
```
Sayso.xcworkspace
Packages/DictationCore/         # shared: AudioCapture, Transcriber, Cleaner, Inserter, Store
  Sources/DictationCore/
    Audio/AudioCapture.swift
    Transcribe/Transcriber.swift          # protocol
    Transcribe/AppleTranscriber.swift     # SpeechAnalyzer
    Transcribe/WhisperKitTranscriber.swift
    Clean/Cleaner.swift                   # protocol
    Clean/ClaudeCleaner.swift             # URLSession streaming
    Clean/FoundationModelsCleaner.swift
    Clean/Prompt.swift                    # system prompt + style hints
    Store/Models.swift                    # Dictation, DictionaryEntry (SwiftData)
    Store/Settings.swift
  Tests/DictationCoreTests/             # prompt guardrails, corrections, command parsing
SaysoMac/                               # menu bar app, hotkey, HUD, paste
SaysoiOS/                               # app, DictateIntent, record sheet
SaysoKeyboard/                          # keyboard extension (phase 3)
```

---

## 7. Risks and how the plan handles them

| Risk | Mitigation |
|---|---|
| Apple STT accuracy on your voice or jargon is not good enough | `Transcriber` is a protocol; drop in WhisperKit (free) or Deepgram (paid toggle) without touching the rest. The dictionary also gets applied at the cleanup step, which fixes most name/term misses. |
| Paste doesn't work in some app | Two fallbacks: simulated keystrokes, then AX value set. Per-app override in Settings. |
| Accessibility permission keeps resetting | Stable Developer ID signing on every build. |
| Fn key conflicts with system dictation | Default to Right Option; document the System Settings toggle for Fn. |
| iOS keyboard can't record | Designed around it: Action Button + clipboard is the primary path; the keyboard hop is secondary. |
| Cleanup model "answers" the dictation instead of cleaning it | System prompt forbids it, plus length-ratio guardrail falls back to raw. Unit-test the prompt with a small fixture set of tricky transcripts. |
| API outage or no network | Raw transcript inserts anyway; optional on-device Foundation Models cleaner. |
| Runaway API bill | Per-dictation `max_tokens` cap, monthly spend counter in the menu bar, and a hard monthly cap in Settings that flips to raw mode. |

---

## 8. First session checklist (Phase 0)

1. New Xcode project: macOS app, SwiftUI, `LSUIElement = YES` (no Dock icon), `MenuBarExtra`.
2. Add `Packages/DictationCore` as a local Swift package; put `AudioCapture` and `AppleTranscriber` there.
3. Request Microphone + Speech permissions; download the `SpeechTranscriber` locale asset on first run.
4. `CGEventTap` for Right Option down/up → start/stop capture. Prompt for Accessibility + Input Monitoring.
5. Non-activating `NSPanel` HUD showing partial results.
6. On stop: take the final transcript, write to `NSPasteboard`, post ⌘V, restore clipboard after 300 ms.
7. Sign with your Developer ID so permissions stick. Enable "Open at Login".
8. Use it for a day. Then start Phase 1.
