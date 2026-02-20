import SwiftUI

/// A view that manages multiple terminal tabs, each backed by a `TerminalWrapper`.
///
/// The tab bar sits at the top. A "+" button creates new tabs whose initial
/// directory matches the current `projectPath`. When the project path changes
/// the active terminal receives a `cd` command so it stays in sync.
struct TerminalTabView: View {
    @Binding var projectPath: String
    @State private var tabs: [TerminalTab] = []
    @State private var selectedTabId: UUID?
    @State private var commandToSend: String?

    var body: some View {
        VStack(spacing: 0) {
            // Tab bar
            HStack(spacing: 0) {
                ForEach(tabs) { tab in
                    tabButton(for: tab)
                }

                Button(action: addTab) {
                    Image(systemName: "plus")
                        .font(.system(size: 12, weight: .medium))
                        .frame(width: 28, height: 28)
                }
                .buttonStyle(.plain)
                .padding(.leading, 4)

                Spacer()
            }
            .padding(.horizontal, 4)
            .padding(.vertical, 2)
            .background(Color(nsColor: .controlBackgroundColor))

            Divider()

            // Terminal content
            if let selected = tabs.first(where: { $0.id == selectedTabId }) {
                TerminalWrapper(
                    initialDirectory: selected.initialDirectory,
                    sendCommand: $commandToSend
                )
                .id(selected.id) // force new view per tab
            } else {
                Spacer()
                Text("No terminal open")
                    .foregroundStyle(.secondary)
                Spacer()
            }
        }
        .onAppear {
            if tabs.isEmpty {
                addTab()
            }
        }
        .onChange(of: projectPath) { _, newPath in
            commandToSend = "cd \"\(newPath)\""
        }
    }

    // MARK: - Tab actions

    private func addTab() {
        let tab = TerminalTab(
            title: "Terminal \(tabs.count + 1)",
            initialDirectory: projectPath
        )
        tabs.append(tab)
        selectedTabId = tab.id
    }

    private func closeTab(_ tab: TerminalTab) {
        tabs.removeAll { $0.id == tab.id }
        if selectedTabId == tab.id {
            selectedTabId = tabs.last?.id
        }
    }

    // MARK: - Tab button

    @ViewBuilder
    private func tabButton(for tab: TerminalTab) -> some View {
        let isSelected = tab.id == selectedTabId

        HStack(spacing: 4) {
            Text(tab.title)
                .font(.system(size: 11))
                .lineLimit(1)

            Button(action: { closeTab(tab) }) {
                Image(systemName: "xmark")
                    .font(.system(size: 8, weight: .bold))
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            .opacity(isSelected ? 1 : 0)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(
            RoundedRectangle(cornerRadius: 4)
                .fill(isSelected
                      ? Color(nsColor: .selectedContentBackgroundColor).opacity(0.3)
                      : Color.clear)
        )
        .contentShape(Rectangle())
        .onTapGesture {
            selectedTabId = tab.id
        }
    }
}
