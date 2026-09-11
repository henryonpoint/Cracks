import Foundation

public struct Dictation: Codable, Identifiable, Sendable {
    public var id: UUID
    public var date: Date
    public var raw: String
    public var clean: String
    public var targetApp: String?
    public var usedCleanup: Bool

    public init(raw: String, clean: String, targetApp: String?, usedCleanup: Bool) {
        id = UUID()
        date = Date()
        self.raw = raw
        self.clean = clean
        self.targetApp = targetApp
        self.usedCleanup = usedCleanup
    }
}

/// Keeps the last few hundred dictations in a JSON file under Application Support.
public final class HistoryStore: ObservableObject {
    @Published public private(set) var items: [Dictation] = []
    private let url: URL
    private let limit: Int

    public init(limit: Int = 500) {
        self.limit = limit
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Sayso", isDirectory: true)
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        url = base.appendingPathComponent("history.json")
        if let data = try? Data(contentsOf: url),
           let saved = try? JSONDecoder().decode([Dictation].self, from: data) {
            items = saved
        }
    }

    public func add(_ dictation: Dictation) {
        items.insert(dictation, at: 0)
        if items.count > limit { items.removeLast(items.count - limit) }
        save()
    }

    public func clear() {
        items.removeAll()
        save()
    }

    private func save() {
        if let data = try? JSONEncoder().encode(items) { try? data.write(to: url, options: .atomic) }
    }
}
