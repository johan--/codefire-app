import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { readConfig } from '../ConfigStore'
import { app, safeStorage } from 'electron'
import path from 'path'
import fs from 'fs'

let client: SupabaseClient | null = null

const TOKEN_FILE = 'supabase-session.json'

function getTokenPath(): string {
  return path.join(app.getPath('userData'), TOKEN_FILE)
}

function loadPersistedSession(): { access_token: string; refresh_token: string } | null {
  try {
    const raw = fs.readFileSync(getTokenPath(), 'utf-8')
    const data = JSON.parse(raw)

    // Handle encrypted format
    if (data._encrypted && safeStorage.isEncryptionAvailable()) {
      const decrypted = safeStorage.decryptString(Buffer.from(data._encrypted, 'base64'))
      return JSON.parse(decrypted)
    }

    // Legacy plaintext format — still accept it (will be re-encrypted on next save)
    if (data.access_token && data.refresh_token) {
      return data
    }

    return null
  } catch {
    return null
  }
}

function persistSession(session: { access_token: string; refresh_token: string } | null): void {
  if (session) {
    const json = JSON.stringify(session)

    // Encrypt if safeStorage is available
    try {
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(json)
        fs.writeFileSync(getTokenPath(), JSON.stringify({ _encrypted: encrypted.toString('base64') }), 'utf-8')
        return
      }
    } catch {
      // Fall through to plaintext
    }

    fs.writeFileSync(getTokenPath(), json, 'utf-8')
  } else {
    try { fs.unlinkSync(getTokenPath()) } catch { /* ignore */ }
  }
}

export function getSupabaseClient(): SupabaseClient | null {
  if (client) return client

  const config = readConfig()
  if (!config.supabaseUrl || !config.supabaseAnonKey) return null

  client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: false,
    },
  })

  const saved = loadPersistedSession()
  if (saved) {
    client.auth.setSession(saved)
  }

  client.auth.onAuthStateChange((_event, session) => {
    if (session) {
      persistSession({ access_token: session.access_token, refresh_token: session.refresh_token })
    } else {
      persistSession(null)
    }
  })

  return client
}

export function resetSupabaseClient(): void {
  client = null
  persistSession(null)
}
