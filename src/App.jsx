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
  useDraggable,
  useDroppable,
  DragOverlay,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import {
  KeyRound, FileDown, Save, Pencil, Plus, X, ChevronDown, ChevronRight,
  GripVertical, Flag, Sparkles, Brain, Flame, BarChart3, Table as TableIcon,
  BookOpen, GitCompare, Check, AlertTriangle, TrendingUp, TrendingDown,
  Loader2, CloudOff, CloudCheck, Download, Upload, Trash2,
} from 'lucide-react'
import './App.css'

const DEFAULT_GREEN = []
const DEFAULT_RED = []

const STORAGE_KEY_PREFIX = 'flag-check-v3'
const LEGACY_STORAGE_KEY = 'flag-check-v3'
const storageKey = (userId) => userId ? `${STORAGE_KEY_PREFIX}:${userId}` : STORAGE_KEY_PREFIX
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2,8)}`
const today = () => new Date().toISOString().slice(0,10)

const PRIORITY_WEIGHTS = { main: 3, secondary: 1 }
const priorityWeight = (p) => PRIORITY_WEIGHTS[p] ?? PRIORITY_WEIGHTS.main

const makeItems = (texts) => texts.map(text => ({
  id: uid(), text, rating: 0, priority: 'main', note: '', ratedAt: null, dealbreaker: false,
}))

const makeProfile = (name) => ({
  id: uid(), name, createdAt: Date.now(),
  green: makeItems(DEFAULT_GREEN),
  red: makeItems(DEFAULT_RED),
  history: [],
  journal: [],
})

const normalizeItem = (i) => {
  const rating = typeof i.rating === 'number'
    ? i.rating
    : (i.checked ? 3 : 0)
  const ratedAt = i.ratedAt ?? i.checkedAt ?? null
  // Migrate legacy weight (1-5) -> priority. weight >= 3 was meaningful → main.
  let priority = i.priority
  if (priority !== 'main' && priority !== 'secondary') {
    priority = (typeof i.weight === 'number' && i.weight < 3) ? 'secondary' : 'main'
  }
  return {
    note: '',
    dealbreaker: false,
    ...i,
    rating,
    ratedAt,
    priority,
  }
}

function normalizeState(p) {
  if (!p || !p.profiles?.length) return null
  p.profiles.forEach(pr => {
    pr.green = pr.green.map(normalizeItem)
    pr.red = pr.red.map(normalizeItem)
    pr.journal = pr.journal || []
  })
  p.streak = p.streak || { count: 0, lastDay: null }
  p.apiKey = p.apiKey || ''
  p.compareIds = p.compareIds || []
  return p
}

function defaultState() {
  const def = makeProfile('Профил 1')
  return { profiles: [def], activeId: def.id, streak: { count: 0, lastDay: null }, apiKey: '', compareIds: [] }
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

function computeStats(profile) {
  const g = profile.green, r = profile.red
  const gMax = g.reduce((s,i)=>s + 5 * priorityWeight(i.priority), 0) || 1
  const gScore = g.reduce((s,i)=>s + i.rating * priorityWeight(i.priority), 0)
  const rMax = r.reduce((s,i)=>s + 5 * priorityWeight(i.priority), 0) || 1
  const rScore = r.reduce((s,i)=>s + i.rating * priorityWeight(i.priority), 0)
  const greenPct = Math.round((gScore / gMax) * 100)
  const redPct = Math.round((rScore / rMax) * 100)
  const compat = Math.max(0, Math.min(100, Math.round(greenPct - redPct)))
  const triggeredDealbreakers = r.filter(i => i.rating > 0 && i.dealbreaker).map(i => i.text)
  return {
    greenChecked: g.filter(i=>i.rating > 0).length,
    redChecked: r.filter(i=>i.rating > 0).length,
    greenPct, redPct, compat, triggeredDealbreakers,
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

  const setRating = (which, id, n) => {
    updateActive(p => ({
      ...p,
      [which]: p[which].map(it => {
        if (it.id !== id) return it
        const next = it.rating === n ? 0 : n
        return { ...it, rating: next, ratedAt: next > 0 ? Date.now() : null }
      }),
    }))
    setBannerDismissed(false)
  }
  const removeItem = (which, id) => updateActive(p => ({ ...p, [which]: p[which].filter(it => it.id !== id) }))
  const updateItem = (which, id, patch) => updateActive(p => ({
    ...p, [which]: p[which].map(it => it.id === id ? { ...it, ...patch } : it),
  }))
  const addItem = (which, text, setText) => {
    const v = text.trim(); if (!v) return
    updateActive(p => ({
      ...p,
      [which]: [...p[which], { id: uid(), text: v, rating: 0, priority: 'main', note: '', ratedAt: null, dealbreaker: false }],
    }))
    setText('')
  }

  const addProfile = () => { setModal({ type: 'newProfile' }); setModalInput('') }
  const setApiKey = () => { setModal({ type: 'apiKey' }); setModalInput(state.apiKey || '') }
  const renameProfile = () => { setModal({ type: 'renameProfile' }); setModalInput(active?.name || '') }
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
  const toggleCompare = (id) => {
    setState(s => {
      const cur = s.compareIds || []
      if (cur.includes(id)) return { ...s, compareIds: cur.filter(x => x !== id) }
      if (cur.length >= 2) return { ...s, compareIds: [cur[1], id] }
      return { ...s, compareIds: [...cur, id] }
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
    const greenRated = active.green.filter(i => i.rating > 0).map(i => `${i.text} (rating ${i.rating}/5, ${i.priority})${i.note ? ' — ' + i.note : ''}`)
    const greenUnrated = active.green.filter(i => i.rating === 0).map(i => `${i.text} (${i.priority})`)
    const redRated = active.red.filter(i => i.rating > 0).map(i => `${i.text} (rating ${i.rating}/5, ${i.priority})${i.note ? ' — ' + i.note : ''}${i.dealbreaker ? ' [DEALBREAKER]' : ''}`)
    const redUnrated = active.red.filter(i => i.rating === 0).map(i => i.text)
    const journal = (active.journal || []).slice(0, 5).map(j => `[${new Date(j.t).toLocaleDateString()}${j.mood ? ' ' + j.mood : ''}] ${j.text}`)

    const prompt = `You are a brutally direct dating analyst. Respond in Bulgarian. Be concise (max 8 sentences total). No fluff, no preamble. Use short declarative sentences.

Subject: ${active.name}
Compatibility: ${stats.compat}% (green ${stats.greenPct}%, red ${stats.redPct}%)
Each flag is rated 1-5 (intensity) and tagged main (3× weight) or secondary (1× weight).

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
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': state.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 500,
          messages: [{ role: 'user', content: prompt }],
        }),
      })
      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`API ${res.status}: ${errText.slice(0, 200)}`)
      }
      const data = await res.json()
      const text = data.content?.map(c => c.text || '').join('\n') || 'Няма отговор'
      setInsight({ loading: false, text, error: '' })
    } catch (e) {
      setInsight({ loading: false, text: '', error: e.message })
    }
  }

  const verdict = verdictFor(stats.compat, stats.redPct)
  const dbBanner = stats.triggeredDealbreakers.length > 0 && !bannerDismissed

  return (
    <div className="app">
      <header className="header">
        <h1>Flag Check</h1>
        <div className="header-actions">
          <SyncBadge status={syncStatus} lastSavedAt={lastSavedAt} />
          <button className="btn-ghost" onClick={renameProfile} title="Преименувай профил" aria-label="Преименувай профил"><Pencil size={16} /></button>
          <button className="btn-ghost" onClick={setApiKey} title="API ключ" aria-label="API ключ"><KeyRound size={16} /></button>
          <button className="btn-ghost" onClick={exportData} disabled={exporting} title="Експорт в PDF" aria-label="Експорт в PDF">
            {exporting ? <Loader2 size={16} className="spin" /> : <FileDown size={16} />}
          </button>
          <button className="btn-ghost" onClick={exportJson} title="Запази архив (JSON)" aria-label="Запази архив"><Download size={16} /></button>
          <button className="btn-ghost" onClick={triggerImport} title="Зареди архив (JSON)" aria-label="Зареди архив"><Upload size={16} /></button>
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
        <div className="banner">
          🚩
          <span>Активирана пречка: {stats.triggeredDealbreakers.join(', ')}</span>
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
        {state.profiles.map(p => {
          const ps = computeStats(p)
          const tr = trendFor(p)
          const isCompare = (state.compareIds || []).includes(p.id)
          return (
            <button
              key={p.id}
              className={`profile-pill ${p.id === active.id ? 'active' : ''} ${isCompare && tab === 'compare' ? 'compare-sel' : ''}`}
              onClick={() => tab === 'compare' ? toggleCompare(p.id) : switchProfile(p.id)}
            >
              {p.name}
              <span className="pct"> {ps.compat}%</span>
              {tr && <span className={`trend ${tr.dir}`}>{tr.dir === 'up' ? '↑' : '↓'}</span>}
            </button>
          )
        })}
        <button className="profile-add" onClick={addProfile}>+ Нов</button>
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
          <main className="grid">
            <Column
              title="Зелени флагове" accent="green" which="green"
              items={active.green} expanded={expanded} setExpanded={setExpanded}
              onRate={(id, n) => setRating('green', id, n)}
              onRemove={id => removeItem('green', id)}
              onUpdate={(id, patch) => updateItem('green', id, patch)}
              newValue={newGreen} setNewValue={setNewGreen}
              onAdd={() => addItem('green', newGreen, setNewGreen)}
            />
            <Column
              title="Червени флагове" accent="red" which="red"
              items={active.red} expanded={expanded} setExpanded={setExpanded}
              onRate={(id, n) => setRating('red', id, n)}
              onRemove={id => removeItem('red', id)}
              onUpdate={(id, patch) => updateItem('red', id, patch)}
              newValue={newRed} setNewValue={setNewRed}
              onAdd={() => addItem('red', newRed, setNewRed)}
            />
          </main>
          <section className="results">
            <Ring value={stats.greenPct} color="var(--green)" label="Зелено" sub={`${stats.greenChecked}/${active.green.length}`} />
            <Ring value={stats.redPct} color="var(--red)" label="Червено" sub={`${stats.redChecked}/${active.red.length}`} />
            <Ring value={stats.compat} color="var(--yellow)" label="Съвместимост" sub="претеглено" big />
            <div className="score-breakdown">
              <div className="score-breakdown-row">
                <span>Зелени точки</span>
                <span><strong style={{ color: 'var(--green)' }}>{stats.gScore}</strong> / {stats.gMax} = {stats.greenPct}%</span>
              </div>
              <div className="score-breakdown-row">
                <span>Червени точки</span>
                <span><strong style={{ color: 'var(--red)' }}>{stats.rScore}</strong> / {stats.rMax} = {stats.redPct}%</span>
              </div>
              <div className="score-breakdown-formula">
                Съвместимост = зелено − червено = {stats.greenPct}% − {stats.redPct}% = <strong>{stats.compat}%</strong>
              </div>
              <div className="score-breakdown-note">Точките се претеглят: Основни ×3, Допълнителни ×1.</div>
            </div>
          </section>
          <div className={`verdict ${verdict.cls}`}>{verdict.text}</div>
          <details className="verdict-legend">
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
          <section className="dealbreaker-block">
            <div className="dealbreaker-block-title">🚩 Пречки (deal breakers)</div>
            {stats.triggeredDealbreakers.length > 0 ? (
              <ul className="dealbreaker-list">
                {stats.triggeredDealbreakers.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            ) : (
              <div className="dealbreaker-empty">Няма активирани пречки</div>
            )}
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
        <FlagsTable profile={active} onUpdate={updateItem} />
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

      {tab === 'compare' && (
        <section className="card">
          <div className="card-title">Сравни профили</div>
          <div className="modal-help">
            Натисни таговете отгоре, за да избереш 2 профила. Избрани: {(state.compareIds || []).length}/2
          </div>
          {(state.compareIds || []).length === 2 && (
            <CompareView
              a={state.profiles.find(p => p.id === state.compareIds[0])}
              b={state.profiles.find(p => p.id === state.compareIds[1])}
            />
          )}
        </section>
      )}

      {tab === 'insights' && (
        <section className="card">
          <div className="card-title">AI анализ · {active.name}</div>
          <div className="modal-help">
            {state.apiKey
              ? 'Изпраща текущия профил към Claude за анализ. Брутално директен изход.'
              : 'Нужен е Anthropic API ключ. Натисни 🔑 в хедъра, за да добавиш. Вземи ключ от console.anthropic.com.'}
          </div>
          <button className="insight-btn" onClick={runInsight} disabled={insight.loading}>
            {insight.loading ? 'Анализирам…' : '🧠 Стартирай анализ'}
          </button>
          {insight.error && <div className="insight-body" style={{ color: 'var(--red)' }}>{insight.error}</div>}
          {insight.text && <div className="insight-body">{insight.text}</div>}
        </section>
      )}

      <footer className="footer">
        {active.green.length + active.red.length} флага · {state.profiles.length} {state.profiles.length === 1 ? 'профил' : 'профила'} · автозапазено
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
                <h3>Anthropic API ключ</h3>
                <div className="modal-help">
                  Запазен само локално. Използва се за директни заявки към Claude API от браузъра. Вземи ключ от console.anthropic.com.
                </div>
                <input
                  type="password" placeholder="sk-ant-…" value={modalInput}
                  onChange={e => setModalInput(e.target.value)}
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') confirmModal() }}
                />
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
              <button className="modal-btn modal-btn-cancel" onClick={() => setModal(null)}>Отказ</button>
              <button className="modal-btn modal-btn-primary" onClick={confirmModal}>Запази</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Column({ title, accent, which, items, expanded, setExpanded, onRate, onRemove, onUpdate, newValue, setNewValue, onAdd }) {
  const [activeId, setActiveId] = useState(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  )

  const main = items.filter(i => i.priority === 'main')
  const secondary = items.filter(i => i.priority === 'secondary')
  const activeItem = activeId ? items.find(i => i.id === activeId) : null

  const handleDragEnd = (event) => {
    setActiveId(null)
    const { active, over } = event
    if (!over) return
    const overId = String(over.id)
    let targetPriority = null
    if (overId.startsWith('zone:')) {
      targetPriority = overId.slice(5) // "main" | "secondary"
    } else {
      const overItem = items.find(i => i.id === overId)
      if (overItem) targetPriority = overItem.priority
    }
    if (!targetPriority) return
    const dragged = items.find(i => i.id === active.id)
    if (!dragged || dragged.priority === targetPriority) return
    onUpdate(active.id, { priority: targetPriority })
  }

  return (
    <section className={`col col-${accent}`}>
      <h2 className="col-title">
        <span className={`dot dot-${accent}`} />
        {title}
        <span className="count">{items.filter(i => i.rating > 0).length}/{items.length}</span>
      </h2>
      {items.length === 0 && (
        <div className="empty col-empty">Все още няма флагове. Добави първия отдолу ↓</div>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={(e) => setActiveId(String(e.active.id))}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        {items.length > 0 && (
          <Fragment>
            <PrioritySection
              accent={accent} which={which} priority="main" label="Основни"
              items={main} expanded={expanded} setExpanded={setExpanded}
              onRate={onRate} onRemove={onRemove} onUpdate={onUpdate}
              activeId={activeId}
            />
            <PrioritySection
              accent={accent} which={which} priority="secondary" label="Допълнителни"
              items={secondary} expanded={expanded} setExpanded={setExpanded}
              onRate={onRate} onRemove={onRemove} onUpdate={onUpdate}
              activeId={activeId}
            />
          </Fragment>
        )}
        <DragOverlay dropAnimation={null}>
          {activeItem ? (
            <div className={`row drag-overlay drag-overlay-${accent}`}>
              <span className="drag-handle" aria-hidden><GripVertical size={14} /></span>
              <span className="row-text">{activeItem.text}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      <div className="add-row">
        <input
          type="text" placeholder="Добави нов флаг…" value={newValue}
          onChange={e => setNewValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onAdd() }}
        />
        <button className={`add-btn add-btn-${accent}`} onClick={onAdd}>+</button>
      </div>
    </section>
  )
}

function PrioritySection({ accent, which, priority, label, items, expanded, setExpanded, onRate, onRemove, onUpdate, activeId }) {
  const { setNodeRef, isOver } = useDroppable({ id: `zone:${priority}` })
  return (
    <div className={`priority-section ${isOver ? 'priority-over' : ''}`}>
      <div className={`priority-head priority-${priority}`}>
        <span className="priority-label">{label}</span>
        <span className="priority-weight">{priority === 'main' ? '×3' : '×1'}</span>
        <span className="priority-count">{items.length}</span>
      </div>
      <ul ref={setNodeRef} className={`list priority-list ${items.length === 0 ? 'priority-list-empty' : ''}`}>
        {items.length === 0 ? (
          <li className="priority-empty">Пусни флаг тук</li>
        ) : (
          items.map(item => (
            <SortableRow
              key={item.id} item={item} accent={accent} which={which}
              expanded={expanded} setExpanded={setExpanded}
              onRate={onRate} onRemove={onRemove} onUpdate={onUpdate}
              isDragging={activeId === item.id}
            />
          ))
        )}
      </ul>
    </div>
  )
}

function SortableRow({ item, accent, which, expanded, setExpanded, onRate, onRemove, onUpdate, isDragging }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: item.id })
  // Item is also a droppable target so cross-section drops can use its position as a hint.
  const { setNodeRef: setDropRef, isOver: isOverItem } = useDroppable({ id: item.id })
  const setRefs = (node) => { setNodeRef(node); setDropRef(node) }
  const key = `${which}-${item.id}`
  const isExp = expanded[key]
  const isDB = accent === 'red' && item.dealbreaker
  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.35 : 1,
  }
  return (
    <li ref={setRefs} style={style} className={`row-wrap ${isDB ? 'dealbreaker' : ''} ${isOverItem ? 'row-over' : ''}`}>
      <div className={`row ${item.rating > 0 ? 'rated' : ''}`}>
        <button className="drag-handle" {...attributes} {...listeners} aria-label="Премести" title="Влачи за преместване"><GripVertical size={14} /></button>
        <div className="row-body">
          <div className="row-main">
            <span className="row-text">
              {item.text}
              {isDB && <span className="db-badge" title="Пречка"><Flag size={10} fill="var(--red)" stroke="none" /></span>}
            </span>
            <button
              className={`row-note-btn ${item.note ? 'has-note' : ''}`}
              onClick={() => setExpanded(e => ({ ...e, [key]: !e[key] }))}
              title="Бележки и опции"
              aria-label="Бележки и опции"
            >{isExp ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
            <button className="row-del" onClick={() => onRemove(item.id)} title="Изтрий" aria-label="Изтрий"><X size={14} /></button>
          </div>
          <Rating accent={accent} value={item.rating} onChange={(n) => onRate(item.id, n)} />
        </div>
      </div>
      {isExp && (
        <div className="row-detail">
          {accent === 'red' && (
            <button
              className={`db-toggle ${item.dealbreaker ? 'on' : ''}`}
              onClick={() => onUpdate(item.id, { dealbreaker: !item.dealbreaker })}
            >{item.dealbreaker ? '🚩 Пречка' : 'Маркирай като пречка'}</button>
          )}
          <textarea
            placeholder="Бележки / контекст…"
            value={item.note || ''}
            onChange={e => onUpdate(item.id, { note: e.target.value })}
          />
          {item.ratedAt && (
            <div className="row-meta">
              Оценено: {new Date(item.ratedAt).toLocaleString()}
            </div>
          )}
        </div>
      )}
    </li>
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

function Ring({ value, color, label, sub, big }) {
  const size = big ? 150 : 110
  const stroke = big ? 12 : 10
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c - (value / 100) * c
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
        <text x="50%" y="50%" textAnchor="middle" dy="0.35em" fill="var(--text)" fontSize={big ? 30 : 22} fontWeight="600">
          {value}%
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
  const greenLabels = Array.from(new Set([...a.green.map(i=>i.text), ...b.green.map(i=>i.text)]))
  const redLabels = Array.from(new Set([...a.red.map(i=>i.text), ...b.red.map(i=>i.text)]))
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
          const ai = lookup(a.green, label)
          const bi = lookup(b.green, label)
          return [
            <div key={`a-g-${label}`} className={`compare-cell ${ai?.rating > 0 ? 'yes' : 'no'}`}>{cell(ai)}</div>,
            <div key={`l-g-${label}`} className="compare-label">{label}</div>,
            <div key={`b-g-${label}`} className={`compare-cell ${bi?.rating > 0 ? 'yes' : 'no'}`}>{cell(bi)}</div>,
          ]
        })}
        <div className="compare-section-head" style={{ color: 'var(--red)' }}>Червени флагове</div>
        {redLabels.flatMap(label => {
          const ai = lookup(a.red, label)
          const bi = lookup(b.red, label)
          return [
            <div key={`a-r-${label}`} className={`compare-cell ${ai?.rating > 0 ? 'yes-red' : 'no'}`}>{cell(ai)}</div>,
            <div key={`l-r-${label}`} className="compare-label">{label}</div>,
            <div key={`b-r-${label}`} className={`compare-cell ${bi?.rating > 0 ? 'yes-red' : 'no'}`}>{cell(bi)}</div>,
          ]
        })}
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

function FlagsTable({ profile, onUpdate }) {
  const allFlags = useMemo(() => {
    const list = []
    profile.green.forEach(i => list.push({ ...i, color: 'green' }))
    profile.red.forEach(i => list.push({ ...i, color: 'red' }))
    // Sort: main first, then by rating desc, then green before red.
    list.sort((a, b) => {
      const pa = a.priority === 'main' ? 0 : 1
      const pb = b.priority === 'main' ? 0 : 1
      if (pa !== pb) return pa - pb
      if (b.rating !== a.rating) return b.rating - a.rating
      return a.color === 'green' ? -1 : 1
    })
    return list
  }, [profile])

  if (allFlags.length === 0) {
    return (
      <section className="card">
        <div className="card-title">{profile.name} · Таблица на флаговете</div>
        <div className="empty">Все още няма флагове. Добави в раздел Флагове.</div>
      </section>
    )
  }

  return (
    <section className="card">
      <div className="card-title">
        <span>{profile.name} · Таблица на флаговете</span>
        <span style={{ color: 'var(--muted)', fontSize: 11, textTransform: 'none', letterSpacing: 0 }}>
          {allFlags.length} {allFlags.length === 1 ? 'флаг' : 'флага'}
        </span>
      </div>
      <div className="flags-table-wrap">
        <table className="flags-table">
          <thead>
            <tr>
              <th>Флаг</th>
              <th className="th-priority">Важност</th>
              <th className="th-rating">Оценка</th>
              <th>Бележки</th>
            </tr>
          </thead>
          <tbody>
            {allFlags.map(item => (
              <tr key={`${item.color}-${item.id}`} className={`tr-${item.color}`}>
                <td>
                  <span className={`color-pill color-${item.color}`} title={item.color === 'green' ? 'Зелен флаг' : 'Червен флаг'}>
                    <Flag size={11} fill={item.color === 'green' ? 'var(--green)' : 'var(--red)'} stroke="none" />
                  </span>
                  <span className="flag-name">{item.text}</span>
                  {item.color === 'red' && item.dealbreaker && <span className="db-badge" title="Пречка"> 🚩</span>}
                </td>
                <td className="td-priority">
                  <span className={`priority-tag priority-tag-${item.priority}`}>
                    {item.priority === 'main' ? 'Основен' : 'Допълнителен'}
                  </span>
                </td>
                <td className="td-rating">
                  <span className={`rating-num rating-num-${item.color} ${item.rating > 0 ? 'set' : ''}`}>
                    {item.rating > 0 ? `${item.rating}/5` : '—'}
                  </span>
                </td>
                <td className="td-note">
                  <input
                    className="note-inline"
                    type="text"
                    placeholder="—"
                    value={item.note || ''}
                    onChange={e => onUpdate(item.color, item.id, { note: e.target.value })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function PdfReport({ profile, stats, verdict }) {
  const flagRow = (item, color) => (
    <tr key={`${color}-${item.id}`}>
      <td style={{ padding: '6px 8px', borderBottom: '1px solid #2a2a2e' }}>
        <span style={{
          display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
          background: color === 'green' ? '#30d158' : '#ff453a', marginRight: 6,
        }} />
        {item.text}{color === 'red' && item.dealbreaker ? ' 🚩' : ''}
      </td>
      <td style={{ padding: '6px 8px', borderBottom: '1px solid #2a2a2e', color: '#a0a0a8' }}>
        {item.priority === 'main' ? 'Основен' : 'Допълнителен'}
      </td>
      <td style={{ padding: '6px 8px', borderBottom: '1px solid #2a2a2e', textAlign: 'center', fontWeight: 600 }}>
        {item.rating > 0 ? `${item.rating}/5` : '—'}
      </td>
      <td style={{ padding: '6px 8px', borderBottom: '1px solid #2a2a2e', color: '#a0a0a8', fontSize: 11 }}>
        {item.note || '—'}
      </td>
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
        <PdfMetric label="Съвместимост" value={`${stats.compat}%`} accent="#ffd60a" big />
        <PdfMetric label="Зелено" value={`${stats.greenPct}%`} sub={`${stats.greenChecked}/${profile.green.length}`} accent="#30d158" />
        <PdfMetric label="Червено" value={`${stats.redPct}%`} sub={`${stats.redChecked}/${profile.red.length}`} accent="#ff453a" />
      </div>

      <div style={{
        padding: 12, background: '#161618', border: '1px solid #2a2a2e',
        borderRadius: 8, marginBottom: 20, fontWeight: 600, textAlign: 'center',
        color: verdict.cls === 'verdict-green' ? '#30d158' : verdict.cls === 'verdict-red' ? '#ff453a' : '#ffd60a',
      }}>
        {verdict.text}
      </div>

      {profile.green.length > 0 && (
        <Fragment>
          <h3 style={{ fontSize: 14, color: '#30d158', margin: '16px 0 8px' }}>Зелени флагове</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ color: '#a0a0a8', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #2a2a2e' }}>Флаг</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #2a2a2e' }}>Важност</th>
                <th style={{ textAlign: 'center', padding: '6px 8px', borderBottom: '1px solid #2a2a2e' }}>Оценка</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #2a2a2e' }}>Бележки</th>
              </tr>
            </thead>
            <tbody>{profile.green.map(i => flagRow(i, 'green'))}</tbody>
          </table>
        </Fragment>
      )}

      {profile.red.length > 0 && (
        <Fragment>
          <h3 style={{ fontSize: 14, color: '#ff453a', margin: '16px 0 8px' }}>Червени флагове</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ color: '#a0a0a8', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #2a2a2e' }}>Флаг</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #2a2a2e' }}>Важност</th>
                <th style={{ textAlign: 'center', padding: '6px 8px', borderBottom: '1px solid #2a2a2e' }}>Оценка</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #2a2a2e' }}>Бележки</th>
              </tr>
            </thead>
            <tbody>{profile.red.map(i => flagRow(i, 'red'))}</tbody>
          </table>
        </Fragment>
      )}

      <div style={{ marginTop: 24, paddingTop: 12, borderTop: '1px solid #2a2a2e', fontSize: 10, color: '#7a7a82' }}>
        Поверително · поколение от Flag Check · оценките са 1-5 по интензитет, важността е Основен (×3) или Допълнителен (×1)
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
