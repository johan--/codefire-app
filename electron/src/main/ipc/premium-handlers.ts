import { ipcMain } from 'electron'
import type { AuthService } from '../services/premium/AuthService'
import type { TeamService } from '../services/premium/TeamService'
import type { SyncEngine } from '../services/premium/SyncEngine'
import type { PresenceService } from '../services/premium/PresenceService'
import { getSupabaseClient } from '../services/premium/SupabaseClient'

export function registerPremiumHandlers(
  authService: AuthService,
  teamService: TeamService,
  syncEngine: SyncEngine,
  presenceService: PresenceService
) {
  // Auth
  ipcMain.handle('premium:getStatus', () => authService.getStatus())
  ipcMain.handle('premium:signUp', (_e, email: string, password: string, displayName: string) =>
    authService.signUp(email, password, displayName))
  ipcMain.handle('premium:signIn', (_e, email: string, password: string) =>
    authService.signIn(email, password))
  ipcMain.handle('premium:signOut', () => authService.signOut())

  // Team management
  ipcMain.handle('premium:createTeam', (_e, name: string, slug: string) =>
    teamService.createTeam(name, slug))
  ipcMain.handle('premium:getTeam', () => authService.getStatus().then(s => s.team))
  ipcMain.handle('premium:listMembers', (_e, teamId: string) =>
    teamService.listMembers(teamId))
  ipcMain.handle('premium:inviteMember', (_e, teamId: string, email: string, role: 'admin' | 'member') =>
    teamService.inviteMember(teamId, email, role))
  ipcMain.handle('premium:removeMember', (_e, teamId: string, userId: string) =>
    teamService.removeMember(teamId, userId))
  ipcMain.handle('premium:acceptInvite', (_e, token: string) =>
    teamService.acceptInvite(token))

  // Project sync
  ipcMain.handle('premium:syncProject', (_e, teamId: string, projectId: string, name: string, repoUrl?: string) => {
    syncEngine.trackEntity('project', projectId, projectId)
    return teamService.syncProject(teamId, projectId, name, repoUrl)
  })
  ipcMain.handle('premium:unsyncProject', (_e, projectId: string) => {
    syncEngine.unsubscribeFromProject(projectId)
    return teamService.unsyncProject(projectId)
  })

  // Billing
  ipcMain.handle('premium:createCheckout', async (_e, teamId: string, plan: string, extraSeats?: number) => {
    const client = getSupabaseClient()
    if (!client) throw new Error('Premium not configured')
    const { data, error } = await client.functions.invoke('create-checkout', {
      body: { teamId, plan, extraSeats: extraSeats || 0 }
    })
    if (error) throw error
    return data
  })

  ipcMain.handle('premium:getBillingPortal', async (_e, teamId: string) => {
    const client = getSupabaseClient()
    if (!client) throw new Error('Premium not configured')
    const { data, error } = await client.functions.invoke('billing-portal', {
      body: { teamId }
    })
    if (error) throw error
    return data
  })

  // Notifications
  ipcMain.handle('premium:getNotifications', async (_e, limit?: number) => {
    const client = getSupabaseClient()
    if (!client) return []
    const { data: { user } } = await client.auth.getUser()
    if (!user) return []
    const { data } = await client
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit || 50)
    return data || []
  })

  ipcMain.handle('premium:markNotificationRead', async (_e, notificationId: string) => {
    const client = getSupabaseClient()
    if (!client) return
    await client.from('notifications').update({ is_read: true }).eq('id', notificationId)
  })

  ipcMain.handle('premium:markAllNotificationsRead', async () => {
    const client = getSupabaseClient()
    if (!client) return
    const { data: { user } } = await client.auth.getUser()
    if (!user) return
    await client.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false)
  })

  // Activity feed
  ipcMain.handle('premium:getActivityFeed', async (_e, projectId: string, limit?: number) => {
    const client = getSupabaseClient()
    if (!client) return []
    const { data } = await client
      .from('activity_events')
      .select('*, user:users(id, email, display_name, avatar_url)')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(limit || 50)
    return data || []
  })

  // Presence
  ipcMain.handle('premium:joinPresence', async (_e, projectId: string) => {
    const client = getSupabaseClient()
    if (!client) return
    const { data: { user } } = await client.auth.getUser()
    if (!user) return
    const { data: profile } = await client.from('users').select('display_name').eq('id', user.id).single()
    await presenceService.joinProject(projectId, {
      userId: user.id,
      displayName: profile?.display_name || user.email || 'Unknown',
      activeFile: null,
      gitBranch: null,
      onlineAt: new Date().toISOString(),
    })
  })

  ipcMain.handle('premium:leavePresence', async (_e, projectId: string) => {
    await presenceService.leaveProject(projectId)
  })

  ipcMain.handle('premium:getPresence', (_e, projectId: string) => {
    return presenceService.getPresence(projectId)
  })

  // ─── Super Admin ─────────────────────────────────────────────────────────────

  ipcMain.handle('premium:admin:isSuperAdmin', async () => {
    const client = getSupabaseClient()
    if (!client) return false
    const { data: { user } } = await client.auth.getUser()
    if (!user) return false
    const { data } = await client.from('super_admins').select('user_id').eq('user_id', user.id).single()
    return !!data
  })

  ipcMain.handle('premium:admin:searchUsers', async (_e, email: string) => {
    const client = getSupabaseClient()
    if (!client) throw new Error('Not configured')
    const { data } = await client.from('users').select('id, email, display_name').ilike('email', `%${email}%`).limit(10)
    return data || []
  })

  ipcMain.handle('premium:admin:listGrants', async () => {
    const client = getSupabaseClient()
    if (!client) throw new Error('Not configured')
    const { data } = await client.from('team_grants').select('*').order('created_at', { ascending: false })
    return data || []
  })

  ipcMain.handle('premium:admin:grantTeam', async (_e, grant: {
    teamId: string
    grantType: string
    planTier: string
    seatLimit?: number
    projectLimit?: number
    repoUrl?: string
    note?: string
    expiresAt?: string
  }) => {
    const client = getSupabaseClient()
    if (!client) throw new Error('Not configured')
    const { data: { user } } = await client.auth.getUser()
    if (!user) throw new Error('Not authenticated')
    const { data, error } = await client.from('team_grants').insert({
      team_id: grant.teamId,
      grant_type: grant.grantType,
      plan_tier: grant.planTier,
      seat_limit: grant.seatLimit || null,
      project_limit: grant.projectLimit || null,
      repo_url: grant.repoUrl || null,
      note: grant.note || null,
      expires_at: grant.expiresAt || null,
      granted_by: user.id,
    }).select().single()
    if (error) throw error
    return data
  })

  ipcMain.handle('premium:admin:revokeGrant', async (_e, grantId: string) => {
    const client = getSupabaseClient()
    if (!client) throw new Error('Not configured')
    const { error } = await client.from('team_grants').delete().eq('id', grantId)
    if (error) throw error
  })
}
