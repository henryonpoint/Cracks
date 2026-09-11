import AVFoundation
import Foundation

/// Captures microphone audio with AVAudioEngine and hands out buffers converted
/// to whatever format the transcriber asked for.
public final class AudioCapture {
    private let engine = AVAudioEngine()
    private var converter: AVAudioConverter?

    public init() {}

    /// Prompts for microphone access if needed. Returns true when granted.
    public static func requestMicrophoneAccess() async -> Bool {
        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized: return true
        case .notDetermined: return await AVCaptureDevice.requestAccess(for: .audio)
        default: return false
        }
    }

    /// Starts the engine. `onBuffer` is called on the audio thread with buffers in `outputFormat`.
    /// `onLevel` receives a 0...1 loudness estimate for the HUD.
    public func start(
        outputFormat: AVAudioFormat,
        onBuffer: @escaping (AVAudioPCMBuffer) -> Void,
        onLevel: ((Float) -> Void)? = nil
    ) throws {
        let input = engine.inputNode
        let inputFormat = input.outputFormat(forBus: 0)
        guard inputFormat.sampleRate > 0 else { throw AudioCaptureError.noInputDevice }

        let needsConversion = inputFormat != outputFormat
        let converter = needsConversion ? AVAudioConverter(from: inputFormat, to: outputFormat) : nil
        converter?.primeMethod = .none // avoids timestamp drift on the SpeechAnalyzer buffer path
        self.converter = converter

        input.installTap(onBus: 0, bufferSize: 4096, format: inputFormat) { buffer, _ in
            if let onLevel { onLevel(AudioCapture.level(of: buffer)) }
            guard let converter else { onBuffer(buffer); return }

            let ratio = outputFormat.sampleRate / inputFormat.sampleRate
            let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 32
            guard let out = AVAudioPCMBuffer(pcmFormat: outputFormat, frameCapacity: capacity) else { return }

            var consumed = false
            var error: NSError?
            let status = converter.convert(to: out, error: &error) { _, outStatus in
                if consumed { outStatus.pointee = .noDataNow; return nil }
                consumed = true
                outStatus.pointee = .haveData
                return buffer
            }
            if status != .error, out.frameLength > 0 { onBuffer(out) }
        }

        engine.prepare()
        try engine.start()
    }

    public func stop() {
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        converter = nil
    }

    /// Cheap RMS → 0...1 estimate for a waveform indicator.
    private static func level(of buffer: AVAudioPCMBuffer) -> Float {
        guard let data = buffer.floatChannelData?[0], buffer.frameLength > 0 else { return 0 }
        var sum: Float = 0
        for i in 0..<Int(buffer.frameLength) { sum += data[i] * data[i] }
        let rms = sqrt(sum / Float(buffer.frameLength))
        // -50 dB → 0, -10 dB → 1
        let db = 20 * log10(max(rms, 1e-6))
        return min(max((db + 50) / 40, 0), 1)
    }
}

public enum AudioCaptureError: Error, LocalizedError {
    case noInputDevice
    public var errorDescription: String? { "No microphone input device is available." }
}
