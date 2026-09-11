import AVFoundation
import Foundation

public struct DictationResult: Sendable {
    public var raw: String
    public var text: String
    public var usedCleanup: Bool
}

/// Orchestrates one dictation: mic → transcriber → cleaner, with fallbacks so
/// something sensible always comes out.
public final class DictationSession {
    public var onPartial: ((String) -> Void)?
    public var onLevel: ((Float) -> Void)?

    private let capture = AudioCapture()
    private let transcriber: Transcriber
    private var format: AVAudioFormat?
    private var partialTask: Task<Void, Never>?

    public private(set) var isPrepared = false

    public init(transcriber: Transcriber) {
        self.transcriber = transcriber
    }

    /// Loads the speech model. Call once at launch; safe to call again.
    public func prepare() async throws {
        format = try await transcriber.prepare()
        isPrepared = true
        guard partialTask == nil else { return } // an AsyncStream has one consumer; never re-iterate
        partialTask = Task { [weak self] in
            guard let self else { return }
            for await text in self.transcriber.partials {
                await MainActor.run { self.onPartial?(text) }
            }
        }
    }

    public func begin() async throws {
        if !isPrepared { try await prepare() }
        guard let format else { throw TranscriberError.noAudioFormat }
        try await transcriber.start()
        try capture.start(
            outputFormat: format,
            onBuffer: { [transcriber] buffer in transcriber.feed(buffer) },
            onLevel: { [weak self] level in
                DispatchQueue.main.async { self?.onLevel?(level) }
            }
        )
    }

    /// Stops listening, finalises the transcript, and cleans it if a cleaner is given.
    public func end(cleaner: Cleaner?, context: CleanupContext, cleanupTimeout: Double = 4) async throws -> DictationResult {
        capture.stop()
        let raw = try await transcriber.finish()
        guard let cleaner, !raw.isEmpty else {
            return DictationResult(raw: raw, text: raw, usedCleanup: false)
        }
        do {
            let cleaned = try await withTimeout(seconds: cleanupTimeout) {
                try await cleaner.clean(raw, context: context)
            }
            let accepted = Guardrails.accept(clean: cleaned, raw: raw)
            return DictationResult(raw: raw, text: accepted, usedCleanup: accepted == cleaned.trimmingCharacters(in: .whitespacesAndNewlines))
        } catch {
            // Network down, slow, or the model misbehaved: the raw transcript still ships.
            return DictationResult(raw: raw, text: raw, usedCleanup: false)
        }
    }

    public func cancel() async {
        capture.stop()
        await transcriber.cancel()
    }
}
