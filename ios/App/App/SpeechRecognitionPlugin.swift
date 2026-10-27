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
                case .newDeviceAvailable, .oldDeviceUnavailable, .override: self?.audioReady = false
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
        call.resolve(["listening": audioEngine?.isRunning ?? false])
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

    private func finishListening() {
        if let engine = audioEngine {
            if engine.isRunning { engine.stop() }
            engine.inputNode.removeTap(onBus: 0)
        }
        recognitionRequest?.endAudio()
        recognitionRequest = nil
        recognitionTask = nil
    }

    @objc func start(_ call: CAPPluginCall) {
        if let engine = audioEngine, engine.isRunning {
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

        let engine = AVAudioEngine()
        audioEngine = engine
        speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: language))
        guard let recognizer = speechRecognizer, recognizer.isAvailable else {
            log("recognizer for \(language) is not available (supportsOnDevice: \(speechRecognizer?.supportsOnDeviceRecognition ?? false))")
            call.reject("Speech recognition is not available for this language right now")
            return
        }

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = partialResults
        request.taskHint = .dictation
        recognitionRequest = request

        let inputNode = engine.inputNode
        let format = inputNode.outputFormat(forBus: 0)
        log("listening in \(language): input format \(format.sampleRate) Hz, \(format.channelCount) channel(s); recognizer onDevice \(recognizer.supportsOnDeviceRecognition); partial \(partialResults)")
        inputNode.removeTap(onBus: 0)
        var buffers = 0
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            self?.recognitionRequest?.append(buffer)
            #if DEBUG
            buffers += 1
            if buffers % 20 == 0, let samples = buffer.floatChannelData?[0] {
                var sum: Float = 0
                let n = Int(buffer.frameLength)
                for i in 0..<n { sum += samples[i] * samples[i] }
                self?.log("microphone level (rms) \(n > 0 ? (sum / Float(n)).squareRoot() : 0)")
            }
            #endif
        }

        recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self = self else { return }
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

        engine.prepare()
        do {
            try engine.start()
            log("engine started")
            notifyListeners("listeningState", data: ["status": "started"])
            if partialResults { call.resolve() }
        } catch {
            log("engine failed to start: \(error.localizedDescription)")
            finishListening()
            call.reject("Could not start listening: \(error.localizedDescription)")
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.log("stop requested (engine running: \(self.audioEngine?.isRunning ?? false))")
            if let engine = self.audioEngine, engine.isRunning {
                self.finishListening()
                self.notifyListeners("listeningState", data: ["status": "stopped"])
            }
            call.resolve()
        }
    }
}
