import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'

import type { TendIdentity } from '../../src/auth/types'
import { parseBackup, type AppState } from '../../src/core'
import { LocalRepository } from '../../src/data/localRepository'
import { GatewayError, type SyncGateway } from '../../src/sync/gatewayClient'
import { diffRecords, recordKey, stateToRecords } from '../../src/sync/recordAdapter'
import { SyncEngine, type SyncEngineNetwork } from '../../src/sync/syncEngine'
import type { DeviceRegistration, PullResponse, PushResponse, RemoteRecord, SyncOperation } from '../../src/sync/types'
import { schema1CompleteState } from '../../src/test-fixtures/schema1'

const workspaceId = 'account:user_a'
const firstDeviceId = '00000000-0000-4000-8000-000000000501'
const secondDeviceId = '00000000-0000-4000-8000-000000000502'
const signedIn: TendIdentity = {
  status: 'signedIn', cloudAvailable: true, userId: 'user_a',
  getAccessToken: async () => 'token', signOut: async () => undefined,
}

class TestNetwork implements SyncEngineNetwork {
  constructor(private online: boolean) {}
  isOnline() { return this.online }
  subscribe() { return () => undefined }
  setOnline(online: boolean) { this.online = online }
}

class InMemoryGateway implements SyncGateway {
  private readonly registrations = new Set<string>()
  private readonly records = new Map<string, RemoteRecord>()
  private readonly results = new Map<string, PushResponse['results'][number]>()
  private readonly changes: Array<{ sequence: number; record: RemoteRecord }> = []
  private sequence = 0
  private conflictSequence = 900

  seed(state: AppState): void {
    for (const local of stateToRecords(state).values()) {
      const record: RemoteRecord = {
        ...local, revision: 1, modifiedAt: '2026-10-15T01:00:00.000Z', deletedAt: null,
      }
      this.records.set(recordKey(record.collection, record.recordId), structuredClone(record))
      this.appendChange(record)
    }
  }

  async registerDevice(registration: DeviceRegistration) {
    this.registrations.add(registration.deviceId)
    return { status: 'registered' as const }
  }

  async validateMigration() { return { accepted: true, recordCount: 0, conflicts: [] } }

  async push({ deviceId, operations }: { deviceId: string; operations: SyncOperation[] }): Promise<PushResponse> {
    if (!this.registrations.has(deviceId)) {
      throw new GatewayError({ status: 403, code: 'DEVICE_UNKNOWN', retryable: false })
    }
    const results: PushResponse['results'] = []
    for (const operation of operations) {
      const duplicate = this.results.get(operation.operationId)
      if (duplicate) {
        results.push(structuredClone(duplicate))
        continue
      }
      const key = recordKey(operation.collection, operation.recordId)
      const current = this.records.get(key)
      if ((current?.revision ?? 0) !== operation.baseRevision) {
        const conflict = {
          operationId: operation.operationId,
          status: 'conflict' as const,
          conflictId: `00000000-0000-4000-8000-${String(this.conflictSequence++).padStart(12, '0')}`,
          ...(current ? { record: structuredClone(current) } : {}),
        }
        this.results.set(operation.operationId, conflict)
        results.push(conflict)
        continue
      }
      const revision = (current?.revision ?? 0) + 1
      const record: RemoteRecord = {
        collection: operation.collection,
        recordId: operation.recordId,
        revision,
        modifiedAt: operation.changedAt,
        deletedAt: operation.kind === 'delete' ? operation.changedAt : null,
        data: operation.kind === 'delete' ? null : structuredClone(operation.data!),
      }
      this.records.set(key, record)
      this.appendChange(record)
      const applied = {
        operationId: operation.operationId, status: 'applied' as const, revision,
        record: structuredClone(record),
      }
      this.results.set(operation.operationId, applied)
      results.push(applied)
    }
    return { results }
  }

  async pull({ deviceId, cursor, limit }: { deviceId: string; cursor?: string; limit: number }): Promise<PullResponse> {
    if (!this.registrations.has(deviceId)) {
      throw new GatewayError({ status: 403, code: 'DEVICE_UNKNOWN', retryable: false })
    }
    const after = cursor ? Number(cursor.replace('cursor-', '')) : 0
    const page = this.changes.filter((change) => change.sequence > after).slice(0, limit)
    const next = page.at(-1)?.sequence ?? after
    return {
      records: page.map(({ record }) => structuredClone(record)),
      cursor: `cursor-${next}`,
      hasMore: this.changes.some((change) => change.sequence > next),
    }
  }

  private appendChange(record: RemoteRecord): void {
    this.sequence += 1
    this.changes.push({ sequence: this.sequence, record: structuredClone(record) })
  }
}

function uuidSequence(start: number): () => string {
  let value = start
  return () => `00000000-0000-4000-8000-${String(value++).padStart(12, '0')}`
}

function registration(deviceId: string): DeviceRegistration {
  return { deviceId, name: 'Test browser', platform: 'web', appVersion: '1.1.14' }
}

async function commitOffline(
  repository: LocalRepository,
  update: (state: AppState) => AppState,
  operationId: () => string,
  changedAt: string,
): Promise<void> {
  const previous = await repository.loadWorkspace(workspaceId)
  if (!previous) throw new Error('Expected the seeded workspace to be available.')
  const next = parseBackup(JSON.stringify(update(structuredClone(previous))))
  const metadata = await repository.loadMetadata(workspaceId)
  const operations = diffRecords(stateToRecords(previous), stateToRecords(next), {
    changedAt,
    operationId,
    baseRevisions: new Map(Object.entries(metadata.revisions)),
  })
  await repository.commit(workspaceId, previous, next, operations)
}

describe('all collection synchronization convergence', () => {
  it.each([
    {
      label: 'second device then first device', firstReconnect: 'second' as const,
      activeNotebook: 'Second-device notebook content', recoveredNotebook: 'First-device notebook content',
    },
    {
      label: 'first device then second device', firstReconnect: 'first' as const,
      activeNotebook: 'First-device notebook content', recoveredNotebook: 'Second-device notebook content',
    },
  ])('converges $label without dropping notebook conflicts or duplicating logs', async ({
    firstReconnect, activeNotebook, recoveredNotebook,
  }) => {
    const base = schema1CompleteState()
    const gateway = new InMemoryGateway()
    gateway.seed(base)
    const firstRepository = await LocalRepository.open({ indexedDB: new IDBFactory() })
    const secondRepository = await LocalRepository.open({ indexedDB: new IDBFactory() })
    const firstNetwork = new TestNetwork(true)
    const secondNetwork = new TestNetwork(true)
    const firstIds = uuidSequence(1_000)
    const secondIds = uuidSequence(2_000)
    const first = new SyncEngine({
      identity: signedIn, workspaceId, deviceId: firstDeviceId, repository: firstRepository, gateway,
      registration: registration(firstDeviceId), network: firstNetwork, operationId: firstIds,
    })
    const second = new SyncEngine({
      identity: signedIn, workspaceId, deviceId: secondDeviceId, repository: secondRepository, gateway,
      registration: registration(secondDeviceId), network: secondNetwork, operationId: secondIds,
    })

    await first.syncNow()
    await second.syncNow()
    firstNetwork.setOnline(false)
    secondNetwork.setOnline(false)

    await commitOffline(firstRepository, (state) => ({
      ...state,
      tasks: state.tasks.map((task, index) => index === 0 ? { ...task, title: 'First-device task title' } : task),
      routine: state.routine.map((block, index) => index === 0 ? { ...block, title: 'First-device routine' } : block),
      activities: state.activities.map((activity, index) => index === 0 ? { ...activity, note: 'First-device note' } : activity),
      ideas: state.ideas.map((idea, index) => index === 1 ? { ...idea, text: 'First-device notebook content' } : idea),
      reviews: state.reviews.map((review, index) => index === 0 ? { ...review, win: 'First-device win' } : review),
      sets: state.sets.map((set, index) => index === 0 ? { ...set, weight: 22.5 } : set),
      wakeLogs: { ...state.wakeLogs, '2026-09-12': state.wakeLogs['2026-09-12']! + 60_000 },
      sleepLogs: { ...state.sleepLogs, '2026-09-12': state.sleepLogs['2026-09-12']! + 60_000 },
      settings: { ...state.settings, theme: 'dark', focusMinutes: 30 },
    }), firstIds, '2026-10-15T02:00:00.000Z')

    await commitOffline(secondRepository, (state) => ({
      ...state,
      tasks: state.tasks.map((task, index) => index === 0 ? { ...task, done: true } : task),
      routine: state.routine.map((block, index) => index === 0 ? { ...block, end: '09:30' } : block),
      activities: state.activities.map((activity, index) => index === 0 ? { ...activity, outcome: 'Second-device outcome' } : activity),
      ideas: state.ideas.map((idea, index) => index === 1 ? { ...idea, text: 'Second-device notebook content' } : idea),
      reviews: state.reviews.map((review, index) => index === 0 ? { ...review, lesson: 'Second-device lesson' } : review),
      sets: state.sets.map((set, index) => index === 0 ? { ...set, reps: 12 } : set),
      wakeLogs: { ...state.wakeLogs, '2026-09-12': state.wakeLogs['2026-09-12']! + 120_000 },
      sleepLogs: { ...state.sleepLogs, '2026-09-12': state.sleepLogs['2026-09-12']! + 120_000 },
      settings: { ...state.settings, breakMinutes: 10 },
    }), secondIds, '2026-10-15T03:00:00.000Z')

    if (firstReconnect === 'second') {
      secondNetwork.setOnline(true)
      await second.syncNow()
      firstNetwork.setOnline(true)
      await first.syncNow()
    } else {
      firstNetwork.setOnline(true)
      await first.syncNow()
      secondNetwork.setOnline(true)
      await second.syncNow()
    }
    await second.syncNow()
    await first.syncNow()

    const firstState = parseBackup(JSON.stringify(await firstRepository.loadWorkspace(workspaceId)))
    const secondState = parseBackup(JSON.stringify(await secondRepository.loadWorkspace(workspaceId)))
    expect(firstState).toEqual(secondState)
    expect(firstState.tasks[0]).toMatchObject({ title: 'First-device task title', done: true })
    expect(firstState.routine[0]).toMatchObject({ title: 'First-device routine', end: '09:30' })
    expect(firstState.activities[0]).toMatchObject({ note: 'First-device note', outcome: 'Second-device outcome' })
    expect(firstState.reviews[0]).toMatchObject({ win: 'First-device win', lesson: 'Second-device lesson' })
    expect(firstState.sets[0]).toMatchObject({ weight: 22.5, reps: 12 })
    expect(firstState.settings).toMatchObject({ theme: 'dark', focusMinutes: 30, breakMinutes: 10 })

    const notebookCopies = firstState.ideas.filter((idea) => (
      idea.text === 'First-device notebook content' || idea.text === 'Second-device notebook content'
    ))
    expect(notebookCopies).toHaveLength(2)
    expect(notebookCopies).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'idea-titled', text: activeNotebook }),
      expect.objectContaining({ text: recoveredNotebook, title: expect.stringContaining('(conflict copy)') }),
    ]))
    expect(new Set(firstState.activities.map(({ id }) => id)).size).toBe(firstState.activities.length)
    expect(Object.keys(firstState.wakeLogs)).toEqual(['2026-09-12'])
    expect(Object.keys(firstState.sleepLogs)).toEqual(['2026-09-12'])

    const conflictRepository = firstReconnect === 'second' ? firstRepository : secondRepository
    const conflicts = (await conflictRepository.loadMetadata(workspaceId)).conflicts ?? []
    expect(conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'notebook-content-change', preserveAsSibling: true }),
      expect.objectContaining({ reason: 'same-field-change', local: expect.objectContaining({ collection: 'wakeLogs' }) }),
      expect.objectContaining({ reason: 'same-field-change', local: expect.objectContaining({ collection: 'sleepLogs' }) }),
    ]))
    expect(await firstRepository.readPending(workspaceId, 100)).toEqual([])
    expect(await secondRepository.readPending(workspaceId, 100)).toEqual([])

    firstRepository.close()
    secondRepository.close()
  })
})
