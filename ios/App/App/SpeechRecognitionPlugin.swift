import Foundation
import Capacitor
import Speech
import AVFoundation

/// Listening for the Speak study mode, on iPhone and iPad.
///
/// The JavaScript side is the `@capacitor-community/speech-recognition` package (the app calls `SpeechRecognition.start`, `stop`,
/// `isListening`, `available`, `checkPermissions`, `requestPermissions` and listens for `partialResults` and `listeningState`).
/// That package has no Swift Package Manager support for iOS, so this is the same small piece of native code, kept inside the app
/// and registered by `MainViewController`. Two changes from the package:
/// - the audio session is set up for talking and listening at once (`.playAndRecord`, `.voiceChat`), so the person can speak
///   while the app is still reading, and the phone's echo cancelling stops the app from hearing its own voice;
/// - `prepareAudio` sets that session up before the app starts reading aloud.
@objc(SpeechRecognition)
public class SpeechRecognitionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SpeechRecognitionPlugin"
    public let jsName = "SpeechRecognition"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isListening", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSupportedLanguages", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "prepareAudio", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removeAllListeners", returnType: CAPPluginReturnPromise)
    ]

    /// Notes for debugging on a real device (Xcode's console, or `xcrun devicectl ... --console`). They exist only in debug builds.
    private func log(_ message: String) {
        #if DEBUG
        NSLog("SBM-SPEECH %@", message)
        #endif
    }

    /// The audio session is set up once and then left alone: setting it up again in the middle of a sentence (every time a short
    /// listening window starts) cuts the end off the voice that is reading. It is redone only when the route changes (headphones
    /// plugged in or out, a speaker connected...).
    private var audioReady = false
    private var routeObserver: NSObjectProtocol?

    private func ensureAudioSession() throws {
        if routeObserver == nil {
            routeObserver = NotificationCenter.default.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] note in
                let reason = (note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt).flatMap { AVAudioSession.RouteChangeReason(rawValue: $0) }
                switch reason {
                case .newDeviceAvailable, .oldDeviceUnavailable, .override: self?.audioReady = false; self?.closeEngine()
                default: break
                }
            }
        }
        if audioReady { return }
        try configureAudioSession()
        audioReady = true
    }

    private let defaultMatches = 5
    private var speechRecognizer: SFSpeechRecognizer?
    private var audioEngine: AVAudioEngine?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    /// Which listening window is current. The recogniser sends one last result after it is stopped; that result belongs to the
    /// window that ended, and must never be taken for something said in the next one (a stale "done" cut the verse short).
    private var window = 0
    private var windowIsLive = false

    // MARK: audio session

    /// Talk and listen at once, so the person can speak over the voice.
    /// - The voice goes where the person expects: to headphones or a Bluetooth speaker when one is connected (`.allowBluetoothA2DP`),
    ///   and to the loud speaker when nothing is (`.defaultToSpeaker`, not the tiny earpiece).
    /// - The app always listens on the device's own microphone. (`.voiceChat` mode and `.allowBluetooth` would switch both ways to a
    ///   headset's call mode: the voice would then play out loud and not in the headphones.)
    /// - Only when the voice comes out of the device's own speaker is `.voiceChat` turned on, because its echo cancelling stops the
    ///   microphone from hearing that voice. With headphones there is no echo to cancel.
    private func configureAudioSession() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetoothA2DP])
        try session.setActive(true, options: .notifyOthersOnDeactivation)
        let privateOutputs: Set<AVAudioSession.Port> = [.headphones, .bluetoothA2DP, .bluetoothLE, .bluetoothHFP, .usbAudio, .carAudio, .airPlay, .HDMI]
        let privateRoute = session.currentRoute.outputs.contains { privateOutputs.contains($0.portType) }
        if !privateRoute {
            try session.setMode(.voiceChat)
        }
        let inputs = session.currentRoute.inputs.map { "\($0.portName) [\($0.portType.rawValue)]" }.joined(separator: ", ")
        let outputs = session.currentRoute.outputs.map { "\($0.portName) [\($0.portType.rawValue)]" }.joined(separator: ", ")
        log("audio session ready (mode \(session.mode.rawValue)). inputs: \(inputs) | outputs: \(outputs) | sampleRate \(session.sampleRate) | inputGain \(session.inputGain) | inputAvailable \(session.isInputAvailable)")
    }

    @objc func prepareAudio(_ call: CAPPluginCall) {
        do {
            try ensureAudioSession()
            call.resolve()
        } catch {
            call.reject("Could not set up the audio: \(error.localizedDescription)")
        }
    }

    // MARK: questions

    @objc func available(_ call: CAPPluginCall) {
        guard let recognizer = SFSpeechRecognizer() else {
            call.resolve(["available": false])
            return
        }
        call.resolve(["available": recognizer.isAvailable])
    }

    @objc func isListening(_ call: CAPPluginCall) {
        call.resolve(["listening": listening])
    }

    @objc func getSupportedLanguages(_ call: CAPPluginCall) {
        let languages = SFSpeechRecognizer.supportedLocales().map { $0.identifier }
        call.resolve(["languages": languages])
    }

    // MARK: permissions

    /// The microphone permission: "granted", "denied" or "prompt" (iOS 17 renamed the way to ask).
    private func microphoneState() -> String {
        if #available(iOS 17.0, *) {
            switch AVAudioApplication.shared.recordPermission {
            case .granted: return "granted"
            case .denied: return "denied"
            case .undetermined: return "prompt"
            @unknown default: return "prompt"
            }
        } else {
            switch AVAudioSession.sharedInstance().recordPermission {
            case .granted: return "granted"
            case .denied: return "denied"
            case .undetermined: return "prompt"
            @unknown default: return "prompt"
            }
        }
    }

    private func askMicrophone(_ done: @escaping (Bool) -> Void) {
        if #available(iOS 17.0, *) {
            AVAudioApplication.requestRecordPermission(completionHandler: done)
        } else {
            AVAudioSession.sharedInstance().requestRecordPermission(done)
        }
    }

    /// "granted" only when the person has allowed BOTH speech recognition and the microphone. (If one of the two was refused the
    /// app would otherwise think it can listen, and hear nothing.)
    private func speechPermissionName() -> String {
        let speech: String
        switch SFSpeechRecognizer.authorizationStatus() {
        case .authorized: speech = "granted"
        case .denied, .restricted: speech = "denied"
        case .notDetermined: speech = "prompt"
        @unknown default: speech = "prompt"
        }
        let microphone = microphoneState()
        log("permissions: speech \(speech), microphone \(microphone)")
        if speech == "denied" || microphone == "denied" { return "denied" }
        if speech == "granted" && microphone == "granted" { return "granted" }
        return "prompt"
    }

    @objc override public func checkPermissions(_ call: CAPPluginCall) {
        call.resolve(["speechRecognition": speechPermissionName()])
    }

    @objc override public func requestPermissions(_ call: CAPPluginCall) {
        SFSpeechRecognizer.requestAuthorization { status in
            DispatchQueue.main.async {
                guard status == .authorized else {
                    call.resolve(["speechRecognition": self.speechPermissionName()])
                    return
                }
                self.askMicrophone { granted in
                    DispatchQueue.main.async {
                        call.resolve(["speechRecognition": granted ? "granted" : "denied"])
                    }
                }
            }
        }
    }

    // MARK: listening

    /// The microphone is opened once and then kept open while Speak mode is in use: opening it (and, on the device's own speaker,
    /// turning on echo cancelling) reconfigures the phone's audio, which makes the voice that is reading stutter or drop out. Only
    /// the recogniser is started and stopped for each listening window. If nothing listens for a while the microphone is closed.
    private var listening = false
    private var idleClose: DispatchWorkItem?
    private let idleSeconds = 20.0

    private func closeEngine() {
        idleClose?.cancel()
        idleClose = nil
        if let engine = audioEngine {
            if engine.isRunning { engine.stop() }
            engine.inputNode.removeTap(onBus: 0)
        }
        audioEngine = nil
    }

    /// The running microphone, started if needed. Its audio goes to whatever recognition request is open (none: it is dropped).
    private func ensureEngine() throws {
        idleClose?.cancel()
        idleClose = nil
        if let engine = audioEngine, engine.isRunning { return }
        closeEngine()
        let engine = AVAudioEngine()
        // When the voice comes out of the device's own speaker, ask the system to cancel that sound from the microphone (the app
        // reads aloud and listens at once, and must not hear itself).
        let privateOutputs: Set<AVAudioSession.Port> = [.headphones, .bluetoothA2DP, .bluetoothLE, .bluetoothHFP, .usbAudio, .carAudio, .airPlay, .HDMI]
        let speakerRoute = !AVAudioSession.sharedInstance().currentRoute.outputs.contains { privateOutputs.contains($0.portType) }
        var echoCancelling = false
        if speakerRoute {
            do { try engine.inputNode.setVoiceProcessingEnabled(true); echoCancelling = true } catch { log("echo cancelling not available: \(error.localizedDescription)") }
        }
        func install(_ engine: AVAudioEngine) {
            let format = engine.inputNode.outputFormat(forBus: 0)
            engine.inputNode.removeTap(onBus: 0)
            engine.inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
                self?.recognitionRequest?.append(buffer)
            }
            log("microphone open (echo cancelling \(engine.inputNode.isVoiceProcessingEnabled)): \(format.sampleRate) Hz, \(format.channelCount) channel(s)")
        }
        install(engine)
        engine.prepare()
        do {
            try engine.start()
        } catch where echoCancelling {
            // Echo cancelling could not start: listen without it rather than not at all.
            log("microphone failed with echo cancelling (\(error.localizedDescription)); trying without")
            try engine.inputNode.setVoiceProcessingEnabled(false)
            install(engine)
            engine.prepare()
            try engine.start()
        }
        audioEngine = engine
    }

    private func finishListening() {
        // Late results from this window are ignored from here on (only in live mode: the one-shot mode waits for its final result).
        if windowIsLive { window += 1 }
        recognitionRequest?.endAudio()
        recognitionRequest = nil
        recognitionTask = nil
        listening = false
        // Close the microphone if nothing starts listening again soon.
        let work = DispatchWorkItem { [weak self] in self?.closeEngine() }
        idleClose = work
        DispatchQueue.main.asyncAfter(deadline: .now() + idleSeconds, execute: work)
    }

    @objc func start(_ call: CAPPluginCall) {
        if listening {
            call.reject("Ongoing speech recognition")
            return
        }
        log("start requested")
        guard SFSpeechRecognizer.authorizationStatus() == .authorized else {
            log("start refused: speech recognition is not authorized")
            call.reject("Missing permission")
            return
        }
        guard microphoneState() == "granted" else {
            log("start refused: the microphone is not allowed")
            call.reject("User denied access to microphone")
            return
        }
        let language = call.getString("language") ?? "en-US"
        let maxResults = call.getInt("maxResults") ?? defaultMatches
        let partialResults = call.getBool("partialResults") ?? false

        recognitionTask?.cancel()
        recognitionTask = nil

        do {
            try ensureAudioSession()
        } catch {
            call.reject("Microphone is already in use by another application.")
            return
        }

        speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: language))
        guard let recognizer = speechRecognizer, recognizer.isAvailable else {
            log("recognizer for \(language) is not available (supportsOnDevice: \(speechRecognizer?.supportsOnDeviceRecognition ?? false))")
            call.reject("Speech recognition is not available for this language right now")
            return
        }

        window += 1
        let myWindow = window
        windowIsLive = partialResults

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = partialResults
        request.taskHint = .dictation
        recognitionRequest = request

        do {
            try ensureEngine()
        } catch {
            log("microphone failed to start: \(error.localizedDescription)")
            recognitionRequest = nil
            closeEngine()
            call.reject("Could not start listening: \(error.localizedDescription)")
            return
        }
        listening = true
        log("listening in \(language): recognizer onDevice \(recognizer.supportsOnDeviceRecognition); partial \(partialResults)")

        recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self = self, myWindow == self.window else { return }
            if let result = result {
                let matches = result.transcriptions.prefix(max(maxResults, 1)).map { $0.formattedString }
                self.log("heard\(result.isFinal ? " (final)" : ""): \(matches.first ?? "")")
                if partialResults {
                    self.notifyListeners("partialResults", data: ["matches": matches])
                } else if result.isFinal {
                    call.resolve(["matches": matches])
                }
                if result.isFinal {
                    self.finishListening()
                    self.notifyListeners("listeningState", data: ["status": "stopped"])
                }
            }
            if let error = error {
                let e = error as NSError
                self.log("recognition ended with error \(e.domain) \(e.code): \(e.localizedDescription)")
                self.finishListening()
                self.notifyListeners("listeningState", data: ["status": "stopped"])
                if !partialResults { call.reject(error.localizedDescription) }
            }
        }

        notifyListeners("listeningState", data: ["status": "started"])
        if partialResults { call.resolve() }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.log("stop requested (listening: \(self.listening))")
            if self.listening {
                self.finishListening()
                self.notifyListeners("listeningState", data: ["status": "stopped"])
            }
            call.resolve()
        }
    }
}


/// Reading aloud on iPhone and iPad.
///
/// The community text-to-speech package plays through a private audio session of its own (`usesApplicationAudioSession = false`), so
/// the system's echo cancelling, which works on the app's own audio, never sees the voice: the microphone then hears the app reading
/// and the app answers itself. This plays through the app's session (the one `SpeechRecognitionPlugin` sets up) instead.
/// The JavaScript side picks a voice by its position in `AVSpeechSynthesisVoice.speechVoices()`, as the package's does.
@objc(AppSpeech)
public class AppSpeechPlugin: CAPPlugin, CAPBridgedPlugin, AVSpeechSynthesizerDelegate {
    public let identifier = "AppSpeechPlugin"
    public let jsName = "AppSpeech"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "speak", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]

    private let synthesizer = AVSpeechSynthesizer()
    private var calls: [CAPPluginCall] = []

    public override func load() {
        synthesizer.usesApplicationAudioSession = true
        synthesizer.delegate = self
    }

    private func resolveCurrent() {
        guard let call = calls.first else { return }
        calls.removeFirst()
        call.resolve()
    }

    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) { resolveCurrent() }
    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) { resolveCurrent() }

    /// The same scale as the package's, so a speed means the same on every phone.
    private func adjustRate(_ rate: Float) -> Float {
        let base = AVSpeechUtteranceDefaultSpeechRate
        return rate >= 1.0 ? (0.1 * rate) + (base - 0.1) : rate * base
    }

    @objc func speak(_ call: CAPPluginCall) {
        let text = call.getString("text") ?? ""
        let lang = call.getString("lang") ?? "en-US"
        let rate = call.getFloat("rate") ?? 1.0
        let volume = call.getFloat("volume") ?? 1.0
        let index = call.getInt("voice") ?? -1
        DispatchQueue.main.async {
            if self.synthesizer.isSpeaking { self.synthesizer.stopSpeaking(at: .immediate) }
            let utterance = AVSpeechUtterance(string: text)
            utterance.voice = AVSpeechSynthesisVoice(language: lang)
            utterance.rate = self.adjustRate(rate)
            utterance.volume = volume
            let voices = AVSpeechSynthesisVoice.speechVoices()
            if index >= 0 && index < voices.count { utterance.voice = voices[index] }
            self.calls.append(call)
            self.synthesizer.speak(utterance)
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.synthesizer.stopSpeaking(at: .immediate)
            call.resolve()
        }
    }
}
