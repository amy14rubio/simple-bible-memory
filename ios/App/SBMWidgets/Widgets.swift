import WidgetKit
import SwiftUI
import AppIntents

/// The four home-screen widgets of the iPhone and iPad app. They draw the snapshot the app saved (see Snapshot.swift); the app asks
/// WidgetKit to redraw them whenever it saves a new one (WidgetBridgePlugin.swift).

struct SnapshotEntry: TimelineEntry {
    let date: Date
    let snapshot: Snapshot
    var deckId = ""
}

/// The next time the widgets should redraw by themselves: just after the person's midnight (a new verse of the day).
private func nextMidnight(after date: Date) -> Date {
    Calendar.current.nextDate(after: date, matching: DateComponents(hour: 0, minute: 0, second: 5), matchingPolicy: .nextTime) ?? date.addingTimeInterval(3600)
}

/// For the widgets with nothing to choose.
struct SnapshotProvider: TimelineProvider {
    func placeholder(in context: Context) -> SnapshotEntry { SnapshotEntry(date: Date(), snapshot: Snapshot()) }
    func getSnapshot(in context: Context, completion: @escaping (SnapshotEntry) -> Void) {
        completion(SnapshotEntry(date: Date(), snapshot: Snapshot.load()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<SnapshotEntry>) -> Void) {
        let now = Date()
        completion(Timeline(entries: [SnapshotEntry(date: now, snapshot: Snapshot.load())], policy: .after(nextMidnight(after: now))))
    }
}

struct AddCardWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "AddCardWidget", provider: SnapshotProvider()) { AddCardView(snapshot: $0.snapshot) }
            .configurationDisplayName("Add card")
            .description("Add a new card.")
            .supportedFamilies([.systemSmall])
    }
}

struct DueTodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "DueTodayWidget", provider: SnapshotProvider()) { DueTodayView(snapshot: $0.snapshot) }
            .configurationDisplayName("Due today")
            .description("Decks with cards due.")
            .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct StatsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "StatsWidget", provider: SnapshotProvider()) { StatsView(snapshot: $0.snapshot) }
            .configurationDisplayName("Statistics")
            .description("Verses memorized.")
            .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: Verse preview: one verse of a deck chosen when the widget is added, a new one each day

struct DeckEntity: AppEntity {
    let id: String
    let title: String
    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Deck"
    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(title)") }
    static let defaultQuery = DeckQuery()
}

/// The decks whose verses may be shown (their own text or a public-domain translation); licensed decks are left out on purpose.
struct DeckQuery: EntityQuery {
    private func all() -> [DeckEntity] { Snapshot.load().verseDecks.map { DeckEntity(id: $0.id, title: $0.title) } }
    func entities(for identifiers: [String]) async throws -> [DeckEntity] { all().filter { identifiers.contains($0.id) } }
    func suggestedEntities() async throws -> [DeckEntity] { all() }
    func defaultResult() async -> DeckEntity? { all().first }
}

struct VerseWidgetIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Verse preview"
    static let description = IntentDescription("Pick the deck this widget shows a verse from.")
    @Parameter(title: "Deck") var deck: DeckEntity?
}

struct VerseProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> SnapshotEntry { SnapshotEntry(date: Date(), snapshot: Snapshot()) }
    func snapshot(for configuration: VerseWidgetIntent, in context: Context) async -> SnapshotEntry {
        SnapshotEntry(date: Date(), snapshot: Snapshot.load(), deckId: configuration.deck?.id ?? "")
    }
    func timeline(for configuration: VerseWidgetIntent, in context: Context) async -> Timeline<SnapshotEntry> {
        let now = Date()
        return Timeline(entries: [SnapshotEntry(date: now, snapshot: Snapshot.load(), deckId: configuration.deck?.id ?? "")], policy: .after(nextMidnight(after: now)))
    }
}

struct VerseWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "VerseWidget", intent: VerseWidgetIntent.self, provider: VerseProvider()) { entry in
            VerseView(snapshot: entry.snapshot, deckId: entry.deckId, date: entry.date)
        }
        .configurationDisplayName("Verse preview")
        .description("A verse each day.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

@main
struct SBMWidgetsBundle: WidgetBundle {
    var body: some Widget {
        AddCardWidget()
        DueTodayWidget()
        StatsWidget()
        VerseWidget()
    }
}
