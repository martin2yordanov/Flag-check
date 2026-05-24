import { useState, useEffect, useMemo, Fragment } from 'react'
import './App.css'

const DEFAULT_GREEN = [
  'Емоционална интелигентност',
  'Дали се напряга, да е chill, над нещата',
  'Да е палава в леглото',
  'Колко близка е с майка си',
  'Има ли приятелки',
  'Умее ли да се извинява и признава грешките',
  'Да не изневерява и как се държи с други мъже',
  'Умее ли да прощава / да не е злопаметна',
  'Говори ли за проблемите на момента',
  'Имаме ли общи интереси',
  'Има ли чувство за хумор',
  'Искрена ли е с мен',
  'Позитивна ли е, yes man',
  'Да не е ревнива',
  'Да не е обсебваща/да може да прекарва време със себе си',
]
const DEFAULT_RED = [
  'Прекалено емоционална',
  'Незряла',
  'Не готви',
  'Не е сексуална / физическа',
  'Не е млада',
  'Лекодостъпна',
  'Лъже',
  'Заядлива',
  'Не знае какво иска',
]

const STORAGE_KEY = 'flag-check-v3'
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2,8)}`
const today = () => new Date().toISOString().slice(0,10)

const makeItems = (texts) => texts.map(text => ({
  id: uid(), text, rating: 0, weight: 3, note: '', ratedAt: null, dealbreaker: false,
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
  return {
    note: '',
    dealbreaker: false,
    weight: 3,
    ...i,
    rating,
    ratedAt,
  }
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const p = JSON.parse(saved)
      if (p.profiles?.length) {
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
    }
  } catch {}
  const def = makeProfile('Default')
  return { profiles: [def], activeId: def.id, streak: { count: 0, lastDay: null }, apiKey: '', compareIds: [] }
}

function computeStats(profile) {
  const g = profile.green, r = profile.red
  const gMax = g.reduce((s,i)=>s + 5 * i.weight, 0) || 1
  const gScore = g.reduce((s,i)=>s + i.rating * i.weight, 0)
  const rMax = r.reduce((s,i)=>s + 5 * i.weight, 0) || 1
  const rScore = r.reduce((s,i)=>s + i.rating * i.weight, 0)
  const greenPct = Math.round((gScore / gMax) * 100)
  const redPct = Math.round((rScore / rMax) * 100)
  const compat = Math.max(0, Math.min(100, Math.round(greenPct - redPct)))
  const triggeredDealbreakers = r.filter(i => i.rating > 0 && i.dealbreaker).map(i => i.text)
  return {
    greenChecked: g.filter(i=>i.rating > 0).length,
    redChecked: r.filter(i=>i.rating > 0).length,
    greenPct, redPct, compat, triggeredDealbreakers,
  }
}

function trendFor(profile) {
  const h = profile.history || []
  if (h.length < 2) return null
  const last = h[h.length - 1].compat
  const prev = h[h.length - 2].compat
  const d = last - prev
  if (Math.abs(d) < 3) return null
  return d > 0 ? { dir: 'up', d } : { dir: 'down', d }
}

function verdictFor(compat, redPct, dbTriggered) {
  if (dbTriggered.length > 0) return { text: `🚩 Пречка: ${dbTriggered[0]}`, cls: 'verdict-red' }
  if (redPct >= 40) return { text: '🚩 Прекалено много червени флагове — бягай', cls: 'verdict-red' }
  if (compat >= 70) return { text: '✨ Силен мач — продължи', cls: 'verdict-green' }
  if (compat >= 50) return { text: '👀 Обещаващо — наблюдавай', cls: 'verdict-yellow' }
  if (compat >= 30) return { text: '⚠️ Смесени сигнали — внимавай', cls: 'verdict-yellow' }
  return { text: '❌ Ниска съвместимост', cls: 'verdict-red' }
}

export default function App() {
  const [state, setState] = useState(loadState)
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

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

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
      [which]: [...p[which], { id: uid(), text: v, rating: 0, weight: 3, note: '', ratedAt: null, dealbreaker: false }],
    }))
    setText('')
  }

  const addProfile = () => { setModal({ type: 'newProfile' }); setModalInput('') }
  const setApiKey = () => { setModal({ type: 'apiKey' }); setModalInput(state.apiKey || '') }
  const confirmModal = () => {
    if (modal?.type === 'newProfile') {
      const name = modalInput.trim() || 'Нов'
      const p = makeProfile(name)
      setState(s => ({ ...s, profiles: [...s.profiles, p], activeId: p.id }))
    } else if (modal?.type === 'apiKey') {
      setState(s => ({ ...s, apiKey: modalInput.trim() }))
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

  const exportData = () => {
    const data = JSON.stringify(state, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `flag-check-${new Date().toISOString().slice(0,10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const runInsight = async () => {
    if (!state.apiKey) { setApiKey(); return }
    setInsight({ loading: true, text: '', error: '' })
    const greenRated = active.green.filter(i => i.rating > 0).map(i => `${i.text} (rating ${i.rating}/5, weight ${i.weight})${i.note ? ' — ' + i.note : ''}`)
    const greenUnrated = active.green.filter(i => i.rating === 0).map(i => `${i.text} (weight ${i.weight})`)
    const redRated = active.red.filter(i => i.rating > 0).map(i => `${i.text} (rating ${i.rating}/5, weight ${i.weight})${i.note ? ' — ' + i.note : ''}${i.dealbreaker ? ' [DEALBREAKER]' : ''}`)
    const redUnrated = active.red.filter(i => i.rating === 0).map(i => i.text)
    const journal = (active.journal || []).slice(0, 5).map(j => `[${new Date(j.t).toLocaleDateString()}${j.mood ? ' ' + j.mood : ''}] ${j.text}`)

    const prompt = `You are a brutally direct dating analyst. Respond in Bulgarian. Be concise (max 8 sentences total). No fluff, no preamble. Use short declarative sentences.

Subject: ${active.name}
Compatibility: ${stats.compat}% (green ${stats.greenPct}%, red ${stats.redPct}%)
Each flag is rated 1-5 (intensity) and weighted 1-5 (importance).

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

  const verdict = verdictFor(stats.compat, stats.redPct, stats.triggeredDealbreakers)
  const dbBanner = stats.triggeredDealbreakers.length > 0 && !bannerDismissed

  return (
    <div className="app">
      <header className="header">
        <h1>Flag Check</h1>
        <div className="header-actions">
          <button className="btn-ghost" onClick={setApiKey} title="API ключ">🔑</button>
          <button className="btn-ghost" onClick={exportData} title="Експорт">↓</button>
          <button className="btn-ghost" onClick={snapshot} title="Запис">💾</button>
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
              onDoubleClick={() => deleteProfile(p.id)}
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
          ['flags', 'Флагове'],
          ['journal', 'Дневник'],
          ['compare', 'Сравнение'],
          ['insights', 'AI'],
        ].map(([t, label]) => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {label}
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
          </section>
          <div className={`verdict ${verdict.cls}`}>{verdict.text}</div>
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
              ? <div className="empty">Натисни 💾 за запис на текущия резултат</div>
              : <HistoryChart history={active.history} />}
          </section>
        </Fragment>
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
        {active.green.length + active.red.length} флага · {state.profiles.length} {state.profiles.length === 1 ? 'профил' : 'профила'} · запазено локално
      </footer>

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
  return (
    <section className={`col col-${accent}`}>
      <h2 className="col-title">
        <span className={`dot dot-${accent}`} />
        {title}
        <span className="count">{items.filter(i => i.rating > 0).length}/{items.length}</span>
      </h2>
      <ul className="list">
        {items.map(item => {
          const key = `${which}-${item.id}`
          const isExp = expanded[key]
          const isDB = accent === 'red' && item.dealbreaker
          return (
            <li key={item.id} className={`row-wrap ${isDB ? 'dealbreaker' : ''}`}>
              <div className={`row ${item.rating > 0 ? 'rated' : ''}`}>
                <Rating accent={accent} value={item.rating} onChange={(n) => onRate(item.id, n)} />
                <span className="row-text">
                  {item.text}
                  {isDB && <span className="db-badge" title="Пречка">🚩</span>}
                </span>
                <span className="row-weight" title="Тежест">×{item.weight}</span>
                <button
                  className={`row-note-btn ${item.note ? 'has-note' : ''}`}
                  onClick={() => setExpanded(e => ({ ...e, [key]: !e[key] }))}
                >{isExp ? '▾' : '▸'}</button>
                <button className="row-del" onClick={() => onRemove(item.id)}>×</button>
              </div>
              {isExp && (
                <div className="row-detail">
                  <div className="weight-row">
                    Тежест:
                    {[1,2,3,4,5].map(w => (
                      <button
                        key={w}
                        className={`weight-pill ${item.weight === w ? 'sel' : ''}`}
                        onClick={() => onUpdate(item.id, { weight: w })}
                      >{w}</button>
                    ))}
                    {accent === 'red' && (
                      <button
                        className={`db-toggle ${item.dealbreaker ? 'on' : ''}`}
                        onClick={() => onUpdate(item.id, { dealbreaker: !item.dealbreaker })}
                      >{item.dealbreaker ? '🚩 Пречка' : 'Маркирай като пречка'}</button>
                    )}
                  </div>
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
        })}
      </ul>
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

function Rating({ accent, value, onChange }) {
  return (
    <div className={`rating rating-${accent}`} role="radiogroup" aria-label="Оценка 1-5">
      {[1,2,3,4,5].map(n => (
        <button
          key={n}
          className={`rating-dot ${n <= value ? 'on' : ''}`}
          onClick={() => onChange(n)}
          aria-label={`${n}`}
          title={`${n}/5`}
        >{n}</button>
      ))}
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
        <div className="compare-section-head" style={{ color: 'var(--green)' }}>✓ Зелени флагове</div>
        {greenLabels.flatMap(label => {
          const ai = lookup(a.green, label)
          const bi = lookup(b.green, label)
          return [
            <div key={`a-g-${label}`} className={`compare-cell ${ai?.rating > 0 ? 'yes' : 'no'}`}>{cell(ai)}</div>,
            <div key={`l-g-${label}`} className="compare-label">{label}</div>,
            <div key={`b-g-${label}`} className={`compare-cell ${bi?.rating > 0 ? 'yes' : 'no'}`}>{cell(bi)}</div>,
          ]
        })}
        <div className="compare-section-head" style={{ color: 'var(--red)' }}>🚩 Червени флагове</div>
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
