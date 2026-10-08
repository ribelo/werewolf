import { SELF } from 'cloudflare:test'
import { expect, it } from 'vitest'

it('ww-029g ww-n7wy: organizer session protects the Worker API', async () => {
  expect((await SELF.fetch('https://app.example/api/contests')).status).toBe(401)
  const login = (password: string) =>
    SELF.fetch('https://app.example/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://app.example' },
      body: JSON.stringify({ password }),
    })
  expect((await login('wrong')).status).toBe(401)
  const response = await login('test-password')
  expect(response.status).toBe(200)
  const setCookie = response.headers.get('Set-Cookie') ?? ''
  expect(setCookie).toContain('HttpOnly')
  expect(setCookie).toContain('Secure')
  expect(setCookie).toContain('SameSite=Strict')
  const cookie = setCookie.split(';')[0] ?? ''
  const authorized = await SELF.fetch('https://app.example/api/contests', {
    headers: { Cookie: cookie },
  })
  expect(authorized.status).toBe(200)
  expect(await authorized.json()).toEqual({ contests: [] })
  expect(
    (await SELF.fetch('https://app.example/api/contests', { headers: { Cookie: cookie + 'bad' } }))
      .status,
  ).toBe(401)
  expect(
    (
      await SELF.fetch('https://app.example/api/session', {
        method: 'POST',
        headers: { Origin: 'https://other.example', 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'test-password' }),
      })
    ).status,
  ).toBe(403)
  expect(
    (await SELF.fetch('https://app.example/api/session', { method: 'POST', body: '{}' })).status,
  ).toBe(400)
  const logout = await SELF.fetch('https://app.example/api/session', {
    method: 'DELETE',
    headers: { Cookie: cookie },
  })
  expect(logout.headers.get('Set-Cookie')).toContain('Max-Age=0')
})
