import { describe, expect, it } from 'vitest'

import { landingRedirectUrl } from './TendAuthProvider'

describe('landingRedirectUrl', () => {
  it('returns to the landing route without preserving auth or app hashes', () => {
    expect(landingRedirectUrl({
      origin: 'https://tend.example',
      pathname: '/app/',
    })).toBe('https://tend.example/app/#landing')
  })
})
