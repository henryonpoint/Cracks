import AppKit
import DictationCore
import SwiftUI

/// Glue between the hotkey, the dictation pipeline, the HUD and text insertion.
@MainActor
final class AppController: ObservableObject {
    static let shared = AppController()

    enum State: Equatable {
        case idle, preparing, listening, finishing
    }

    @Published private(set) var state: State = .idle
    @Published private(set) var statusMessage = "Starting…"
    @Published private(set) var lastError: String?
    @Published private(set) var permissions = Permissions()

    let settings = AppSettings.shared
    let history = HistoryStore()

    private let session: DictationSession
    private let hud = HUDPanel()
    private let inserter = TextInserter()
    private var hotkey: HotkeyMonitor?
    private var queue: Task<Void, Never>?
    private var pressStarted: Date?
    private var targetBundleID: String?

    struct Permissions {
        var microphone = false
        var accessibility = false
    }

    private init() {
        session = DictationSession(transcriber: AppleTranscriber())
        session.onPartial = { [weak self] text in self?.hud.model.text = text }
        session.onLevel = { [weak self] level in self?.hud.model.level = level }
    }

    func start() {
        refreshPermissions()
        installHotkey()

        state = .preparing
        statusMessage = "Loading speech model…"
        Task {
            let granted = await AudioCapture.requestMicrophoneAccess()
            permissions.microphone = granted
            do {
                try await session.prepare()
                statusMessage = "Ready · hold \(settings.hotkey.label)"
                state = .idle
            } catch {
                statusMessage = "Speech model failed to load"
                lastError = error.localizedDescription
                state = .idle
            }
        }
    }

    func refreshPermissions() {
        permissions.accessibility = HotkeyMonitor.isTrusted(prompt: false)
    }

    func installHotkey() {
        hotkey?.stop()
        let monitor = HotkeyMonitor(hotkey: settings.hotkey)
        monitor.onKeyDown = { [weak self] in self?.keyDown() }
        monitor.onKeyUp = { [weak self] in self?.keyUp() }
        do {
            try monitor.start()
            hotkey = monitor
        } catch {
            lastError = error.localizedDescription
            statusMessage = "Grant Accessibility + Input Monitoring, then relaunch"
        }
    }

    // MARK: Hotkey handling (serialised so a fast tap can't overtake a slow start)

    private func keyDown() {
        guard state == .idle else { return }
        state = .listening
        pressStarted = Date()
        targetBundleID = NSWorkspace.shared.frontmostApplication?.bundleIdentifier
        hud.model.reset(state: .listening)
        hud.show()

        enqueue { [self] in
            do {
                try await session.begin()
            } catch {
                lastError = error.localizedDescription
                hud.hide()
                state = .idle
            }
        }
    }

    private func keyUp() {
        guard state == .listening else { return }
        state = .finishing

        let tooShort = Date().timeIntervalSince(pressStarted ?? Date()) < 0.25
        let useCleanup = settings.cleanupEnabled && !(settings.apiKey ?? "").isEmpty
        let context = CleanupContext(
            styleHint: StyleHints.hint(forBundleID: targetBundleID),
            dictionary: settings.dictionary
        )

        enqueue { [self] in
            defer { state = .idle }
            if tooShort {
                await session.cancel()
                hud.hide()
                return
            }
            hud.model.state = useCleanup ? .cleaning : .finishing
            do {
                var cleaner: Cleaner?
                if useCleanup {
                    cleaner = ClaudeCleaner(apiKey: settings.apiKey ?? "", model: settings.model) { [hud] partial in
                        Task { @MainActor in hud.model.text = partial }
                    }
                }
                let result = try await session.end(cleaner: cleaner, context: context)
                hud.hide()
                guard !result.text.isEmpty else { return }
                inserter.insert(result.text)
                history.add(Dictation(raw: result.raw, clean: result.text, targetApp: targetBundleID, usedCleanup: result.usedCleanup))
                lastError = nil
            } catch {
                hud.hide()
                lastError = error.localizedDescription
            }
        }
    }

    private func enqueue(_ work: @escaping @MainActor () async -> Void) {
        let previous = queue
        queue = Task { @MainActor in
            await previous?.value
            await work()
        }
    }
}
