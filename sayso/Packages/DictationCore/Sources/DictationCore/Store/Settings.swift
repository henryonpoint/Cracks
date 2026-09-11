import Foundation

public enum Hotkey: String, CaseIterable, Identifiable, Codable, Sendable {
    case rightOption
    case fn

    public var id: String { rawValue }
    public var label: String {
        switch self {
        case .rightOption: return "Right Option (⌥)"
        case .fn: return "Fn / Globe"
        }
    }
}

/// UserDefaults-backed preferences shared by the app and its views.
public final class AppSettings: ObservableObject {
    public static let shared = Settings()

    private let defaults: UserDefaults
    private enum Key {
        static let hotkey = "hotkey"
        static let cleanupEnabled = "cleanupEnabled"
        static let dictionary = "dictionary"
        static let model = "model"
    }

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        hotkey = Hotkey(rawValue: defaults.string(forKey: Key.hotkey) ?? "") ?? .rightOption
        cleanupEnabled = defaults.object(forKey: Key.cleanupEnabled) as? Bool ?? true
        dictionary = defaults.stringArray(forKey: Key.dictionary) ?? []
        model = defaults.string(forKey: Key.model) ?? "claude-haiku-4-5"
    }

    @Published public var hotkey: Hotkey { didSet { defaults.set(hotkey.rawValue, forKey: Key.hotkey) } }
    @Published public var cleanupEnabled: Bool { didSet { defaults.set(cleanupEnabled, forKey: Key.cleanupEnabled) } }
    @Published public var dictionary: [String] { didSet { defaults.set(dictionary, forKey: Key.dictionary) } }
    @Published public var model: String { didSet { defaults.set(model, forKey: Key.model) } }

    public var apiKey: String? {
        get { Keychain.read(account: "anthropic-api-key") }
        set {
            if let newValue, !newValue.isEmpty { Keychain.write(newValue, account: "anthropic-api-key") }
            else { Keychain.delete(account: "anthropic-api-key") }
            objectWillChange.send()
        }
    }
}
