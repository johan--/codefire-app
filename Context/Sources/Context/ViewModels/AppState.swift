import Foundation
import GRDB
import Combine

@MainActor
class AppState: ObservableObject {
    @Published var currentProject: Project?
    @Published var projects: [Project] = []
    @Published var selectedTab: GUITab = .tasks
    @Published var isHomeView: Bool = true
    @Published var clients: [Client] = []

    enum GUITab: String, CaseIterable {
        case tasks = "Tasks"
        case dashboard = "Dashboard"
        case sessions = "Sessions"
        case notes = "Notes"
        case memory = "Memory"
        case rules = "Rules"
        case visualize = "Visualize"

        var icon: String {
            switch self {
            case .dashboard: return "house"
            case .sessions: return "clock"
            case .tasks: return "checklist"
            case .notes: return "note.text"
            case .memory: return "brain"
            case .rules: return "doc.text.magnifyingglass"
            case .visualize: return "chart.dots.scatter"
            }
        }
    }

    func loadProjects() {
        do {
            let discovery = ProjectDiscovery()
            try discovery.importProjects()
            projects = try DatabaseService.shared.dbQueue.read { db in
                try Project.order(Project.Columns.lastOpened.desc).fetchAll(db)
            }

            // Auto-select the most recently opened project if none is selected
            // and we're not on the home view.
            if !isHomeView && currentProject == nil, let first = projects.first {
                selectProject(first)
            }
        } catch {
            print("Failed to load projects: \(error)")
        }
        loadClients()
    }

    func selectProject(_ project: Project) {
        isHomeView = false
        currentProject = project
        do {
            try DatabaseService.shared.dbQueue.write { db in
                var updated = project
                updated.lastOpened = Date()
                try updated.update(db)
            }
            let discovery = ProjectDiscovery()
            try discovery.importSessions(for: project)

            // Notify views that session data is available.
            NotificationCenter.default.post(name: .sessionsDidChange, object: nil)
        } catch {
            print("Failed to update project: \(error)")
        }
    }

    func selectHome() {
        isHomeView = true
        currentProject = nil
    }

    func loadClients() {
        do {
            clients = try DatabaseService.shared.dbQueue.read { db in
                try Client.order(Column("sortOrder").asc, Column("name").asc).fetchAll(db)
            }
        } catch {
            print("Failed to load clients: \(error)")
        }
    }

    func createClient(name: String, color: String) {
        var client = Client(
            id: UUID().uuidString,
            name: name,
            color: color,
            sortOrder: clients.count,
            createdAt: Date()
        )
        do {
            try DatabaseService.shared.dbQueue.write { db in
                try client.insert(db)
            }
            loadClients()
        } catch {
            print("Failed to create client: \(error)")
        }
    }

    func deleteClient(_ client: Client) {
        do {
            _ = try DatabaseService.shared.dbQueue.write { db in
                try client.delete(db)
            }
            loadClients()
            loadProjects() // refresh since projects may have lost their clientId
        } catch {
            print("Failed to delete client: \(error)")
        }
    }

    func updateProjectClient(_ project: Project, clientId: String?) {
        do {
            try DatabaseService.shared.dbQueue.write { db in
                var updated = project
                updated.clientId = clientId
                try updated.update(db)
            }
            loadProjects()
        } catch {
            print("Failed to update project client: \(error)")
        }
    }

    /// Projects grouped by client for the sidebar.
    var projectsByClient: [(client: Client?, projects: [Project])] {
        var groups: [(client: Client?, projects: [Project])] = []

        for client in clients {
            let clientProjects = projects.filter { $0.clientId == client.id }
            if !clientProjects.isEmpty {
                groups.append((client: client, projects: clientProjects))
            }
        }

        let ungrouped = projects.filter { $0.clientId == nil }
        if !ungrouped.isEmpty {
            groups.append((client: nil, projects: ungrouped))
        }

        return groups
    }
}
