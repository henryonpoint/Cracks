import AppKit
import ApplicationServices
import DictationCore

/// Watches a modifier key system-wide with a listen-only CGEvent tap.
/// Needs Accessibility (and on newer macOS, Input Monitoring) permission.
final class HotkeyMonitor {
    var onKeyDown: (() -> Void)?
    var onKeyUp: (() -> Void)?

    private let hotkey: Hotkey
    private var tap: CFMachPort?
    private var runLoopSource: CFRunLoopSource?
    private var isDown = false

    init(hotkey: Hotkey) {
        self.hotkey = hotkey
    }

    static func isTrusted(prompt: Bool) -> Bool {
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: prompt] as CFDictionary
        return AXIsProcessTrustedWithOptions(options)
    }

    func start() throws {
        guard HotkeyMonitor.isTrusted(prompt: true) else { throw HotkeyError.notTrusted }

        let mask: CGEventMask = (1 << CGEventType.flagsChanged.rawValue)
        let refcon = Unmanaged.passUnretained(self).toOpaque()
        guard let tap = CGEvent.tapCreate(
            tap: .cgSessionEventTap,
            place: .headInsertEventTap,
            options: .listenOnly,
            eventsOfInterest: mask,
            callback: { _, type, event, refcon in
                if let refcon {
                    let monitor = Unmanaged<HotkeyMonitor>.fromOpaque(refcon).takeUnretainedValue()
                    monitor.handle(type: type, event: event)
                }
                return Unmanaged.passUnretained(event)
            },
            userInfo: refcon
        ) else {
            throw HotkeyError.tapFailed
        }

        let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
        CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)
        self.tap = tap
        self.runLoopSource = source
    }

    func stop() {
        if let tap { CGEvent.tapEnable(tap: tap, enable: false) }
        if let runLoopSource { CFRunLoopRemoveSource(CFRunLoopGetMain(), runLoopSource, .commonModes) }
        tap = nil
        runLoopSource = nil
    }

    private func handle(type: CGEventType, event: CGEvent) {
        // macOS disables taps that stall; re-enable and carry on.
        if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
            if let tap { CGEvent.tapEnable(tap: tap, enable: true) }
            return
        }
        guard type == .flagsChanged else { return }

        let keyCode = event.getIntegerValueField(.keyboardEventKeycode)
        let flags = event.flags
        let down: Bool
        switch hotkey {
        case .rightOption:
            guard keyCode == 61 else { return } // right ⌥ (left is 58)
            down = flags.contains(.maskAlternate)
        case .fn:
            guard keyCode == 63 else { return }
            down = flags.contains(.maskSecondaryFn)
        }
        guard down != isDown else { return }
        isDown = down
        DispatchQueue.main.async { [self] in
            down ? onKeyDown?() : onKeyUp?()
        }
    }
}

enum HotkeyError: Error, LocalizedError {
    case notTrusted
    case tapFailed

    var errorDescription: String? {
        switch self {
        case .notTrusted: return "Sayso needs Accessibility permission to see the dictation key."
        case .tapFailed: return "Could not install the key listener. Check Input Monitoring in System Settings."
        }
    }
}
