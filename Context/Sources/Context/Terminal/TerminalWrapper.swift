import SwiftUI
import SwiftTerm
import AppKit

/// Wraps SwiftTerm's `LocalProcessTerminalView` (an NSView) for use in SwiftUI.
///
/// The wrapper starts a shell process in `initialDirectory` and supports sending
/// commands programmatically through the `sendCommand` binding. When a non-nil
/// value is written, the text plus a newline is fed to the terminal and the
/// binding is reset to nil.
struct TerminalWrapper: NSViewRepresentable {
    typealias NSViewType = LocalProcessTerminalView

    let initialDirectory: String
    @Binding var sendCommand: String?

    // MARK: - Coordinator

    class Coordinator: NSObject, LocalProcessTerminalViewDelegate {
        var parent: TerminalWrapper
        var terminalView: LocalProcessTerminalView?

        init(_ parent: TerminalWrapper) {
            self.parent = parent
        }

        // MARK: LocalProcessTerminalViewDelegate

        func processTerminated(source: TerminalView, exitCode: Int32?) {
            // Could notify the parent or restart; for now do nothing.
        }

        func sizeChanged(source: LocalProcessTerminalView, newCols: Int, newRows: Int) {
            // No-op: the terminal handles resize internally.
        }

        func setTerminalTitle(source: LocalProcessTerminalView, title: String) {
            // Could propagate to the tab title in the future.
        }

        func hostCurrentDirectoryUpdate(source: TerminalView, directory: String?) {
            // Could track the working directory; no-op for now.
        }

        // MARK: Shell management

        func startShell(in directory: String?) {
            guard let terminalView else { return }
            let shell = ProcessInfo.processInfo.environment["SHELL"] ?? "/bin/zsh"
            terminalView.startProcess(
                executable: shell,
                args: [shell, "--login"],
                environment: nil,
                execName: nil,
                currentDirectory: directory
            )
        }

        func sendText(_ text: String) {
            terminalView?.send(txt: text)
        }
    }

    // MARK: - NSViewRepresentable

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeNSView(context: NSViewRepresentableContext<TerminalWrapper>) -> LocalProcessTerminalView {
        let terminal = LocalProcessTerminalView(frame: .zero)
        terminal.font = NSFont.monospacedSystemFont(ofSize: 13, weight: .regular)
        terminal.processDelegate = context.coordinator
        context.coordinator.terminalView = terminal

        context.coordinator.startShell(in: initialDirectory)
        return terminal
    }

    func updateNSView(_ nsView: LocalProcessTerminalView, context: NSViewRepresentableContext<TerminalWrapper>) {
        if let command = sendCommand {
            context.coordinator.sendText(command + "\n")
            // Reset on the next run-loop tick to avoid modifying state during view update.
            DispatchQueue.main.async {
                sendCommand = nil
            }
        }
    }
}
