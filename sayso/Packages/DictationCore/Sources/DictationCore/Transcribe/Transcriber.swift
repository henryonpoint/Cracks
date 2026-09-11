import AVFoundation
import Foundation

/// A streaming speech-to-text engine. One instance handles many dictations:
/// call `prepare()` once, then `start` / `feed` / `finish` per dictation.
public protocol Transcriber: AnyObject {
    /// Full text-so-far updates (finalised + volatile), suitable for a live HUD.
    var partials: AsyncStream<String> { get }

    /// Loads models and returns the audio format buffers must be fed in.
    func prepare() async throws -> AVAudioFormat

    /// Begins a new dictation.
    func start() async throws

    /// Feed converted audio. Safe to call from the audio thread.
    func feed(_ buffer: AVAudioPCMBuffer)

    /// Ends input and returns the final transcript.
    func finish() async throws -> String

    /// Abandons the current dictation.
    func cancel() async
}

public enum TranscriberError: Error, LocalizedError {
    case unsupportedLocale(Locale)
    case noAudioFormat
    case notStarted
    case timedOut

    public var errorDescription: String? {
        switch self {
        case .unsupportedLocale(let l): return "Speech recognition does not support \(l.identifier)."
        case .noAudioFormat: return "The speech model is not installed yet."
        case .notStarted: return "Transcription was not started."
        case .timedOut: return "Transcription did not finish in time."
        }
    }
}

/// Runs `operation` but gives up after `seconds`.
func withTimeout<T: Sendable>(seconds: Double, _ operation: @escaping @Sendable () async throws -> T) async throws -> T {
    try await withThrowingTaskGroup(of: T.self) { group in
        group.addTask { try await operation() }
        group.addTask {
            try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
            throw TranscriberError.timedOut
        }
        let result = try await group.next()!
        group.cancelAll()
        return result
    }
}
