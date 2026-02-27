import SwiftUI

struct DevToolsPanel: View {
    @ObservedObject var tab: BrowserTab
    @Binding var isVisible: Bool

    enum DevToolsTab: String, CaseIterable {
        case elements = "Elements"
        case styles = "Styles"
        case boxModel = "Box Model"

        var icon: String {
            switch self {
            case .elements: return "chevron.left.forwardslash.chevron.right"
            case .styles: return "paintbrush"
            case .boxModel: return "rectangle.center.inset.filled"
            }
        }
    }

    @State private var selectedTab: DevToolsTab = .elements

    var body: some View {
        VStack(spacing: 0) {
            // Header bar
            headerBar

            Divider()

            // Tab content
            Group {
                switch selectedTab {
                case .elements:
                    elementsTab
                case .styles:
                    stylesTab
                case .boxModel:
                    boxModelTab
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(Color(nsColor: .windowBackgroundColor))
    }

    // MARK: - Header Bar

    private var headerBar: some View {
        HStack(spacing: 6) {
            // Element picker toggle
            Button {
                if tab.isElementPickerActive {
                    tab.stopElementPicker()
                } else {
                    tab.startElementPicker()
                }
            } label: {
                Image(systemName: "cursorarrow.click.2")
                    .font(.system(size: 11, weight: .medium))
                    .frame(width: 26, height: 26)
                    .background(
                        RoundedRectangle(cornerRadius: 4)
                            .fill(tab.isElementPickerActive ? Color.accentColor.opacity(0.2) : Color.clear)
                    )
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .foregroundColor(tab.isElementPickerActive ? .accentColor : .primary)
            .help("Select an element to inspect")

            // Tab buttons
            ForEach(DevToolsTab.allCases, id: \.self) { devTab in
                Button {
                    selectedTab = devTab
                } label: {
                    HStack(spacing: 3) {
                        Image(systemName: devTab.icon)
                            .font(.system(size: 9))
                        Text(devTab.rawValue)
                            .font(.system(size: 11, weight: selectedTab == devTab ? .semibold : .regular))
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(
                        RoundedRectangle(cornerRadius: 4)
                            .fill(selectedTab == devTab
                                  ? Color(nsColor: .controlBackgroundColor)
                                  : Color.clear)
                    )
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .foregroundColor(selectedTab == devTab ? .primary : .secondary)
            }

            Spacer()

            // Selected element label
            if let el = tab.inspectedElement {
                selectedElementLabel(el)
            }

            // Close button
            Button {
                tab.stopElementPicker()
                isVisible = false
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(.tertiary)
                    .frame(width: 20, height: 20)
                    .background(
                        Circle()
                            .fill(Color(nsColor: .controlBackgroundColor).opacity(0.6))
                    )
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
    }

    @ViewBuilder
    private func selectedElementLabel(_ el: InspectedElement) -> some View {
        HStack(spacing: 3) {
            Text("<\(el.tagName)>")
                .font(.system(size: 10, design: .monospaced))
                .foregroundStyle(.secondary)

            if let id = el.id, !id.isEmpty {
                Text("#\(id)")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(.accentColor)
            }

            if !el.classes.isEmpty {
                Text(".\(el.classes.prefix(2).joined(separator: "."))")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(.orange)
            }

            if let ref = el.axRef {
                Text("[\(ref)]")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(.tertiary)
            }
        }
        .lineLimit(1)
    }

    // MARK: - Elements Tab

    private var elementsTab: some View {
        Group {
            if let el = tab.inspectedElement {
                ScrollView {
                    VStack(alignment: .leading, spacing: 8) {
                        // Element tag display
                        elementTagDisplay(el)

                        Divider()

                        // Attributes
                        if !el.attributes.isEmpty {
                            sectionHeader("Attributes")
                            VStack(alignment: .leading, spacing: 2) {
                                ForEach(el.attributes.sorted(by: { $0.key < $1.key }), id: \.key) { key, value in
                                    HStack(alignment: .top, spacing: 4) {
                                        Text(key)
                                            .font(.system(size: 11, design: .monospaced))
                                            .foregroundColor(.accentColor)
                                        Text("=")
                                            .font(.system(size: 11, design: .monospaced))
                                            .foregroundStyle(.tertiary)
                                        Text("\"\(value)\"")
                                            .font(.system(size: 11, design: .monospaced))
                                            .foregroundColor(.orange)
                                            .lineLimit(3)
                                            .textSelection(.enabled)
                                    }
                                }
                            }
                            .padding(.horizontal, 12)
                        }

                        // Position & Size
                        Divider()
                        sectionHeader("Position & Size")
                        HStack(spacing: 16) {
                            labeledValue("x", String(format: "%.0f", el.rect.x))
                            labeledValue("y", String(format: "%.0f", el.rect.y))
                            labeledValue("w", String(format: "%.0f", el.rect.width))
                            labeledValue("h", String(format: "%.0f", el.rect.height))
                        }
                        .padding(.horizontal, 12)

                        // Parent
                        if let parent = el.parent {
                            Divider()
                            sectionHeader("Parent")
                            elementSummaryRow(parent)
                                .padding(.horizontal, 12)
                        }

                        // Children
                        if !el.children.isEmpty {
                            Divider()
                            sectionHeader("Children (\(el.children.count))")
                            VStack(alignment: .leading, spacing: 2) {
                                ForEach(el.children) { child in
                                    elementSummaryRow(child)
                                }
                            }
                            .padding(.horizontal, 12)
                        }
                    }
                    .padding(.vertical, 8)
                }
            } else {
                emptyState(
                    icon: "cursorarrow.click.2",
                    message: "Click the picker button, then select an element on the page"
                )
            }
        }
    }

    @ViewBuilder
    private func elementTagDisplay(_ el: InspectedElement) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 0) {
                Text("<")
                    .foregroundStyle(.tertiary)
                Text(el.tagName)
                    .foregroundColor(.accentColor)

                if let id = el.id, !id.isEmpty {
                    Text(" id")
                        .foregroundColor(.orange)
                    Text("=\"\(id)\"")
                        .foregroundColor(.green)
                }

                if !el.classes.isEmpty {
                    Text(" class")
                        .foregroundColor(.orange)
                    Text("=\"\(el.classes.joined(separator: " "))\"")
                        .foregroundColor(.green)
                }

                Text(">")
                    .foregroundStyle(.tertiary)
            }
            .font(.system(size: 12, design: .monospaced))
            .textSelection(.enabled)

            // Selector
            HStack(spacing: 4) {
                Text("Selector:")
                    .font(.system(size: 10))
                    .foregroundStyle(.tertiary)
                Text(el.selector)
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .textSelection(.enabled)
            }
        }
        .padding(.horizontal, 12)
    }

    @ViewBuilder
    private func elementSummaryRow(_ summary: ElementSummary) -> some View {
        HStack(spacing: 3) {
            Text("<\(summary.tagName)>")
                .font(.system(size: 11, design: .monospaced))
                .foregroundColor(.accentColor)

            if let id = summary.elementId, !id.isEmpty {
                Text("#\(id)")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundColor(.orange)
            }

            if !summary.classes.isEmpty {
                Text(".\(summary.classes.prefix(2).joined(separator: "."))")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(.secondary)
            }

            Spacer()
        }
    }

    // MARK: - Styles Tab

    private var stylesTab: some View {
        Group {
            if let styles = tab.inspectedStyles {
                ScrollView {
                    VStack(alignment: .leading, spacing: 4) {
                        stylesSection("Typography", styles.typography)
                        stylesSection("Layout", styles.layout)
                        stylesSection("Spacing", styles.spacing)
                        stylesSection("Colors", styles.colors)
                        stylesSection("Border", styles.border)
                        if !styles.other.isEmpty {
                            stylesSection("Other", styles.other)
                        }
                    }
                    .padding(.vertical, 8)
                }
            } else if tab.inspectedElement != nil {
                emptyState(
                    icon: "paintbrush",
                    message: "Loading styles..."
                )
            } else {
                emptyState(
                    icon: "paintbrush",
                    message: "Select an element to view its computed styles"
                )
            }
        }
    }

    @ViewBuilder
    private func stylesSection(_ title: String, _ pairs: [(String, String)]) -> some View {
        if !pairs.isEmpty {
            VStack(alignment: .leading, spacing: 2) {
                sectionHeader(title)

                ForEach(Array(pairs.enumerated()), id: \.offset) { _, pair in
                    HStack(alignment: .top, spacing: 0) {
                        Text(pair.0)
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundColor(.accentColor)
                            .frame(minWidth: 160, alignment: .leading)
                        Text(pair.1)
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundStyle(.primary)
                            .lineLimit(2)
                            .textSelection(.enabled)
                    }
                    .padding(.horizontal, 12)
                }
            }

            Divider()
                .padding(.vertical, 2)
        }
    }

    // MARK: - Box Model Tab

    private var boxModelTab: some View {
        Group {
            if let box = tab.inspectedBoxModel {
                VStack(spacing: 0) {
                    Spacer()
                    boxModelDiagram(box)
                    Spacer()
                }
                .frame(maxWidth: .infinity)
            } else if tab.inspectedElement != nil {
                emptyState(
                    icon: "rectangle.center.inset.filled",
                    message: "Loading box model..."
                )
            } else {
                emptyState(
                    icon: "rectangle.center.inset.filled",
                    message: "Select an element to view its box model"
                )
            }
        }
    }

    @ViewBuilder
    private func boxModelDiagram(_ box: BoxModelData) -> some View {
        let marginColor = Color.orange.opacity(0.15)
        let borderColor = Color.yellow.opacity(0.2)
        let paddingColor = Color.green.opacity(0.15)
        let contentColor = Color.blue.opacity(0.15)

        ZStack {
            // Margin layer
            RoundedRectangle(cornerRadius: 4)
                .fill(marginColor)
                .overlay(
                    RoundedRectangle(cornerRadius: 4)
                        .stroke(Color.orange.opacity(0.3), lineWidth: 1)
                )

            VStack(spacing: 0) {
                boxDimensionLabel(String(format: "%.0f", box.margin.top))
                    .foregroundColor(.orange)
                    .padding(.top, 4)

                HStack(spacing: 0) {
                    boxDimensionLabel(String(format: "%.0f", box.margin.left))
                        .foregroundColor(.orange)
                        .padding(.leading, 4)

                    // Border layer
                    ZStack {
                        RoundedRectangle(cornerRadius: 3)
                            .fill(borderColor)
                            .overlay(
                                RoundedRectangle(cornerRadius: 3)
                                    .stroke(Color.yellow.opacity(0.4), lineWidth: 1)
                            )

                        VStack(spacing: 0) {
                            boxDimensionLabel(String(format: "%.0f", box.border.top))
                                .foregroundColor(.yellow)
                                .padding(.top, 3)

                            HStack(spacing: 0) {
                                boxDimensionLabel(String(format: "%.0f", box.border.left))
                                    .foregroundColor(.yellow)
                                    .padding(.leading, 3)

                                // Padding layer
                                ZStack {
                                    RoundedRectangle(cornerRadius: 2)
                                        .fill(paddingColor)
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 2)
                                                .stroke(Color.green.opacity(0.4), lineWidth: 1)
                                        )

                                    VStack(spacing: 0) {
                                        boxDimensionLabel(String(format: "%.0f", box.padding.top))
                                            .foregroundColor(.green)
                                            .padding(.top, 3)

                                        HStack(spacing: 0) {
                                            boxDimensionLabel(String(format: "%.0f", box.padding.left))
                                                .foregroundColor(.green)
                                                .padding(.leading, 3)

                                            // Content
                                            RoundedRectangle(cornerRadius: 2)
                                                .fill(contentColor)
                                                .overlay(
                                                    RoundedRectangle(cornerRadius: 2)
                                                        .stroke(Color.blue.opacity(0.3), lineWidth: 1)
                                                )
                                                .overlay(
                                                    Text("\(String(format: "%.0f", box.content.width)) x \(String(format: "%.0f", box.content.height))")
                                                        .font(.system(size: 10, design: .monospaced))
                                                        .foregroundColor(.blue)
                                                )
                                                .frame(minWidth: 80, minHeight: 36)

                                            boxDimensionLabel(String(format: "%.0f", box.padding.right))
                                                .foregroundColor(.green)
                                                .padding(.trailing, 3)
                                        }

                                        boxDimensionLabel(String(format: "%.0f", box.padding.bottom))
                                            .foregroundColor(.green)
                                            .padding(.bottom, 3)
                                    }
                                }
                                .padding(4)

                                boxDimensionLabel(String(format: "%.0f", box.border.right))
                                    .foregroundColor(.yellow)
                                    .padding(.trailing, 3)
                            }

                            boxDimensionLabel(String(format: "%.0f", box.border.bottom))
                                .foregroundColor(.yellow)
                                .padding(.bottom, 3)
                        }
                    }
                    .padding(4)

                    boxDimensionLabel(String(format: "%.0f", box.margin.right))
                        .foregroundColor(.orange)
                        .padding(.trailing, 4)
                }

                boxDimensionLabel(String(format: "%.0f", box.margin.bottom))
                    .foregroundColor(.orange)
                    .padding(.bottom, 4)
            }
        }
        .frame(maxWidth: 360, maxHeight: 200)

        // Legend
        HStack(spacing: 12) {
            legendItem("margin", .orange)
            legendItem("border", .yellow)
            legendItem("padding", .green)
            legendItem("content", .blue)
        }
        .padding(.top, 8)
    }

    private func boxDimensionLabel(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 9, design: .monospaced))
    }

    private func legendItem(_ label: String, _ color: Color) -> some View {
        HStack(spacing: 4) {
            RoundedRectangle(cornerRadius: 2)
                .fill(color.opacity(0.3))
                .frame(width: 10, height: 10)
            Text(label)
                .font(.system(size: 9))
                .foregroundStyle(.secondary)
        }
    }

    // MARK: - Shared Components

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 10, weight: .semibold))
            .foregroundStyle(.tertiary)
            .textCase(.uppercase)
            .padding(.horizontal, 12)
            .padding(.top, 4)
    }

    private func labeledValue(_ label: String, _ value: String) -> some View {
        HStack(spacing: 3) {
            Text(label)
                .font(.system(size: 10))
                .foregroundStyle(.tertiary)
            Text(value)
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(.secondary)
        }
    }

    private func emptyState(icon: String, message: String) -> some View {
        VStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 20))
                .foregroundStyle(.tertiary)
            Text(message)
                .font(.system(size: 11))
                .foregroundStyle(.tertiary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
