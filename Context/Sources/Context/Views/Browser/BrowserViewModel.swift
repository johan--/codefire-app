import Foundation
import Combine

class BrowserViewModel: ObservableObject {
    @Published var tabs: [BrowserTab] = []
    @Published var activeTabId: UUID?

    private var cancellables = Set<AnyCancellable>()

    var activeTab: BrowserTab? {
        tabs.first { $0.id == activeTabId }
    }

    func newTab() {
        let tab = BrowserTab()
        tabs.append(tab)
        activeTabId = tab.id

        // Forward tab property changes to trigger view updates
        tab.objectWillChange
            .sink { [weak self] _ in
                self?.objectWillChange.send()
            }
            .store(in: &cancellables)
    }

    func closeTab(_ id: UUID) {
        tabs.removeAll { $0.id == id }
        if activeTabId == id {
            activeTabId = tabs.last?.id
        }
    }
}
