import SwiftUI
import WidgetKit

/// The four widgets' pictures. Each is drawn from a `Snapshot` and the family (size) it is in, like the Android layouts.

let home = URL(string: "simplebiblememory://home")!

/// The widget's background, in the app's own surface colour.
struct Shell<Content: View>: View {
    let snapshot: Snapshot
    @ViewBuilder var content: Content
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        content.containerBackground(snapshot.palette(for: scheme).surface.color, for: .widget)
    }
}

// MARK: Add card

struct AddCardView: View {
    let snapshot: Snapshot
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        let p = snapshot.palette(for: scheme)
        Shell(snapshot: snapshot) {
            VStack(spacing: 12) {
                ZStack {
                    Circle().fill(p.accent.color)
                    Image(systemName: "plus").font(.system(size: 28, weight: .bold)).foregroundStyle(p.accent.readable(p.background, p.foreground).color)
                }
                .frame(width: 60, height: 60)
                Text(snapshot.label("addCard"))
                    .font(.system(.subheadline, weight: .semibold))
                    .foregroundStyle(p.foreground.color)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .widgetURL(URL(string: "simplebiblememory://add"))
    }
}

// MARK: Due today

struct DueTodayView: View {
    let snapshot: Snapshot
    @Environment(\.colorScheme) private var scheme
    @Environment(\.widgetFamily) private var family

    /// Decks with cards due come first (in the app's order), then the rest.
    private var ordered: [Snapshot.Deck] { snapshot.decks.filter { $0.due > 0 } + snapshot.decks.filter { $0.due == 0 } }
    private var total: Int { snapshot.decks.reduce(0) { $0 + $1.due } }
    private var rowLimit: Int {
        switch family {
        case .systemSmall: return 2
        case .systemMedium: return 3
        default: return 6
        }
    }

    var body: some View {
        let p = snapshot.palette(for: scheme)
        let decks = ordered
        // "+N more" takes the place of a row only when it is needed.
        let show = decks.count <= rowLimit ? decks.count : max(1, rowLimit - 1)
        Shell(snapshot: snapshot) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 8) {
                    Text(snapshot.label("dueToday")).font(.system(.subheadline, weight: .semibold)).foregroundStyle(p.foreground.color).lineLimit(1).minimumScaleFactor(0.7)
                    Spacer(minLength: 4)
                    if !decks.isEmpty {
                        Text(total > 0 ? String(total) : "✓")
                            .font(.system(.footnote, weight: .bold))
                            .foregroundStyle(p.accent.readable(p.background, p.foreground).color)
                            .padding(.horizontal, 9).padding(.vertical, 3)
                            .background(Capsule().fill(p.accent.color))
                    }
                }
                if decks.isEmpty {
                    Spacer()
                    Text(snapshot.label("noDecks")).font(.footnote).foregroundStyle(p.muted.color)
                    Spacer()
                } else {
                    VStack(spacing: 0) {
                        ForEach(decks.prefix(show)) { deck in row(deck, p) }
                    }
                    .padding(.top, 12)
                    if decks.count > show {
                        Text(snapshot.label("more", count: decks.count - show)).font(.caption).foregroundStyle(p.muted.color).padding(.top, 4)
                    }
                    Spacer(minLength: 0)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .widgetURL(home)
    }

    @ViewBuilder private func row(_ deck: Snapshot.Deck, _ p: Palette) -> some View {
        let line = HStack {
            Text(deck.title).font(.subheadline).foregroundStyle(p.foreground.color).lineLimit(1)
            Spacer(minLength: 6)
            Text(deck.due > 0 ? String(deck.due) : "✓").font(.system(.subheadline, weight: .semibold)).foregroundStyle((deck.due > 0 ? p.foreground : p.muted).color)
        }
        .padding(.vertical, 9)
        .overlay(alignment: .top) { Rectangle().fill(p.border.color).frame(height: 1) }
        // (a small widget is one tap target; the bigger ones open the deck that was tapped)
        if family == .systemSmall { line } else if let url = URL(string: "simplebiblememory://collection/\(deck.id)") { Link(destination: url) { line } } else { line }
    }
}

// MARK: Statistics

private struct Slice: Shape {
    var start: Double, end: Double
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let c = CGPoint(x: rect.midX, y: rect.midY)
        path.move(to: c)
        path.addArc(center: c, radius: min(rect.width, rect.height) / 2, startAngle: .degrees(start - 90), endAngle: .degrees(end - 90), clockwise: false)
        path.closeSubpath()
        return path
    }
}

/// The card stages pie of the Statistics screen: new, learning (the accent), young, mature.
struct StagePie: View {
    let counts: [Int]
    let palette: Palette
    var body: some View {
        let total = counts.reduce(0, +)
        let p = palette
        let colors = [p.foreground.mixed(percent: p.background.isDark ? 22 : 34, into: p.background), p.accent, p.foreground.mixed(percent: 55, into: p.background), p.foreground].map(\.color)
        if total == 0 {
            Circle().fill(p.border.color)
        } else {
            ZStack {
                ForEach(0..<4, id: \.self) { i in
                    if counts[i] > 0 {
                        let from = 360 * Double(counts[0..<i].reduce(0, +)) / Double(total)
                        let to = from + 360 * Double(counts[i]) / Double(total)
                        Slice(start: from, end: to).fill(colors[i])
                        if counts.filter({ $0 > 0 }).count > 1 { Slice(start: from, end: to).stroke(p.surface.color, lineWidth: 1.5) }
                    }
                }
            }
        }
    }
}

struct StatsView: View {
    let snapshot: Snapshot
    @Environment(\.colorScheme) private var scheme
    @Environment(\.widgetFamily) private var family
    var body: some View {
        let p = snapshot.palette(for: scheme)
        Shell(snapshot: snapshot) {
            HStack(spacing: 16) {
                if family != .systemSmall { StagePie(counts: snapshot.counts, palette: p).aspectRatio(1, contentMode: .fit).frame(maxHeight: 110) }
                VStack(alignment: family == .systemSmall ? .center : .leading, spacing: 2) {
                    Text(String(snapshot.memorized))
                        .font(.system(size: 64, weight: .bold, design: .serif))
                        .foregroundStyle(p.foreground.color)
                        .lineLimit(1).minimumScaleFactor(0.3)
                    Text(snapshot.label("memorized"))
                        .font(.system(size: 14))
                        .foregroundStyle(p.muted.color)
                        .lineLimit(2).minimumScaleFactor(0.7)
                        .multilineTextAlignment(family == .systemSmall ? .center : .leading)
                }
                .frame(maxWidth: .infinity, alignment: family == .systemSmall ? .center : .leading)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .widgetURL(URL(string: "simplebiblememory://stats"))
    }
}

// MARK: Verse preview

struct VerseView: View {
    let snapshot: Snapshot
    /// The deck chosen when the widget was set up ("" until then: the first deck that can show a verse).
    let deckId: String
    let date: Date
    @Environment(\.colorScheme) private var scheme
    @Environment(\.widgetFamily) private var family

    private var deck: Snapshot.VerseDeck? {
        snapshot.verseDecks.first { $0.id == deckId } ?? (deckId.isEmpty ? snapshot.verseDecks.first : nil)
    }
    private var fontSize: CGFloat {
        switch family {
        case .systemSmall: return 16
        case .systemMedium: return 20
        default: return 28
        }
    }

    var body: some View {
        let p = snapshot.palette(for: scheme)
        Shell(snapshot: snapshot) {
            if let deck, !deck.verses.isEmpty {
                let verse = deck.verses[dayNumber(date) % deck.verses.count]
                HStack(alignment: .top, spacing: 10) {
                    RoundedRectangle(cornerRadius: 2).fill(p.accent.color).frame(width: 3)
                    VStack(alignment: .leading, spacing: 6) {
                        // as big as fits the widget
                        Text(verse.text)
                            .font(.system(size: fontSize, design: .serif))
                            .foregroundStyle(p.foreground.color)
                            .minimumScaleFactor(0.45)
                            .frame(maxHeight: .infinity, alignment: .topLeading)
                        Text(verse.translation.isEmpty ? verse.ref : "\(verse.ref) · \(verse.translation)")
                            .font(.system(.footnote, weight: .medium))
                            .foregroundStyle(p.muted.color)
                            .lineLimit(1)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            } else {
                // The deck is gone, or has nothing that may be shown (licensed text): say so instead of showing nothing.
                let licensed = !deckId.isEmpty && deck == nil && snapshot.licensedDeckIds.contains(deckId)
                Text(snapshot.label(licensed ? "licensedDeck" : "noVerses"))
                    .font(.footnote)
                    .foregroundStyle(p.foreground.color)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            }
        }
        .widgetURL(deck.flatMap { URL(string: "simplebiblememory://collection/\($0.id)") } ?? home)
    }
}
