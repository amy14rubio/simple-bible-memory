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

    private let defaultMatches = 5
    private var speechRecognizer: SFSpeechRecognizer?
    private var audioEngine: AVAudioEngine?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?

    // MARK: audio session

    /// Talk and listen at once. `.voiceChat` turns on the phone's echo cancelling; `.defaultToSpeaker` keeps the voice on the loud
    /// speaker (not the tiny earpiece) when nothing is plugged in.
    private func configureAudioSession() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetooth])
        try session.setActive(true, options: .notifyOthersOnDeactivation)
    }

    @objc func prepareAudio(_ call: CAPPluginCall) {
        do {
            try configureAudioSession()
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

    private func speechPermissionName() -> String {
        switch SFSpeechRecognizer.authorizationStatus() {
        case .authorized: return "granted"
        case .denied, .restricted: return "denied"
        case .notDetermined: return "prompt"
        @unknown default: return "prompt"
        }
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
                AVAudioSession.sharedInstance().requestRecordPermission { granted in
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
        guard SFSpeechRecognizer.authorizationStatus() == .authorized else {
            call.reject("Missing permission")
            return
        }
        let language = call.getString("language") ?? "en-US"
        let maxResults = call.getInt("maxResults") ?? defaultMatches
        let partialResults = call.getBool("partialResults") ?? false

        recognitionTask?.cancel()
        recognitionTask = nil

        do {
            try configureAudioSession()
        } catch {
            call.reject("Microphone is already in use by another application.")
            return
        }

        let engine = AVAudioEngine()
        audioEngine = engine
        speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: language))
        guard let recognizer = speechRecognizer, recognizer.isAvailable else {
            call.reject("Speech recognition is not available for this language right now")
            return
        }

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = partialResults
        request.taskHint = .dictation
        recognitionRequest = request

        let inputNode = engine.inputNode
        let format = inputNode.outputFormat(forBus: 0)
        inputNode.removeTap(onBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            self?.recognitionRequest?.append(buffer)
        }

        recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self = self else { return }
            if let result = result {
                let matches = result.transcriptions.prefix(max(maxResults, 1)).map { $0.formattedString }
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
                self.finishListening()
                self.notifyListeners("listeningState", data: ["status": "stopped"])
                if !partialResults { call.reject(error.localizedDescription) }
            }
        }

        engine.prepare()
        do {
            try engine.start()
            notifyListeners("listeningState", data: ["status": "started"])
            if partialResults { call.resolve() }
        } catch {
            finishListening()
            call.reject("Could not start listening: \(error.localizedDescription)")
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let engine = self.audioEngine, engine.isRunning {
                self.finishListening()
                self.notifyListeners("listeningState", data: ["status": "stopped"])
            }
            call.resolve()
        }
    }
}
