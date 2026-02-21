import Foundation

struct EmailTriageResult {
    let title: String
    let description: String?
    let priority: Int
    let type: String
}

enum EmailTriageService {
    nonisolated static func triageEmails(
        _ emails: [(subject: String, from: String, body: String, isCalendar: Bool)]
    ) -> [EmailTriageResult?] {
        if emails.isEmpty { return [] }

        var emailDescriptions = ""
        for (i, email) in emails.enumerated() {
            emailDescriptions += """
            --- EMAIL \(i + 1) ---
            From: \(email.from)
            Subject: \(email.subject)
            Calendar invite: \(email.isCalendar ? "yes" : "no")
            Body (truncated):
            \(String(email.body.prefix(1500)))

            """
        }

        let prompt = """
        You are triaging incoming emails for a freelance developer/agency owner.
        Analyze each email and determine if it requires action.

        For each email, return a JSON object with:
        - "index": the email number (1-based)
        - "actionable": true if this needs a task, false if it's just FYI/spam/noise
        - "title": short action item title (under 80 chars). Be specific.
        - "description": 1-2 sentence context about what needs to be done
        - "priority": 0 (none), 1 (low), 2 (medium), 3 (high), 4 (urgent)
        - "type": "task", "question", "calendar", or "fyi"

        Rules:
        - Bug reports and specific requests are actionable (type: "task")
        - Questions that need answers are actionable (type: "question")
        - Calendar invites are actionable (type: "calendar")
        - Newsletters, automated notifications, and FYI emails are NOT actionable
        - Extract the actual action item as the title, not just the email subject

        Return ONLY a JSON array. No other text.

        \(emailDescriptions)
        """

        guard let raw = callClaude(prompt: prompt) else {
            return emails.map { _ in nil }
        }

        var jsonStr = raw
        if jsonStr.hasPrefix("```") {
            let lines = jsonStr.components(separatedBy: "\n")
            let filtered = lines.filter { !$0.hasPrefix("```") }
            jsonStr = filtered.joined(separator: "\n")
        }

        guard let data = jsonStr.data(using: .utf8),
              let array = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
        else {
            return emails.map { _ in nil }
        }

        var results: [EmailTriageResult?] = emails.map { _ in nil }
        for item in array {
            guard let index = item["index"] as? Int,
                  let actionable = item["actionable"] as? Bool,
                  actionable,
                  let title = item["title"] as? String,
                  index >= 1, index <= emails.count
            else { continue }

            results[index - 1] = EmailTriageResult(
                title: title,
                description: item["description"] as? String,
                priority: min(max(item["priority"] as? Int ?? 0, 0), 4),
                type: item["type"] as? String ?? "task"
            )
        }

        return results
    }

    // MARK: - Claude CLI

    private nonisolated static func callClaude(prompt: String) -> String? {
        guard let claudePath = findClaudeBinary() else { return nil }

        let process = Process()
        let outputPipe = Pipe()
        let inputPipe = Pipe()

        process.executableURL = URL(fileURLWithPath: claudePath)
        process.arguments = ["-p", "--output-format", "text"]
        process.standardOutput = outputPipe
        process.standardError = FileHandle.nullDevice
        process.standardInput = inputPipe
        process.environment = ProcessInfo.processInfo.environment

        guard let promptData = prompt.data(using: .utf8) else { return nil }
        inputPipe.fileHandleForWriting.write(promptData)
        inputPipe.fileHandleForWriting.closeFile()

        do {
            try process.run()
            process.waitUntilExit()
        } catch { return nil }

        guard process.terminationStatus == 0 else { return nil }
        let data = outputPipe.fileHandleForReading.readDataToEndOfFile()
        return String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private nonisolated static func findClaudeBinary() -> String? {
        let candidates = [
            "/usr/local/bin/claude",
            "/opt/homebrew/bin/claude",
            "\(NSHomeDirectory())/.npm/bin/claude",
            "\(NSHomeDirectory())/.local/bin/claude",
            "\(NSHomeDirectory())/.nvm/current/bin/claude",
        ]
        for path in candidates {
            if FileManager.default.fileExists(atPath: path) { return path }
        }
        let which = Process()
        let pipe = Pipe()
        which.executableURL = URL(fileURLWithPath: "/usr/bin/which")
        which.arguments = ["claude"]
        which.standardOutput = pipe
        which.standardError = FileHandle.nullDevice
        which.environment = ProcessInfo.processInfo.environment
        do {
            try which.run()
            which.waitUntilExit()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            if let path = String(data: data, encoding: .utf8)?
                .trimmingCharacters(in: .whitespacesAndNewlines),
               !path.isEmpty { return path }
        } catch {}
        return nil
    }
}
