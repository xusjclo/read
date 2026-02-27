import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import ePub from 'epubjs'
import type { Book, Rendition, NavItem } from 'epubjs'
import { useBookStore } from '../stores/bookStore'
import { getBookFile } from '../utils/db'

interface TocItem {
  label: string
  href: string
  subitems?: TocItem[]
}

const THEMES = {
  light: { body: { background: '#ffffff', color: '#1a1a1a' } },
  dark: { body: { background: '#1a1a2e', color: '#e0e0e0' } },
  sepia: { body: { background: '#f4ecd8', color: '#5b4636' } },
}

const THEME_BG: Record<string, string> = { light: '#ffffff', dark: '#1a1a2e', sepia: '#f4ecd8' }
const THEME_TEXT: Record<string, string> = { light: '#1a1a1a', dark: '#e0e0e0', sepia: '#5b4636' }

export default function EpubReader() {
  const { bookId } = useParams<{ bookId: string }>()
  const navigate = useNavigate()
  const viewerRef = useRef<HTMLDivElement>(null)
  const bookRef = useRef<Book | null>(null)
  const renditionRef = useRef<Rendition | null>(null)

  const {
    loadProgress, updateProgress,
    bookmarks, loadBookmarks, addBookmark, removeBookmark,
    theme, fontSize, setTheme, setFontSize,
  } = useBookStore()

  const [toc, setToc] = useState<TocItem[]>([])
  const [showSidebar, setShowSidebar] = useState(false)
  const [sidebarTab, setSidebarTab] = useState<'toc' | 'bookmarks' | 'settings'>('toc')
  const [currentChapter, setCurrentChapter] = useState('')
  const [progress, setProgress] = useState(0)
  const [ready, setReady] = useState(false)

  const flattenToc = (items: NavItem[]): TocItem[] => {
    return items.map((item) => ({
      label: item.label.trim(),
      href: item.href,
      subitems: item.subitems ? flattenToc(item.subitems) : undefined,
    }))
  }

  useEffect(() => {
    if (!bookId || !viewerRef.current) return
    let destroyed = false

    const init = async () => {
      const fileData = await getBookFile(bookId)
      if (!fileData || destroyed) return

      await loadProgress(bookId)
      await loadBookmarks(bookId)

      const book = ePub(fileData)
      bookRef.current = book

      const rendition = book.renderTo(viewerRef.current!, {
        width: '100%',
        height: '100%',
        spread: 'none',
        flow: 'paginated',
      })

      renditionRef.current = rendition

      Object.entries(THEMES).forEach(([name, styles]) => {
        rendition.themes.register(name, styles)
      })

      rendition.themes.select(theme)
      rendition.themes.fontSize(`${fontSize}px`)
      rendition.themes.default({
        body: { 'line-height': '1.8', 'padding': '0 16px' },
        'p': { 'margin-bottom': '0.8em' },
      })

      const nav = await book.loaded.navigation
      setToc(flattenToc(nav.toc))

      const savedProgress = useBookStore.getState().currentProgress
      if (savedProgress?.location) {
        await rendition.display(savedProgress.location)
      } else {
        await rendition.display()
      }

      rendition.on('relocated', (location: { start: { cfi: string; href: string; percentage: number }; atEnd: boolean }) => {
        if (destroyed) return
        const pct = Math.floor((location.start.percentage || 0) * 100)
        setProgress(pct)
        const chapter = nav.toc.find((t) => location.start.href.includes(t.href))
        if (chapter) setCurrentChapter(chapter.label.trim())
        updateProgress({
          bookId: bookId!,
          location: location.start.cfi,
          percentage: pct,
          updatedAt: Date.now(),
        })
      })

      setReady(true)
    }

    init()

    return () => {
      destroyed = true
      if (renditionRef.current) { renditionRef.current.destroy(); renditionRef.current = null }
      if (bookRef.current) { bookRef.current.destroy(); bookRef.current = null }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId])

  useEffect(() => { if (renditionRef.current) renditionRef.current.themes.select(theme) }, [theme])
  useEffect(() => { if (renditionRef.current) renditionRef.current.themes.fontSize(`${fontSize}px`) }, [fontSize])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') renditionRef.current?.prev()
      if (e.key === 'ArrowRight') renditionRef.current?.next()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const goToChapter = useCallback((href: string) => {
    renditionRef.current?.display(href)
    setShowSidebar(false)
  }, [])

  const handleAddBookmark = useCallback(async () => {
    if (!bookId || !renditionRef.current) return
    const location = renditionRef.current.currentLocation() as { start: { cfi: string } } | undefined
    if (!location) return
    const cfi = location.start.cfi
    const existing = bookmarks.find((b) => b.cfi === cfi)
    if (existing) {
      await removeBookmark(bookId, existing.id)
    } else {
      await addBookmark({
        id: crypto.randomUUID(),
        bookId,
        cfi,
        text: currentChapter || '未知位置',
        color: '#fbbf24',
        note: '',
        createdAt: Date.now(),
      })
    }
  }, [bookId, bookmarks, currentChapter, addBookmark, removeBookmark])

  const currentCfi = (() => {
    try {
      const loc = renditionRef.current?.currentLocation() as { start: { cfi: string } } | undefined
      return loc?.start?.cfi || ''
    } catch { return '' }
  })()

  const isBookmarked = bookmarks.some((b) => b.cfi === currentCfi)

  return (
    <div className="h-screen flex flex-col" style={{ background: THEME_BG[theme], color: THEME_TEXT[theme] }}>
      <header className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: theme === 'dark' ? '#333' : '#e5e7eb' }}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 rounded-lg hover:bg-black/5 transition-colors cursor-pointer">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <span className="text-sm opacity-60 truncate max-w-[200px]">{currentChapter}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleAddBookmark} className="p-2 rounded-lg hover:bg-black/5 transition-colors cursor-pointer" title="书签">
            <svg className="w-5 h-5" fill={isBookmarked ? '#fbbf24' : 'none'} stroke={isBookmarked ? '#fbbf24' : 'currentColor'} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
          </button>
          <button onClick={() => { setShowSidebar(!showSidebar); setSidebarTab('toc') }} className="p-2 rounded-lg hover:bg-black/5 transition-colors cursor-pointer" title="目录">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <button onClick={() => { setShowSidebar(!showSidebar); setSidebarTab('settings') }} className="p-2 rounded-lg hover:bg-black/5 transition-colors cursor-pointer" title="设置">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        <div className="flex-1 relative">
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="animate-spin h-8 w-8 border-[3px] border-blue-500 border-t-transparent rounded-full" />
            </div>
          )}
          <div ref={viewerRef} className="h-full" />
          <div className="absolute left-0 top-0 bottom-0 w-1/4 cursor-pointer z-10" onClick={() => renditionRef.current?.prev()} />
          <div className="absolute right-0 top-0 bottom-0 w-1/4 cursor-pointer z-10" onClick={() => renditionRef.current?.next()} />
        </div>

        {showSidebar && (
          <>
            <div className="absolute inset-0 bg-black/20 z-20" onClick={() => setShowSidebar(false)} />
            <div className="absolute right-0 top-0 bottom-0 w-80 z-30 shadow-2xl border-l overflow-y-auto" style={{ background: THEME_BG[theme], borderColor: theme === 'dark' ? '#333' : '#e5e7eb' }}>
              <div className="flex border-b" style={{ borderColor: theme === 'dark' ? '#333' : '#e5e7eb' }}>
                {(['toc', 'bookmarks', 'settings'] as const).map((tab) => (
                  <button key={tab} onClick={() => setSidebarTab(tab)} className={`flex-1 py-3 text-sm font-medium transition-colors cursor-pointer ${sidebarTab === tab ? 'border-b-2 border-blue-500 text-blue-500' : 'opacity-60 hover:opacity-100'}`}>
                    {tab === 'toc' ? '目录' : tab === 'bookmarks' ? '书签' : '设置'}
                  </button>
                ))}
              </div>
              <div className="p-4">
                {sidebarTab === 'toc' && (
                  <div className="space-y-1">
                    {toc.map((item, i) => (
                      <div key={i}>
                        <button onClick={() => goToChapter(item.href)} className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-black/5 transition-colors truncate cursor-pointer">{item.label}</button>
                        {item.subitems?.map((sub, j) => (
                          <button key={j} onClick={() => goToChapter(sub.href)} className="w-full text-left pl-8 pr-3 py-1.5 text-xs opacity-70 rounded-lg hover:bg-black/5 transition-colors truncate cursor-pointer">{sub.label}</button>
                        ))}
                      </div>
                    ))}
                    {toc.length === 0 && <p className="text-sm opacity-50 text-center py-8">暂无目录</p>}
                  </div>
                )}
                {sidebarTab === 'bookmarks' && (
                  <div className="space-y-2">
                    {bookmarks.map((bm) => (
                      <div key={bm.id} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-black/5 transition-colors cursor-pointer" onClick={() => { renditionRef.current?.display(bm.cfi); setShowSidebar(false) }}>
                        <svg className="w-4 h-4 shrink-0 text-amber-400" fill="currentColor" viewBox="0 0 24 24"><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{bm.text}</p>
                          <p className="text-xs opacity-50">{new Date(bm.createdAt).toLocaleDateString()}</p>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); removeBookmark(bookId!, bm.id) }} className="p-1 rounded hover:bg-red-100 text-red-400 cursor-pointer">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ))}
                    {bookmarks.length === 0 && <p className="text-sm opacity-50 text-center py-8">暂无书签</p>}
                  </div>
                )}
                {sidebarTab === 'settings' && (
                  <div className="space-y-6">
                    <div>
                      <label className="text-sm font-medium mb-3 block">字号</label>
                      <div className="flex items-center gap-4">
                        <button onClick={() => setFontSize(Math.max(12, fontSize - 2))} className="w-10 h-10 rounded-lg border flex items-center justify-center text-lg cursor-pointer hover:bg-black/5" style={{ borderColor: theme === 'dark' ? '#444' : '#d1d5db' }}>A-</button>
                        <span className="text-sm flex-1 text-center">{fontSize}px</span>
                        <button onClick={() => setFontSize(Math.min(32, fontSize + 2))} className="w-10 h-10 rounded-lg border flex items-center justify-center text-lg cursor-pointer hover:bg-black/5" style={{ borderColor: theme === 'dark' ? '#444' : '#d1d5db' }}>A+</button>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-3 block">主题</label>
                      <div className="flex gap-3">
                        {([
                          { key: 'light' as const, label: '日间', bg: '#fff', border: '#e5e7eb' },
                          { key: 'sepia' as const, label: '护眼', bg: '#f4ecd8', border: '#d4c5a0' },
                          { key: 'dark' as const, label: '夜间', bg: '#1a1a2e', border: '#333' },
                        ]).map((t) => (
                          <button key={t.key} onClick={() => setTheme(t.key)} className={`flex-1 py-3 rounded-xl text-sm font-medium border-2 transition-all cursor-pointer ${theme === t.key ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`} style={{ background: t.bg, borderColor: t.border, color: t.key === 'dark' ? '#e0e0e0' : '#333' }}>
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <footer className="px-4 py-2 border-t flex items-center gap-3 shrink-0" style={{ borderColor: theme === 'dark' ? '#333' : '#e5e7eb' }}>
        <span className="text-xs opacity-50 w-10">{progress}%</span>
        <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: theme === 'dark' ? '#333' : '#e5e7eb' }}>
          <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </footer>
    </div>
  )
}
