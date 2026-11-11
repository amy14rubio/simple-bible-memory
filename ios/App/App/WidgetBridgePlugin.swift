import Foundation
import Capacitor
import WidgetKit

/// Hands the home-screen widgets their data (the iPhone and iPad version of `WidgetBridgePlugin.java`). The web side sends a JSON snapshot
/// (src/features/widgets/snapshot.ts); it is saved in the App Group the widget extension also reads, and the widgets are asked to redraw.
@objc(WidgetBridge)
public class WidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetBridgePlugin"
    public let jsName = "WidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise)
    ]

    @objc func update(_ call: CAPPluginCall) {
        guard let snapshot = call.getString("snapshot") else {
            call.reject("snapshot is required")
            return
        }
        UserDefaults(suiteName: "group.app.simplebiblememory")?.set(snapshot, forKey: "snapshot")
        if #available(iOS 14.0, *) { WidgetCenter.shared.reloadAllTimelines() }
        call.resolve()
    }
}
