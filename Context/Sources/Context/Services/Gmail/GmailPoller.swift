import Foundation
import GRDB
import Combine

@MainActor
class GmailPoller: ObservableObject {
    @Published var isSyncing = false
    @Published var lastSyncDate: Date?
    @Published var lastError: String?
    @Published var newTaskCount: Int = 0

    private var timer: Timer?
    private let oauthManager: GoogleOAuthManager
    private let apiService: GmailAPIService
    private var syncInterval: TimeInterval = 300

    init(oauthManager: GoogleOAuthManager) {
        self.oauthManager = oauthManager
        self.apiService = GmailAPIService(oauthManager: oauthManager)
    }

    func startPolling(interval: TimeInterval = 300) {
        syncInterval = interval
        timer?.invalidate()
        Task { await syncAllAccounts() }
        timer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak self] _ in
            Task { @MainActor in
                await self?.syncAllAccounts()
            }
        }
    }

    func stopPolling() {
        timer?.invalidate()
        timer = nil
    }

    func syncNow() async {
        await syncAllAccounts()
    }

    // MARK: - Core Sync Loop

    private func syncAllAccounts() async {
        guard !isSyncing else { return }
        isSyncing = true
        lastError = nil
        var totalNew = 0

        do {
            let accounts = try await DatabaseService.shared.dbQueue.read { db in
                try GmailAccount.filter(Column("isActive") == true).fetchAll(db)
            }

            for account in accounts {
                let count = await syncAccount(account)
                totalNew += count
            }

            newTaskCount = totalNew
            lastSyncDate = Date()

            if totalNew > 0 {
                NotificationCenter.default.post(name: .tasksDidChange, object: nil)
                NotificationCenter.default.post(name: .gmailDidSync, object: nil)
            }
        } catch {
            lastError = "Sync failed: \(error.localizedDescription)"
            print("GmailPoller: sync error: \(error)")
        }

        isSyncing = false
    }

    private func syncAccount(_ account: GmailAccount) async -> Int {
        let after = account.lastSyncAt ?? Date().addingTimeInterval(-86400)

        guard let listResponse = await apiService.listMessages(
            accountId: account.id,
            query: "in:inbox",
            after: after
        ) else { return 0 }

        let existingIds = getExistingMessageIds(for: account.id)
        let newMessageIds = listResponse.messageIds.filter { !existingIds.contains($0.id) }

        guard !newMessageIds.isEmpty else {
            updateLastSync(accountId: account.id)
            return 0
        }

        var messages: [GmailAPIService.GmailMessage] = []
        for (msgId, _) in newMessageIds.prefix(20) {
            if let msg = await apiService.getMessage(id: msgId, accountId: account.id) {
                messages.append(msg)
            }
        }

        var whitelistedMessages: [(GmailAPIService.GmailMessage, WhitelistMatch)] = []
        for msg in messages {
            let senderEmail = WhitelistFilter.extractEmail(from: msg.from)
            if let match = WhitelistFilter.check(senderEmail: senderEmail) {
                whitelistedMessages.append((msg, match))
            }
        }

        guard !whitelistedMessages.isEmpty else {
            saveProcessedEmails(messages: messages, account: account, matches: [:])
            updateLastSync(accountId: account.id)
            return 0
        }

        let triageInput = whitelistedMessages.map {
            (subject: $0.0.subject, from: $0.0.from, body: $0.0.body, isCalendar: $0.0.isCalendarInvite)
        }

        let triageResults = await Task.detached {
            EmailTriageService.triageEmails(triageInput)
        }.value

        var newTasks = 0
        for (i, (msg, match)) in whitelistedMessages.enumerated() {
            guard i < triageResults.count, let triage = triageResults[i] else { continue }

            let taskId = createTaskFromEmail(
                message: msg,
                triage: triage,
                match: match,
                accountId: account.id
            )

            saveProcessedEmail(
                message: msg,
                accountId: account.id,
                taskId: taskId,
                triageType: triage.type
            )

            newTasks += 1
        }

        updateLastSync(accountId: account.id)
        return newTasks
    }

    // MARK: - Database Helpers

    private func getExistingMessageIds(for accountId: String) -> Set<String> {
        do {
            let ids = try DatabaseService.shared.dbQueue.read { db in
                try String.fetchAll(db, sql:
                    "SELECT gmailMessageId FROM processedEmails WHERE gmailAccountId = ?",
                    arguments: [accountId]
                )
            }
            return Set(ids)
        } catch { return [] }
    }

    private func createTaskFromEmail(
        message: GmailAPIService.GmailMessage,
        triage: EmailTriageResult,
        match: WhitelistMatch,
        accountId: String
    ) -> Int64? {
        let senderName = WhitelistFilter.extractName(from: message.from)
            ?? WhitelistFilter.extractEmail(from: message.from)

        var description = "From: \(senderName)\n"
        description += "Subject: \(message.subject)\n\n"
        if let triageDesc = triage.description {
            description += triageDesc
        }

        var task = TaskItem(
            id: nil,
            projectId: "__global__",
            title: triage.title,
            description: description,
            status: "todo",
            priority: max(triage.priority, match.priority),
            sourceSession: nil,
            source: "email",
            createdAt: Date(),
            completedAt: nil,
            labels: nil,
            attachments: nil,
            isGlobal: true,
            gmailThreadId: message.threadId,
            gmailMessageId: message.id
        )

        var labels = [triage.type]
        if message.isCalendarInvite { labels.append("calendar") }
        task.setLabels(labels)

        do {
            try DatabaseService.shared.dbQueue.write { db in
                try task.insert(db)
            }
            return task.id
        } catch {
            print("GmailPoller: failed to create task: \(error)")
            return nil
        }
    }

    private func saveProcessedEmail(
        message: GmailAPIService.GmailMessage,
        accountId: String,
        taskId: Int64?,
        triageType: String
    ) {
        var email = ProcessedEmail(
            id: nil,
            gmailMessageId: message.id,
            gmailThreadId: message.threadId,
            gmailAccountId: accountId,
            fromAddress: WhitelistFilter.extractEmail(from: message.from),
            fromName: WhitelistFilter.extractName(from: message.from),
            subject: message.subject,
            snippet: message.snippet,
            body: message.body,
            receivedAt: message.date,
            taskId: taskId,
            triageType: triageType,
            isRead: false,
            repliedAt: nil,
            importedAt: Date()
        )
        do {
            try DatabaseService.shared.dbQueue.write { db in
                try email.insert(db)
            }
        } catch {
            print("GmailPoller: failed to save processed email: \(error)")
        }
    }

    private func saveProcessedEmails(
        messages: [GmailAPIService.GmailMessage],
        account: GmailAccount,
        matches: [String: WhitelistMatch]
    ) {
        for msg in messages {
            var email = ProcessedEmail(
                id: nil,
                gmailMessageId: msg.id,
                gmailThreadId: msg.threadId,
                gmailAccountId: account.id,
                fromAddress: WhitelistFilter.extractEmail(from: msg.from),
                fromName: WhitelistFilter.extractName(from: msg.from),
                subject: msg.subject,
                snippet: msg.snippet,
                body: nil,
                receivedAt: msg.date,
                taskId: nil,
                triageType: "skipped",
                isRead: false,
                repliedAt: nil,
                importedAt: Date()
            )
            try? DatabaseService.shared.dbQueue.write { db in
                try email.insert(db)
            }
        }
    }

    private func updateLastSync(accountId: String) {
        try? DatabaseService.shared.dbQueue.write { db in
            try db.execute(
                sql: "UPDATE gmailAccounts SET lastSyncAt = ? WHERE id = ?",
                arguments: [Date(), accountId]
            )
        }
    }
}
