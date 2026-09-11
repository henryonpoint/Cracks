import AVFoundation
import Foundation
import Speech

/// On-device transcription with Apple's SpeechAnalyzer (macOS 26 / iOS 26+).
/// Free, private, streams volatile results in a few hundred milliseconds.
@available(macOS 26.0, iOS 26.0, *)
public final class AppleTranscriber: Transcriber, @unchecked Sendable {
    public let partials: AsyncStream<String>
    private let partialsContinuation: AsyncStream<String>.Continuation

    private let requestedLocale: Locale
    private var locale: Locale?
    private var analyzer: SpeechAnalyzer?
    private var transcriber: SpeechTranscriber?
    private var inputBuilder: AsyncStream<AnalyzerInput>.Continuation?
    private var resultsTask: Task<Void, Never>?

    private let lock = NSLock()
    private var finalizedText = ""
    private var volatileText = ""

    public init(locale: Locale = .current) {
        requestedLocale = locale
        (partials, partialsContinuation) = AsyncStream<String>.makeStream()
    }

    // MARK: Transcriber

    public func prepare() async throws -> AVAudioFormat {
        guard let supported = await SpeechTranscriber.supportedLocale(equivalentTo: requestedLocale) else {
            throw TranscriberError.unsupportedLocale(requestedLocale)
        }
        locale = supported
        let probe = makeTranscriber(locale: supported)

        // Downloads the on-device model the first time (shared with other apps once installed).
        if let request = try await AssetInventory.assetInstallationRequest(supporting: [probe]) {
            try await request.downloadAndInstall()
        }
        guard let format = await SpeechTranscriber.bestAvailableAudioFormat(compatibleWith: [probe]) else {
            throw TranscriberError.noAudioFormat
        }
        return format
    }

    public func start() async throws {
        guard let locale else { throw TranscriberError.notStarted }
        await cancel()

        let transcriber = makeTranscriber(locale: locale)
        let analyzer = SpeechAnalyzer(modules: [transcriber])
        let (stream, builder) = AsyncStream<AnalyzerInput>.makeStream()

        lock.withLock {
            finalizedText = ""
            volatileText = ""
        }

        resultsTask = Task { [weak self] in
            do {
                for try await result in transcriber.results {
                    guard let self else { return }
                    let text = String(result.text.characters)
                    self.apply(text: text, isFinal: result.isFinal)
                }
            } catch {
                // The analyzer reports its own failure through finish(); nothing to do here.
            }
        }

        try await analyzer.start(inputSequence: stream)

        self.transcriber = transcriber
        self.analyzer = analyzer
        self.inputBuilder = builder
    }

    public func feed(_ buffer: AVAudioPCMBuffer) {
        inputBuilder?.yield(AnalyzerInput(buffer: buffer))
    }

    public func finish() async throws -> String {
        guard let analyzer else { throw TranscriberError.notStarted }
        inputBuilder?.finish()
        inputBuilder = nil

        try await withTimeout(seconds: 4) {
            try await analyzer.finalizeAndFinishThroughEndOfInput()
        }
        // The results stream ends once the analyzer finishes; wait briefly for the last phrase.
        if let task = resultsTask {
            _ = try? await withTimeout(seconds: 1.5) { await task.value }
        }
        teardown()
        return currentText()
    }

    public func cancel() async {
        inputBuilder?.finish()
        inputBuilder = nil
        if let analyzer { await analyzer.cancelAndFinishNow() }
        resultsTask?.cancel()
        teardown()
    }

    // MARK: Private

    private func makeTranscriber(locale: Locale) -> SpeechTranscriber {
        SpeechTranscriber(
            locale: locale,
            transcriptionOptions: [],
            reportingOptions: [.volatileResults],
            attributeOptions: []
        )
    }

    /// Apple sends phrases in order: volatile results are replaced until a final one lands.
    private func apply(text: String, isFinal: Bool) {
        let combined: String = lock.withLock {
            if isFinal {
                finalizedText = join(finalizedText, text)
                volatileText = ""
            } else {
                volatileText = text
            }
            return join(finalizedText, volatileText)
        }
        partialsContinuation.yield(combined)
    }

    private func currentText() -> String {
        lock.withLock { join(finalizedText, volatileText) }
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func join(_ a: String, _ b: String) -> String {
        if a.isEmpty { return b }
        if b.isEmpty { return a }
        if a.hasSuffix(" ") || b.hasPrefix(" ") { return a + b }
        return a + " " + b
    }

    private func teardown() {
        analyzer = nil
        transcriber = nil
        resultsTask = nil
    }
}
