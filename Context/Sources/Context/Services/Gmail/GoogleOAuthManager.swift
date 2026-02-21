import Foundation
import AuthenticationServices

@MainActor
class GoogleOAuthManager: NSObject, ObservableObject {
    @Published var isAuthenticating = false

    var clientId: String { UserDefaults.standard.string(forKey: "gmailClientId") ?? "" }
    var clientSecret: String {
        KeychainHelper.read(key: "gmailClientSecret") ?? ""
    }

    private let authURL = "https://accounts.google.com/o/oauth2/v2/auth"
    private let tokenURL = "https://oauth2.googleapis.com/token"
    private let scopes = "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send"
    private let redirectURI = "context-app://oauth/callback"

    func startOAuthFlow() async -> GmailTokens? {
        isAuthenticating = true
        defer { isAuthenticating = false }

        var components = URLComponents(string: authURL)!
        components.queryItems = [
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "redirect_uri", value: redirectURI),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: scopes),
            URLQueryItem(name: "access_type", value: "offline"),
            URLQueryItem(name: "prompt", value: "consent"),
        ]

        guard let authorizationURL = components.url else { return nil }

        let code: String? = await withCheckedContinuation { continuation in
            let session = ASWebAuthenticationSession(
                url: authorizationURL,
                callbackURLScheme: "context-app"
            ) { callbackURL, error in
                guard error == nil,
                      let callbackURL,
                      let code = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false)?
                        .queryItems?.first(where: { $0.name == "code" })?.value
                else {
                    continuation.resume(returning: nil)
                    return
                }
                continuation.resume(returning: code)
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            session.start()
        }

        guard let authCode = code else { return nil }
        return await exchangeCodeForTokens(code: authCode)
    }

    private func exchangeCodeForTokens(code: String) async -> GmailTokens? {
        var request = URLRequest(url: URL(string: tokenURL)!)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")

        let body = [
            "code=\(code)",
            "client_id=\(clientId)",
            "client_secret=\(clientSecret)",
            "redirect_uri=\(redirectURI)",
            "grant_type=authorization_code",
        ].joined(separator: "&")
        request.httpBody = body.data(using: .utf8)

        guard let (data, _) = try? await URLSession.shared.data(for: request),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let accessToken = json["access_token"] as? String,
              let refreshToken = json["refresh_token"] as? String,
              let expiresIn = json["expires_in"] as? Int
        else { return nil }

        return GmailTokens(
            accessToken: accessToken,
            refreshToken: refreshToken,
            expiresAt: Date().addingTimeInterval(TimeInterval(expiresIn))
        )
    }

    func refreshAccessToken(accountId: String) async -> String? {
        guard let refreshToken = KeychainHelper.read(key: "refreshToken-\(accountId)") else {
            return nil
        }

        var request = URLRequest(url: URL(string: tokenURL)!)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")

        let body = [
            "refresh_token=\(refreshToken)",
            "client_id=\(clientId)",
            "client_secret=\(clientSecret)",
            "grant_type=refresh_token",
        ].joined(separator: "&")
        request.httpBody = body.data(using: .utf8)

        guard let (data, _) = try? await URLSession.shared.data(for: request),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let accessToken = json["access_token"] as? String,
              let expiresIn = json["expires_in"] as? Int
        else { return nil }

        try? KeychainHelper.save(key: "accessToken-\(accountId)", value: accessToken)
        let expiry = Date().addingTimeInterval(TimeInterval(expiresIn))
        try? KeychainHelper.save(
            key: "tokenExpiry-\(accountId)",
            value: String(expiry.timeIntervalSince1970)
        )

        return accessToken
    }

    func getValidToken(for accountId: String) async -> String? {
        if let expiryStr = KeychainHelper.read(key: "tokenExpiry-\(accountId)"),
           let expiry = Double(expiryStr),
           Date().timeIntervalSince1970 < expiry - 60,
           let token = KeychainHelper.read(key: "accessToken-\(accountId)") {
            return token
        }
        return await refreshAccessToken(accountId: accountId)
    }

    func saveTokens(_ tokens: GmailTokens, accountId: String) {
        try? KeychainHelper.save(key: "accessToken-\(accountId)", value: tokens.accessToken)
        try? KeychainHelper.save(key: "refreshToken-\(accountId)", value: tokens.refreshToken)
        try? KeychainHelper.save(
            key: "tokenExpiry-\(accountId)",
            value: String(tokens.expiresAt.timeIntervalSince1970)
        )
    }

    func deleteTokens(accountId: String) {
        KeychainHelper.delete(key: "accessToken-\(accountId)")
        KeychainHelper.delete(key: "refreshToken-\(accountId)")
        KeychainHelper.delete(key: "tokenExpiry-\(accountId)")
    }
}

extension GoogleOAuthManager: ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        NSApplication.shared.keyWindow ?? ASPresentationAnchor()
    }
}

struct GmailTokens {
    let accessToken: String
    let refreshToken: String
    let expiresAt: Date
}
