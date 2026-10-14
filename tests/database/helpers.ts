import { PGlite } from '@electric-sql/pglite'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

export async function secureSyncMigration(): Promise<string> {
  const directory = resolve(process.cwd(), 'supabase/migrations')
  const files = (await readdir(directory)).filter((name) => name.endsWith('_secure_sync_schema.sql'))
  if (files.length !== 1) throw new Error(`Expected one secure sync migration, found ${files.length}`)
  return readFile(resolve(directory, files[0]!), 'utf8')
}

export async function testDatabase(): Promise<PGlite> {
  const database = new PGlite()
  await database.exec(`
    create role anon noinherit;
    create role authenticated noinherit;
    create role service_role noinherit bypassrls;
    create schema auth;
    create function auth.jwt() returns jsonb
    language sql stable
    as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
    $$;
  `)
  await database.exec(await secureSyncMigration())
  return database
}

export async function asUser(database: PGlite, subject: string): Promise<void> {
  await database.exec(`reset role; select set_config('request.jwt.claims', '${JSON.stringify({ sub: subject })}', false); set role authenticated;`)
}

export async function asAnon(database: PGlite): Promise<void> {
  await database.exec(`reset role; select set_config('request.jwt.claims', '{}', false); set role anon;`)
}

export async function asDatabaseOwner(database: PGlite): Promise<void> {
  await database.exec(`reset role; select set_config('request.jwt.claims', '{}', false);`)
}
