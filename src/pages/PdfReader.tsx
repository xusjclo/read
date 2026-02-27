import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import * as pdfjsLib from 'pdfjs-dist'
import { useBookStore } from '../stores/bookStore'
import { getBookFile, generateId } from '../utils/db'

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

const THEME_BG: Record<string, string> = { light: '#ffffff', dark: '#1a1a2e', sepia: '#f4ecd8' }
const THEME_TEXT: Record<string, string> = { light: '#1a1a1a', dark: '#e0e0e0', sepia: '#5b4636' }

export default function PdfReader() {
  const { bookId } = useParams<{ bookId: string }>()
  const navigate = useNavigate()
  const scrollRef = useRef<HTMLDivElement>(null)
  const canvasContainerRef = useRef<HTMLDivElement>(null)

  const {
    loadProgress, updateProgress,
    bookmarks, loadBookmarks, addBookmark, removeBookmark,
    theme, setTheme,
  } = useBookStore()

  const [totalPages, setTotalPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [scale, setScale] = useState(1.5)
  const [showSidebar, setShowSidebar] = useState(false)
  const [sidebarTab, setSidebarTab] = useState<'toc' | 'bookmarks' | 'settings'>('toc')
  const [outline, setOutline] = useState<{ title: string; page: number }[]>([])
  const [ready, setReady] = useState(false)
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null)
  const renderingRef = useRef(false)

  useEffect(() => {
    if (!bookId) return
    let cancelled = false

    const init = async () => {
      const fileData = await getBookFile(bookId)
      if (!fileData || cancelled) return

      await loadProgress(bookId)
      await loadBookmarks(bookId)

      const pdf = await pdfjsLib.getDocument({ data: fileData }).promise
      if (cancelled) return

      pdfDocRef.current = pdf
      setTotalPages(pdf.numPages)

      // 解析大纲
      try {
        const outlineData = await pdf.getOutline()
        if (outlineData) {
          const items: { title: string; page: number }[] = []
          for (const item of outlineData) {
            if (item.dest) {
              try {
                const dest = typeof item.dest === 'string'
                  ? await pdf.getDestination(item.dest)
                  : item.dest
                if (dest) {
                  const pageIndex = await pdf.getPageIndex(dest[0])
                  items.push({ title: item.title, page: pageIndex + 1 })
                }
              } catch {
                items.push({ title: item.title, page: 1 })
              }
            }
          }
          setOutline(items)
        }
      } catch {
        // no outline
      }

      // 恢复进度
      const saved = useBookStore.getState().currentProgress
      const startPage = saved?.location ? parseInt(saved.location) : 1

      setReady(true)
      setCurrentPage(startPage)
      renderPages(pdf, startPage, cancelled)
    }

    init()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId])

  // scale 变化时重新渲染
  useEffect(() => {
    if (pdfDocRef.current && ready) {
      renderPages(pdfDocRef.current, currentPage, false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale])

  const renderPages = async (pdf: pdfjsLib.PDFDocumentProxy, startPage: number, cancelled: boolean) => {
    if (renderingRef.current || !canvasContainerRef.current) return
    renderingRef.current = true

    const container = canvasContainerRef.current
    container.innerHTML = ''

    for (let i = 1; i <= pdf.numPages; i++) {
      if (cancelled) break
      const page = await pdf.getPage(i)
      const viewport = page.getViewport({ scale })

      const wrapper = document.createElement('div')
      wrapper.className = 'mx-auto mb-4 shadow-lg'
      wrapper.style.width = `${viewport.width}px`
      wrapper.setAttribute('data-page', String(i))

      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`

      const ctx = canvas.getContext('2d')!
      wrapper.appendChild(canvas)
      container.appendChild(wrapper)

      await page.render({ canvasContext: ctx, viewport }).promise
    }

    renderingRef.current = false

    // 滚到目标页
    if (startPage > 1) {
      requestAnimationFrame(() => {
        const target = container.querySelector(`[data-page="${startPage}"]`) as HTMLElement
        if (target && scrollRef.current) {
          scrollRef.current.scrollTop = target.offsetTop - 10
        }
      })
    }
  }

  const handleScroll = useCallback(() => {
    if (!scrollRef.current || !canvasContainerRef.current || !bookId) return
    const container = canvasContainerRef.current
    const scrollTop = scrollRef.current.scrollTop
    const pages = container.querySelectorAll('[data-page]')

    let current = 1
    for (const page of pages) {
      const el = page as HTMLElement
      if (el.offsetTop <= scrollTop + 100) {
        current = parseInt(el.getAttribute('data-page') || '1')
      }
    }

    setCurrentPage(current)
    const pct = totalPages > 0 ? Math.floor((current / totalPages) * 100) : 0
    updateProgress({
      bookId,
      location: String(current),
      percentage: pct,
      updatedAt: Date.now(),
    })
  }, [bookId, totalPages, updateProgress])

  const goToPage = useCallback((page: number) => {
    if (!canvasContainerRef.current || !scrollRef.current) return
    const target = canvasContainerRef.current.querySelector(`[data-page="${page}"]`) as HTMLElement
    if (target) {
      scrollRef.current.scrollTop = target.offsetTop - 10
    }
    setShowSidebar(false)
  }, [])

  const handleAddBookmark = useCallback(() => {
    if (!bookId) return
    const location = String(currentPage)
    const existing = bookmarks.find((b) => b.cfi === location)
    if (existing) {
      removeBookmark(bookId, existing.id)
    } else {
      addBookmark({
        id: generateId(),
        bookId,
        cfi: location,
        text: `第 ${currentPage} 页`,
        color: '#fbbf24',
        note: '',
        createdAt: Date.now(),
      })
    }
  }, [bookId, currentPage, bookmarks, addBookmark, removeBookmark])

  const isBookmarked = bookmarks.some((b) => b.cfi === String(currentPage))
  const progress = totalPages > 0 ? Math.floor((currentPage / totalPages) * 100) : 0

  return (
    <div className="h-screen flex flex-col" style={{ background: THEME_BG[theme], color: THEME_TEXT[theme] }}>
      {/* 顶栏 */}
      <header
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{ borderColor: theme === 'dark' ? '#333' : '#e5e7eb' }}
      >
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 rounded-lg hover:bg-black/5 transition-colors cursor-pointer">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm opacity-60">{currentPage} / {totalPages}</span>
        </div>

        <div className="flex items-center gap-1">
          {/* 缩放 */}
          <button
            onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}
            className="p-2 rounded-lg hover:bg-black/5 transition-colors cursor-pointer text-sm"
            title="缩小"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          <span className="text-xs opacity-60 w-12 text-center">{Math.round(scale * 100)}%</span>
          <button
            onClick={() => setScale((s) => Math.min(3, s + 0.25))}
            className="p-2 rounded-lg hover:bg-black/5 transition-colors cursor-pointer text-sm"
            title="放大"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>

          <div className="w-px h-5 mx-1" style={{ background: theme === 'dark' ? '#444' : '#d1d5db' }} />

          <button onClick={handleAddBookmark} className="p-2 rounded-lg hover:bg-black/5 transition-colors cursor-pointer" title="书签">
            <svg className="w-5 h-5" fill={isBookmarked ? '#fbbf24' : 'none'} stroke={isBookmarked ? '#fbbf24' : 'currentColor'} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </button>
          <button onClick={() => { setShowSidebar(!showSidebar); setSidebarTab('toc') }} className="p-2 rounded-lg hover:bg-black/5 transition-colors cursor-pointer" title="目录">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <button onClick={() => { setShowSidebar(!showSidebar); setSidebarTab('settings') }} className="p-2 rounded-lg hover:bg-black/5 transition-colors cursor-pointer" title="设置">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </header>

      {/* 主内容区 */}
      <div className="flex flex-1 overflow-hidden relative">
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto py-4"
          onScroll={handleScroll}
          style={{ background: theme === 'dark' ? '#111' : '#f0f0f0' }}
        >
          {!ready ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin h-8 w-8 border-[3px] border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : (
            <div ref={canvasContainerRef} className="flex flex-col items-center" />
          )}
        </div>

        {/* 侧边栏 */}
        {showSidebar && (
          <>
            <div className="absolute inset-0 bg-black/20 z-20" onClick={() => setShowSidebar(false)} />
            <div
              className="absolute right-0 top-0 bottom-0 w-80 z-30 shadow-2xl border-l overflow-y-auto"
              style={{ background: THEME_BG[theme], borderColor: theme === 'dark' ? '#333' : '#e5e7eb' }}
            >
              <div className="flex border-b" style={{ borderColor: theme === 'dark' ? '#333' : '#e5e7eb' }}>
                {(['toc', 'bookmarks', 'settings'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setSidebarTab(tab)}
                    className={`flex-1 py-3 text-sm font-medium transition-colors cursor-pointer ${
                      sidebarTab === tab ? 'border-b-2 border-blue-500 text-blue-500' : 'opacity-60 hover:opacity-100'
                    }`}
                  >
                    {tab === 'toc' ? '目录' : tab === 'bookmarks' ? '书签' : '设置'}
                  </button>
                ))}
              </div>

              <div className="p-4">
                {sidebarTab === 'toc' && (
                  <div className="space-y-1">
                    {outline.map((item, i) => (
                      <button
                        key={i}
                        onClick={() => goToPage(item.page)}
                        className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-black/5 transition-colors truncate cursor-pointer"
                      >
                        {item.title}
                        <span className="ml-2 opacity-40 text-xs">p.{item.page}</span>
                      </button>
                    ))}
                    {outline.length === 0 && <p className="text-sm opacity-50 text-center py-8">暂无目录</p>}
                  </div>
                )}

                {sidebarTab === 'bookmarks' && (
                  <div className="space-y-2">
                    {bookmarks.map((bm) => (
                      <div
                        key={bm.id}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-black/5 transition-colors cursor-pointer"
                        onClick={() => { goToPage(parseInt(bm.cfi)); setShowSidebar(false) }}
                      >
                        <svg className="w-4 h-4 shrink-0 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                        </svg>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{bm.text}</p>
                          <p className="text-xs opacity-50">{new Date(bm.createdAt).toLocaleDateString()}</p>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeBookmark(bookId!, bm.id) }}
                          className="p-1 rounded hover:bg-red-100 text-red-400 cursor-pointer"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                    {bookmarks.length === 0 && <p className="text-sm opacity-50 text-center py-8">暂无书签</p>}
                  </div>
                )}

                {sidebarTab === 'settings' && (
                  <div className="space-y-6">
                    <div>
                      <label className="text-sm font-medium mb-3 block">缩放</label>
                      <div className="flex items-center gap-4">
                        <button onClick={() => setScale((s) => Math.max(0.5, s - 0.25))} className="w-10 h-10 rounded-lg border flex items-center justify-center text-lg cursor-pointer hover:bg-black/5" style={{ borderColor: theme === 'dark' ? '#444' : '#d1d5db' }}>-</button>
                        <span className="text-sm flex-1 text-center">{Math.round(scale * 100)}%</span>
                        <button onClick={() => setScale((s) => Math.min(3, s + 0.25))} className="w-10 h-10 rounded-lg border flex items-center justify-center text-lg cursor-pointer hover:bg-black/5" style={{ borderColor: theme === 'dark' ? '#444' : '#d1d5db' }}>+</button>
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
                          <button
                            key={t.key}
                            onClick={() => setTheme(t.key)}
                            className={`flex-1 py-3 rounded-xl text-sm font-medium border-2 transition-all cursor-pointer ${theme === t.key ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}
                            style={{ background: t.bg, borderColor: t.border, color: t.key === 'dark' ? '#e0e0e0' : '#333' }}
                          >
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

      {/* 底部进度条 */}
      <footer className="px-4 py-2 border-t flex items-center gap-3 shrink-0" style={{ borderColor: theme === 'dark' ? '#333' : '#e5e7eb' }}>
        <span className="text-xs opacity-50 w-10">{progress}%</span>
        <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: theme === 'dark' ? '#333' : '#e5e7eb' }}>
          <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </footer>
    </div>
  )
}
