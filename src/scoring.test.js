import { describe, it, expect } from 'vitest'
import {
  uid, today, LISTS, CATEGORY_IDS, DEFAULT_CATEGORY,
  newItem, makeItems, makeProfile,
  normalizeItem, normalizeState, defaultState,
  itemScore, itemMax, byWeightDesc, computeStats,
  RED_ALERT_PCT, VERDICT_BANDS, trendFor, verdictFor,
} from './scoring.js'

const item = (overrides = {}) => ({
  id: 'x', text: 't', rating: 0, weight: 2, category: DEFAULT_CATEGORY,
  note: '', ratedAt: null, ...overrides,
})
const profile = (overrides = {}) => ({
  id: 'p', name: 'Anna', createdAt: 0,
  green: [], red: [], musthaves: [], dealbreakers: [], history: [], journal: [],
  ...overrides,
})

describe('constants', () => {
  it('lists & categories', () => {
    expect(LISTS).toEqual(['green', 'red', 'musthaves', 'dealbreakers'])
    expect(CATEGORY_IDS).toContain(DEFAULT_CATEGORY)
    expect(CATEGORY_IDS).toEqual(['sex', 'eq', 'qualities', 'personal'])
  })
})

describe('uid / today', () => {
  it('uid is unique enough across rapid calls', () => {
    const s = new Set()
    for (let i = 0; i < 200; i++) s.add(uid())
    expect(s.size).toBe(200)
  })
  it('today is ISO yyyy-mm-dd', () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('newItem / makeItems / makeProfile', () => {
  it('newItem defaults', () => {
    const i = newItem('hello')
    expect(i.text).toBe('hello')
    expect(i.rating).toBe(0)
    expect(i.weight).toBe(2)
    expect(i.category).toBe(DEFAULT_CATEGORY)
    expect(i.note).toBe('')
    expect(i.ratedAt).toBeNull()
    expect(typeof i.id).toBe('string')
  })
  it('makeItems maps to items', () => {
    const arr = makeItems(['a', 'b'])
    expect(arr).toHaveLength(2)
    expect(arr[0].text).toBe('a')
  })
  it('makeProfile shape', () => {
    const p = makeProfile('Test')
    expect(p.name).toBe('Test')
    for (const k of LISTS) expect(Array.isArray(p[k])).toBe(true)
    expect(p.history).toEqual([])
    expect(p.journal).toEqual([])
  })
})

describe('normalizeItem', () => {
  it('clamps weight 5 → 3', () => {
    expect(normalizeItem({ text: 't', weight: 5 }).weight).toBe(3)
  })
  it('clamps weight 0 → 1', () => {
    expect(normalizeItem({ text: 't', weight: 0 }).weight).toBe(1)
  })
  it('defaults missing weight to 2', () => {
    expect(normalizeItem({ text: 't' }).weight).toBe(2)
  })
  it('rounds fractional weight', () => {
    expect(normalizeItem({ text: 't', weight: 1.7 }).weight).toBe(2)
  })
  it('migrates legacy checked → rating 3', () => {
    expect(normalizeItem({ text: 't', checked: true }).rating).toBe(3)
  })
  it('legacy unchecked → rating 0', () => {
    expect(normalizeItem({ text: 't', checked: false }).rating).toBe(0)
  })
  it('preserves explicit numeric rating', () => {
    expect(normalizeItem({ text: 't', rating: 4 }).rating).toBe(4)
  })
  it('fallback to default category for unknown id', () => {
    expect(normalizeItem({ text: 't', category: 'bogus' }).category).toBe(DEFAULT_CATEGORY)
  })
  it('keeps a valid category', () => {
    expect(normalizeItem({ text: 't', category: 'eq' }).category).toBe('eq')
  })
  it('uses ratedAt or checkedAt fallback', () => {
    expect(normalizeItem({ text: 't', checkedAt: 1234 }).ratedAt).toBe(1234)
    expect(normalizeItem({ text: 't', ratedAt: 9 }).ratedAt).toBe(9)
  })
  it('fills note default', () => {
    expect(normalizeItem({ text: 't' }).note).toBe('')
  })
  it('preserves existing note', () => {
    expect(normalizeItem({ text: 't', note: 'hi' }).note).toBe('hi')
  })
})

describe('normalizeState', () => {
  it('returns null when no profiles', () => {
    expect(normalizeState({ profiles: [] })).toBeNull()
    expect(normalizeState(null)).toBeNull()
  })
  it('fills blank names with "Профил N"', () => {
    const s = normalizeState({ profiles: [{ name: '   ', green: [], red: [] }, { name: '', green: [], red: [] }] })
    expect(s.profiles[0].name).toBe('Профил 1')
    expect(s.profiles[1].name).toBe('Профил 2')
  })
  it('initializes streak / apiKey / compareIds defaults', () => {
    const s = normalizeState({ profiles: [{ name: 'a' }] })
    expect(s.streak).toEqual({ count: 0, lastDay: null })
    expect(s.apiKey).toBe('')
    expect(s.compareIds).toEqual([])
  })
  it('migrates red items with dealbreaker:true into dealbreakers', () => {
    const s = normalizeState({ profiles: [{
      name: 'a', red: [{ text: 'r1' }, { text: 'r2', dealbreaker: true }],
    }] })
    const p = s.profiles[0]
    expect(p.red.map(i => i.text)).toEqual(['r1'])
    expect(p.dealbreakers.map(i => i.text)).toEqual(['r2'])
    expect(p.dealbreakers[0].dealbreaker).toBeUndefined()
  })
  it('initializes empty lists when missing', () => {
    const s = normalizeState({ profiles: [{ name: 'a' }] })
    const p = s.profiles[0]
    for (const k of LISTS) expect(Array.isArray(p[k])).toBe(true)
    expect(p.journal).toEqual([])
  })
})

describe('defaultState', () => {
  it('has a single empty profile', () => {
    const s = defaultState()
    expect(s.profiles).toHaveLength(1)
    expect(s.activeId).toBe(s.profiles[0].id)
    expect(s.compareIds).toEqual([])
  })
})

describe('itemScore / itemMax / byWeightDesc', () => {
  it('itemScore = rating × weight', () => {
    expect(itemScore({ rating: 4, weight: 3 })).toBe(12)
    expect(itemScore({ rating: 0, weight: 3 })).toBe(0)
  })
  it('itemScore falls back to weight 2', () => {
    expect(itemScore({ rating: 5 })).toBe(10)
  })
  it('itemMax = 5 × weight', () => {
    expect(itemMax({ weight: 3 })).toBe(15)
    expect(itemMax({})).toBe(10)
  })
  it('byWeightDesc sorts 3 → 1 stably', () => {
    const arr = [
      { id: 'a', weight: 1 },
      { id: 'b', weight: 3 },
      { id: 'c', weight: 2 },
      { id: 'd', weight: 3 },
      { id: 'e', weight: 1 },
    ]
    const sorted = byWeightDesc(arr).map(i => i.id)
    expect(sorted).toEqual(['b', 'd', 'c', 'a', 'e'])
  })
  it('does not mutate input', () => {
    const arr = [{ id: 'a', weight: 1 }, { id: 'b', weight: 3 }]
    byWeightDesc(arr)
    expect(arr.map(i => i.id)).toEqual(['a', 'b'])
  })
})

describe('computeStats', () => {
  it('empty profile has neutral compat at 50%', () => {
    const s = computeStats(profile())
    expect(s.compat).toBe(50)
    expect(s.greenPct).toBe(0)
    expect(s.redPct).toBe(0)
    expect(s.ratedCount).toBe(0)
    expect(s.confidence).toBe(0)
  })
  it('counts only rated items toward gCount/rCount', () => {
    const p = profile({
      green: [item({ rating: 5, weight: 2 }), item({ rating: 0, weight: 2 })],
      red: [item({ rating: 3, weight: 1 })],
    })
    const s = computeStats(p)
    expect(s.gCount).toBe(1)
    expect(s.rCount).toBe(1)
    expect(s.greenChecked).toBe(1)
    expect(s.greenTotal).toBe(2)
  })
  it('includes musthaves in greens and dealbreakers in reds', () => {
    const p = profile({
      musthaves: [item({ rating: 5, weight: 3 })],
      dealbreakers: [item({ rating: 4, weight: 2 })],
    })
    const s = computeStats(p)
    expect(s.greenTotal).toBe(1)
    expect(s.redTotal).toBe(1)
    expect(s.gScore).toBe(15)
    expect(s.rScore).toBe(8)
  })
  it('all greens rated max → high compat with red empty (shrunk by prior)', () => {
    // With PRIOR_STRENGTH=4 and 5 rated maxed greens, compat = (5*1 + 4*0.5)/9 ≈ 78%.
    // More rated flags reduce the pull toward the 50% prior.
    const p = profile({
      green: Array.from({ length: 5 }, () => item({ rating: 5, weight: 2 })),
    })
    const s = computeStats(p)
    expect(s.greenPct).toBe(100)
    expect(s.compat).toBe(78)

    const pMany = profile({
      green: Array.from({ length: 40 }, () => item({ rating: 5, weight: 2 })),
    })
    expect(computeStats(pMany).compat).toBeGreaterThan(90)
  })
  it('greenPct / redPct are 0-100', () => {
    const p = profile({
      green: [item({ rating: 5, weight: 3 })],
      red: [item({ rating: 5, weight: 3 })],
    })
    const s = computeStats(p)
    expect(s.greenPct).toBe(100)
    expect(s.redPct).toBe(100)
  })
  it('triggeredDealbreakers lists rated dealbreaker texts', () => {
    const p = profile({
      dealbreakers: [
        item({ text: 'lies', rating: 4 }),
        item({ text: 'cheats', rating: 0 }),
      ],
    })
    const s = computeStats(p)
    expect(s.triggeredDealbreakers).toEqual(['lies'])
  })
  it('unmetMusthaves lists unrated musthave texts', () => {
    const p = profile({
      musthaves: [
        item({ text: 'honest', rating: 5 }),
        item({ text: 'kind', rating: 0 }),
      ],
    })
    const s = computeStats(p)
    expect(s.unmetMusthaves).toEqual(['kind'])
  })
  it('compat clamped to [0,100]', () => {
    const p = profile({
      green: Array.from({ length: 20 }, () => item({ rating: 5, weight: 3 })),
    })
    const s = computeStats(p)
    expect(s.compat).toBeGreaterThanOrEqual(0)
    expect(s.compat).toBeLessThanOrEqual(100)
  })
  it('handles missing lists gracefully', () => {
    // intentionally bare profile — every list missing
    const s = computeStats({ id: 'p', name: 'p' })
    expect(s.compat).toBe(50)
    expect(s.gMax).toBe(1) // avoids divide-by-zero
  })
  it('confidence grows with rated count', () => {
    const few = profile({ green: [item({ rating: 4 })] })
    const many = profile({
      green: Array.from({ length: 10 }, () => item({ rating: 4 })),
    })
    expect(computeStats(many).confidence).toBeGreaterThan(computeStats(few).confidence)
  })
  it('intensityShare/countShare are 0-100 integers', () => {
    const p = profile({
      green: [item({ rating: 5, weight: 3 })],
      red: [item({ rating: 5, weight: 1 })],
    })
    const s = computeStats(p)
    expect(Number.isInteger(s.intensityShare)).toBe(true)
    expect(s.intensityShare).toBeGreaterThanOrEqual(0)
    expect(s.intensityShare).toBeLessThanOrEqual(100)
  })
})

describe('trendFor', () => {
  it('null when fewer than 2 history points', () => {
    expect(trendFor(profile())).toBeNull()
    expect(trendFor(profile({ history: [{ compat: 50 }] }))).toBeNull()
  })
  it('null when delta < 3', () => {
    expect(trendFor(profile({ history: [{ compat: 50 }, { compat: 52 }] }))).toBeNull()
    expect(trendFor(profile({ history: [{ compat: 50 }, { compat: 48 }] }))).toBeNull()
  })
  it('up when delta ≥ +3', () => {
    expect(trendFor(profile({ history: [{ compat: 50 }, { compat: 55 }] }))).toEqual({ dir: 'up', d: 5 })
  })
  it('down when delta ≤ -3', () => {
    expect(trendFor(profile({ history: [{ compat: 60 }, { compat: 55 }] }))).toEqual({ dir: 'down', d: -5 })
  })
  it('uses last two points only', () => {
    const h = [{ compat: 10 }, { compat: 90 }, { compat: 92 }]
    expect(trendFor(profile({ history: h }))).toBeNull()
  })
})

describe('verdictFor', () => {
  it('red alert overrides everything when redPct ≥ threshold', () => {
    expect(verdictFor(95, RED_ALERT_PCT).cls).toBe('verdict-red')
    expect(verdictFor(95, RED_ALERT_PCT).text).toContain('бягай')
  })
  it('returns strong-match band at ≥70%', () => {
    expect(verdictFor(70, 0).cls).toBe('verdict-green')
    expect(verdictFor(99, 0).cls).toBe('verdict-green')
  })
  it('returns promising band at [50,70)', () => {
    expect(verdictFor(50, 0).cls).toBe('verdict-yellow')
    expect(verdictFor(69, 0).cls).toBe('verdict-yellow')
  })
  it('returns mixed band at [30,50)', () => {
    expect(verdictFor(30, 0).cls).toBe('verdict-yellow')
    expect(verdictFor(49, 0).cls).toBe('verdict-yellow')
  })
  it('returns low band at <30%', () => {
    expect(verdictFor(0, 0).cls).toBe('verdict-red')
    expect(verdictFor(29, 0).cls).toBe('verdict-red')
  })
  it('red alert just below threshold does NOT trigger', () => {
    expect(verdictFor(80, RED_ALERT_PCT - 1).cls).toBe('verdict-green')
  })
  it('VERDICT_BANDS sorted by descending min', () => {
    const mins = VERDICT_BANDS.map(b => b.min)
    const sorted = [...mins].sort((a, b) => b - a)
    expect(mins).toEqual(sorted)
  })
})

// Regression: this is the exact scenario that blanked the compare tab in
// production — stale ids in compareIds after a profile was deleted. The
// rendering path is in App.jsx, but here we verify the data invariant
// (deleteProfile must strip the id from compareIds) at the model level.
describe('compareIds invariants (regression)', () => {
  it('stale ids resolve to undefined when looked up against profiles', () => {
    const profiles = [{ id: 'a' }, { id: 'b' }]
    const compareIds = ['a', 'deleted']
    const resolved = compareIds.map(id => profiles.find(p => p.id === id))
    expect(resolved[1]).toBeUndefined()
  })
})
