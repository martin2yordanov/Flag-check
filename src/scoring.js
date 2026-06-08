// Pure scoring + state helpers. Kept side-effect free so they can be unit tested
// without touching React / DOM / localStorage. App.jsx is the only consumer.

export const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2,8)}`
export const today = () => new Date().toISOString().slice(0,10)

export const LISTS = ['green', 'red', 'musthaves', 'dealbreakers']
export const CATEGORY_IDS = ['sex', 'eq', 'qualities', 'personal']
export const DEFAULT_CATEGORY = 'personal'

export const newItem = (text) => ({
  id: uid(), text, rating: 0, weight: 2, category: DEFAULT_CATEGORY, note: '', ratedAt: null,
})
export const makeItems = (texts) => texts.map(newItem)

export const makeProfile = (name) => ({
  id: uid(), name, createdAt: Date.now(),
  green: [],
  red: [],
  musthaves: [],
  dealbreakers: [],
  history: [],
  journal: [],
})

export const normalizeItem = (i) => {
  const rating = typeof i.rating === 'number'
    ? i.rating
    : (i.checked ? 3 : 0)
  const ratedAt = i.ratedAt ?? i.checkedAt ?? null
  // Per-item numeric weight 1-3 is the only importance signal now.
  // Clamp legacy values (old 1-5 scale) into the new 1-3 range so prior data keeps its high-importance intent.
  const weight = typeof i.weight === 'number' ? Math.min(3, Math.max(1, Math.round(i.weight))) : 2
  const category = CATEGORY_IDS.includes(i.category) ? i.category : DEFAULT_CATEGORY
  return {
    note: '',
    ...i,
    rating,
    ratedAt,
    weight,
    category,
  }
}

export function normalizeState(p) {
  if (!p || !p.profiles?.length) return null
  p.profiles.forEach((pr, idx) => {
    pr.name = (pr.name && pr.name.trim()) ? pr.name : `Профил ${idx + 1}`
    pr.green = (pr.green || []).map(normalizeItem)
    pr.red = (pr.red || []).map(normalizeItem)
    pr.musthaves = (pr.musthaves || []).map(normalizeItem)
    pr.dealbreakers = (pr.dealbreakers || []).map(normalizeItem)
    // Migrate legacy red items flagged dealbreaker:true into the dealbreakers list.
    const legacyDB = pr.red.filter(i => i.dealbreaker)
    if (legacyDB.length) {
      pr.red = pr.red.filter(i => !i.dealbreaker)
      pr.dealbreakers = [...pr.dealbreakers, ...legacyDB.map(({ dealbreaker, ...rest }) => rest)]
    }
    pr.journal = pr.journal || []
  })
  p.streak = p.streak || { count: 0, lastDay: null }
  p.apiKey = p.apiKey || ''
  p.compareIds = p.compareIds || []
  return p
}

export function defaultState() {
  const def = makeProfile('Профил 1')
  return { profiles: [def], activeId: def.id, streak: { count: 0, lastDay: null }, apiKey: '', compareIds: [] }
}

// Each flag contributes rating × per-item weight (1-3).
export const itemScore = (i) => i.rating * (i.weight || 2)
export const itemMax = (i) => 5 * (i.weight || 2)

// Stable sort by weight desc (3 on top → 1 at bottom); equal weights keep their
// manual (array) order, so manual reordering within a weight group is preserved.
export const byWeightDesc = (items) => [...items].sort((a, b) => (b.weight || 2) - (a.weight || 2))

export function computeStats(profile) {
  const g = [...(profile.green || []), ...(profile.musthaves || [])]
  const r = [...(profile.red || []), ...(profile.dealbreakers || [])]
  const gMax = g.reduce((s,i)=>s + itemMax(i), 0) || 1
  const gScore = g.reduce((s,i)=>s + itemScore(i), 0)
  const rMax = r.reduce((s,i)=>s + itemMax(i), 0) || 1
  const rScore = r.reduce((s,i)=>s + itemScore(i), 0)
  const greenPct = Math.round((gScore / gMax) * 100)
  const redPct = Math.round((rScore / rMax) * 100)

  const ratedG = g.filter(i => i.rating > 0)
  const ratedR = r.filter(i => i.rating > 0)
  const nG = ratedG.length, nR = ratedR.length, n = nG + nR
  const intensityShare = (gScore + rScore) > 0 ? gScore / (gScore + rScore) : 0.5
  const countShare = (nG + nR) > 0 ? nG / (nG + nR) : 0.5
  const blended = 0.7 * intensityShare + 0.3 * countShare
  const PRIOR_STRENGTH = 4
  const compat01 = (n * blended + PRIOR_STRENGTH * 0.5) / (n + PRIOR_STRENGTH)
  const compat = Math.max(0, Math.min(100, Math.round(compat01 * 100)))
  const confidence = Math.round((n / (n + PRIOR_STRENGTH)) * 100)
  const gCount = nG, rCount = nR

  const triggeredDealbreakers = (profile.dealbreakers || []).filter(i => i.rating > 0).map(i => i.text)
  const unmetMusthaves = (profile.musthaves || []).filter(i => i.rating === 0).map(i => i.text)
  return {
    greenChecked: g.filter(i=>i.rating > 0).length, greenTotal: g.length,
    redChecked: r.filter(i=>i.rating > 0).length, redTotal: r.length,
    greenPct, redPct, compat, confidence, ratedCount: n, triggeredDealbreakers, unmetMusthaves,
    intensityShare: Math.round(intensityShare * 100), countShare: Math.round(countShare * 100),
    gCount, rCount,
    gScore, gMax, rScore, rMax,
  }
}

export const RED_ALERT_PCT = 40
export const VERDICT_BANDS = [
  { min: 70, text: '✨ Силен мач — продължи', cls: 'verdict-green' },
  { min: 50, text: '👀 Обещаващо — наблюдавай', cls: 'verdict-yellow' },
  { min: 30, text: '⚠️ Смесени сигнали — внимавай', cls: 'verdict-yellow' },
  { min: 0,  text: '❌ Ниска съвместимост', cls: 'verdict-red' },
]

export function trendFor(profile) {
  const h = profile.history || []
  if (h.length < 2) return null
  const last = h[h.length - 1].compat
  const prev = h[h.length - 2].compat
  const d = last - prev
  if (Math.abs(d) < 3) return null
  return d > 0 ? { dir: 'up', d } : { dir: 'down', d }
}

export function verdictFor(compat, redPct) {
  if (redPct >= RED_ALERT_PCT) return { text: '🚩 Прекалено много червени флагове — бягай', cls: 'verdict-red' }
  return VERDICT_BANDS.find(b => compat >= b.min) || VERDICT_BANDS[VERDICT_BANDS.length - 1]
}
