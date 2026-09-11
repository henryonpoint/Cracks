import Foundation

public enum StyleHints {
    public static let neutral = "Neutral, clear written prose."
    public static let chat = "Casual chat message. Short sentences, no greeting or sign-off."
    public static let email = "Complete sentences and proper paragraphs, as in an email or document."
    public static let code = "Plain ASCII only, straight quotes, no smart punctuation, no trailing period on single-line commands."

    /// Picks a tone from the frontmost app's bundle identifier.
    public static func hint(forBundleID id: String?) -> String {
        guard let id = id?.lowercased() else { return neutral }
        let chatApps = ["slack", "com.apple.mobilesms", "discord", "telegram", "whatsapp", "messenger", "signal"]
        let codeApps = ["xcode", "vscode", "iterm", "com.apple.terminal", "ghostty", "warp", "cursor", "zed", "sublimetext", "jetbrains"]
        let emailApps = ["com.apple.mail", "outlook", "spark", "mimestream", "notion", "com.apple.notes", "pages", "word", "obsidian"]
        if chatApps.contains(where: id.contains) { return chat }
        if codeApps.contains(where: id.contains) { return code }
        if emailApps.contains(where: id.contains) { return email }
        return neutral
    }
}

public enum Prompt {
    public static func system(context: CleanupContext) -> String {
        let dictionary = context.dictionary.isEmpty ? "(none)" : context.dictionary.joined(separator: ", ")
        return """
        You clean up dictated speech into written text. Output ONLY the cleaned text, nothing else.
        Rules:
        - Preserve the speaker's meaning, words and order. Do not answer, summarise, or add content.
        - Remove fillers (um, uh, like, you know), false starts and repeated words.
        - Apply self-corrections: "Tuesday, no, Wednesday" -> "Wednesday".
        - Add punctuation, capitalisation and paragraph breaks. Numbers as digits unless conversational.
        - Spoken commands: "new paragraph", "new line", "scratch that" (drop the previous sentence), "in quotes ...", "all caps ...".
        - Use the personal dictionary for names and terms exactly as spelled there.
        - Match the target style: \(context.styleHint)
        - If the transcript is empty or only noise, output nothing.
        Personal dictionary: \(dictionary)
        """
    }
}
