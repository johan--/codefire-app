import Foundation

/// Observable model representing a single terminal tab.
///
/// Each tab stores its display title and the directory in which its shell was
/// originally started.
class TerminalTab: Identifiable, ObservableObject {
    let id = UUID()
    @Published var title: String
    let initialDirectory: String

    init(title: String = "Terminal", initialDirectory: String) {
        self.title = title
        self.initialDirectory = initialDirectory
    }
}
