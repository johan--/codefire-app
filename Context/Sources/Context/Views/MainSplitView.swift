import SwiftUI

struct MainSplitView: View {
    @EnvironmentObject var appState: AppState
    @State private var projectPath: String = ""

    var body: some View {
        HSplitView {
            ProjectSidebarView()
                .frame(minWidth: 160, maxWidth: 240)

            TerminalTabView(projectPath: $projectPath)
                .frame(minWidth: 400, idealWidth: 600)

            GUIPanelView()
                .frame(minWidth: 400, idealWidth: 600)
        }
        .onChange(of: appState.currentProject) { _, project in
            if let project = project {
                projectPath = project.path
            }
        }
    }
}
