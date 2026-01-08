import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import './App.css'

type Language = 'en' | 'de' | 'ru'
type Difficulty = 'beginner' | 'intermediate' | 'advanced'

type LocalizedEntry = { text: string; lastModified?: string }
type RawOption = Record<string, LocalizedEntry>
type RawSituation = {
  id: string
  question: Record<string, LocalizedEntry>
  answer: Record<string, LocalizedEntry>
  answerOpt: number
  options: RawOption[]
}

type CategoryNode = {
  id: string
  name: Record<Language, string>
  subcategories: {
    id: string
    name: Record<Language, string>
    situationIds: string[]
  }[]
}

type MediaManifest = Record<string, ('question' | 'answer')[]>

type Situation = RawSituation & {
  difficulty: Difficulty
  hasQuestionVideo: boolean
  hasAnswerVideo: boolean
  subcategories: string[]
  parentCategories: string[]
}

type CategoryIndex = {
  byId: Record<string, Set<string>>
  subMeta: Record<
    string,
    { parentId: string; name: Record<Language, string>; parentName: Record<Language, string> }
  >
  situationToSub: Record<string, string[]>
}

const DATA_FILES: { path: string; difficulty: Difficulty }[] = [
  { path: 'data/situations_beginner.json', difficulty: 'beginner' },
  { path: 'data/situations_intermediate.json', difficulty: 'intermediate' },
  { path: 'data/situations_advanced.json', difficulty: 'advanced' },
]

const LANG_LABELS: Record<Language, string> = {
  en: 'English',
  de: 'Deutsch',
  ru: 'Русский',
}

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
}

function asset(path: string) {
  return `${import.meta.env.BASE_URL}${path}`
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(asset(path))
  if (!res.ok) {
    throw new Error(`Failed to load ${path}: ${res.status}`)
  }
  return res.json()
}

function getLocalizedText(entry: Record<string, LocalizedEntry>, lang: Language) {
  return (
    entry?.[lang]?.text ??
    entry?.en?.text ??
    entry?.de?.text ??
    entry?.ru?.text ??
    ''
  )
}

function getOptionText(option: RawOption, lang: Language) {
  return (
    option?.[lang] ||
    option?.en ||
    option?.de ||
    option?.ru ||
    { text: '' }
  ).text
}

function buildCategoryIndex(categories: CategoryNode[]): CategoryIndex {
  const byId: Record<string, Set<string>> = {}
  const subMeta: CategoryIndex['subMeta'] = {}
  const situationToSub: Record<string, string[]> = {}

  categories.forEach((cat) => {
    const parentSet = new Set<string>()
    cat.subcategories.forEach((sub) => {
      subMeta[sub.id] = { parentId: cat.id, name: sub.name, parentName: cat.name }
      byId[sub.id] = new Set(sub.situationIds)
      sub.situationIds.forEach((sid) => {
        parentSet.add(sid)
        situationToSub[sid] = situationToSub[sid] || []
        situationToSub[sid].push(sub.id)
      })
    })
    byId[cat.id] = parentSet
  })

  return { byId, subMeta, situationToSub }
}

function normalizeSituations(
  raw: RawSituation[],
  difficulty: Difficulty,
  media: MediaManifest,
  index?: CategoryIndex,
): Situation[] {
  return raw.map((item) => {
    const options = item.options.map((opt) =>
      Object.fromEntries(
        Object.entries(opt).filter(([key]) => !key.endsWith('_short')),
      ),
    ) as RawOption[]
    const subcategories = index?.situationToSub[item.id] ?? []
    const parentCategories = subcategories
      .map((subId) => index?.subMeta[subId]?.parentId)
      .filter(Boolean) as string[]
    return {
      ...item,
      options,
      difficulty,
      subcategories,
      parentCategories,
      hasQuestionVideo: Boolean(media[item.id]?.includes('question')),
      hasAnswerVideo: Boolean(media[item.id]?.includes('answer')),
    }
  })
}

function useKeyboardNav(ids: string[], selectedId: string | null, onSelect: (id: string) => void) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (!selectedId || !ids.length) return
      const idx = ids.indexOf(selectedId)
      if (idx === -1) return
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault()
        const next = ids[Math.min(ids.length - 1, idx + 1)]
        if (next) onSelect(next)
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault()
        const prev = ids[Math.max(0, idx - 1)]
        if (prev) onSelect(prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [ids, onSelect, selectedId])
}

function filterSituations(
  situations: Situation[],
  params: {
    difficulty: Difficulty | 'all'
    category: string
    query: string
    lang: Language
    issuesOnly: boolean
    categorySets?: Record<string, Set<string>>
  },
) {
  const q = params.query.trim().toLowerCase()
  return situations.filter((s) => {
    if (params.difficulty !== 'all' && s.difficulty !== params.difficulty) return false
    if (params.category) {
      const set = params.categorySets?.[params.category]
      if (!set || !set.has(s.id)) return false
    }
    if (params.issuesOnly) {
      const hasIssues = !s.hasQuestionVideo || !s.hasAnswerVideo || s.subcategories.length === 0
      if (!hasIssues) return false
    }
    if (!q) return true
    const haystack = [
      s.id,
      getLocalizedText(s.question, params.lang),
      getLocalizedText(s.answer, params.lang),
      ...s.options.map((opt) => getOptionText(opt, params.lang)),
    ]
      .join(' ')
      .toLowerCase()
    return haystack.includes(q)
  })
}

export default function App() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [situations, setSituations] = useState<Situation[]>([])
  const [categories, setCategories] = useState<CategoryNode[]>([])
  const [categoryIndex, setCategoryIndex] = useState<CategoryIndex | null>(null)
  const [uncategorized, setUncategorized] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(true)

  const langParam = searchParams.get('lang')
  const lang: Language = langParam === 'de' || langParam === 'ru' ? langParam : 'en'
  const difficultyParam = searchParams.get('difficulty')
  const difficulty: Difficulty | 'all' =
    difficultyParam === 'beginner' || difficultyParam === 'intermediate' || difficultyParam === 'advanced'
      ? difficultyParam
      : 'all'
  const category = searchParams.get('category') || ''
  const query = searchParams.get('q') || ''
  const issuesOnly = searchParams.get('issues') === '1'
  const selectedId = searchParams.get('id')

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        setError(null)
        const [beginner, intermediate, advanced, categoryData, mediaManifest] = await Promise.all([
          fetchJson<RawSituation[]>(DATA_FILES[0].path),
          fetchJson<RawSituation[]>(DATA_FILES[1].path),
          fetchJson<RawSituation[]>(DATA_FILES[2].path),
          fetchJson<CategoryNode[]>('data/categories.json'),
          fetchJson<MediaManifest>('data/media-manifest.json'),
        ])
        const idx = buildCategoryIndex(categoryData)
        const normalized = [
          ...normalizeSituations(beginner, 'beginner', mediaManifest, idx),
          ...normalizeSituations(intermediate, 'intermediate', mediaManifest, idx),
          ...normalizeSituations(advanced, 'advanced', mediaManifest, idx),
        ]
        setSituations(normalized)
        setCategories(categoryData)
        setCategoryIndex(idx)
        const unc = normalized.filter((s) => s.subcategories.length === 0).map((s) => s.id)
        setUncategorized(unc)
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const categorySets = useMemo(() => categoryIndex?.byId ?? {}, [categoryIndex])

  const filtered = useMemo(
    () =>
      filterSituations(situations, {
        difficulty: difficulty as Difficulty | 'all',
        category,
        query,
        lang,
        issuesOnly,
        categorySets,
      }),
    [category, categorySets, difficulty, issuesOnly, lang, query, situations],
  )

  useEffect(() => {
    if (filtered.length === 0) return
    if (!selectedId || !filtered.find((s) => s.id === selectedId)) {
      const params = new URLSearchParams(searchParams)
      params.set('id', filtered[0].id)
      setSearchParams(params, { replace: true })
    }
  }, [filtered, searchParams, selectedId, setSearchParams])

  const ids = filtered.map((s) => s.id)
  const current = filtered.find((s) => s.id === selectedId) ?? null

  function updateParam(key: string, value: string | null, preserveId = false) {
    const next = new URLSearchParams(searchParams)
    if (!value || value === 'all') {
      next.delete(key)
    } else {
      next.set(key, value)
    }
    if (key !== 'id' && !preserveId) {
      next.delete('id')
    }
    setSearchParams(next, { replace: true })
  }

  function selectId(id: string) {
    const next = new URLSearchParams(searchParams)
    next.set('id', id)
    setSearchParams(next, { replace: true })
  }

  function go(delta: number) {
    if (!current) return
    const idx = ids.indexOf(current.id)
    const target = ids[idx + delta]
    if (target) selectId(target)
  }

  useKeyboardNav(ids, current?.id ?? null, selectId)

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    Object.entries(categorySets).forEach(([id, set]) => {
      counts[id] = set.size
    })
    return counts
  }, [categorySets])

  const issueIds = useMemo(
    () =>
      situations
        .filter((s) => !s.hasQuestionVideo || !s.hasAnswerVideo || s.subcategories.length === 0)
        .map((s) => s.id),
    [situations],
  )

  if (loading) {
    return (
      <div className="app">
        <div className="empty">Loading situations…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="app">
        <div className="empty">Failed to load: {error}</div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__title">
          <h1>RRS Situations Review</h1>
          <span>Browse questions, answers, animations, and categories</span>
        </div>
        <div className="filters-inline">
          <div className="chip-row">
            {(['en', 'de', 'ru'] as Language[]).map((l) => (
              <button
                key={l}
                className={clsx('chip', { active: lang === l })}
                onClick={() => updateParam('lang', l, true)}
              >
                {LANG_LABELS[l]}
              </button>
            ))}
          </div>
          <div className="search-bar">
            <input
              className="search-input"
              placeholder="Search text or ID"
              value={query}
              onChange={(e) => updateParam('q', e.target.value)}
            />
          </div>
          <button className="btn secondary" onClick={() => setShowFilters((v) => !v)}>
            {showFilters ? 'Hide filters' : 'Show filters'}
          </button>
        </div>
      </header>

      <div className="layout" style={{ gridTemplateColumns: showFilters ? '320px 1fr' : '1fr' }}>
        {showFilters && (
          <aside className="panel">
            <div className="panel__section">
              <div className="panel__title">Difficulty</div>
              <div className="chip-row">
              {(['all', 'beginner', 'intermediate', 'advanced'] as const).map((d) => (
                <button
                  key={d}
                  className={clsx('chip', { active: difficulty === d })}
                  onClick={() => updateParam('difficulty', d === 'all' ? null : d, true)}
                >
                  {d === 'all' ? 'All' : DIFFICULTY_LABELS[d as Difficulty]}
                </button>
              ))}
            </div>
            </div>

            <div className="panel__section">
              <div className="panel__title">Categories</div>
              <div className="category-tree">
                <button
                  className={clsx('category-button', { active: category === '' })}
                  onClick={() => updateParam('category', null, true)}
                >
                  <span>All categories</span>
                  <span className="count-pill">{situations.length}</span>
                </button>
                {categories.map((cat) => (
                  <div key={cat.id} className="category-parent">
                    <div className="category-label">
                      {cat.name[lang] || cat.name.en} <span className="count-pill">{categoryCounts[cat.id] || 0}</span>
                    </div>
                    <div className="subcategory-list">
                      {cat.subcategories.map((sub) => (
                        <button
                          key={sub.id}
                          className={clsx('category-button', { active: category === sub.id })}
                          onClick={() => updateParam('category', sub.id, true)}
                        >
                          <span>{sub.name[lang] || sub.name.en}</span>
                          <span className="count-pill">{categoryCounts[sub.id] || 0}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel__section">
              <div className="panel__title">Checks</div>
              <div className="issue-toggle">
                <input
                  type="checkbox"
                  checked={issuesOnly}
                  onChange={(e) => updateParam('issues', e.target.checked ? '1' : null)}
                />
                <span>Show items with issues ({issueIds.length})</span>
              </div>
              <div className="issue-row" style={{ marginTop: 8 }}>
                <span className="pill issue">Missing media</span>
                <span className="pill">Uncategorized: {uncategorized.length}</span>
              </div>
            </div>
          </aside>
        )}

        <div className="main">
          <section className="list-pane">
            <div className="list-header">
              <span>{filtered.length} situations</span>
              <span className="stat-block">
                <span className="pill">Issues: {issueIds.length}</span>
              </span>
            </div>
            <div className="list">
              {filtered.length === 0 && <div className="empty">No situations match the filters.</div>}
              {filtered.map((s) => {
                const hasIssues = !s.hasQuestionVideo || !s.hasAnswerVideo || s.subcategories.length === 0
                return (
                  <div
                    key={s.id}
                    className={clsx('card', { active: current?.id === s.id })}
                    onClick={() => selectId(s.id)}
                  >
                    <div className="card__top">
                      <span>{s.id}</span>
                      <span className={clsx('pill', `difficulty-${s.difficulty}`)}>
                        {DIFFICULTY_LABELS[s.difficulty]}
                      </span>
                      {hasIssues && <span className="pill issue">Issue</span>}
                    </div>
                    <div className="card__question">{getLocalizedText(s.question, lang)}</div>
                    <div className="card__meta">
                      {s.subcategories.map((subId) => {
                        const meta = categoryIndex?.subMeta[subId]
                        if (!meta) return null
                        return (
                          <span key={subId} className="pill">
                            {meta.parentName[lang] || meta.parentName.en} / {meta.name[lang] || meta.name.en}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="detail-pane">
            {!current && <div className="empty">Select a situation to review.</div>}
            {current && (
              <>
                <div className="detail-header">
                  <h2>
                    {current.id} — {getLocalizedText(current.question, lang)}
                  </h2>
                  <span className={clsx('pill', `difficulty-${current.difficulty}`)}>
                    {DIFFICULTY_LABELS[current.difficulty]}
                  </span>
                  {!current.hasQuestionVideo || !current.hasAnswerVideo ? (
                    <span className="pill issue">Media missing</span>
                  ) : null}
                  {current.subcategories.length === 0 ? (
                    <span className="pill issue">Uncategorized</span>
                  ) : null}
                </div>

                <div className="detail-meta">
                  <div className="nav-buttons">
                    <button className="btn secondary" onClick={() => go(-1)} disabled={ids[0] === current.id}>
                      Prev
                    </button>
                    <button className="btn secondary" onClick={() => go(1)} disabled={ids[ids.length - 1] === current.id}>
                      Next
                    </button>
                  </div>
                  <div className="stat-block">
                    <span className="pill">Options: {current.options.length}</span>
                    <span className="pill">
                      Categories: {current.subcategories.length || '—'}
                    </span>
                  </div>
                </div>

                <div className="options">
                  {current.options.map((opt, idx) => (
                    <div key={idx} className={clsx('option', { correct: idx === current.answerOpt })}>
                      <strong>Option {idx + 1}</strong>: {getOptionText(opt, lang)}
                    </div>
                  ))}
                </div>

                {(() => {
                  const videos = [
                    current.hasQuestionVideo
                      ? { key: 'question', label: 'Question animation', src: asset(`media/${current.id}_question.mp4`) }
                      : null,
                    current.hasAnswerVideo
                      ? { key: 'answer', label: 'Answer animation', src: asset(`media/${current.id}_answer.mp4`) }
                      : null,
                  ].filter(Boolean) as { key: string; label: string; src: string }[]

                  if (videos.length === 0) return null

                  return (
                    <div
                      className="video-grid"
                      style={{ gridTemplateColumns: `repeat(${videos.length}, minmax(0, 1fr))` }}
                    >
                      {videos.map((v) => (
                        <div className="video-box" key={v.key}>
                          <h4>{v.label}</h4>
                          <video controls src={v.src} />
                        </div>
                      ))}
                    </div>
                  )
                })()}

                <div className="markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {getLocalizedText(current.question, lang)}
                  </ReactMarkdown>
                </div>

                <div className="markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {getLocalizedText(current.answer, lang)}
                  </ReactMarkdown>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
