import UIKit
import Capacitor

/// The app's own web view controller: the same as Capacitor's, plus the speech plugin that lives inside this app
/// (see SpeechRecognitionPlugin.swift for why).
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(SpeechRecognitionPlugin())
        bridge?.registerPluginInstance(AppSpeechPlugin())
        bridge?.registerPluginInstance(WidgetBridgePlugin())
    }
}
