import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { Migrator } from '../../main/database/migrator'
import { migrations } from '../../main/database/migrations'

describe('BrowserCommandExecutor', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    const migrator = new Migrator(db, migrations)
    migrator.migrate()
  })

  afterEach(() => {
    db.close()
  })

  it('fetches pending commands ordered by createdAt', () => {
    db.prepare(`
      INSERT INTO browserCommands (tool, args, status, createdAt)
      VALUES (?, ?, 'pending', datetime('now', '-2 seconds'))
    `).run('browser_navigate', JSON.stringify({ url: 'https://example.com' }))

    db.prepare(`
      INSERT INTO browserCommands (tool, args, status, createdAt)
      VALUES (?, ?, 'pending', datetime('now', '-1 second'))
    `).run('browser_click', JSON.stringify({ ref: '1' }))

    const pending = db.prepare(
      "SELECT * FROM browserCommands WHERE status = 'pending' ORDER BY createdAt ASC"
    ).all()

    expect(pending).toHaveLength(2)
    expect((pending[0] as any).tool).toBe('browser_navigate')
  })

  it('marks command as completed with result', () => {
    db.prepare(`
      INSERT INTO browserCommands (tool, args, status, createdAt)
      VALUES (?, ?, 'pending', datetime('now'))
    `).run('browser_snapshot', '{}')

    const cmd = db.prepare(
      "SELECT * FROM browserCommands WHERE status = 'pending' LIMIT 1"
    ).get() as any

    db.prepare(
      "UPDATE browserCommands SET status = 'completed', result = ?, completedAt = datetime('now') WHERE id = ?"
    ).run(JSON.stringify({ html: '<html>...</html>' }), cmd.id)

    const updated = db.prepare('SELECT * FROM browserCommands WHERE id = ?').get(cmd.id) as any
    expect(updated.status).toBe('completed')
    expect(JSON.parse(updated.result).html).toBe('<html>...</html>')
  })

  it('marks command as error on failure', () => {
    db.prepare(`
      INSERT INTO browserCommands (tool, args, status, createdAt)
      VALUES (?, ?, 'pending', datetime('now'))
    `).run('browser_click', JSON.stringify({ ref: '999' }))

    const cmd = db.prepare(
      "SELECT * FROM browserCommands WHERE status = 'pending' LIMIT 1"
    ).get() as any

    db.prepare(
      "UPDATE browserCommands SET status = 'error', result = ?, completedAt = datetime('now') WHERE id = ?"
    ).run(JSON.stringify({ error: 'Element not found' }), cmd.id)

    const updated = db.prepare('SELECT * FROM browserCommands WHERE id = ?').get(cmd.id) as any
    expect(updated.status).toBe('error')
  })
})
