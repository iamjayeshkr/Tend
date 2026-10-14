import type { TendIdentity } from '../auth/types'
import { defaultState, type AppState } from '../core'
import type { LocalRepository } from './localRepository'

export type WorkspaceSelection =
  | { kind: 'guest'; workspaceId: 'guest'; state: AppState; persisted: boolean }
  | { kind: 'account'; workspaceId: string; ownerId: string; state: AppState; persisted: boolean }
  | {
      kind: 'locked'
      workspaceId: string | null
      ownerId: string | null
      reason: 'identity-loading' | 'session-expired'
    }

export type SignOutPreparation =
  | { status: 'ready' }
  | { status: 'requiresSyncOrExport'; pendingCount: number }

export class WorkspaceManager {
  private readonly lockedAccounts = new Set<string>()

  constructor(readonly repository: LocalRepository) {}

  lockAccount(userId: string): void {
    if (userId) this.lockedAccounts.add(userId)
  }

  async select(identity: TendIdentity): Promise<WorkspaceSelection> {
    if (identity.status === 'loading') {
      return { kind: 'locked', workspaceId: null, ownerId: null, reason: 'identity-loading' }
    }
    if (identity.status === 'locked' && identity.userId) {
      this.lockAccount(identity.userId)
      return {
        kind: 'locked',
        workspaceId: `account:${identity.userId}`,
        ownerId: identity.userId,
        reason: 'session-expired',
      }
    }
    if (identity.status === 'guest' || identity.status === 'locked') {
      const stored = await this.repository.loadWorkspace('guest')
      return {
        kind: 'guest',
        workspaceId: 'guest',
        state: stored ?? defaultState(),
        persisted: stored !== null,
      }
    }

    this.lockedAccounts.delete(identity.userId)
    const workspaceId = `account:${identity.userId}`
    const stored = await this.repository.loadWorkspace(workspaceId)
    return {
      kind: 'account',
      workspaceId,
      ownerId: identity.userId,
      state: stored ?? defaultState(),
      persisted: stored !== null,
    }
  }

  async prepareSignOut(userId: string): Promise<SignOutPreparation> {
    const pending = await this.repository.readPending(`account:${userId}`, 101)
    return pending.length === 0
      ? { status: 'ready' }
      : { status: 'requiresSyncOrExport', pendingCount: pending.length }
  }
}
