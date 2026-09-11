import AppKit
import DictationCore
import SwiftUI

struct MenuView: View {
    @EnvironmentObject private var controller: AppController

    var body: some View {
        Text(controller.statusMessage)
        if let error = controller.lastError {
            Text(error).foregroundStyle(.secondary)
        }
        Divider()
        if let last = controller.history.items.first {
            Button("Copy last: “\(last.clean.prefix(40))…”") {
                NSPasteboard.general.clearContents()
                NSPasteboard.general.setString(last.clean, forType: .string)
            }
        }
        Toggle("Clean up with Claude", isOn: Binding(
            get: { controller.settings.cleanupEnabled },
            set: { controller.settings.cleanupEnabled = $0 }
        ))
        Divider()
        SettingsLink { Text("Settings…") }
            .keyboardShortcut(",")
        Button("Quit Sayso") { NSApplication.shared.terminate(nil) }
            .keyboardShortcut("q")
    }
}
