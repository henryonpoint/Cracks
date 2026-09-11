import AppKit
import SwiftUI

/// Floating, non-activating pill so focus never leaves the app you're dictating into.
@MainActor
final class HUDPanel {
    let model = HUDModel()
    private var panel: NSPanel?

    func show() {
        if panel == nil { panel = makePanel() }
        position()
        panel?.orderFrontRegardless()
    }

    func hide() {
        panel?.orderOut(nil)
    }

    private func makePanel() -> NSPanel {
        let panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 420, height: 64),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.level = .floating
        panel.isFloatingPanel = true
        panel.hidesOnDeactivate = false
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        panel.contentView = NSHostingView(rootView: HUDView(model: model))
        return panel
    }

    private func position() {
        guard let panel else { return }
        let mouse = NSEvent.mouseLocation
        let screen = NSScreen.screens.first { $0.frame.contains(mouse) } ?? NSScreen.main
        guard let frame = screen?.visibleFrame else { return }
        let size = panel.frame.size
        let origin = NSPoint(x: frame.midX - size.width / 2, y: frame.minY + 48)
        panel.setFrameOrigin(origin)
    }
}

@MainActor
final class HUDModel: ObservableObject {
    enum State { case listening, finishing, cleaning }

    @Published var text = ""
    @Published var level: Float = 0
    @Published var state: State = .listening

    func reset(state: State) {
        text = ""
        level = 0
        self.state = state
    }
}

struct HUDView: View {
    @ObservedObject var model: HUDModel

    var body: some View {
        HStack(spacing: 12) {
            indicator
            Text(displayText)
                .font(.system(size: 14, weight: .medium))
                .lineLimit(1)
                .truncationMode(.head)
                .foregroundStyle(.primary)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(label)
                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(.regularMaterial, in: Capsule())
        .overlay(Capsule().strokeBorder(.white.opacity(0.12)))
        .padding(8)
    }

    private var displayText: String {
        model.text.isEmpty ? (model.state == .listening ? "Listening…" : "") : model.text
    }

    private var label: String {
        switch model.state {
        case .listening: return "REC"
        case .finishing: return "…"
        case .cleaning: return "CLEAN"
        }
    }

    @ViewBuilder
    private var indicator: some View {
        switch model.state {
        case .listening:
            Circle()
                .fill(Color.red)
                .frame(width: 10, height: 10)
                .scaleEffect(1 + CGFloat(model.level) * 0.8)
                .animation(.easeOut(duration: 0.08), value: model.level)
        case .finishing, .cleaning:
            ProgressView()
                .controlSize(.small)
        }
    }
}
