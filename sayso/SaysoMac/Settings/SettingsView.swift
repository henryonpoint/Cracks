import AppKit
import DictationCore
import ServiceManagement
import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var controller: AppController
    @ObservedObject private var settings = AppSettings.shared
    @State private var apiKey = AppSettings.shared.apiKey ?? ""
    @State private var dictionaryText = AppSettings.shared.dictionary.joined(separator: "\n")
    @State private var launchAtLogin = SMAppService.mainApp.status == .enabled

    var body: some View {
        Form {
            Section("Dictation key") {
                Picker("Hold to dictate", selection: $settings.hotkey) {
                    ForEach(Hotkey.allCases) { Text($0.label).tag($0) }
                }
                .onChange(of: settings.hotkey) { _, _ in controller.installHotkey() }
                if settings.hotkey == .fn {
                    Text("Turn off “Press Fn key to start dictation” in System Settings → Keyboard so the keys don't fight.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }

            Section("Cleanup") {
                Toggle("Clean up with Claude", isOn: $settings.cleanupEnabled)
                SecureField("Anthropic API key", text: $apiKey)
                    .onSubmit { settings.apiKey = apiKey }
                TextField("Model", text: $settings.model)
                Text("Only the transcript text is sent, never audio. Without a key, or with cleanup off, you get the raw on-device transcript.")
                    .font(.caption).foregroundStyle(.secondary)
            }

            Section("Personal dictionary") {
                TextEditor(text: $dictionaryText)
                    .font(.body.monospaced())
                    .frame(minHeight: 90)
                    .onChange(of: dictionaryText) { _, text in
                        settings.dictionary = text
                            .split(whereSeparator: \.isNewline)
                            .map { $0.trimmingCharacters(in: .whitespaces) }
                            .filter { !$0.isEmpty }
                    }
                Text("One name or term per line, spelled the way you want it typed.")
                    .font(.caption).foregroundStyle(.secondary)
            }

            Section("Permissions") {
                permissionRow("Microphone", granted: controller.permissions.microphone,
                              pane: "Privacy_Microphone")
                permissionRow("Accessibility", granted: controller.permissions.accessibility,
                              pane: "Privacy_Accessibility")
                permissionRow("Input Monitoring", granted: controller.permissions.accessibility,
                              pane: "Privacy_ListenEvent")
                Button("Re-check") { controller.refreshPermissions(); controller.installHotkey() }
            }

            Section {
                Toggle("Open at login", isOn: $launchAtLogin)
                    .onChange(of: launchAtLogin) { _, on in
                        do {
                            if on { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
                        } catch {
                            launchAtLogin = SMAppService.mainApp.status == .enabled
                        }
                    }
            }
        }
        .formStyle(.grouped)
        .frame(width: 460)
        .padding(.bottom, 8)
        .onDisappear { settings.apiKey = apiKey }
    }

    private func permissionRow(_ name: String, granted: Bool, pane: String) -> some View {
        HStack {
            Image(systemName: granted ? "checkmark.circle.fill" : "exclamationmark.circle")
                .foregroundStyle(granted ? .green : .orange)
            Text(name)
            Spacer()
            Button("Open System Settings") {
                if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?\(pane)") {
                    NSWorkspace.shared.open(url)
                }
            }
            .controlSize(.small)
        }
    }
}
