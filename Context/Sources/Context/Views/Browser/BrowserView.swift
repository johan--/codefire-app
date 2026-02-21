import SwiftUI
import WebKit

struct BrowserView: View {
    @ObservedObject var viewModel: BrowserViewModel
    @State private var urlText: String = ""

    var body: some View {
        VStack(spacing: 0) {
            // Nav bar
            navBar
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(Color(nsColor: .windowBackgroundColor))

            Rectangle()
                .fill(Color(nsColor: .separatorColor).opacity(0.5))
                .frame(height: 1)

            // Tab strip
            tabStrip
                .padding(.horizontal, 6)
                .padding(.vertical, 4)
                .background(Color(nsColor: .windowBackgroundColor))

            Rectangle()
                .fill(Color(nsColor: .separatorColor).opacity(0.5))
                .frame(height: 1)

            // Web content ZStack — all tabs stay alive, only the active one is visible
            ZStack {
                ForEach(viewModel.tabs) { tab in
                    let isActive = tab.id == viewModel.activeTabId
                    WebViewWrapper(webView: tab.webView)
                        .opacity(isActive ? 1 : 0)
                        .allowsHitTesting(isActive)
                }
            }
            .overlay {
                if viewModel.tabs.isEmpty {
                    VStack(spacing: 8) {
                        Image(systemName: "globe")
                            .font(.system(size: 24))
                            .foregroundStyle(.tertiary)
                        Text("No tabs open")
                            .font(.system(size: 12))
                            .foregroundStyle(.tertiary)
                    }
                }
            }
        }
        .onChange(of: viewModel.activeTabId) { _, _ in
            syncURLBar()
        }
        .onReceive(viewModel.objectWillChange) { _ in
            // When any tab property changes, keep the URL bar in sync
            DispatchQueue.main.async {
                syncURLBar()
            }
        }
    }

    // MARK: - Nav Bar

    private var navBar: some View {
        HStack(spacing: 6) {
            // Back
            Button {
                viewModel.activeTab?.webView.goBack()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 12, weight: .medium))
                    .frame(width: 26, height: 26)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(viewModel.activeTab?.canGoBack != true)
            .foregroundColor(viewModel.activeTab?.canGoBack == true ? .primary : .secondary.opacity(0.4))

            // Forward
            Button {
                viewModel.activeTab?.webView.goForward()
            } label: {
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .medium))
                    .frame(width: 26, height: 26)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(viewModel.activeTab?.canGoForward != true)
            .foregroundColor(viewModel.activeTab?.canGoForward == true ? .primary : .secondary.opacity(0.4))

            // Reload / Stop
            Button {
                if let tab = viewModel.activeTab {
                    if tab.isLoading {
                        tab.webView.stopLoading()
                    } else {
                        tab.webView.reload()
                    }
                }
            } label: {
                Image(systemName: viewModel.activeTab?.isLoading == true ? "xmark" : "arrow.clockwise")
                    .font(.system(size: 11, weight: .medium))
                    .frame(width: 26, height: 26)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(viewModel.activeTab == nil)
            .foregroundColor(viewModel.activeTab != nil ? .primary : .secondary.opacity(0.4))

            // URL field
            TextField("Enter URL", text: $urlText)
                .textFieldStyle(.plain)
                .font(.system(size: 12, design: .monospaced))
                .padding(.horizontal, 8)
                .padding(.vertical, 5)
                .background(
                    RoundedRectangle(cornerRadius: 6)
                        .fill(Color(nsColor: .textBackgroundColor))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(Color(nsColor: .separatorColor).opacity(0.5), lineWidth: 0.5)
                )
                .onSubmit {
                    let trimmed = urlText.trimmingCharacters(in: .whitespaces)
                    guard !trimmed.isEmpty else { return }
                    if viewModel.tabs.isEmpty {
                        viewModel.newTab()
                    }
                    viewModel.activeTab?.navigate(to: trimmed)
                }

            // Screenshot
            Button {
                takeScreenshot()
            } label: {
                Image(systemName: "camera")
                    .font(.system(size: 11, weight: .medium))
                    .frame(width: 26, height: 26)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(viewModel.activeTab == nil)
            .foregroundColor(viewModel.activeTab != nil ? .primary : .secondary.opacity(0.4))
        }
    }

    // MARK: - Tab Strip

    private var tabStrip: some View {
        HStack(spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 0) {
                    ForEach(viewModel.tabs) { tab in
                        browserTabButton(for: tab)
                    }
                }
            }

            Button(action: { viewModel.newTab() }) {
                Image(systemName: "plus")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.secondary)
                    .frame(width: 26, height: 26)
                    .background(Color.clear)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.leading, 2)

            Spacer()
        }
    }

    // MARK: - Tab Button (matches terminal tab style)

    @ViewBuilder
    private func browserTabButton(for tab: BrowserTab) -> some View {
        let isSelected = tab.id == viewModel.activeTabId

        HStack(spacing: 4) {
            if tab.isLoading {
                ProgressView()
                    .controlSize(.mini)
                    .scaleEffect(0.6)
                    .frame(width: 10, height: 10)
            } else {
                Image(systemName: "globe")
                    .font(.system(size: 9, weight: .medium))
                    .foregroundColor(isSelected ? .primary : .secondary.opacity(0.5))
            }

            Text(tab.title)
                .font(.system(size: 11, weight: isSelected ? .medium : .regular))
                .lineLimit(1)
                .frame(maxWidth: 120, alignment: .leading)
                .foregroundColor(isSelected ? .primary : .secondary)

            if isSelected {
                Button(action: { viewModel.closeTab(tab.id) }) {
                    Image(systemName: "xmark")
                        .font(.system(size: 7, weight: .bold))
                        .foregroundStyle(.tertiary)
                        .frame(width: 14, height: 14)
                        .background(
                            Circle()
                                .fill(Color(nsColor: .controlBackgroundColor).opacity(0.6))
                        )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(
            RoundedRectangle(cornerRadius: 5)
                .fill(isSelected
                      ? Color(nsColor: .controlBackgroundColor)
                      : Color.clear)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 5)
                .stroke(isSelected
                        ? Color(nsColor: .separatorColor).opacity(0.3)
                        : Color.clear,
                        lineWidth: 0.5)
        )
        .contentShape(Rectangle())
        .onTapGesture {
            viewModel.activeTabId = tab.id
        }
    }

    // MARK: - Helpers

    private func syncURLBar() {
        if let tab = viewModel.activeTab {
            urlText = tab.currentURL
        }
    }

    private func takeScreenshot() {
        guard let tab = viewModel.activeTab else { return }

        let config = WKSnapshotConfiguration()
        tab.webView.takeSnapshot(with: config) { image, error in
            guard let image = image, error == nil else { return }

            let tiff = image.tiffRepresentation
            guard let tiffData = tiff,
                  let bitmap = NSBitmapImageRep(data: tiffData),
                  let pngData = bitmap.representation(using: .png, properties: [:]) else { return }

            let appSupport = FileManager.default.urls(
                for: .applicationSupportDirectory,
                in: .userDomainMask
            ).first!.appendingPathComponent("Context/browser-screenshots", isDirectory: true)

            try? FileManager.default.createDirectory(at: appSupport, withIntermediateDirectories: true)

            let filename = "screenshot-\(ISO8601DateFormatter().string(from: Date())).png"
                .replacingOccurrences(of: ":", with: "-")
            let fileURL = appSupport.appendingPathComponent(filename)

            do {
                try pngData.write(to: fileURL)
                NSPasteboard.general.clearContents()
                NSPasteboard.general.setString(fileURL.path, forType: .string)
            } catch {
                // Screenshot save failed silently
            }
        }
    }
}
