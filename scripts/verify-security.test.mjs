import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('production service worker security updates', () => {
  it('activates new builds immediately and never precaches hidden files', async () => {
    const source = await readFile(new URL('./build-sw.mjs', import.meta.url), 'utf8')
    expect(source).toContain('self.skipWaiting()')
    expect(source).toContain("f.name.startsWith('.')")
  })

  it('uses the network first for navigations while retaining an offline shell', async () => {
    const source = await readFile(new URL('./build-sw.mjs', import.meta.url), 'utf8')
    expect(source).toContain("e.request.mode==='navigate'")
    expect(source).toMatch(/e\.request\.mode==='navigate'.*fetch\(e\.request\).*caches\.match\('\.\/index\.html'\)/s)
  })
})

describe('Supabase gateway ownership', () => {
  it('passes Clerk and signed scheduler requests to functions that verify them internally', async () => {
    const config = await readFile(new URL('../supabase/config.toml', import.meta.url), 'utf8')
    for (const name of ['sync', 'account', 'clerk-webhook', 'retention']) {
      const section = config.split(`[functions.${name}]`)[1]?.split(/\n\[/)[0]
      expect(section, `missing secure gateway handoff for ${name}`).toContain('verify_jwt = false')
    }
  })
})

describe('desktop Clerk boundary', () => {
  it('uses Clerk\'s Electron bridge and encrypted session storage', async () => {
    const main = await readFile(new URL('../electron/main.cjs', import.meta.url), 'utf8')
    const preload = await readFile(new URL('../electron/preload.cjs', import.meta.url), 'utf8')
    const provider = await readFile(new URL('../src/auth/TendAuthProvider.tsx', import.meta.url), 'utf8')

    expect(main).toContain('createClerkBridge')
    expect(main).toContain("require('@clerk/electron/storage')")
    expect(main).toContain("scheme: RENDERER_SCHEME")
    expect(main).toContain("host: RENDERER_HOST")
    expect(main).toContain('clerk.isPrimaryInstance')
    expect(main).toContain('clerk.cleanup()')
    expect(preload).toContain('exposeClerkBridge()')
    expect(provider).toContain("from '@clerk/electron/react'")
  })

  it('restricts the privileged renderer and OS protocol to Tend only', async () => {
    const main = await readFile(new URL('../electron/main.cjs', import.meta.url), 'utf8')
    const builder = JSON.parse(await readFile(new URL('../electron-builder.json', import.meta.url), 'utf8'))

    expect(main).toContain("const RENDERER_SCHEME = 'tend'")
    expect(main).toContain("const RENDERER_HOST = 'renderer'")
    expect(main).toContain('parsedUrl.host !== RENDERER_HOST')
    expect(main).toContain("relativePath.startsWith('..')")
    expect(main).toContain("mainWindow.webContents.on('will-redirect'")
    expect(main).toContain("'Content-Security-Policy'")
    expect(main).not.toContain("'unsafe-eval'")
    expect(builder.protocols).toContainEqual({ name: 'Tend', schemes: ['tend'] })
  })
})
