import AppKit
import Carbon.HIToolbox

/// Puts text at the cursor of the frontmost app: clipboard + ⌘V, then restores
/// whatever was on the clipboard before.
final class TextInserter {
    private struct SavedItem {
        var entries: [(NSPasteboard.PasteboardType, Data)]
    }

    func insert(_ text: String) {
        let pasteboard = NSPasteboard.general
        let saved = snapshot(pasteboard)

        pasteboard.clearContents()
        pasteboard.setString(text, forType: .string)

        postCommandV()

        // Give the target app a moment to read the pasteboard before restoring it.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
            self.restore(saved, to: pasteboard)
        }
    }

    private func postCommandV() {
        guard let source = CGEventSource(stateID: .combinedSessionState) else { return }
        let vKey = CGKeyCode(kVK_ANSI_V)
        guard let down = CGEvent(keyboardEventSource: source, virtualKey: vKey, keyDown: true),
              let up = CGEvent(keyboardEventSource: source, virtualKey: vKey, keyDown: false) else { return }
        down.flags = .maskCommand
        up.flags = .maskCommand
        down.post(tap: .cghidEventTap)
        up.post(tap: .cghidEventTap)
    }

    private func snapshot(_ pasteboard: NSPasteboard) -> [SavedItem] {
        (pasteboard.pasteboardItems ?? []).map { item in
            SavedItem(entries: item.types.compactMap { type in
                item.data(forType: type).map { (type, $0) }
            })
        }
    }

    private func restore(_ items: [SavedItem], to pasteboard: NSPasteboard) {
        guard !items.isEmpty else { return }
        pasteboard.clearContents()
        let restored: [NSPasteboardItem] = items.map { saved in
            let item = NSPasteboardItem()
            for (type, data) in saved.entries { item.setData(data, forType: type) }
            return item
        }
        pasteboard.writeObjects(restored)
    }
}
