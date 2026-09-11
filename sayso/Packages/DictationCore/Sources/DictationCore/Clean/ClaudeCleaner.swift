import Foundation

/// Cleans transcripts with Claude over the Messages API, streaming the reply.
/// Swift has no official Anthropic SDK, so this talks REST directly.
public struct ClaudeCleaner: Cleaner {
    public var model: String
    public var apiKey: String
    public var onDelta: (@Sendable (String) -> Void)?

    public init(apiKey: String, model: String = "claude-haiku-4-5", onDelta: (@Sendable (String) -> Void)? = nil) {
        self.apiKey = apiKey
        self.model = model
        self.onDelta = onDelta
    }

    public func clean(_ transcript: String, context: CleanupContext) async throws -> String {
        let trimmed = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return "" }

        var request = URLRequest(url: URL(string: "https://api.anthropic.com/v1/messages")!)
        request.httpMethod = "POST"
        request.timeoutInterval = 15
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        // Roughly 2x the transcript so a runaway reply can never paste a wall of text.
        let maxTokens = min(max(trimmed.count / 2, 128), 2048)
        let body: [String: Any] = [
            "model": model,
            "max_tokens": maxTokens,
            "stream": true,
            "system": Prompt.system(context: context),
            "messages": [["role": "user", "content": trimmed]],
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (bytes, response) = try await URLSession.shared.bytes(for: request)
        guard let http = response as? HTTPURLResponse else { throw ClaudeError.badResponse }
        guard (200..<300).contains(http.statusCode) else {
            var text = ""
            for try await line in bytes.lines { text += line }
            throw ClaudeError.http(http.statusCode, text)
        }

        var output = ""
        for try await line in bytes.lines {
            guard line.hasPrefix("data:") else { continue }
            let payload = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
            guard let data = payload.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let type = json["type"] as? String else { continue }

            switch type {
            case "content_block_delta":
                if let delta = json["delta"] as? [String: Any], let text = delta["text"] as? String {
                    output += text
                    onDelta?(output)
                }
            case "error":
                let message = (json["error"] as? [String: Any])?["message"] as? String ?? "unknown"
                throw ClaudeError.api(message)
            case "message_stop":
                return output
            default:
                continue
            }
        }
        return output
    }
}

public enum ClaudeError: Error, LocalizedError {
    case badResponse
    case http(Int, String)
    case api(String)

    public var errorDescription: String? {
        switch self {
        case .badResponse: return "Unexpected response from the Claude API."
        case .http(let code, let body): return "Claude API returned HTTP \(code): \(body.prefix(200))"
        case .api(let message): return "Claude API error: \(message)"
        }
    }
}
