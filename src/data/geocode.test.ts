import { describe, expect, it } from 'vitest'
import { createGeocoder, MIN_INTERVAL_MS } from './geocode'

function fakeClock() {
  let t = 0
  return { now: () => t, sleep: async (ms: number) => void (t += ms), advance: (ms: number) => void (t += ms) }
}

describe('F7: Nominatim address search', () => {
  it('parses results and restricts to Croatia by default', async () => {
    const urls: string[] = []
    const clock = fakeClock()
    const search = createGeocoder(
      async (url) => {
        urls.push(url)
        return {
          ok: true,
          status: 200,
          json: async () => [
            { display_name: 'Velika Gorica, Zagrebačka županija, Hrvatska', name: 'Velika Gorica', lat: '45.7125', lon: '16.0758' },
            { display_name: 'Bez koordinata', lat: 'x', lon: 'y' },
          ],
        }
      },
      clock.now,
      clock.sleep,
    )
    const r = await search('Velika Gorica')
    expect(r).toEqual([
      { name: 'Velika Gorica', address: 'Velika Gorica, Zagrebačka županija, Hrvatska', lat: 45.7125, lon: 16.0758 },
    ])
    expect(urls[0]).toContain('countrycodes=hr')
    expect(urls[0]).toContain('format=jsonv2')
  })

  it('ignores queries shorter than 3 characters without calling the API', async () => {
    let calls = 0
    const search = createGeocoder(async () => {
      calls++
      return { ok: true, status: 200, json: async () => [] }
    })
    expect(await search('ab')).toEqual([])
    expect(calls).toBe(0)
  })

  it('keeps at least 1 s between requests (usage policy)', async () => {
    const clock = fakeClock()
    const times: number[] = []
    const search = createGeocoder(
      async () => {
        times.push(clock.now())
        return { ok: true, status: 200, json: async () => [] }
      },
      clock.now,
      clock.sleep,
    )
    await Promise.all([search('Zagreb'), search('Samobor'), search('Sesvete')])
    expect(times).toHaveLength(3)
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(MIN_INTERVAL_MS)
  })

  it('reports HTTP errors and keeps working afterwards', async () => {
    const clock = fakeClock()
    let fail = true
    const search = createGeocoder(
      async () => ({ ok: !fail, status: fail ? 429 : 200, json: async () => [] }),
      clock.now,
      clock.sleep,
    )
    await expect(search('Zagreb')).rejects.toThrow('429')
    fail = false
    await expect(search('Zagreb')).resolves.toEqual([])
  })
})
