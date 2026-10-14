import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { schema1CompleteState, schema1InvalidBackups } from '../src/test-fixtures/schema1';

const FIRST_TASK = 'Understand binary search';

async function openApp(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Make it mine', exact: true })).toBeVisible();
}

async function finishSetup(page: Page, intention = FIRST_TASK) {
  await page.getByRole('button', { name: 'Make it mine', exact: true }).click();
  await page.getByLabel(/Your name/).fill('Mira');
  await page.getByLabel('Wake up', { exact: true }).fill('07:00');
  await page.getByLabel('Wind down', { exact: true }).fill('22:30');
  await page.getByRole('button', { name: /^25 min/ }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByLabel(/One thing for today/).fill(intention);
  await page.getByRole('button', { name: 'Start my day', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Your next step' })).toBeVisible();
}

async function go(page: Page, section: 'Today' | 'Focus' | 'Notebook' | 'You') {
  const mobile = page.getByRole('navigation', { name: 'Mobile navigation' });
  const navigation = await mobile.isVisible() ? mobile : page.getByRole('navigation', { name: 'Main navigation' });
  await navigation.getByRole('button', { name: section, exact: true }).click();
}

async function readState(page: Page): Promise<any> {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('tend', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const transaction = db.transaction('snapshots', 'readonly');
      const get = transaction.objectStore('snapshots').get('tend.state.v1');
      transaction.oncomplete = () => { db.close(); resolve(get.result ? JSON.parse(get.result) : null); };
      transaction.onerror = () => reject(transaction.error);
    };
  }));
}

async function assertNoHorizontalOverflow(page: Page) {
  const size = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(size.document, 'The app should fit without horizontal scrolling').toBeLessThanOrEqual(size.viewport + 1);
}

async function savePage(page: Page, title: string, body: string) {
  await page.getByRole('button', { name: 'New page', exact: true }).click();
  await page.getByRole('textbox', { name: 'Page title', exact: true }).fill(title);
  await page.getByRole('textbox', { name: 'Write your page', exact: true }).fill(body);
  await page.clock.runFor(1_000);
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
}

async function showNotebookIndex(page: Page) {
  const browse = page.getByRole('button', { name: /^Browse pages/ });
  if (await browse.isVisible()) await browse.click();
}

async function restoreFile(page: Page, state: unknown) {
  await page.getByLabel('Import backup file').setInputFiles({
    name: 'legacy-tend-backup.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ format: 'tend-backup', schemaVersion: 1, state })),
  });
  await expect(page.getByRole('dialog')).toContainText('Restoring replaces');
  await page.getByRole('button', { name: 'Replace with this backup', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-13T10:00:00+05:30') });
  await page.clock.pauseAt(new Date('2026-09-13T10:00:01+05:30'));
});

test('guided first run leads to one task and a four-tab app', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await openApp(page);
  await expect(page.getByRole('button', { name: /sign in|create account|continue with google/i })).toHaveCount(0);
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('welcome.png'), fullPage: true, animations: 'disabled' });
  await finishSetup(page);
  await expect(page.getByRole('region', { name: 'Your next step' })).toContainText(FIRST_TASK);
  for (const section of ['Today', 'Focus', 'Notebook', 'You'] as const) {
    await go(page, section);
    await assertNoHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`${section.toLowerCase()}.png`), fullPage: true, animations: 'disabled' });
  }
  const account = page.getByRole('region', { name: 'Account and cloud sync' });
  await expect(account).toContainText('Cloud sync is optional');
  await expect(account).toContainText('Your data stays on this device');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Make it mine', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Your next step' })).toContainText(FIRST_TASK);
  const state = await readState(page);
  expect(state.onboarded).toBe(true);
  expect(state.settings).toMatchObject({ name: 'Mira', wake: '07:00', sleep: '22:30' });
  expect(state.tasks).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('task focus pauses, recovers after reload, and saves the actual three minutes', async ({ page }) => {
  await openApp(page);
  await finishSetup(page);
  await page.getByRole('button', { name: 'Focus on this', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Focus objective' })).toHaveValue(FIRST_TASK);
  await page.getByRole('button', { name: 'Start focus', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.clock.fastForward(120_000);
  await expect(page.getByRole('timer')).toHaveText('23:00');
  await page.reload();
  await go(page, 'Focus');
  await expect(page.getByRole('timer')).toHaveText('23:00');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
  await page.clock.fastForward(180_000);
  await page.reload();
  await go(page, 'Focus');
  await expect(page.getByRole('timer')).toHaveText('23:00');
  expect((await readState(page)).activities).toHaveLength(0);
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.clock.fastForward(60_000);
  await expect(page.getByRole('timer')).toHaveText('22:00');
  await page.getByRole('button', { name: 'Finish session', exact: true }).click();
  await expect(page.getByLabel('Minutes to keep in your journal')).toHaveValue('3');
  await page.getByLabel('What did you learn? (optional)').fill('Halve the search space each time.');
  await page.getByRole('button', { name: 'Keep this session', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const saved = await readState(page);
  expect(saved.timer).toBeNull();
  expect(saved.activities.filter((entry: any) => entry.title === FIRST_TASK)).toHaveLength(1);
  expect(saved.activities[0].note).toContain('Halve the search space');
  await page.reload();
  const reopened = await readState(page);
  expect(reopened.activities).toEqual(saved.activities);
  await go(page, 'You');
  await page.getByRole('button', { name: /^Activity journal/ }).click();
  await expect(page.getByRole('button', { name: new RegExp(FIRST_TASK) })).toBeVisible();
});

test('notebook saves a page, preserves edits after leaving, and reopens after restart', async ({ page }, testInfo) => {
  await openApp(page);
  await finishSetup(page, '');
  await go(page, 'Notebook');
  await savePage(page, 'Binary search notes', 'Start with a sorted collection.\nDiscard half after every comparison.');
  await page.getByRole('textbox', { name: 'Write your page', exact: true }).fill('Start with a sorted collection.\nDiscard half after every comparison.\nRemember the empty interval.');
  await page.clock.runFor(1_000);
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('notebook-writing.png'), fullPage: true, animations: 'disabled' });
  await go(page, 'Today');
  await go(page, 'Notebook');
  await page.reload();
  await go(page, 'Notebook');
  await showNotebookIndex(page);
  await page.getByRole('button', { name: 'Open page: Binary search notes', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Page title', exact: true })).toHaveValue('Binary search notes');
  await expect(page.getByRole('textbox', { name: 'Write your page', exact: true })).toHaveValue(/Remember the empty interval\./);
  const state = await readState(page);
  expect(state.ideas.filter((entry: any) => entry.title === 'Binary search notes')).toHaveLength(1);
});

test('legacy thoughts and questions restore once and retain their history when edited', async ({ page }) => {
  await openApp(page);
  await finishSetup(page, '');
  const legacy = schema1CompleteState();
  await restoreFile(page, legacy);
  await go(page, 'Notebook');
  await showNotebookIndex(page);
  await expect(page.getByRole('button', { name: 'Open page: An untitled thought from an earlier release.', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Open page: A deterministic question', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Open page: A deterministic question', exact: true }).click();
  await page.getByRole('textbox', { name: 'Page title', exact: true }).fill('Spacing and memory');
  await page.getByRole('textbox', { name: 'Write your page', exact: true }).fill('Why do spaced reviews help?\nExplore active recall next.');
  await page.clock.runFor(1_000);
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  await page.reload();
  const restored = await readState(page);
  expect(restored.ideas).toHaveLength(2);
  expect(restored.ideas.find((entry: any) => entry.id === 'idea-titled')).toMatchObject({
    id: 'idea-titled', title: 'Spacing and memory', kind: 'question', status: 'researching', createdAt: legacy.ideas[1]?.createdAt,
  });
});

// Recovery validation: deletion must remain reversible and must not duplicate the restored page.
test('notebook deletion can be undone without duplicating the restored page', async ({ page }) => {
  await openApp(page);
  await finishSetup(page, '');
  await go(page, 'Notebook');
  await savePage(page, 'Undo-safe page', 'This page should come back exactly once.');
  await page.getByRole('button', { name: 'Page options', exact: true }).click();
  await page.getByRole('button', { name: 'Remove page', exact: true }).click();
  await page.getByRole('button', { name: 'Remove this page', exact: true }).click();
  const removalNotice = page.getByRole('status').filter({ hasText: 'Page removed.' });
  await expect(removalNotice).toBeVisible();
  await expect.poll(async () => (await readState(page)).ideas.filter((entry: any) => entry.title === 'Undo-safe page').length).toBe(0);
  await removalNotice.getByRole('button', { name: 'Undo removal', exact: true }).click();
  await expect.poll(async () => (await readState(page)).ideas.filter((entry: any) => entry.title === 'Undo-safe page').length).toBe(1);
  await page.reload();
  await go(page, 'Notebook');
  await showNotebookIndex(page);
  await expect(page.getByRole('button', { name: 'Open page: Undo-safe page', exact: true })).toHaveCount(1);
});

test('backup export and restore retain the whole notebook; corrupt files leave it alone', async ({ page }) => {
  await openApp(page);
  await finishSetup(page);
  await go(page, 'Notebook');
  await savePage(page, 'A page worth keeping', 'This page belongs in the backup.');
  await go(page, 'You');
  await page.getByRole('button', { name: /^Preferences & backups/ }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup', exact: true }).click();
  const download = await downloadPromise;
  const file = await download.path();
  expect(file).toBeTruthy();
  const exported = JSON.parse(await readFile(file!, 'utf8'));
  expect(exported.format).toBe('tend-backup');
  expect(exported.state.ideas[0].title).toBe('A page worth keeping');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByLabel('Import backup file').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"tend-backup","schemaVersion":1,"state":{"version":99}}') });
  await expect(page.getByRole('status')).toContainText('Backup not restored');
  expect(await readState(page)).toEqual(exported.state);
  // Recovery validation: a well-formed but future schema must be rejected without touching current data.
  await page.getByLabel('Import backup file').setInputFiles({ name: 'future.json', mimeType: 'application/json', buffer: Buffer.from(schema1InvalidBackups.unsupportedVersion) });
  await expect(page.getByRole('status')).toContainText('Backup not restored');
  expect(await readState(page)).toEqual(exported.state);
  await restoreFile(page, exported.state);
  await page.reload();
  expect(await readState(page)).toEqual(exported.state);
});

test('offline restart retains pages and lets the owner continue writing', async ({ page, context }) => {
  await openApp(page);
  await finishSetup(page);
  await go(page, 'Notebook');
  await savePage(page, 'Offline notebook', 'This stays with me without Wi-Fi.');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await go(page, 'Notebook');
  await showNotebookIndex(page);
  await page.getByRole('button', { name: 'Open page: Offline notebook', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Write your page', exact: true })).toHaveValue('This stays with me without Wi-Fi.');
  await page.getByRole('textbox', { name: 'Write your page', exact: true }).fill('Written and saved while offline.');
  await page.clock.runFor(1_000);
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  await page.reload();
  expect((await readState(page)).ideas[0].text).toBe('Written and saved while offline.');
});

test('web app explains that actual app protection needs Android', async ({ page }) => {
  await openApp(page);
  await finishSetup(page);
  await go(page, 'You');
  await page.getByRole('button', { name: /^Your app shield/ }).click();
  const protectionNotice = page.getByRole('region', { name: 'Control Apps, Games & Screen Time' });
  await expect(protectionNotice).toContainText('Available in the Android app');
  await expect(protectionNotice).toContainText(/only the installed Android app can pause games and apps/i);
  await expect(page.getByRole('button', { name: 'Set up app protection', exact: true })).toHaveCount(0);
});

// Recovery validation: core dialogs remain keyboard-operable with reduced motion requested.
test('preferences dialog is keyboard reachable with reduced motion and no horizontal overflow', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openApp(page);
  await finishSetup(page, '');
  await go(page, 'You');
  const trigger = page.getByRole('button', { name: /^Preferences & backups/ });
  await trigger.focus();
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Preferences' })).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('Android protection asks for explicit consent and reports missing access honestly', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const scope = window as any;
    const calls: Array<{ method: string; argument?: unknown }> = [];
    const protection = { enabled: false, accessibility: false, usageAccess: false, packages: ['com.instagram.android', 'com.google.android.youtube'], focusUntil: 0, overrides: [] };
    scope.__nativeTest = { calls, protection };
    scope.AndroidBridge = {
      loadState: () => localStorage.getItem('tend.mock.state'),
      saveState: (json: string) => { localStorage.setItem('tend.mock.state', json); return true; },
      getCapabilities: () => JSON.stringify({ platform: 'android', notifications: false, usageAccess: protection.usageAccess, exactAlarms: false, accessibility: protection.accessibility, protectionEnabled: protection.enabled }),
      getUsage: () => JSON.stringify({ granted: false, apps: [] }),
      getProtectionState: () => JSON.stringify(protection),
      configureProtection: (json: string) => { const update = JSON.parse(json); calls.push({ method: 'configureProtection', argument: update }); Object.assign(protection, update); return true; },
      requestPermission: (kind: string) => calls.push({ method: 'requestPermission', argument: kind }),
      configureLimits: () => {}, scheduleAlarm: () => true, cancelAlarm: () => {}, scheduleTimer: () => {}, cancelTimer: () => {},
    };
  });
  await openApp(page);
  await finishSetup(page);
  expect(await page.evaluate(() => (window as any).__nativeTest.calls.filter((call: any) => call.method === 'requestPermission'))).toEqual([]);
  await go(page, 'You');
  await page.getByRole('button', { name: /^Your app shield/ }).click();
  await expect(page.getByText('Not switched on yet', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Set up app protection', exact: true }).click();
  const disclosure = page.getByRole('region', { name: 'Your attention. Your permission.' });
  await expect(disclosure).toContainText('Android Accessibility');
  await expect(disclosure).toContainText('does not read screen text, messages, passwords or taps');
  await expect(disclosure).toContainText('tasks remain unfinished');
  await expect(disclosure).toContainText('cooldown buffer');
  await expect(disclosure).toContainText('mandatory daily log deadline');
  await expect(disclosure).toContainText('Emergency calls, dialer, and Settings stay available');
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('protection-consent.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Not now', exact: true }).click();
  expect(await page.evaluate(() => (window as any).__nativeTest.protection.enabled)).toBe(false);
  expect(await page.evaluate(() => (window as any).__nativeTest.calls.filter((call: any) => call.method === 'requestPermission'))).toEqual([]);
  await page.getByRole('button', { name: 'Set up app protection', exact: true }).click();
  await page.getByRole('button', { name: 'I agree · open Android settings', exact: true }).click();
  expect(await page.evaluate(() => (window as any).__nativeTest.calls.filter((call: any) => call.method === 'requestPermission'))).toEqual([{ method: 'requestPermission', argument: 'accessibility' }]);
  await expect(page.getByText('One permission to finish', { exact: true })).toBeVisible();
  await expect(page.getByText('Ready for your next session', { exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    (window as any).__nativeTest.protection.accessibility = true;
    window.dispatchEvent(new CustomEvent('tend-capabilities-changed'));
  });
  await expect(page.getByText('Ready for your next session', { exact: true })).toBeVisible();
  // Historical characterization: the recovered release opens a confirmation screen here and keeps protection enabled.
  await page.getByRole('button', { name: 'Turn off app protection', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => (window as any).__nativeTest.protection.enabled)).toBe(true);
  await page.getByRole('button', { name: 'Close and face my commitments', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Ready for your next session', { exact: true })).toBeVisible();
});
