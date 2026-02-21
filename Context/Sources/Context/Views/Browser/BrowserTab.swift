import Foundation
import WebKit
import Combine
import SwiftUI

// MARK: - Console Log Entry

struct ConsoleLogEntry: Identifiable {
    let id = UUID()
    let level: String
    let message: String
    let timestamp: Date

    var icon: String {
        switch level {
        case "error": return "xmark.circle.fill"
        case "warn":  return "exclamationmark.triangle.fill"
        case "info":  return "info.circle.fill"
        default:      return "chevron.right"
        }
    }

    var color: Color {
        switch level {
        case "error": return .red
        case "warn":  return .orange
        case "info":  return .blue
        default:      return .secondary
        }
    }
}

// MARK: - Weak Script Message Handler

/// Weak proxy to avoid retain cycle: WKUserContentController strongly retains its handlers.
private class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    weak var delegate: WKScriptMessageHandler?
    init(delegate: WKScriptMessageHandler) { self.delegate = delegate }
    func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
        delegate?.userContentController(c, didReceive: message)
    }
}

// MARK: - Browser Tab

class BrowserTab: NSObject, Identifiable, ObservableObject, WKScriptMessageHandler {
    let id = UUID()
    let webView: WKWebView

    @Published var title: String = "New Tab"
    @Published var currentURL: String = ""
    @Published var isLoading: Bool = false
    @Published var canGoBack: Bool = false
    @Published var canGoForward: Bool = false
    @Published var consoleLogs: [ConsoleLogEntry] = []

    private static let maxLogEntries = 500
    private var observations: [NSKeyValueObservation] = []

    var errorCount: Int {
        consoleLogs.filter { $0.level == "error" }.count
    }

    var warningCount: Int {
        consoleLogs.filter { $0.level == "warn" }.count
    }

    func addConsoleLog(level: String, message: String) {
        let entry = ConsoleLogEntry(level: level, message: message, timestamp: Date())
        consoleLogs.append(entry)
        if consoleLogs.count > Self.maxLogEntries {
            consoleLogs.removeFirst(consoleLogs.count - Self.maxLogEntries)
        }
    }

    func clearConsoleLogs() {
        consoleLogs.removeAll()
    }

    override init() {
        let config = WKWebViewConfiguration()
        config.preferences.isElementFullscreenEnabled = true

        // Inject console interceptor script
        let consoleScript = WKUserScript(
            source: """
            (function() {
                var orig = {};
                ['log','warn','error','info'].forEach(function(l) {
                    orig[l] = console[l];
                    console[l] = function() {
                        var m = Array.prototype.slice.call(arguments).map(function(a) {
                            try { return typeof a === 'object' ? JSON.stringify(a) : String(a); }
                            catch(e) { return String(a); }
                        }).join(' ');
                        window.webkit.messageHandlers.consoleLog.postMessage({level:l, message:m});
                        orig[l].apply(console, arguments);
                    };
                });
                window.addEventListener('error', function(e) {
                    window.webkit.messageHandlers.consoleLog.postMessage({
                        level:'error', message: e.message + ' at ' + e.filename + ':' + e.lineno
                    });
                });
            })();
            """,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: false
        )
        config.userContentController.addUserScript(consoleScript)

        self.webView = WKWebView(frame: .zero, configuration: config)
        super.init()

        // Register message handler via weak proxy
        config.userContentController.add(WeakScriptMessageHandler(delegate: self), name: "consoleLog")

        observations = [
            webView.observe(\.title) { [weak self] wv, _ in
                DispatchQueue.main.async { self?.title = wv.title ?? "New Tab" }
            },
            webView.observe(\.url) { [weak self] wv, _ in
                DispatchQueue.main.async { self?.currentURL = wv.url?.absoluteString ?? "" }
            },
            webView.observe(\.isLoading) { [weak self] wv, _ in
                DispatchQueue.main.async { self?.isLoading = wv.isLoading }
            },
            webView.observe(\.canGoBack) { [weak self] wv, _ in
                DispatchQueue.main.async { self?.canGoBack = wv.canGoBack }
            },
            webView.observe(\.canGoForward) { [weak self] wv, _ in
                DispatchQueue.main.async { self?.canGoForward = wv.canGoForward }
            },
        ]
    }

    deinit {
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "consoleLog")
    }

    func navigate(to urlString: String) {
        var input = urlString.trimmingCharacters(in: .whitespaces)
        if !input.contains("://") {
            if input.hasPrefix("localhost") || input.hasPrefix("127.0.0.1") {
                input = "http://\(input)"
            } else {
                input = "https://\(input)"
            }
        }
        guard let url = URL(string: input) else { return }
        webView.load(URLRequest(url: url))
    }

    // MARK: - WKScriptMessageHandler

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "consoleLog",
              let body = message.body as? [String: String],
              let level = body["level"],
              let msg = body["message"]
        else { return }

        DispatchQueue.main.async { [weak self] in
            self?.addConsoleLog(level: level, message: msg)
        }
    }
}
