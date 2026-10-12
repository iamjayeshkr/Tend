// Isolated emulator/debug-package test; never writes to the signed app's data.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import ts from 'typescript';
const adb = `${process.env.ANDROID_HOME || `${process.env.HOME}/Library/Android/sdk`}/platform-tools/adb`;
const run = (...args) => execFileSync(adb, args, { encoding: 'utf8' }).trim();
if (run('shell', 'getprop', 'ro.kernel.qemu') !== '1') throw Error('This test requires an emulator.');
const service = 'app.tend.debug/app.tend.ProtectionService';
const previous = run('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services');
const previousEnabled = run('shell', 'settings', 'get', 'secure', 'accessibility_enabled');
const others = previous === 'null' ? [] : previous.split(':').filter(v => v && v !== service);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser;
try {
  run('shell', 'am', 'start', '-W', '-n', 'app.tend.debug/app.tend.MainActivity');
  const pid = run('shell', 'pidof', 'app.tend.debug');
  run('forward', 'tcp:9229', `localabstract:webview_devtools_remote_${pid}`);
  browser = await chromium.connectOverCDP('http://127.0.0.1:9229');
  const page = browser.contexts()[0].pages()[0];
  const compiled = ts.transpileModule(readFileSync('src/core.ts', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } }).outputText;
  const { defaultState, dateKey } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
  const state = defaultState(); state.onboarded = true;
  state.tasks = [{ id: 'task-a', title: 'Read the chapter', date: dateKey(), category: 'study', done: false }, { id: 'task-b', title: 'Write revision notes', date: dateKey(), category: 'study', done: false }];
  const save = async () => {
    if (!await page.evaluate(s => window.AndroidBridge.saveState(JSON.stringify(s)), state)) throw Error('Snapshot not saved');
  };
  await save();
  await page.evaluate(() => {
    if (!window.AndroidBridge.configureProtection(JSON.stringify({ enabled: true, blockUntilTasksDone: true, focusUntil: 0, packages: ['com.google.android.youtube'] }))) throw Error('Protection not configured');
    window.AndroidBridge.configureLimits(JSON.stringify({ youtube: 1440, instagram: 1440, enabled: false }));
  });
  run('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', others.join(':'));
  await wait(700);
  run('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', [...others, service].join(':'));
  run('shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1');
  await wait(1500);
  run('shell', 'am', 'start', '-W', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER', '-p', 'com.google.android.youtube');
  const dump = async () => {
    run('shell', 'uiautomator', 'dump', '/sdcard/tend-task-smoke.xml');
    return run('shell', 'cat', '/sdcard/tend-task-smoke.xml');
  };
  await wait(1000);
  let xml = await dump();
  if (!xml.includes('Back to my tasks')) throw Error('YouTube was not blocked for unfinished tasks');
  writeFileSync('artifacts/android/task-lock-1.1.1.png', execFileSync(adb, ['exec-out', 'screencap', '-p']));
  state.tasks[0].done = true; await save();
  xml = await dump();
  if (!xml.includes('Back to my tasks')) throw Error('One completed task incorrectly unlocked YouTube');
  state.tasks[1].done = true; await save();
  await wait(1000); xml = await dump();
  if (xml.includes('Back to my tasks')) throw Error('Completing the last task did not remove the shield');
  writeFileSync('artifacts/android/task-unlocked-1.1.1.png', execFileSync(adb, ['exec-out', 'screencap', '-p']));
  state.tasks[0].done = false; await save();
  xml = await dump();
  if (!xml.includes('Back to my tasks')) throw Error('Reopening a task did not restore the shield');
  console.log('PASS: real YouTube blocked without a timer; partial completion stays blocked; final completion unlocks while Tend is backgrounded; reopened task relocks.');
} finally {
  run('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', previous === 'null' ? '' : previous);
  run('shell', 'settings', 'put', 'secure', 'accessibility_enabled', previousEnabled === 'null' ? '0' : previousEnabled);
  if (browser) await browser.close();
  run('forward', '--remove', 'tcp:9229');
}
