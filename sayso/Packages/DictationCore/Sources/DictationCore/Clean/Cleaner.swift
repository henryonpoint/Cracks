import Foundation

/// Where the text is going, so the cleaner can match tone.
public struct CleanupContext: Sendable {
    public var styleHint: String
    public var dictionary: [String]

    public init(styleHint: String = StyleHints.neutral, dictionary: [String] = []) {
        self.styleHint = styleHint
        self.dictionary = dictionary
    }
}

/// Turns a raw transcript into text you'd be happy to send.
public protocol Cleaner: Sendable {
    func clean(_ transcript: String, context: CleanupContext) async throws -> String
}

/// Raw mode: exactly what you said, zero latency, zero cost.
public struct PassthroughCleaner: Cleaner {
    public init() {}
    public func clean(_ transcript: String, context: CleanupContext) async throws -> String { transcript }
}

/// Sanity checks so a misbehaving model can never paste garbage.
public enum Guardrails {
    /// Returns `clean` if it looks like an edit of `raw`, otherwise `raw`.
    public static func accept(clean: String, raw: String) -> String {
        let c = clean.trimmingCharacters(in: .whitespacesAndNewlines)
        let r = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !c.isEmpty else { return r }
        guard r.count > 20 else { return c } // tiny inputs legitimately change a lot

        let ratio = Double(c.count) / Double(r.count)
        if ratio > 1.5 || ratio < 0.3 { return r }
        return c
    }
}
