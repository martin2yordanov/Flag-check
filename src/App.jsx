import { useState, useEffect, useMemo, useRef, Fragment } from 'react'
import { Show, SignIn, UserButton, useAuth, useUser } from '@clerk/react'
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  pointerWithin,
  closestCenter,
  useDraggable,
  useDroppable,
  DragOverlay,
} from '@dnd-kit/core'
import {
  SortableContext,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  KeyRound, FileDown, Save, Pencil, Plus, X, ChevronDown, ChevronRight,
  GripVertical, Flag, Sparkles, Brain, Flame, BarChart3, Table as TableIcon,
  BookOpen, GitCompare, Check, AlertTriangle, TrendingUp, TrendingDown,
  Loader2, CloudOff, CloudCheck, Download, Upload, Trash2, Star, ArrowUpDown, Ban, Copy, Eye, EyeOff, Database,
} from 'lucide-react'
import './App.css'

// Injected by vite.config.js at build time; bumps on every push (git commit count).
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '3.2.0'

const DEFAULT_GREEN = []
const DEFAULT_RED = []

const STORAGE_KEY_PREFIX = 'flag-check-v3'
const LEGACY_STORAGE_KEY = 'flag-check-v3'
const storageKey = (userId) => userId ? `${STORAGE_KEY_PREFIX}:${userId}` : STORAGE_KEY_PREFIX
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2,8)}`
const today = () => new Date().toISOString().slice(0,10)

const LISTS = ['green', 'red', 'musthaves', 'dealbreakers']
const CATEGORIES = [
  { id: 'sex', label: 'Секс', color: '#ff5d8f', icon: '🔥' },
  { id: 'eq', label: 'Емоционална интелигентност', color: '#579bfc', icon: '🧠' },
  { id: 'qualities', label: 'Качества', color: '#00c875', icon: '⭐' },
  { id: 'personal', label: 'Личен живот', color: '#a25ddc', icon: '🏠' },
]
const CATEGORY_IDS = CATEGORIES.map(c => c.id)
const DEFAULT_CATEGORY = 'personal'

// Curated suggestion library with gendered Bulgarian wording: f = evaluating a
// woman, m = evaluating a man. Picked via the user's onboarding choice.
const SUGGESTED = {
  green: [
    { f: 'Плаща си сама сметката', m: 'Плаща си сам сметката', category: 'qualities' },
    { f: 'Пита за мнението ми и се вслушва в съветите ми', m: 'Пита за мнението ми и се вслушва в съветите ми', category: 'eq' },
    { f: 'Признава кога греши и се извинява първа', m: 'Признава кога греши и се извинява първи', category: 'eq' },
    { f: 'Има доверие — не рови в телефона ми', m: 'Има доверие — не рови в телефона ми', category: 'personal' },
    { f: 'Говори ме хубаво пред други хора', m: 'Говори ме хубаво пред други хора', category: 'eq' },
    { f: 'Не вади стари кавги по време на нов спор', m: 'Не вади стари кавги по време на нов спор', category: 'eq' },
    { f: 'Финансово отговорна — не живее над възможностите си', m: 'Финансово отговорен — не живее над възможностите си', category: 'qualities' },
    { f: 'Уважава времето ми с приятели и семейство', m: 'Уважава времето ми с приятели и семейство', category: 'personal' },
    { f: 'Приема ме такъв, не се опитва да ме „поправя“', m: 'Приема ме такъв, не се опитва да ме „поправя“', category: 'qualities' },
    { f: 'Поема инициатива за планове, не чака само мен', m: 'Поема инициатива за планове, не чака само мен', category: 'personal' },
    { f: 'Любопитна и се развива — чете, учи, има интереси', m: 'Любопитен и се развива — чете, учи, има интереси', category: 'qualities' },
    { f: 'Спокойна е около мои колежки и приятелки', m: 'Спокоен е около мои колеги и приятели', category: 'eq' },
  ],
  red: [
    { f: 'Синдром на жертвата', m: 'Синдром на жертвата', category: 'qualities' },
    { f: 'Тества ме с игрички и мълчаливи проверки', m: 'Тества ме с игрички и мълчаливи проверки', category: 'eq' },
    { f: 'Флиртува с други, за да ме ревнува', m: 'Флиртува с други, за да ме ревнува', category: 'personal' },
    { f: 'Сравнява ме с бившите си', m: 'Сравнява ме с бившите си', category: 'eq' },
    { f: 'Заплашва с раздяла при всеки спор', m: 'Заплашва с раздяла при всеки спор', category: 'eq' },
    { f: 'Говори лошо за мен пред приятелките си', m: 'Говори лошо за мен пред приятелите си', category: 'eq' },
    { f: 'Социалните мрежи са ѝ по-важни', m: 'Социалните мрежи са му по-важни', category: 'personal' },
    { f: 'Лъже за дребни неща', m: 'Лъже за дребни неща', category: 'qualities' },
    { f: 'Държи се различно на публично и насаме', m: 'Държи се различно на публично и насаме', category: 'qualities' },
    { f: 'Прекалено зависима — не може да е сама', m: 'Прекалено зависим — не може да е сам', category: 'personal' },
    { f: 'Импулсивно харчене / разчита само на мен финансово', m: 'Импулсивно харчене / разчита само на мен финансово', category: 'qualities' },
  ],
}
const genderText = (s, gender) => (gender === 'male' ? s.m : s.f)

// Default left→right order of the editable table's columns (notes last).
const TABLE_COL_IDS = ['actions', 'color', 'name', 'rating', 'weight', 'points', 'note']
const COL_ORDER_KEY = 'flag-check-table-cols'
const loadColOrder = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(COL_ORDER_KEY))
    if (Array.isArray(saved)) {
      const valid = saved.filter(id => TABLE_COL_IDS.includes(id))
      const missing = TABLE_COL_IDS.filter(id => !valid.includes(id))
      return [...valid, ...missing]
    }
  } catch {}
  return TABLE_COL_IDS
}
const saveColOrder = (o) => { try { localStorage.setItem(COL_ORDER_KEY, JSON.stringify(o)) } catch {} }
const newItem = (text) => ({
  id: uid(), text, rating: 0, weight: 2, category: DEFAULT_CATEGORY, note: '', ratedAt: null,
})
const makeItems = (texts) => texts.map(newItem)

const makeProfile = (name) => ({
  id: uid(), name, createdAt: Date.now(),
  green: makeItems(DEFAULT_GREEN),
  red: makeItems(DEFAULT_RED),
  musthaves: [],
  dealbreakers: [],
  history: [],
  journal: [],
})

const normalizeItem = (i) => {
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

function normalizeState(p) {
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
  p.gender = (p.gender === 'male' || p.gender === 'female') ? p.gender : 'female'
  // Existing users (already have any flags/history) skip onboarding.
  if (typeof p.onboarded !== 'boolean') {
    p.onboarded = p.profiles.some(pr =>
      (pr.green?.length || pr.red?.length || pr.musthaves?.length || pr.dealbreakers?.length || pr.history?.length))
  }
  return p
}

function defaultState() {
  const def = makeProfile('Профил 1')
  return { profiles: [def], activeId: def.id, streak: { count: 0, lastDay: null }, apiKey: '', compareIds: [], gender: 'female', onboarded: false }
}

function loadLocal(userId) {
  // Prefer user-namespaced key; fall back to legacy unscoped key once for migration.
  try {
    const ns = localStorage.getItem(storageKey(userId))
    if (ns) {
      const p = normalizeState(JSON.parse(ns))
      if (p) return p
    }
    if (userId) {
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
      if (legacy) {
        const p = normalizeState(JSON.parse(legacy))
        if (p) return p
      }
    }
  } catch {}
  return defaultState()
}

// Each flag contributes rating × per-item weight (1-3).
const itemScore = (i) => i.rating * (i.weight || 2)
const itemMax = (i) => 5 * (i.weight || 2)

// Stable sort by weight desc (3 on top → 1 at bottom); equal weights keep their
// manual (array) order, so manual reordering within a weight group is preserved.
const byWeightDesc = (items) => [...items].sort((a, b) => (b.weight || 2) - (a.weight || 2))

function computeStats(profile) {
  const g = [...(profile.green || []), ...(profile.musthaves || [])]
  const r = [...(profile.red || []), ...(profile.dealbreakers || [])]
  const gMax = g.reduce((s,i)=>s + itemMax(i), 0) || 1
  const gScore = g.reduce((s,i)=>s + itemScore(i), 0)
  const rMax = r.reduce((s,i)=>s + itemMax(i), 0) || 1
  const rScore = r.reduce((s,i)=>s + itemScore(i), 0)
  const greenPct = Math.round((gScore / gMax) * 100)
  const redPct = Math.round((rScore / rMax) * 100)

  // Compatibility — count ONLY rated flags (rating > 0); unrated/empty flags
  // are excluded from the equation. Blends:
  //   (a) intensityShare = green weighted points / (green + red points)  [70%]
  //   (b) countShare     = # rated green flags / (rated green + red)     [30%]
  // then applies a Bayesian shrinkage toward neutral 0.5 (IMDb/Evan-Miller style)
  // so a couple of rated flags don't produce an overconfident score.
  const ratedG = g.filter(i => i.rating > 0)
  const ratedR = r.filter(i => i.rating > 0)
  const nG = ratedG.length, nR = ratedR.length, n = nG + nR
  const intensityShare = (gScore + rScore) > 0 ? gScore / (gScore + rScore) : 0.5
  const countShare = (nG + nR) > 0 ? nG / (nG + nR) : 0.5
  const blended = 0.7 * intensityShare + 0.3 * countShare
  const PRIOR_STRENGTH = 4 // "virtual" neutral flags; ~50% confidence at 4 rated flags
  const compat01 = (n * blended + PRIOR_STRENGTH * 0.5) / (n + PRIOR_STRENGTH)
  const compat = Math.max(0, Math.min(100, Math.round(compat01 * 100)))
  const confidence = Math.round((n / (n + PRIOR_STRENGTH)) * 100)
  const gCount = nG, rCount = nR

  // Gates: triggered dealbreakers (present red) and unmet must-haves (absent green).
  const triggeredDealbreakers = (profile.dealbreakers || []).filter(i => i.rating > 0).map(i => i.text)
  const unmetMusthaves = (profile.musthaves || []).filter(i => i.rating === 0).map(i => i.text)
  return {
    greenChecked: g.filter(i=>i.rating > 0).length, greenTotal: g.length,
    redChecked: r.filter(i=>i.rating > 0).length, redTotal: r.length,
    greenPct, redPct, compat, confidence, ratedCount: n, triggeredDealbreakers, unmetMusthaves,
    intensityShare: Math.round(intensityShare * 100), countShare: Math.round(countShare * 100),
    gCount, rCount,
    // Weighted-point breakdown so the compatibility number is transparent.
    gScore, gMax, rScore, rMax,
  }
}

// Verdict thresholds, surfaced in the UI legend so the bands aren't magic numbers.
const RED_ALERT_PCT = 40
const VERDICT_BANDS = [
  { min: 70, text: '✨ Силен мач — продължи', cls: 'verdict-green' },
  { min: 50, text: '👀 Обещаващо — наблюдавай', cls: 'verdict-yellow' },
  { min: 30, text: '⚠️ Смесени сигнали — внимавай', cls: 'verdict-yellow' },
  { min: 0,  text: '❌ Ниска съвместимост', cls: 'verdict-red' },
]

function trendFor(profile) {
  const h = profile.history || []
  if (h.length < 2) return null
  const last = h[h.length - 1].compat
  const prev = h[h.length - 2].compat
  const d = last - prev
  if (Math.abs(d) < 3) return null
  return d > 0 ? { dir: 'up', d } : { dir: 'down', d }
}

function verdictFor(compat, redPct) {
  if (redPct >= RED_ALERT_PCT) return { text: '🚩 Прекалено много червени флагове — бягай', cls: 'verdict-red' }
  return VERDICT_BANDS.find(b => compat >= b.min) || VERDICT_BANDS[VERDICT_BANDS.length - 1]
}

export default function App() {
  return (
    <Fragment>
      <Show when="signed-out">
        <SignInScreen />
      </Show>
      <Show when="signed-in">
        <FlagCheckApp />
      </Show>
    </Fragment>
  )
}

function SignInScreen() {
  return (
    <div className="auth-screen">
      <div className="auth-header">
        <h1>Flag Check</h1>
        <p>Влез или регистрирай се, за да синхронизираш профилите си между устройства.</p>
      </div>
      <SignIn routing="hash" signUpUrl="#/sign-up" />
    </div>
  )
}

function Onboarding({ onChoose }) {
  return (
    <div className="onboarding">
      <div className="onboarding-inner">
        <Flag size={40} className="logo-icon" />
        <h1>Добре дошъл във Flag Check</h1>
        <p>Кого ще оценяваш? Това нагласява езика и предложенията.</p>
        <div className="onboarding-choices">
          <button className="onboarding-btn ob-female" onClick={() => onChoose('female')}>
            <span className="ob-emoji">♀</span>
            <span className="ob-label">Оценявам жени</span>
          </button>
          <button className="onboarding-btn ob-male" onClick={() => onChoose('male')}>
            <span className="ob-emoji">♂</span>
            <span className="ob-label">Оценявам мъже</span>
          </button>
        </div>
        <p className="onboarding-note">Това нагласява само езика на предложенията.</p>
      </div>
    </div>
  )
}

function FlagCheckApp() {
  const { userId, getToken, isLoaded: authLoaded } = useAuth()
  const { user } = useUser()
  const [state, setState] = useState(() => loadLocal(userId))
  const [tab, setTab] = useState('flags')
  const [expanded, setExpanded] = useState({})
  const [newGreen, setNewGreen] = useState('')
  const [newRed, setNewRed] = useState('')
  const [modal, setModal] = useState(null)
  const [modalInput, setModalInput] = useState('')
  const [editingProfile, setEditingProfile] = useState(null)
  const [profileDraft, setProfileDraft] = useState('')
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [insight, setInsight] = useState({ loading: false, text: '', error: '' })
  const [journalText, setJournalText] = useState('')
  const [journalMood, setJournalMood] = useState('')
  const [syncStatus, setSyncStatus] = useState('idle') // idle | loading | saving | error | conflict
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const [conflict, setConflict] = useState(null) // { data, updated_at } from server when a remote edit clobbered ours
  const hydratedRef = useRef(false)
  const saveTimerRef = useRef(null)
  const serverUpdatedAtRef = useRef(null) // last updated_at we've successfully synced with the server

  // Initial pull from server on auth ready.
  useEffect(() => {
    if (!authLoaded || !userId) return
    let cancelled = false
    ;(async () => {
      setSyncStatus('loading')
      try {
        const token = await getToken()
        const res = await fetch('/api/data', { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) throw new Error(`GET /api/data ${res.status}`)
        const body = await res.json()
        if (cancelled) return
        if (body.data && typeof body.data === 'object' && Array.isArray(body.data.profiles)) {
          const norm = normalizeState(body.data) || defaultState()
          setState(norm)
        }
        serverUpdatedAtRef.current = body.updated_at ?? null
        hydratedRef.current = true
        setSyncStatus('idle')
        setLastSavedAt(Date.now())
      } catch (e) {
        console.warn('Initial sync failed; using local cache.', e)
        hydratedRef.current = true
        setSyncStatus('error')
      }
    })()
    return () => { cancelled = true }
  }, [authLoaded, userId, getToken])

  // Persist locally + debounced PUT to server.
  useEffect(() => {
    try { localStorage.setItem(storageKey(userId), JSON.stringify(state)) } catch {}
    if (!hydratedRef.current || !userId) return
    // Don't auto-save over an unresolved conflict; wait for the user to choose.
    if (conflict) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      setSyncStatus('saving')
      try {
        const token = await getToken()
        const res = await fetch('/api/data', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ data: state, baseUpdatedAt: serverUpdatedAtRef.current }),
        })
        if (res.status === 409) {
          const body = await res.json()
          console.warn('Sync conflict: server has a newer version.')
          setConflict({ data: body.data, updated_at: body.updated_at })
          setSyncStatus('conflict')
          return
        }
        if (!res.ok) throw new Error(`PUT /api/data ${res.status}`)
        const body = await res.json()
        serverUpdatedAtRef.current = body.updated_at ?? serverUpdatedAtRef.current
        setSyncStatus('idle')
        setLastSavedAt(Date.now())
      } catch (e) {
        console.warn('Sync save failed; local cache retained.', e)
        setSyncStatus('error')
      }
    }, 800)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [state, userId, getToken, conflict])

  useEffect(() => {
    const t = today()
    setState(s => {
      const last = s.streak?.lastDay
      if (last === t) return s
      let newCount = 1
      if (last) {
        const lastDate = new Date(last)
        const todayDate = new Date(t)
        const diffDays = Math.round((todayDate - lastDate) / 86400000)
        if (diffDays === 1) newCount = (s.streak.count || 0) + 1
        else if (diffDays > 1) newCount = 1
      }
      return { ...s, streak: { count: newCount, lastDay: t } }
    })
  }, [])

  const active = state.profiles.find(p => p.id === state.activeId) || state.profiles[0]
  const stats = useMemo(() => computeStats(active), [active])
  const trend = useMemo(() => trendFor(active), [active])

  const updateActive = (mut) => {
    setState(s => ({ ...s, profiles: s.profiles.map(p => p.id === active.id ? mut(p) : p) }))
  }

  // Mutations operate by item id across every list (green/red/musthaves/dealbreakers).
  const mapLists = (p, fn) => {
    const np = { ...p }
    for (const k of LISTS) np[k] = (p[k] || []).map(fn)
    return np
  }
  const setRating = (id, n) => {
    updateActive(p => mapLists(p, it => {
      if (it.id !== id) return it
      const next = it.rating === n ? 0 : n
      return { ...it, rating: next, ratedAt: next > 0 ? Date.now() : null }
    }))
    setBannerDismissed(false)
  }
  const updateItem = (id, patch) => updateActive(p => {
    const np = {}
    for (const k of LISTS) {
      const arr = p[k] || []
      const idx = arr.findIndex(i => i.id === id)
      if (idx === -1) { np[k] = arr; continue }
      const item = arr[idx]
      const updated = { ...item, ...patch }
      // When weight changes, reposition so it lands at the edge of its new weight
      // group: heavier → end of array (bottom of the higher group), lighter →
      // front (top of the lower group). Display is stable-sorted by weight desc.
      if (patch.weight != null && patch.weight !== (item.weight || 2)) {
        const rest = arr.filter(i => i.id !== id)
        np[k] = patch.weight > (item.weight || 2) ? [...rest, updated] : [updated, ...rest]
      } else {
        np[k] = arr.map(i => i.id === id ? updated : i)
      }
    }
    return np
  })
  const removeItem = (id) => updateActive(p => {
    const np = { ...p }
    for (const k of LISTS) np[k] = (p[k] || []).filter(it => it.id !== id)
    return np
  })
  // Drag-and-drop relocate: move an item to another list/category and optionally
  // insert it before a given item (enables reordering within a list/category).
  const moveItem = (id, toListKey, { category, beforeId } = {}) => updateActive(p => {
    let moved = null
    const np = {}
    for (const k of LISTS) {
      np[k] = []
      for (const it of (p[k] || [])) {
        if (it.id === id) moved = it
        else np[k].push(it)
      }
    }
    if (!moved) return p
    if (category) moved = { ...moved, category }
    const target = np[toListKey]
    const idx = beforeId ? target.findIndex(it => it.id === beforeId) : -1
    if (idx >= 0) target.splice(idx, 0, moved)
    else target.push(moved)
    return { ...p, ...np }
  })
  const addItem = (which, text, setText) => {
    const v = text.trim(); if (!v) return
    updateActive(p => ({ ...p, [which]: [...(p[which] || []), newItem(v)] }))
    setText('')
  }
  // Add a suggested flag (with a preset category) to the current profile.
  const addFlag = (which, text, category) => {
    updateActive(p => ({ ...p, [which]: [...(p[which] || []), { ...newItem(text), category }] }))
  }
  const catLabel = (id) => CATEGORIES.find(c => c.id === id)?.label || ''
  // Suggestion pool = curated (gendered) + every flag the user has typed across
  // all their profiles (harvested at runtime), deduped by text.
  const suggestionsFor = (which) => {
    const out = []
    const seen = new Set()
    const add = (text, category) => {
      const key = (text || '').trim().toLowerCase()
      if (!key || seen.has(key)) return
      seen.add(key)
      out.push({ text, category })
    }
    ;(SUGGESTED[which] || []).forEach(s => add(genderText(s, state.gender), s.category))
    state.profiles.forEach(p => {
      const lists = which === 'green' ? [p.green, p.musthaves] : [p.red, p.dealbreakers]
      lists.forEach(l => (l || []).forEach(i => add(i.text, i.category)))
    })
    return out
  }
  const hasFlag = (which, text) => {
    const t = text.trim().toLowerCase()
    const lists = which === 'green' ? [active.green, active.musthaves] : [active.red, active.dealbreakers]
    return lists.some(l => (l || []).some(i => (i.text || '').trim().toLowerCase() === t))
  }

  const addProfile = () => { setModal({ type: 'newProfile' }); setModalInput('') }
  const setApiKey = () => { setModal({ type: 'apiKey' }); setModalInput(state.apiKey || '') }
  const renameProfile = () => { setModal({ type: 'renameProfile' }); setModalInput(active?.name || '') }
  const openCopyFrom = () => setModal({ type: 'copyFrom' })
  // Copy all flags from a source profile into the active one, preserving text,
  // category, weight (but resetting the per-profile rating — same criteria,
  // different evaluation). Skips entries with text already in the active list.
  const copyFromProfile = (sourceId) => {
    const source = state.profiles.find(p => p.id === sourceId)
    if (!source || source.id === active.id) { setModal(null); return }
    const cloneItems = (existing, incoming) => {
      const have = new Set((existing || []).map(i => (i.text || '').trim().toLowerCase()))
      const fresh = (incoming || [])
        .filter(i => !have.has((i.text || '').trim().toLowerCase()))
        .map(i => ({
          id: uid(),
          text: i.text,
          category: i.category || DEFAULT_CATEGORY,
          weight: i.weight || 2,
          rating: 0,
          ratedAt: null,
          note: '',
        }))
      return [...(existing || []), ...fresh]
    }
    updateActive(p => ({
      ...p,
      green: cloneItems(p.green, source.green),
      red: cloneItems(p.red, source.red),
      musthaves: cloneItems(p.musthaves, source.musthaves),
      dealbreakers: cloneItems(p.dealbreakers, source.dealbreakers),
    }))
    setModal(null)
  }
  const confirmModal = () => {
    if (modal?.type === 'newProfile') {
      const name = modalInput.trim() || `Профил ${state.profiles.length + 1}`
      const p = makeProfile(name)
      setState(s => ({ ...s, profiles: [...s.profiles, p], activeId: p.id }))
    } else if (modal?.type === 'apiKey') {
      setState(s => ({ ...s, apiKey: modalInput.trim() }))
    } else if (modal?.type === 'renameProfile') {
      const name = modalInput.trim()
      if (name) updateActive(p => ({ ...p, name }))
    }
    setModal(null)
  }
  const switchProfile = (id) => setState(s => ({ ...s, activeId: id }))
  const commitProfileName = (id) => {
    const v = profileDraft.trim()
    if (v) setState(s => ({ ...s, profiles: s.profiles.map(p => p.id === id ? { ...p, name: v } : p) }))
    setEditingProfile(null)
  }
  const setCompareSlot = (slot, id) => {
    setState(s => {
      const cur = [...(s.compareIds || [])]
      cur[slot] = id
      return { ...s, compareIds: cur }
    })
  }
  const deleteProfile = (id) => {
    if (state.profiles.length <= 1) { alert('Трябва поне един профил.'); return }
    if (!confirm('Изтрий този профил?')) return
    setState(s => {
      const remaining = s.profiles.filter(p => p.id !== id)
      return { ...s, profiles: remaining, activeId: s.activeId === id ? remaining[0].id : s.activeId }
    })
  }

  // Conflict resolution: keep the server's version (discard local edits).
  const resolveConflictKeepServer = () => {
    if (!conflict) return
    const norm = normalizeState(conflict.data) || defaultState()
    serverUpdatedAtRef.current = conflict.updated_at ?? null
    setConflict(null)
    setState(norm)
    setSyncStatus('idle')
    setLastSavedAt(Date.now())
  }

  // Conflict resolution: force-push local edits, overwriting the server.
  const resolveConflictKeepMine = async () => {
    if (!conflict) return
    setSyncStatus('saving')
    try {
      const token = await getToken()
      const res = await fetch('/api/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ data: state, force: true }),
      })
      if (!res.ok) throw new Error(`PUT /api/data ${res.status}`)
      const body = await res.json()
      serverUpdatedAtRef.current = body.updated_at ?? null
      setConflict(null)
      setSyncStatus('idle')
      setLastSavedAt(Date.now())
    } catch (e) {
      console.warn('Force overwrite failed.', e)
      setSyncStatus('error')
    }
  }

  const snapshot = () => {
    const s = computeStats(active)
    updateActive(p => ({
      ...p,
      history: [...(p.history || []), { t: Date.now(), compat: s.compat, greenPct: s.greenPct, redPct: s.redPct }],
    }))
  }

  const addJournal = () => {
    const v = journalText.trim()
    if (!v && !journalMood) return
    updateActive(p => ({
      ...p,
      journal: [{ id: uid(), t: Date.now(), text: v, mood: journalMood }, ...(p.journal || [])],
    }))
    setJournalText('')
    setJournalMood('')
  }
  const deleteJournal = (id) => updateActive(p => ({ ...p, journal: p.journal.filter(j => j.id !== id) }))

  // Raw JSON backup: export the full state, and import (with confirmation) to restore.
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `flag-check-backup-${new Date().toISOString().slice(0,10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }
  const importInputRef = useRef(null)
  const triggerImport = () => importInputRef.current?.click()
  const importJson = (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-importing the same file
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      let norm
      try {
        norm = normalizeState(JSON.parse(reader.result))
      } catch {
        alert('Неуспешно четене на файла. Очаква се JSON архив от Flag Check.')
        return
      }
      if (!norm) { alert('Невалиден архивен файл — няма профили.'); return }
      if (!confirm('Това ще замени текущите профили с тези от архива. Продължи?')) return
      setState(norm)
    }
    reader.readAsText(file)
  }

  const [exporting, setExporting] = useState(false)
  const exportData = async () => {
    if (exporting) return
    setExporting(true)
    try {
      // Lazy-load the heavy PDF libraries only when the user actually exports.
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
      ])
      const node = document.getElementById('pdf-report')
      if (!node) return
      const canvas = await html2canvas(node, {
        backgroundColor: '#0a0a0c',
        scale: 2,
        useCORS: true,
        windowWidth: 800,
      })
      const imgData = canvas.toDataURL('image/png')
      // A4 portrait: 210 x 297 mm. Fit image width, scale height.
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const margin = 8
      const imgW = pageW - 2 * margin
      const imgH = (canvas.height * imgW) / canvas.width
      let position = margin
      let remaining = imgH
      // If image is taller than page, slice across pages.
      if (imgH <= pageH - 2 * margin) {
        pdf.addImage(imgData, 'PNG', margin, margin, imgW, imgH)
      } else {
        // Render full image, then offset y to break across pages.
        let y = margin
        let pageOffset = 0
        while (remaining > 0) {
          pdf.addImage(imgData, 'PNG', margin, y - pageOffset, imgW, imgH)
          remaining -= (pageH - 2 * margin)
          if (remaining > 0) {
            pdf.addPage()
            pageOffset += (pageH - 2 * margin)
            y = margin
          }
        }
      }
      pdf.save(`flag-check-${active.name}-${new Date().toISOString().slice(0,10)}.pdf`)
    } catch (e) {
      console.error('PDF export failed', e)
      alert('Грешка при експорт в PDF: ' + (e?.message || e))
    } finally {
      setExporting(false)
    }
  }

  const runInsight = async () => {
    if (!state.apiKey) { setApiKey(); return }
    setInsight({ loading: true, text: '', error: '' })
    const fmt = (i) => `${i.text} (rating ${i.rating}/5, weight ${i.weight})${i.note ? ' — ' + i.note : ''}`
    const greenAll = [...active.green, ...(active.musthaves || [])]
    const redAll = [...active.red, ...(active.dealbreakers || [])]
    const greenRated = greenAll.filter(i => i.rating > 0).map(fmt)
    const greenUnrated = greenAll.filter(i => i.rating === 0).map(i => i.text)
    const redRated = redAll.filter(i => i.rating > 0).map(i => `${fmt(i)}${(active.dealbreakers || []).some(d => d.id === i.id) ? ' [DEALBREAKER]' : ''}`)
    const redUnrated = redAll.filter(i => i.rating === 0).map(i => i.text)
    const musthaves = (active.musthaves || []).map(i => `${i.text}${i.rating === 0 ? ' [UNMET]' : ''}`)
    const journal = (active.journal || []).slice(0, 5).map(j => `[${new Date(j.t).toLocaleDateString()}${j.mood ? ' ' + j.mood : ''}] ${j.text}`)

    const prompt = `You are a brutally direct dating analyst. Respond in Bulgarian. Be concise (max 8 sentences total). No fluff, no preamble. Use short declarative sentences.

Subject: ${active.name}
Compatibility: ${stats.compat}% (green ${stats.greenPct}%, red ${stats.redPct}%)
Each flag is rated 1-5 (intensity) and has a numeric weight 1-3. Score contribution = rating × weight.
Must-haves are required green traits; unmet ones are serious. Dealbreakers are red traits that end it if present.

Must-haves: ${musthaves.join('; ') || 'none'}
Rated green flags: ${greenRated.join('; ') || 'none'}
Unrated green flags: ${greenUnrated.join('; ') || 'none'}
Rated red flags: ${redRated.join('; ') || 'none'}
Unrated red flags: ${redUnrated.join('; ') || 'none'}
Recent journal: ${journal.join(' | ') || 'none'}

Output exactly this structure in Bulgarian:
ОСНОВЕН РИСК: [едно изречение за най-големия риск]
НАЙ-СИЛЕН СИГНАЛ: [едно изречение за най-силния позитив]
ПРОВЕРИ СЛЕДВАЩО: [2 конкретни неща за тестване/наблюдение]
ПРИСЪДА: [продължи / внимавай / бягай — едно изречение обосновка]`

    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${state.apiKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 500,
          temperature: 0.7,
          messages: [{ role: 'user', content: prompt }],
        }),
      })
      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`API ${res.status}: ${errText.slice(0, 200)}`)
      }
      const data = await res.json()
      const text = data.choices?.[0]?.message?.content || 'Няма отговор'
      setInsight({ loading: false, text, error: '' })
    } catch (e) {
      setInsight({ loading: false, text: '', error: e.message })
    }
  }

  const verdict = verdictFor(stats.compat, stats.redPct)
  const dbBanner = (stats.triggeredDealbreakers.length > 0 || stats.unmetMusthaves.length > 0) && !bannerDismissed

  if (!state.onboarded) {
    return <Onboarding onChoose={(gender) => setState(s => ({ ...s, gender, onboarded: true }))} />
  }

  return (
    <div className="app">
      <header className="header">
        <h1>
          <Flag size={18} className="logo-icon" />
          Flag Check
          <span className="version">v{APP_VERSION}</span>
        </h1>
        <div className="header-actions">
          <SyncBadge status={syncStatus} lastSavedAt={lastSavedAt} />
          <button className="btn-ghost" onClick={exportData} disabled={exporting} title="Експорт в PDF" aria-label="Експорт в PDF">
            {exporting ? <Loader2 size={16} className="spin" /> : <FileDown size={16} />}
          </button>
          <button className="btn-ghost" onClick={() => setModal({ type: 'data' })} title="Архив (JSON)" aria-label="Архив (JSON)"><Database size={16} /></button>
          <input ref={importInputRef} type="file" accept="application/json,.json" onChange={importJson} style={{ display: 'none' }} />
          <button className="btn-ghost" onClick={snapshot} title="Запис на текущ резултат" aria-label="Запис"><Save size={16} /></button>
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      {state.streak.count > 1 && (
        <div className="streak-bar">
          <span className="streak-fire">🔥</span>
          <span className="streak-text">
            <span className="streak-num">{state.streak.count} поредни дни</span>
            {' · '}
            {active.history?.length > 0
              ? `Последен запис преди ${Math.round((Date.now() - active.history[active.history.length-1].t)/86400000)} д.`
              : 'Натисни 💾 за днешен запис'}
          </span>
        </div>
      )}

      {dbBanner && (
        <div className="banner banner-db">
          🚩
          <span>
            Активирана пречка: {stats.triggeredDealbreakers.join(', ')}
            {stats.unmetMusthaves.length > 0 && ` · Непокрито задължително: ${stats.unmetMusthaves.join(', ')}`}
          </span>
          <button className="banner-close" onClick={() => setBannerDismissed(true)}>×</button>
        </div>
      )}

      {conflict && (
        <div className="banner banner-conflict">
          ⚠️
          <span>
            Профилът е променен от друго устройство{conflict.updated_at ? ` (${new Date(conflict.updated_at).toLocaleString()})` : ''}.
            Запазването е спряно, за да не загубиш данни.
          </span>
          <button className="banner-action" onClick={resolveConflictKeepServer}>Зареди сървъра</button>
          <button className="banner-action banner-action-danger" onClick={resolveConflictKeepMine}>Запази моите</button>
        </div>
      )}

      <div className="profile-bar">
        {state.profiles.map((p, idx) => {
          const ps = computeStats(p)
          const tr = trendFor(p)
          const isCompare = (state.compareIds || []).includes(p.id)
          const name = p.name || `Профил ${idx + 1}`
          if (editingProfile === p.id) {
            return (
              <input
                key={p.id}
                className="profile-edit"
                autoFocus
                value={profileDraft}
                onChange={e => setProfileDraft(e.target.value)}
                onBlur={() => commitProfileName(p.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitProfileName(p.id)
                  if (e.key === 'Escape') setEditingProfile(null)
                }}
              />
            )
          }
          return (
            <button
              key={p.id}
              className={`profile-pill ${p.id === active.id ? 'active' : ''}`}
              onClick={() => switchProfile(p.id)}
              onDoubleClick={() => { setProfileDraft(name); setEditingProfile(p.id) }}
              title="Двоен клик за преименуване"
            >
              {name}
              <span className="pct"> {ps.compat}%</span>
              {tr && <span className={`trend ${tr.dir}`}>{tr.dir === 'up' ? '↑' : '↓'}</span>}
            </button>
          )
        })}
        <button className="profile-add" onClick={addProfile}>+ Нов</button>
        <button
          className="profile-add profile-copy"
          onClick={openCopyFrom}
          disabled={state.profiles.length < 2}
          title={state.profiles.length < 2 ? 'Няма друг профил за копиране' : 'Копирай флаговете от друг профил'}
        >
          <Copy size={13} /> Копирай от
        </button>
      </div>

      <div className="tabs">
        {[
          ['flags', 'Флагове', Flag],
          ['table', 'Таблица', TableIcon],
          ['journal', 'Дневник', BookOpen],
          ['compare', 'Сравнение', GitCompare],
          ['insights', 'AI', Brain],
        ].map(([t, label, Icon]) => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            <Icon size={14} className="tab-icon" />
            <span className="tab-label">{label}</span>
          </button>
        ))}
      </div>

      {tab === 'flags' && (
        <Fragment>
          <Board
            profile={active}
            onRate={setRating} onRemove={removeItem} onUpdate={updateItem} onMove={moveItem}
            addFlag={addFlag} hasFlag={hasFlag}
            suggestGreen={suggestionsFor('green')} suggestRed={suggestionsFor('red')}
            newGreen={newGreen} setNewGreen={setNewGreen} addGreen={() => addItem('green', newGreen, setNewGreen)}
            newRed={newRed} setNewRed={setNewRed} addRed={() => addItem('red', newRed, setNewRed)}
          />
          <section className="results">
            <Ring value={stats.greenPct} color="var(--green)" label="Зелено" sub={`${stats.greenChecked}/${stats.greenTotal}`} />
            <Ring value={stats.redPct} color="var(--red)" label="Червено" sub={`${stats.redChecked}/${stats.redTotal}`} />
            <Ring value={stats.compat} color="var(--accent)" label="Съвместимост" sub="претеглено" big />
          </section>
          <div className="score-breakdown card">
            <div className="score-breakdown-row">
              <span>Зелени · оценени</span>
              <span><strong style={{ color: 'var(--green)' }}>{stats.gScore}</strong> т. · {stats.gCount} оценени</span>
            </div>
            <div className="score-breakdown-row">
              <span>Червени · оценени</span>
              <span><strong style={{ color: 'var(--red)' }}>{stats.rScore}</strong> т. · {stats.rCount} оценени</span>
            </div>
            <div className="score-breakdown-row">
              <span>Интензитет (зелено дял)</span>
              <span>{stats.intensityShare}% <span style={{ color: 'var(--muted)' }}>· тегло 70%</span></span>
            </div>
            <div className="score-breakdown-row">
              <span>Баланс по брой (зелено дял)</span>
              <span>{stats.countShare}% <span style={{ color: 'var(--muted)' }}>· тегло 30%</span></span>
            </div>
            <div className="score-breakdown-row">
              <span>Увереност ({stats.ratedCount} оценени)</span>
              <span>{stats.confidence}% <span style={{ color: 'var(--muted)' }}>· тегли към 50% при малко данни</span></span>
            </div>
            <div className="score-breakdown-formula">
              Съвместимост = <strong>{stats.compat}%</strong>
            </div>
            <div className="score-breakdown-note">Броят се само оценени флагове (rating&gt;0). Малко данни → резултатът се притегля към неутрални 50% (Bayesian среднопретегляне).</div>
          </div>
          <div className={`verdict ${verdict.cls}`}>{verdict.text}</div>
          <details className="verdict-legend card">
            <summary>Как се определя присъдата?</summary>
            <ul>
              <li><span className="legend-dot legend-red" />Червено ≥ {RED_ALERT_PCT}% → „бягай“ (има приоритет над всичко)</li>
              {VERDICT_BANDS.map(b => (
                <li key={b.min}>
                  <span className={`legend-dot ${b.cls === 'verdict-green' ? 'legend-green' : b.cls === 'verdict-red' ? 'legend-red' : 'legend-yellow'}`} />
                  Съвместимост ≥ {b.min}% → {b.text}
                </li>
              ))}
            </ul>
          </details>
          <section className="gates">
            <div className="gate-block gate-red">
              <div className="gate-title"><Ban size={13} /> Активни пречки</div>
              {stats.triggeredDealbreakers.length > 0
                ? <ul>{stats.triggeredDealbreakers.map((t, i) => <li key={i}>{t}</li>)}</ul>
                : <div className="gate-empty">Няма активирани пречки</div>}
            </div>
            <div className="gate-block gate-green">
              <div className="gate-title"><Star size={13} /> Непокрити задължителни</div>
              {stats.unmetMusthaves.length > 0
                ? <ul>{stats.unmetMusthaves.map((t, i) => <li key={i}>{t}</li>)}</ul>
                : <div className="gate-empty">Всички задължителни са покрити</div>}
            </div>
          </section>
          <section className="card">
            <div className="card-title">
              <span>{active.name} · История</span>
              {active.history?.length > 0 && (
                <span style={{ color: 'var(--muted)', fontSize: 11, textTransform: 'none', letterSpacing: 0 }}>
                  {active.history.length} {active.history.length === 1 ? 'запис' : 'записа'}
                </span>
              )}
            </div>
            {(active.history?.length || 0) === 0
              ? <div className="empty">Натисни иконата за запис, за да фиксираш текущия резултат</div>
              : <HistoryChart history={active.history} />}
          </section>
        </Fragment>
      )}

      {tab === 'table' && (
        <FlagsTable profile={active} onUpdate={updateItem} onRate={setRating} onRemove={removeItem} />
      )}

      {tab === 'journal' && (
        <section className="card">
          <div className="card-title">{active.name} · Дневник</div>
          <div className="mood-row">
            {['🔥','😍','😐','😬','🚩'].map(m => (
              <button
                key={m}
                className={`mood-pill ${journalMood === m ? 'sel' : ''}`}
                onClick={() => setJournalMood(journalMood === m ? '' : m)}
              >{m}</button>
            ))}
          </div>
          <div className="journal-add">
            <textarea
              placeholder="Какво се случи днес? (среща, разговор, наблюдение…)"
              value={journalText}
              onChange={e => setJournalText(e.target.value)}
            />
            <button className="add-btn add-btn-green" onClick={addJournal}>+</button>
          </div>
          {(active.journal?.length || 0) === 0
            ? <div className="empty">Все още няма записи. Записвай срещи, разговори, наблюдения.</div>
            : active.journal.map(j => (
                <div key={j.id} className="entry">
                  <div className="entry-head">
                    <span>{new Date(j.t).toLocaleString()} {j.mood || ''}</span>
                    <button className="entry-del" onClick={() => deleteJournal(j.id)}>×</button>
                  </div>
                  {j.text}
                </div>
              ))}
        </section>
      )}

      {tab === 'compare' && (() => {
        if (state.profiles.length < 2) {
          return (
            <section className="card">
              <div className="card-title">Сравни профили</div>
              <div className="empty">Нужни са поне 2 профила за сравнение. Добави още един с „+ Нов“.</div>
            </section>
          )
        }
        const aId = state.profiles.some(p => p.id === state.compareIds?.[0]) ? state.compareIds[0] : state.profiles[0].id
        const bId = state.profiles.some(p => p.id === state.compareIds?.[1]) && state.compareIds[1] !== aId
          ? state.compareIds[1]
          : (state.profiles.find(p => p.id !== aId)?.id)
        const a = state.profiles.find(p => p.id === aId)
        const b = state.profiles.find(p => p.id === bId)
        return (
          <section className="card">
            <div className="card-title">Сравни профили</div>
            <div className="compare-select-row">
              <select className="cell-select compare-select" value={aId} onChange={e => setCompareSlot(0, e.target.value)}>
                {state.profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <span className="compare-vs">срещу</span>
              <select className="cell-select compare-select" value={bId} onChange={e => setCompareSlot(1, e.target.value)}>
                {state.profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            {a && b && a.id !== b.id
              ? <CompareView a={a} b={b} />
              : <div className="empty">Избери два различни профила.</div>}
          </section>
        )
      })()}

      {tab === 'insights' && (
        <section className="card">
          <div className="card-title">
            <span>AI анализ · {active.name}</span>
            <button className="btn-ghost" onClick={setApiKey} title="API ключ" aria-label="API ключ">
              <KeyRound size={14} /> {state.apiKey ? 'Смени API ключ' : 'Добави API ключ'}
            </button>
          </div>
          <div className="modal-help">
            {state.apiKey
              ? 'Изпраща текущия профил към Claude за анализ. Брутално директен изход.'
              : 'Нужен е Groq API ключ (безплатен). Натисни „Добави API ключ“ горе вдясно. Вземи ключ от console.groq.com.'}
          </div>
          <button className="insight-btn" onClick={runInsight} disabled={insight.loading}>
            {insight.loading ? 'Анализирам…' : '🧠 Стартирай анализ'}
          </button>
          {insight.error && <div className="insight-body" style={{ color: 'var(--red)' }}>{insight.error}</div>}
          {insight.text && <div className="insight-body">{insight.text}</div>}
        </section>
      )}

      <footer className="footer">
        {active.green.length + active.red.length + (active.musthaves?.length || 0) + (active.dealbreakers?.length || 0)} флага · {state.profiles.length} {state.profiles.length === 1 ? 'профил' : 'профила'} · автозапазено · v{APP_VERSION}
      </footer>

      <PdfReport profile={active} stats={stats} verdict={verdict} />

      {modal && (
        <div className="modal-bg" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            {modal.type === 'newProfile' && (
              <Fragment>
                <h3>Нов профил</h3>
                <input
                  type="text" placeholder="Име…" value={modalInput}
                  onChange={e => setModalInput(e.target.value)}
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') confirmModal() }}
                />
              </Fragment>
            )}
            {modal.type === 'apiKey' && (
              <Fragment>
                <h3>Groq API ключ</h3>
                <div className="modal-help">
                  Безплатен ключ от console.groq.com. Запазва се само в твоя профил и се ползва за директни заявки към Groq от браузъра.
                </div>
                <input
                  type="password" placeholder="gsk_…" value={modalInput}
                  onChange={e => setModalInput(e.target.value)}
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') confirmModal() }}
                />
              </Fragment>
            )}
            {modal.type === 'data' && (
              <Fragment>
                <h3>Архив (JSON)</h3>
                <div className="modal-help">Запази всичките си профили във файл или зареди от предишен архив.</div>
                <div className="data-actions">
                  <button className="data-btn" onClick={() => { setModal(null); exportJson() }}>
                    <Download size={16} /> Запази архив
                  </button>
                  <button className="data-btn" onClick={() => { setModal(null); triggerImport() }}>
                    <Upload size={16} /> Зареди архив
                  </button>
                </div>
              </Fragment>
            )}
            {modal.type === 'copyFrom' && (
              <Fragment>
                <h3>Копирай флагове в „{active.name}“</h3>
                <div className="modal-help">
                  Избери профил — всички зелени и червени флагове (вкл. задължителни и пречки) ще се добавят тук с тяхната тежест. Оценките 1–5 не се копират — попълни ги ръчно за този профил. Повтарящи се текстове се пропускат.
                </div>
                <div className="suggest-list">
                  {state.profiles.filter(p => p.id !== active.id).length === 0 ? (
                    <div className="empty">Няма друг профил.</div>
                  ) : (
                    state.profiles.filter(p => p.id !== active.id).map(p => {
                      const total = (p.green?.length || 0) + (p.red?.length || 0) + (p.musthaves?.length || 0) + (p.dealbreakers?.length || 0)
                      return (
                        <div key={p.id} className="suggest-row">
                          <span className="suggest-text">{p.name}</span>
                          <span className="suggest-cat">{total} {total === 1 ? 'флаг' : 'флага'}</span>
                          <button className="suggest-add sg-green" onClick={() => copyFromProfile(p.id)} title="Копирай от този профил" aria-label="Копирай"><Copy size={14} /></button>
                        </div>
                      )
                    })
                  )}
                </div>
              </Fragment>
            )}
            {modal.type === 'renameProfile' && (
              <Fragment>
                <h3>Преименувай профил</h3>
                <div className="modal-help">
                  Името се вижда само от теб и се запазва между устройства.
                </div>
                <input
                  type="text" placeholder="Ново име…" value={modalInput}
                  onChange={e => setModalInput(e.target.value)}
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') confirmModal() }}
                />
                {state.profiles.length > 1 && (
                  <button
                    className="modal-delete"
                    onClick={() => { const id = active.id; setModal(null); deleteProfile(id) }}
                  >
                    <Trash2 size={14} /> Изтрий профил „{active.name}“
                  </button>
                )}
              </Fragment>
            )}
            <div className="modal-btns">
              {(modal.type === 'suggest' || modal.type === 'copyFrom' || modal.type === 'data') ? (
                <button className="modal-btn modal-btn-primary" onClick={() => setModal(null)}>Готово</button>
              ) : (
                <Fragment>
                  <button className="modal-btn modal-btn-cancel" onClick={() => setModal(null)}>Отказ</button>
                  <button className="modal-btn modal-btn-primary" onClick={confirmModal}>Запази</button>
                </Fragment>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// One DndContext spanning both colours so items can be dragged between
// green/red columns and the must-have/dealbreaker banners.
function Board({ profile, onRate, onRemove, onUpdate, onMove, addFlag, hasFlag, suggestGreen, suggestRed, newGreen, setNewGreen, addGreen, newRed, setNewRed, addRed }) {
  const [activeId, setActiveId] = useState(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  )

  const allItems = LISTS.flatMap(k => (profile[k] || []))
  const activeItem = activeId ? allItems.find(i => i.id === activeId) : null
  const findList = (id) => LISTS.find(k => (profile[k] || []).some(i => i.id === id)) || null
  const accentOf = (list) => (list === 'green' || list === 'musthaves') ? 'green' : 'red'

  const handleDragEnd = (event) => {
    setActiveId(null)
    const { active, over } = event
    if (!over) return
    const draggedId = String(active.id)
    const fromList = findList(draggedId)
    if (!fromList) return
    const overId = String(over.id)
    if (overId === draggedId) return

    // Resolve the drop target into { list, category?, beforeId? }.
    // Zones: zone:musthaves | zone:dealbreakers | zone:<color>:<categoryId>.
    // Dropping onto an item inserts before it (reordering / cross-category).
    let toList = null, category = null, beforeId = null
    if (overId.startsWith('zone:')) {
      const parts = overId.split(':')
      toList = parts[1]
      if (parts[2]) category = parts[2]
    } else {
      const overList = findList(overId)
      if (!overList) return
      toList = overList
      const overItem = (profile[overList] || []).find(i => i.id === overId)
      category = overItem?.category || null
      beforeId = overId
    }
    if (!toList || !LISTS.includes(toList)) return

    onMove(draggedId, toList, { category, beforeId })
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={(e) => setActiveId(String(e.active.id))}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <main className="board">
        <BoardSide
          accent="green" which="green" bannerZone="musthaves"
          columnTitle="Зелени флагове" bannerTitle="Задължителни" bannerIcon={Star}
          columnItems={profile.green} bannerItems={profile.musthaves || []}
          activeId={activeId}
          onRate={onRate} onRemove={onRemove} onUpdate={onUpdate}
          addFlag={addFlag} hasFlag={hasFlag} suggestions={suggestGreen}
          newValue={newGreen} setNewValue={setNewGreen} onAdd={addGreen}
        />
        <BoardSide
          accent="red" which="red" bannerZone="dealbreakers"
          columnTitle="Червени флагове" bannerTitle="Dealbreakers (пречки)" bannerIcon={Ban}
          columnItems={profile.red} bannerItems={profile.dealbreakers || []}
          activeId={activeId}
          onRate={onRate} onRemove={onRemove} onUpdate={onUpdate}
          addFlag={addFlag} hasFlag={hasFlag} suggestions={suggestRed}
          newValue={newRed} setNewValue={setNewRed} onAdd={addRed}
        />
      </main>
      <DragOverlay dropAnimation={null}>
        {activeItem ? (
          <div className={`row drag-overlay drag-overlay-${accentOf(findList(activeItem.id))}`}>
            <span className="drag-handle" aria-hidden><GripVertical size={14} /></span>
            <span className="row-text">{activeItem.text}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function BoardSide({ accent, which, bannerZone, columnTitle, bannerTitle, bannerIcon: BannerIcon, columnItems, bannerItems, activeId, onRate, onRemove, onUpdate, addFlag, hasFlag, suggestions, newValue, setNewValue, onAdd }) {
  return (
    <section className={`side side-${accent}`}>
      <BannerZone
        accent={accent} zone={bannerZone} title={bannerTitle} Icon={BannerIcon}
        items={bannerItems}
        onRate={onRate} onRemove={onRemove} onUpdate={onUpdate} activeId={activeId}
      />
      <div className={`col col-${accent}`}>
        <h2 className="col-title">
          <span className={`dot dot-${accent}`} />
          {columnTitle}
          <span className="count">{columnItems.filter(i => i.rating > 0).length}/{columnItems.length}</span>
        </h2>
        {CATEGORIES.map(cat => (
          <CategorySection
            key={cat.id} which={which} accent={accent} catId={cat.id} label={cat.label}
            color={cat.color} icon={cat.icon}
            items={columnItems.filter(i => i.category === cat.id)} activeId={activeId}
            onRate={onRate} onRemove={onRemove} onUpdate={onUpdate}
          />
        ))}
        <div className="add-row">
          <input
            type="text" placeholder="Добави нов флаг…" value={newValue}
            onChange={e => setNewValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onAdd() }}
          />
          <button className={`add-btn add-btn-${accent}`} onClick={onAdd} title="Добави нов флаг" aria-label="Добави нов флаг"><Plus size={16} /></button>
        </div>
        <SuggestBox accent={accent} which={which} suggestions={suggestions} addFlag={addFlag} hasFlag={hasFlag} />
      </div>
    </section>
  )
}

function SuggestBox({ accent, which, suggestions, addFlag, hasFlag }) {
  const [showAdded, setShowAdded] = useState(false)
  const items = suggestions.map(s => ({ ...s, added: hasFlag(which, s.text) }))
  const newOnes = items.filter(s => !s.added)
  const addedOnes = items.filter(s => s.added)
  const shown = showAdded ? [...newOnes, ...addedOnes] : newOnes
  return (
    <div className={`suggest-box suggest-box-${accent}`}>
      <div className="suggest-box-head">
        <span className="suggest-box-title">{accent === 'red' ? 'Червени предложения' : 'Зелени предложения'}</span>
        <button className="suggest-box-toggle" onClick={() => setShowAdded(v => !v)}>
          {showAdded ? <EyeOff size={12} /> : <Eye size={12} />}
          {showAdded ? 'Скрий добавените' : 'Покажи добавените'}
        </button>
      </div>
      <div className="suggest-tags">
        {shown.length === 0 ? (
          <span className="suggest-empty">Няма нови предложения.</span>
        ) : (
          shown.map(s => (
            <button
              key={s.text}
              className={`suggest-tag suggest-tag-${accent} ${s.added ? 'added' : ''}`}
              disabled={s.added}
              onClick={() => !s.added && addFlag(which, s.text, s.category || DEFAULT_CATEGORY)}
              title={s.added ? 'Вече добавено' : 'Добави'}
            >
              {s.added ? <Check size={11} /> : <Plus size={11} />} {s.text}
            </button>
          ))
        )}
      </div>
    </div>
  )
}

function BannerZone({ accent, zone, title, Icon, items, onRate, onRemove, onUpdate, activeId }) {
  const { setNodeRef, isOver } = useDroppable({ id: `zone:${zone}` })
  const sorted = byWeightDesc(items)
  return (
    <div className={`board-banner board-banner-${accent} ${isOver ? 'banner-over' : ''}`}>
      <div className="board-banner-head">
        {Icon && <Icon size={13} />}
        <span className="board-banner-title">{title}</span>
        <span className="count">{items.length}</span>
      </div>
      <ul ref={setNodeRef} className={`list banner-list ${items.length === 0 ? 'banner-list-empty' : ''}`}>
        {sorted.length === 0 ? (
          <li className="priority-empty">Влачи флаг тук ↑</li>
        ) : (
          sorted.map(item => (
            <SortableRow
              key={item.id} item={item} accent={accent} which={zone} special
              onRate={onRate} onRemove={onRemove} onUpdate={onUpdate}
              isDragging={activeId === item.id}
            />
          ))
        )}
      </ul>
    </div>
  )
}

function CategorySection({ which, accent, catId, label, color, icon, items, activeId, onRate, onRemove, onUpdate }) {
  const { setNodeRef, isOver } = useDroppable({ id: `zone:${which}:${catId}` })
  const rated = items.filter(i => i.rating > 0).length
  const sorted = byWeightDesc(items)
  return (
    <div className={`cat-section ${isOver ? 'cat-over' : ''}`} style={{ '--cat-color': color }}>
      <div className="cat-head">
        <span className="cat-icon" aria-hidden>{icon}</span>
        <span className="cat-label">{label}</span>
        <span className="cat-count">{rated}/{items.length}</span>
      </div>
      <ul ref={setNodeRef} className={`list cat-list ${items.length === 0 ? 'cat-list-empty' : ''}`}>
        {sorted.length === 0 ? (
          <li className="priority-empty">Пусни тук</li>
        ) : (
          sorted.map(item => (
            <SortableRow
              key={item.id} item={item} accent={accent} which={`${which}:${catId}`}
              onRate={onRate} onRemove={onRemove} onUpdate={onUpdate}
              isDragging={activeId === item.id}
            />
          ))
        )}
      </ul>
    </div>
  )
}

function SortableRow({ item, accent, which, special, onRate, onRemove, onUpdate, isDragging }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: item.id })
  // Item is also a droppable target so drops can use its position as a hint.
  const { setNodeRef: setDropRef, isOver: isOverItem } = useDroppable({ id: item.id })
  const setRefs = (node) => { setNodeRef(node); setDropRef(node) }
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.text)
  const [confirmDel, setConfirmDel] = useState(false)
  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.35 : 1,
  }
  const commitName = () => {
    const v = draft.trim()
    if (v && v !== item.text) onUpdate(item.id, { text: v })
    else setDraft(item.text)
    setEditing(false)
  }
  return (
    <li ref={setRefs} style={style} className={`row-wrap ${special ? `special special-${accent}` : ''} ${isOverItem ? 'row-over' : ''}`}>
      <div className={`row ${item.rating > 0 ? 'rated' : ''}`}>
        <button className="drag-handle" {...attributes} {...listeners} aria-label="Премести" title="Влачи за преместване"><GripVertical size={14} /></button>
        <div className="row-body">
          <div className="row-main">
            {editing ? (
              <input
                className="row-edit" autoFocus value={draft}
                onChange={e => setDraft(e.target.value)}
                onBlur={commitName}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitName()
                  if (e.key === 'Escape') { setDraft(item.text); setEditing(false) }
                }}
              />
            ) : (
              <span
                className="row-text"
                onDoubleClick={() => { setDraft(item.text); setEditing(true) }}
                title="Двоен клик за преименуване"
              >
                {special && <span className={`db-badge db-badge-${accent}`}>{accent === 'red' ? <Ban size={11} /> : <Star size={11} />}</span>}
                {item.text}
              </span>
            )}
            <WeightPicker value={item.weight} onChange={(w) => onUpdate(item.id, { weight: w })} />
            {confirmDel ? (
              <span className="row-confirm">
                <button className="row-confirm-yes" onClick={() => onRemove(item.id)}>Изтрий</button>
                <button className="row-confirm-no" onClick={() => setConfirmDel(false)} aria-label="Отказ"><X size={12} /></button>
              </span>
            ) : (
              <button className="row-del" onClick={() => setConfirmDel(true)} title="Изтрий" aria-label="Изтрий"><X size={14} /></button>
            )}
          </div>
          <Rating accent={accent} value={item.rating} onChange={(n) => onRate(item.id, n)} />
        </div>
      </div>
    </li>
  )
}

function WeightPicker({ value, onChange }) {
  return (
    <div className="weight-picker" role="radiogroup" aria-label="Тежест 1-3" title="Тежест 1–3">
      {[1,2,3].map(n => (
        <button
          key={n} type="button"
          className={`weight-seg ${n <= (value || 2) ? 'on' : ''}`}
          onClick={() => onChange(n)}
          title={`Тежест ${n}`} aria-label={`Тежест ${n}`}
        >{n}</button>
      ))}
    </div>
  )
}

function Rating({ accent, value, onChange }) {
  const labels = ['', 'Слабо', 'Средно', 'Силно', 'Много силно', 'Изключително']
  return (
    <div className={`rating rating-${accent}`} role="radiogroup" aria-label="Оценка 1-5">
      <div className="rating-segs">
        {[1,2,3,4,5].map(n => (
          <button
            key={n}
            type="button"
            className={`rating-seg ${n <= value ? 'on' : ''}`}
            onClick={() => onChange(n)}
            aria-label={`${n}/5 — ${labels[n]}`}
            title={`${n}/5 · ${labels[n]}`}
          >
            <span className="rating-seg-fill" />
          </button>
        ))}
      </div>
      <span className="rating-readout">{value > 0 ? `${value}/5` : '—'}</span>
    </div>
  )
}

function Ring({ value, color, label, sub, big, text }) {
  const size = big ? 150 : 110
  const stroke = big ? 12 : 10
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c - (Math.max(0, Math.min(100, value)) / 100) * c
  return (
    <div className="ring">
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--panel-2)" strokeWidth={stroke} />
        <circle
          cx={size/2} cy={size/2} r={r}
          fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
        <text x="50%" y="50%" textAnchor="middle" dy="0.35em" fill="var(--text)" fontSize={big ? 28 : 22} fontWeight="600">
          {text ?? `${value}%`}
        </text>
      </svg>
      <div className="ring-label">{label}</div>
      <div className="ring-sub">{sub}</div>
    </div>
  )
}

function HistoryChart({ history }) {
  const w = 320, height = 140, pad = 20
  const pts = history.slice(-20)
  const xs = pts.map((_, i) => pts.length === 1 ? w/2 : pad + (i / (pts.length - 1)) * (w - 2 * pad))
  const yFor = (v) => height - pad - (v / 100) * (height - 2 * pad)
  const compatPath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xs[i]} ${yFor(p.compat)}`).join(' ')
  const greenPath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xs[i]} ${yFor(p.greenPct)}`).join(' ')
  const redPath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xs[i]} ${yFor(p.redPct)}`).join(' ')
  return (
    <div className="chart-wrap">
      <svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none">
        {[0, 25, 50, 75, 100].map(g => (
          <line key={g} x1={pad} x2={w - pad} y1={yFor(g)} y2={yFor(g)}
            stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        ))}
        <path d={greenPath} fill="none" stroke="var(--green)" strokeWidth="1.5" opacity="0.5" />
        <path d={redPath} fill="none" stroke="var(--red)" strokeWidth="1.5" opacity="0.5" />
        <path d={compatPath} fill="none" stroke="var(--yellow)" strokeWidth="2.5" />
        {pts.map((p, i) => (
          <circle key={i} cx={xs[i]} cy={yFor(p.compat)} r="3" fill="var(--yellow)" />
        ))}
      </svg>
      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--muted)', justifyContent: 'center', marginTop: 4 }}>
        <span style={{ color: 'var(--yellow)' }}>— Съвместимост</span>
        <span style={{ color: 'var(--green)', opacity: 0.7 }}>— Зелено</span>
        <span style={{ color: 'var(--red)', opacity: 0.7 }}>— Червено</span>
      </div>
    </div>
  )
}

function CompareView({ a, b }) {
  const sa = computeStats(a), sb = computeStats(b)
  // Head-to-head math:
  //  • diff  = direct subtraction of the two compatibility %s (percentage points)
  //  • rel   = (higher − lower) / lower × 100  → "X% better than the other"
  //  • share = higher / (higher + lower)        → dominance on a 50–100% scale
  const ca = sa.compat, cb = sb.compat
  const tie = ca === cb
  const better = ca >= cb ? a : b
  const hi = Math.max(ca, cb), lo = Math.min(ca, cb)
  const diff = hi - lo
  const rel = lo > 0 ? Math.round(((hi - lo) / lo) * 100) : null
  const share = (hi + lo) > 0 ? Math.round((hi / (hi + lo)) * 100) : 50
  const aGreen = [...a.green, ...(a.musthaves || [])], bGreen = [...b.green, ...(b.musthaves || [])]
  const aRed = [...a.red, ...(a.dealbreakers || [])], bRed = [...b.red, ...(b.dealbreakers || [])]
  const greenLabels = Array.from(new Set([...aGreen.map(i=>i.text), ...bGreen.map(i=>i.text)]))
  const redLabels = Array.from(new Set([...aRed.map(i=>i.text), ...bRed.map(i=>i.text)]))
  const lookup = (arr, text) => arr.find(i => i.text === text)
  const cell = (item) => {
    if (!item) return <span>·</span>
    if (item.rating === 0) return <span>—</span>
    return <span>{item.rating}/5</span>
  }

  return (
    <div>
      <div className="compare-grid" style={{ marginBottom: 14 }}>
        <div className="compare-head">{`${a.name}\n${sa.compat}%`}</div>
        <div style={{ fontSize: 18, color: 'var(--muted)' }}>vs</div>
        <div className="compare-head">{`${b.name}\n${sb.compat}%`}</div>
      </div>
      <div className="compare-grid">
        <div className="compare-section-head" style={{ color: 'var(--green)' }}>Зелени флагове</div>
        {greenLabels.flatMap(label => {
          const ai = lookup(aGreen, label)
          const bi = lookup(bGreen, label)
          return [
            <div key={`a-g-${label}`} className={`compare-cell ${ai?.rating > 0 ? 'yes' : 'no'}`}>{cell(ai)}</div>,
            <div key={`l-g-${label}`} className="compare-label">{label}</div>,
            <div key={`b-g-${label}`} className={`compare-cell ${bi?.rating > 0 ? 'yes' : 'no'}`}>{cell(bi)}</div>,
          ]
        })}
        <div className="compare-section-head" style={{ color: 'var(--red)' }}>Червени флагове</div>
        {redLabels.flatMap(label => {
          const ai = lookup(aRed, label)
          const bi = lookup(bRed, label)
          return [
            <div key={`a-r-${label}`} className={`compare-cell ${ai?.rating > 0 ? 'yes-red' : 'no'}`}>{cell(ai)}</div>,
            <div key={`l-r-${label}`} className="compare-label">{label}</div>,
            <div key={`b-r-${label}`} className={`compare-cell ${bi?.rating > 0 ? 'yes-red' : 'no'}`}>{cell(bi)}</div>,
          ]
        })}
      </div>

      <div className="compare-summary card">
        <div className="cs-head">{tie ? '🤝 Равностойни' : `🏆 ${better.name} води`}</div>
        <div className="cs-ring">
          <Ring
            value={rel != null ? rel : 100}
            color="var(--accent)"
            label={tie ? 'равни' : 'по-добър'}
            sub={tie ? '' : better.name}
            big
            text={tie ? '0%' : (rel != null ? `${rel}%` : '∞')}
          />
        </div>
        <div className="cs-bar">
          <div className="cs-bar-a" style={{ width: `${ca + cb > 0 ? (ca / (ca + cb)) * 100 : 50}%` }} />
          <div className="cs-bar-b" style={{ width: `${ca + cb > 0 ? (cb / (ca + cb)) * 100 : 50}%` }} />
        </div>
        <div className="cs-rows">
          <div className="cs-row"><span style={{ color: 'var(--green)' }}>{a.name}</span><strong>{ca}%</strong></div>
          <div className="cs-row"><span style={{ color: 'var(--accent)' }}>{b.name}</span><strong>{cb}%</strong></div>
          <div className="cs-row"><span>Разлика</span><strong>{diff} проц. пункта</strong></div>
          <div className="cs-row"><span>Дял на надмощие</span><strong>{share}% : {100 - share}%</strong></div>
        </div>
        <div className="cs-note">
          Кръгът показва относителното предимство: (по-висок − по-нисък) / по-нисък × 100 — с колко % единият превъзхожда другия. Разлика = пряко изваждане (процентни пункта). Дял на надмощие = по-висок / (по-висок + по-нисък).
        </div>
      </div>
    </div>
  )
}

function SyncBadge({ status, lastSavedAt }) {
  if (status === 'loading') return <span className="sync-badge sync-loading"><Loader2 size={12} className="spin" /> Зареждам</span>
  if (status === 'saving') return <span className="sync-badge sync-saving"><Loader2 size={12} className="spin" /> Синхронизирам</span>
  if (status === 'conflict') return <span className="sync-badge sync-error" title="Има по-нова версия на сървъра. Избери коя да запазиш от лентата отгоре."><AlertTriangle size={12} /> Конфликт</span>
  if (status === 'error') return <span className="sync-badge sync-error" title="Промените са в локалния кеш — ще се синхронизират когато се възстанови връзката."><CloudOff size={12} /> Офлайн</span>
  if (status === 'idle' && lastSavedAt) {
    return <span className="sync-badge sync-saved" title={new Date(lastSavedAt).toLocaleString()}><CloudCheck size={12} /> Автозапазено</span>
  }
  return null
}

function FlagsTable({ profile, onUpdate, onRate, onRemove }) {
  const [sort, setSort] = useState({ key: 'default', dir: 1 })
  const [hideEmpty, setHideEmpty] = useState(false)
  const [manualOrder, setManualOrder] = useState([]) // ids, manual tiebreak within equal points

  const baseRows = useMemo(() => {
    const list = []
    const push = (arr, color, kind) => (arr || []).forEach(i => list.push({ ...i, color, kind }))
    push(profile.green, 'green', 'flag')
    push(profile.musthaves, 'green', 'musthave')
    push(profile.red, 'red', 'flag')
    push(profile.dealbreakers, 'red', 'dealbreaker')
    return list
  }, [profile])

  const sorters = {
    name: (a, b) => a.text.localeCompare(b.text, 'bg'),
    rating: (a, b) => a.rating - b.rating,
    weight: (a, b) => (a.weight || 2) - (b.weight || 2),
    points: (a, b) => itemScore(a) - itemScore(b),
    color: (a, b) => (a.color === 'green' ? -1 : 1),
  }
  const orderIdx = (id) => { const k = manualOrder.indexOf(id); return k === -1 ? Number.MAX_SAFE_INTEGER : k }
  const visible = hideEmpty ? baseRows.filter(i => i.rating > 0) : baseRows
  const rows = [...visible].sort((a, b) => {
    if (sort.key !== 'default') return sorters[sort.key](a, b) * sort.dir
    // Auto: by points (weight×rating) desc, then manual order, then weight & rating.
    return (itemScore(b) - itemScore(a))
      || (orderIdx(a.id) - orderIdx(b.id))
      || ((b.weight || 2) - (a.weight || 2))
      || (b.rating - a.rating)
  })

  const stats = computeStats(profile)
  const net = stats.gScore - stats.rScore
  const tAvg = Math.round(stats.gMax * 0.20)
  const tGood = Math.round(stats.gMax * 0.45)
  const tExc = Math.round(stats.gMax * 0.70)
  const toggleSort = (key) => setSort(s => s.key === key ? { key, dir: -s.dir } : { key, dir: 1 })

  const [colOrder, setColOrder] = useState(loadColOrder)
  const colSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  )
  const onColDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return
    setColOrder(prev => {
      const next = arrayMove(prev, prev.indexOf(active.id), prev.indexOf(over.id))
      saveColOrder(next)
      return next
    })
  }
  const onRowDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return
    const ids = rows.map(r => r.id)
    setManualOrder(arrayMove(ids, ids.indexOf(active.id), ids.indexOf(over.id)))
    setSort({ key: 'default', dir: 1 })
  }

  // Column metadata + default cell renderers (points & actions are rendered in TableRow).
  const COLS = {
    actions: { cls: 'th-actions', label: '' },
    color: {
      cls: 'th-color', label: '', sortKey: 'color',
      cell: (item) => (
        <td className="td-color" key="color">
          <span className={`color-pill color-${item.color}`} title={item.color === 'green' ? 'Зелен флаг' : 'Червен флаг'}>
            {item.kind === 'dealbreaker' ? <Ban size={11} /> : item.kind === 'musthave' ? <Star size={11} /> : <Flag size={11} fill={item.color === 'green' ? 'var(--green)' : 'var(--red)'} stroke="none" />}
          </span>
        </td>
      ),
    },
    name: {
      label: 'Флаг', sortKey: 'name',
      cell: (item) => (
        <td key="name">
          <input className="cell-input flag-name-input" type="text" value={item.text} onChange={e => onUpdate(item.id, { text: e.target.value })} />
        </td>
      ),
    },
    rating: {
      cls: 'th-rating', label: 'Оценка', sortKey: 'rating',
      cell: (item) => (
        <td className="td-rating" key="rating"><CellSegs accent={item.color} value={item.rating} onChange={(n) => onRate(item.id, n)} /></td>
      ),
    },
    weight: {
      cls: 'th-weight', label: 'Тежест', sortKey: 'weight',
      cell: (item) => (
        <td className="td-weight" key="weight"><CellSegs accent="neutral" count={3} value={item.weight || 2} onChange={(n) => onUpdate(item.id, { weight: n })} /></td>
      ),
    },
    points: { cls: 'th-points', label: 'Точки', sortKey: 'points' },
    note: {
      label: 'Бележки',
      cell: (item) => (
        <td className="td-note" key="note">
          <input className="cell-input note-inline" type="text" placeholder="—" value={item.note || ''} onChange={e => onUpdate(item.id, { note: e.target.value })} />
        </td>
      ),
    },
  }
  const orderedIds = colOrder.filter(id => COLS[id])
  const rowIds = rows.map(r => r.id)

  const banner = (
    <div className="table-banner">
      <span className="table-banner-title"><TableIcon size={14} /> {profile.name} · Таблица на флаговете</span>
      <span className="table-count"><Flag size={12} /> {baseRows.length} ФЛАГА</span>
      <button className="table-toggle" onClick={() => setHideEmpty(h => !h)}>
        {hideEmpty ? <Eye size={13} /> : <EyeOff size={13} />}
        {hideEmpty ? 'Покажи празните полета' : 'Скрий празните полета'}
      </button>
    </div>
  )

  if (baseRows.length === 0) {
    return (
      <section className="card">
        {banner}
        <div className="empty">Все още няма флагове. Добави в раздел Флагове.</div>
      </section>
    )
  }

  return (
    <section className="card">
      {banner}
      <div className="flags-table-wrap">
        <table className="flags-table editable">
          <thead>
            <DndContext sensors={colSensors} collisionDetection={closestCenter} onDragEnd={onColDragEnd}>
              <SortableContext items={orderedIds} strategy={horizontalListSortingStrategy}>
                <tr>
                  {orderedIds.map(id => (
                    <ColumnHeader key={id} id={id} col={COLS[id]} sort={sort} toggleSort={toggleSort} />
                  ))}
                </tr>
              </SortableContext>
            </DndContext>
          </thead>
          <DndContext sensors={colSensors} collisionDetection={closestCenter} onDragEnd={onRowDragEnd}>
            <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
              <tbody>
                {rows.map(item => (
                  <TableRow key={item.id} item={item} orderedIds={orderedIds} COLS={COLS} onRemove={onRemove} />
                ))}
              </tbody>
            </SortableContext>
          </DndContext>
          <tfoot>
            <tr className="table-total">
              <td colSpan={orderedIds.length}>
                <div className="total-bar">
                  <div className="score-guide">
                    <span className="guide-item guide-avg">Среден ≥ {tAvg}</span>
                    <span className="guide-item guide-good">Добър ≥ {tGood}</span>
                    <span className="guide-item guide-exc">Отличен ≥ {tExc}</span>
                    <span className="guide-max">макс +{stats.gMax}</span>
                  </div>
                  <div className="total-right">
                    <div className="total-line">
                      <span className="total-label">Общ брой точки</span>
                      <span className={`total-points ${net >= tExc ? 'lvl-exc' : net >= tGood ? 'lvl-good' : net >= tAvg ? 'lvl-avg' : 'lvl-low'}`}>{net}</span>
                    </div>
                    <div className="total-sub">
                      <span style={{ color: 'var(--green)' }}>{stats.gScore} зелени</span> − <span style={{ color: 'var(--red)' }}>{stats.rScore} червени</span> = {net}
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

function TableRow({ item, orderedIds, COLS, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const [confirmDel, setConfirmDel] = useState(false)
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  const score = itemScore(item)
  const sign = score === 0 ? '' : (item.color === 'red' ? '−' : '+')
  return (
    <tr ref={setNodeRef} style={style} className={`tr-${item.color}`}>
      {orderedIds.map(id => {
        if (id === 'actions') {
          return (
            <td className="td-actions" key="actions">
              {confirmDel ? (
                <span className="row-confirm">
                  <button className="row-confirm-yes" onClick={() => onRemove(item.id)}>Изтрий</button>
                  <button className="row-confirm-no" onClick={() => setConfirmDel(false)} aria-label="Отказ"><X size={12} /></button>
                </span>
              ) : (
                <button className="row-del" onClick={() => setConfirmDel(true)} title="Изтрий" aria-label="Изтрий"><X size={13} /></button>
              )}
            </td>
          )
        }
        if (id === 'points') {
          return (
            <td className={`td-points td-points-${item.color}`} key="points">
              <span className="points-cell">
                <button className="row-grip" {...attributes} {...listeners} title="Влачи за подреждане" aria-label="Подреди"><GripVertical size={12} /></button>
                <span>{sign}{score}</span>
              </span>
            </td>
          )
        }
        return COLS[id].cell(item)
      })}
    </tr>
  )
}

function ColumnHeader({ id, col, sort, toggleSort }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  }
  return (
    <th ref={setNodeRef} style={style} className={`${col.cls || ''} draggable-col ${col.sortKey && sort.key === col.sortKey ? 'sorted' : ''}`}>
      <span className="th-inner">
        <button className="col-grip" {...attributes} {...listeners} title="Влачи за разместване" aria-label="Размести колона"><GripVertical size={12} /></button>
        {col.sortKey ? (
          <span className="th-sort" onClick={() => toggleSort(col.sortKey)}>{col.label}<ArrowUpDown size={11} className="sort-icon" /></span>
        ) : (
          <span>{col.label}</span>
        )}
      </span>
    </th>
  )
}

function CellSegs({ accent, value, onChange, count = 5 }) {
  return (
    <div className={`cell-segs cell-segs-${accent}`} role="radiogroup">
      {Array.from({ length: count }, (_, idx) => idx + 1).map(n => (
        <button
          key={n} type="button"
          className={`cell-seg ${n <= value ? 'on' : ''}`}
          onClick={() => onChange(n === value ? (accent === 'neutral' ? n : 0) : n)}
          title={`${n}/${count}`} aria-label={`${n}/${count}`}
        />
      ))}
    </div>
  )
}

function PdfReport({ profile, stats, verdict }) {
  const greenAll = [...(profile.green || []), ...((profile.musthaves || []).map(i => ({ ...i, _tag: '★' })))]
  const redAll = [...(profile.red || []), ...((profile.dealbreakers || []).map(i => ({ ...i, _tag: '⛔' })))]
  const flagRow = (item, color) => (
    <tr key={`${color}-${item.id}`}>
      <td style={{ padding: '6px 8px', borderBottom: '1px solid #2a2a2e' }}>
        <span style={{
          display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
          background: color === 'green' ? '#30d158' : '#ff453a', marginRight: 6,
        }} />
        {item.text}{item._tag ? ` ${item._tag}` : ''}
      </td>
      <td style={{ padding: '6px 8px', borderBottom: '1px solid #2a2a2e', textAlign: 'center', fontWeight: 600 }}>
        {item.rating > 0 ? `${item.rating}/5` : '—'}
      </td>
      <td style={{ padding: '6px 8px', borderBottom: '1px solid #2a2a2e', textAlign: 'center', color: '#a0a0a8' }}>
        {item.weight || 2}
      </td>
      <td style={{ padding: '6px 8px', borderBottom: '1px solid #2a2a2e', color: '#a0a0a8', fontSize: 11 }}>
        {item.note || '—'}
      </td>
    </tr>
  )
  const headRow = (
    <tr style={{ color: '#a0a0a8', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 }}>
      <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #2a2a2e' }}>Флаг</th>
      <th style={{ textAlign: 'center', padding: '6px 8px', borderBottom: '1px solid #2a2a2e' }}>Оценка</th>
      <th style={{ textAlign: 'center', padding: '6px 8px', borderBottom: '1px solid #2a2a2e' }}>Тежест</th>
      <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #2a2a2e' }}>Бележки</th>
    </tr>
  )
  return (
    <div
      id="pdf-report"
      style={{
        position: 'fixed',
        left: '-10000px',
        top: 0,
        width: 800,
        padding: 32,
        background: '#0a0a0c',
        color: '#f0f0f2',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        fontSize: 13,
        lineHeight: 1.4,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16, paddingBottom: 12, borderBottom: '2px solid #2a2a2e' }}>
        <div>
          <div style={{ fontSize: 12, color: '#a0a0a8', letterSpacing: 1, textTransform: 'uppercase' }}>Flag Check · доклад</div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>{profile.name}</div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 11, color: '#a0a0a8' }}>
          {new Date().toLocaleDateString('bg-BG', { year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
        <PdfMetric label="Съвместимост" value={`${stats.compat}%`} accent="#5b5fff" big />
        <PdfMetric label="Зелено" value={`${stats.greenPct}%`} sub={`${stats.greenChecked}/${stats.greenTotal}`} accent="#30d158" />
        <PdfMetric label="Червено" value={`${stats.redPct}%`} sub={`${stats.redChecked}/${stats.redTotal}`} accent="#ff453a" />
      </div>

      <div style={{
        padding: 12, background: '#161618', border: '1px solid #2a2a2e',
        borderRadius: 8, marginBottom: 20, fontWeight: 600, textAlign: 'center',
        color: verdict.cls === 'verdict-green' ? '#30d158' : verdict.cls === 'verdict-red' ? '#ff453a' : '#ffd60a',
      }}>
        {verdict.text}
      </div>

      {greenAll.length > 0 && (
        <Fragment>
          <h3 style={{ fontSize: 14, color: '#30d158', margin: '16px 0 8px' }}>Зелени флагове (★ = задължителен)</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>{headRow}</thead>
            <tbody>{greenAll.map(i => flagRow(i, 'green'))}</tbody>
          </table>
        </Fragment>
      )}

      {redAll.length > 0 && (
        <Fragment>
          <h3 style={{ fontSize: 14, color: '#ff453a', margin: '16px 0 8px' }}>Червени флагове (⛔ = пречка)</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>{headRow}</thead>
            <tbody>{redAll.map(i => flagRow(i, 'red'))}</tbody>
          </table>
        </Fragment>
      )}

      <div style={{ marginTop: 24, paddingTop: 12, borderTop: '1px solid #2a2a2e', fontSize: 10, color: '#7a7a82' }}>
        Поверително · поколение от Flag Check · точки = оценка (1–5) × тежест (1–3)
      </div>
    </div>
  )
}

function PdfMetric({ label, value, sub, accent, big }) {
  return (
    <div style={{
      flex: big ? 1.4 : 1,
      padding: 14,
      background: '#161618',
      border: '1px solid #2a2a2e',
      borderRadius: 10,
    }}>
      <div style={{ fontSize: 10, color: '#a0a0a8', letterSpacing: 0.6, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: big ? 32 : 24, fontWeight: 700, color: accent, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: '#7a7a82', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}
