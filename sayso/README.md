# Sayso · Mac

Hold a key, speak, release: clean text lands at your cursor in whatever app is in front.
Speech-to-text is Apple's on-device `SpeechAnalyzer` (free, private, streams live words).
Cleanup is optional: Claude Haiku over the Messages API when you add a key, otherwise the
raw transcript is pasted with zero latency and zero cost.

This is the **Phase 0/1 desktop-only build** from [`docs/dictation-app-plan.md`](../docs/dictation-app-plan.md).
No iPhone target yet, no Developer Program needed.

## Requirements

- macOS 26 (Tahoe) or later on Apple Silicon
- Xcode 26 or later
- [XcodeGen](https://github.com/yonaskolb/XcodeGen): `brew install xcodegen`
- A free Apple ID signed into Xcode (Settings → Accounts) for a stable local signing identity

## Build and run

```bash
cd sayso
xcodegen generate          # creates Sayso.xcodeproj from project.yml
open Sayso.xcodeproj
```

In Xcode: select the `SaysoMac` target → Signing & Capabilities → pick your personal team.
Then ⌘R. The app has no Dock icon; look for the mic in the menu bar.

First run:

1. **Microphone** and **Speech Recognition** prompts: allow both.
2. **Accessibility** prompt (needed to see the dictation key and to paste): allow, then
   relaunch. If nothing happens when you hold the key, also add Sayso under
   System Settings → Privacy & Security → **Input Monitoring**.
3. The on-device speech model downloads once (a few hundred MB). The menu shows
   "Ready" when done.
4. Optional: open Settings (⌘,) and paste an Anthropic API key to turn on cleanup.
   Add names and jargon to the dictionary, one per line.

Now hold **Right Option**, talk, release. The text appears where your cursor is.
Presses shorter than a quarter second are ignored so an accidental tap does nothing.

## Layout

```
sayso/
  project.yml                       XcodeGen spec (Info.plist keys, entitlements, target)
  Packages/DictationCore/           shared Swift package, platform-agnostic
    Audio/AudioCapture.swift          AVAudioEngine tap + format conversion
    Transcribe/Transcriber.swift      protocol
    Transcribe/AppleTranscriber.swift SpeechAnalyzer implementation
    Clean/Cleaner.swift               protocol, PassthroughCleaner, Guardrails
    Clean/Prompt.swift                system prompt + per-app style hints
    Clean/ClaudeCleaner.swift         streaming Messages API client
    Store/Settings.swift, Keychain.swift, HistoryStore.swift
    DictationSession.swift            mic → transcriber → cleaner orchestration
    Tests/                            guardrail + style-hint tests
  SaysoMac/                         menu-bar app
    AppController.swift               hotkey → session → HUD → paste
    Hotkey/HotkeyMonitor.swift        CGEvent tap on Right Option / Fn
    HUD/HUDPanel.swift                non-activating floating pill
    Insert/TextInserter.swift         clipboard + ⌘V with restore
    MenuView.swift, Settings/SettingsView.swift
```

## Known rough edges

- **Not compiled yet.** This scaffold was written without a Mac. Expect a handful of
  compiler nits on first build (the `SpeechAnalyzer` API is new and signatures may differ
  slightly). Fix in place; the structure is the point.
- If `SpeechAnalyzer.start(inputSequence:)` throws on your OS build (there is a known
  buffer-path bug on some 26.x releases), the fallback is to record to a temporary
  `AVAudioFile` during the press and call `analyzer.analyzeSequence(from:)` on release.
  That costs nothing in accuracy, only the live preview.
- Paste is ⌘V. Apps that remap ⌘V (some terminals) need the keystroke fallback, which is
  not written yet.
- Fn as the hotkey requires turning off Apple's own Fn-to-dictate shortcut.

## Next

In rough order: history window in the menu, double-tap to lock hands-free mode, keystroke
fallback for insertion, a local model cleaner (Apple Foundation Models or MLX) so the whole
thing runs offline, then the iPhone target from the plan.
