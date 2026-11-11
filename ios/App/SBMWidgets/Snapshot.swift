import SwiftUI

/// What the app hands to the home-screen widgets: one JSON snapshot (colours, wording, and what each widget shows), saved by the app
/// (WidgetBridgePlugin.swift) into the App Group the app and the widgets share. The widgets cannot read the app's database (it lives
/// inside the web view), so they only ever draw this. Without a snapshot (the app has not been opened yet) they draw sensible defaults
/// in the app's own paper-and-rose look. This is the same job as `WidgetData.java` on Android, and the snapshot is the same JSON
/// (see src/features/widgets/snapshot.ts).
enum AppGroup {
    static let identifier = "group.app.simplebiblememory"
    static let key = "snapshot"
}

/// A colour as plain numbers, so it can be mixed and compared for contrast the way the Android widgets do.
struct RGB: Equatable {
    var r: Double, g: Double, b: Double

    init(_ r: Double, _ g: Double, _ b: Double) { self.r = r; self.g = g; self.b = b }

    init?(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6, let v = UInt32(s, radix: 16) else { return nil }
        r = Double((v >> 16) & 255) / 255
        g = Double((v >> 8) & 255) / 255
        b = Double(v & 255) / 255
    }

    var color: Color { Color(.sRGB, red: r, green: g, blue: b, opacity: 1) }

    var luminance: Double {
        func lin(_ c: Double) -> Double { c <= 0.03928 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4) }
        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    }

    /// WCAG contrast ratio (1 to 21).
    func contrast(with other: RGB) -> Double {
        let a = luminance, b = other.luminance
        return (max(a, b) + 0.05) / (min(a, b) + 0.05)
    }

    /// Whichever of the two colours is easier to read on this one.
    func readable(_ first: RGB, _ second: RGB) -> RGB {
        contrast(with: first) >= contrast(with: second) ? first : second
    }

    /// `percent`% of this colour mixed into `background` (like CSS color-mix in sRGB).
    func mixed(percent: Double, into background: RGB) -> RGB {
        let p = percent / 100
        return RGB(r * p + background.r * (1 - p), g * p + background.g * (1 - p), b * p + background.b * (1 - p))
    }

    /// Is this a dark background? (The same test the app uses for custom themes.)
    var isDark: Bool { luminance < 0.3 }
}

/// The colours the widgets use: the app's theme (light, dark or the person's own colours), as the app last saved it.
struct Palette {
    var background, foreground, muted, surface, border, accent: RGB

    // The app's tokens (src/styles/tokens.css).
    static let light = Palette(background: RGB(hex: "#f8f8f6")!, foreground: RGB(hex: "#17171a")!, muted: RGB(hex: "#5e5e5a")!, surface: RGB(hex: "#eeeeea")!, border: RGB(hex: "#d9d8d3")!, accent: RGB(hex: "#d96878")!)
    static let dark = Palette(background: RGB(hex: "#131312")!, foreground: RGB(hex: "#f1f0ec")!, muted: RGB(hex: "#a4a29b")!, surface: RGB(hex: "#1d1d1b")!, border: RGB(hex: "#333330")!, accent: RGB(hex: "#d96878")!)

    init(background: RGB, foreground: RGB, muted: RGB, surface: RGB, border: RGB, accent: RGB) {
        self.background = background; self.foreground = foreground; self.muted = muted
        self.surface = surface; self.border = border; self.accent = accent
    }

    init(_ o: [String: Any], fallback: Palette) {
        func pick(_ key: String, _ fallback: RGB) -> RGB { (o[key] as? String).flatMap(RGB.init(hex:)) ?? fallback }
        self.init(background: pick("background", fallback.background), foreground: pick("foreground", fallback.foreground),
                  muted: pick("muted", fallback.muted), surface: pick("surface", fallback.surface),
                  border: pick("border", fallback.border), accent: pick("accent", fallback.accent))
    }
}

extension Dictionary where Key == String, Value == Any {
    func int(_ key: String) -> Int { (self[key] as? NSNumber)?.intValue ?? 0 }
    func string(_ key: String) -> String { self[key] as? String ?? "" }
    func dict(_ key: String) -> [String: Any]? { self[key] as? [String: Any] }
    func list(_ key: String) -> [[String: Any]] { (self[key] as? [[String: Any]]) ?? [] }
}

struct Snapshot {
    struct Deck: Identifiable { let id: String; let title: String; let due: Int }
    struct Verse { let ref: String; let text: String; let translation: String }
    struct VerseDeck: Identifiable { let id: String; let title: String; let verses: [Verse] }

    var language = ""
    var themePref = "system"
    var palettes: [String: Palette] = [:]
    var labels: [String: String] = [:]
    var decks: [Deck] = []
    var memorized = 0
    /// New, learning, young, mature.
    var counts = [0, 0, 0, 0]
    var verseDecks: [VerseDeck] = []
    var licensedDeckIds: [String] = []

    /// The snapshot the app saved last, or an empty one.
    static func load() -> Snapshot {
        guard let json = UserDefaults(suiteName: AppGroup.identifier)?.string(forKey: AppGroup.key) else { return Snapshot() }
        return Snapshot(json: json)
    }

    init() {}

    init(json: String) {
        guard let data = json.data(using: .utf8), let o = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return }
        language = o.string("language")
        if let theme = o.dict("theme") {
            themePref = theme.string("pref").isEmpty ? "system" : theme.string("pref")
            if let l = theme.dict("light") { palettes["light"] = Palette(l, fallback: .light) }
            if let d = theme.dict("dark") { palettes["dark"] = Palette(d, fallback: .dark) }
            if let c = theme.dict("custom") {
                let base: Palette = (theme["customIsDark"] as? Bool ?? false) ? .dark : .light
                palettes["custom"] = Palette(c, fallback: base)
            }
        }
        labels = (o.dict("labels") ?? [:]).compactMapValues { $0 as? String }
        decks = o.list("decks").map { Deck(id: $0.string("id"), title: $0.string("title"), due: $0.int("due")) }
        if let stats = o.dict("stats") {
            memorized = stats.int("memorized")
            if let c = stats.dict("counts") { counts = [c.int("new"), c.int("learning"), c.int("young"), c.int("mature")] }
        }
        verseDecks = o.list("verseDecks").map { d in
            VerseDeck(id: d.string("id"), title: d.string("title"), verses: d.list("verses").map { Verse(ref: $0.string("ref"), text: $0.string("text"), translation: $0.string("tr")) })
        }
        licensedDeckIds = o.list("licensedDecks").map { $0.string("id") }
    }

    /// The palette to draw with right now: the person's choice in the app; "system" follows the phone's light or dark setting.
    func palette(for scheme: ColorScheme) -> Palette {
        switch themePref {
        case "custom": return palettes["custom"] ?? (scheme == .dark ? .dark : .light)
        case "dark": return palettes["dark"] ?? .dark
        case "light": return palettes["light"] ?? .light
        default: return scheme == .dark ? (palettes["dark"] ?? .dark) : (palettes["light"] ?? .light)
        }
    }

    // MARK: Words

    private var spanish: Bool {
        language.isEmpty ? Locale.current.language.languageCode?.identifier == "es" : language.hasPrefix("es")
    }

    /// A word or phrase the app saved in the person's language; the widget's own default until there is one.
    func label(_ key: String) -> String {
        if let v = labels[key], !v.isEmpty { return v }
        let en = ["addCard": "Add card", "dueToday": "Due today", "noDecks": "No decks yet", "memorized": "Verses memorized", "more": "+{count} more",
                  "licensedDeck": "Licensed text can't be shown on the home screen", "noVerses": "Add a deck of your own verses (or a public-domain translation) to see one here."]
        let es = ["addCard": "Añadir tarjeta", "dueToday": "Pendientes hoy", "noDecks": "Aún no hay carpetas", "memorized": "Versículos memorizados", "more": "+{count} más",
                  "licensedDeck": "El texto con licencia no se puede mostrar en la pantalla de inicio", "noVerses": "Añade una carpeta con tus propios versículos (o una traducción de dominio público) para ver uno aquí."]
        return (spanish ? es[key] : en[key]) ?? en[key] ?? ""
    }

    func label(_ key: String, count: Int) -> String { label(key).replacingOccurrences(of: "{count}", with: String(count)) }
}

/// Whole days since 1 Jan 1970 where the person is, so the verse changes at their midnight (the same count the Android widget uses).
func dayNumber(_ date: Date = Date()) -> Int {
    Int((date.timeIntervalSince1970 + Double(TimeZone.current.secondsFromGMT(for: date))) / 86400)
}
