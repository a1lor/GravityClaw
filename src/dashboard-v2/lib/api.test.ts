import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('api.get', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => vi.unstubAllGlobals())

  it('appends gc_token from localStorage to the URL', async () => {
    localStorage.setItem('gc_token', 'test-token-123')
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: 'value' }),
    })

    const { api } = await import('./api')
    await api.get('/api/kpis')

    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(calledUrl).toContain('?token=test-token-123')
  })

  it('throws on non-ok response', async () => {
    localStorage.setItem('gc_token', 'tok')
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    })

    const { api } = await import('./api')
    await expect(api.get('/api/kpis')).rejects.toThrow('401')
  })
})
