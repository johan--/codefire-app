import SwiftUI

struct HomeView: View {
    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "house.fill")
                .font(.system(size: 32))
                .foregroundStyle(.tertiary)
            Text("Planner")
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(.secondary)
            Text("Global kanban + notes coming soon")
                .font(.system(size: 12))
                .foregroundStyle(.tertiary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
