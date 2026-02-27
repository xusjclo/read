import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useBookStore } from '../stores/bookStore'
import { getBookFile } from '../utils/db'
import { parseTxtContent, decodeTextBuffer, type TxtChapter } from '../utils/txt'

const THEME_BG: Record<string, string> = { light: '#ffffff', dark: '#1a1a2e', sepia: '#f4ecd8' }
const THEME_TEXT: Record<string, string> = { light: '#1a1a1a', dark: '#e0e0e0', sepia: '#5b4636' }

export default function TxtReader() {
  const { bookId } = useParams<{ bookId: string }>()
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  const {
    loadProgress, updateProgress,
    bookmarks, loadBookmarks, addBookmark, removeBookmark,
    theme, fontSize, setTheme, setFontSize,
  } = useBookStore()

  const [paragraphs, setParagraphs] = useState<string[]>([])
  const [chapters, setChapters] = useState<TxtChapter[]>([])
  const [showSidebar, setShowSidebar] = useState(false)
  const [sidebarTab, setSidebarTab] = useState<'toc' | 'bookmarks' | 'settings'>('toc')
  const [ready, setReady] = useState(false)
  const [currentPage, setCurrentPage] = useState(0)
  const [pages, setPages] = useState<number[][]>([]) // 每页包含的段落索引范围 [startIdx]
  const [slideClass, setSlideClass] = useState('')
  const [paginationDone, setPaginationDone] = useState(false)
  const pendingProgressRestore = useRef(false)

  // 解析文本并构建段落
  useEffect(() => {
    if (!bookId) return
    const init = async () => {
      const fileData = await getBookFile(bookId)
      if (!fileData) return

      await loadProgress(bookId)
      await loadBookmarks(bookId)

      const text = decodeTextBuffer(fileData)
      const parsed = parseTxtContent(text)
      setChapters(parsed.chapters)

      // 按行分段
      const paras = text.split('\n').filter((l) => l.trim().length > 0)
      setParagraphs(paras)
      pendingProgressRestore.current = true
      setReady(true)
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId])

  // 分页：使用增量 DOM 测量，但分批处理避免卡顿
  const measurePages = useCallback(() => {
    if (!containerRef.current || paragraphs.length === 0) return

    const container = containerRef.current
    const containerHeight = container.clientHeight - 64 // 减去 padding
    if (containerHeight <= 0) return

    // 估算每行字符数和每页行数来做快速分页
    // 容器宽度约 768px（max-w-3xl），减去 padding 48px = 720px
    // 每个字符约 fontSize * 0.55 宽度（等宽估算，中文约等于 fontSize）
    const contentWidth = Math.min(container.clientWidth - 48, 720)
    const charsPerLine = Math.floor(contentWidth / (fontSize * 0.55))
    const lineHeight = fontSize * 1.8
    const paraMargin = 16 // mb-4
    const linesPerPage = Math.floor(containerHeight / lineHeight)

    if (charsPerLine <= 0 || linesPerPage <= 0) return

    const pageList: number[][] = []
    let currentPageParas: number[] = []
    let usedLines = 0

    for (let i = 0; i < paragraphs.length; i++) {
      const text = paragraphs[i].trim()
      // 中文字符占1个位置，其他字符占0.5个位置
      let charWidth = 0
      for (let c = 0; c < text.length; c++) {
        charWidth += text.charCodeAt(c) > 127 ? 1 : 0.5
      }
      // 缩进 2em = 2个字符宽
      charWidth += 2
      const paraLines = Math.max(1, Math.ceil(charWidth / (charsPerLine * 0.55)))
      const paraHeightInLines = paraLines + (paraMargin / lineHeight)

      if (usedLines + paraHeightInLines > linesPerPage && currentPageParas.length > 0) {
        pageList.push([...currentPageParas])
        currentPageParas = [i]
        usedLines = paraHeightInLines
      } else {
        currentPageParas.push(i)
        usedLines += paraHeightInLines
      }
    }

    if (currentPageParas.length > 0) {
      pageList.push(currentPageParas)
    }

    setPages(pageList)
    setPaginationDone(true)
  }, [paragraphs, fontSize])

  // 测量分页
  useEffect(() => {
    if (!ready) return
    setPaginationDone(false)
    const t = requestAnimationFrame(() => measurePages())
    return () => cancelAnimationFrame(t)
  }, [ready, measurePages])

  // 窗口大小改变时重新分页
  useEffect(() => {
    const onResize = () => measurePages()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [measurePages])

  // 恢复阅读进度
  useEffect(() => {
    if (!paginationDone || pages.length === 0 || !pendingProgressRestore.current) return
    pendingProgressRestore.current = false
    const saved = useBookStore.getState().currentProgress
    if (saved?.location) {
      const page = parseInt(saved.location)
      if (!isNaN(page) && page >= 0 && page < pages.length) {
        setCurrentPage(page)
      }
    }
  }, [paginationDone, pages])

  const totalPages = pages.length

  // 获取当前页的段落
  const currentPageParagraphs = useMemo(() => {
    if (totalPages === 0 || currentPage >= totalPages) return []
    const paraIndices = pages[currentPage]
    return paraIndices.map((idx) => paragraphs[idx])
  }, [currentPage, totalPages, pages, paragraphs])

  // 章节→段落索引映射（用于章节跳转）
  const chapterParaMap = useMemo(() => {
    if (chapters.length === 0 || paragraphs.length === 0) return []
    const map: { chapterIdx: number; paraIdx: number }[] = []

    // 为每个章节找到对应的段落索引
    let charOffset = 0
    let chIdx = 0
    for (let i = 0; i < paragraphs.length; i++) {
      while (chIdx < chapters.length && chapters[chIdx].startIndex <= charOffset) {
        map.push({ chapterIdx: chIdx, paraIdx: i })
        chIdx++
      }
      charOffset += paragraphs[i].length + 1
    }
    // 处理剩余章节
    while (chIdx < chapters.length) {
      map.push({ chapterIdx: chIdx, paraIdx: paragraphs.length - 1 })
      chIdx++
    }
    return map
  }, [chapters, paragraphs])

  // 当前章节名称
  const currentChapterName = useMemo(() => {
    if (chapters.length === 0 || totalPages === 0 || !pages[currentPage]) return ''
    const firstParaIdx = pages[currentPage][0]

    let chName = ''
    for (const item of chapterParaMap) {
      if (item.paraIdx <= firstParaIdx) {
        chName = chapters[item.chapterIdx].title
      } else {
        break
      }
    }
    return chName
  }, [currentPage, chapters, pages, totalPages, chapterParaMap])

  // 翻页动画
  const animateTo = useCallback((page: number, direction: 'left' | 'right') => {
    if (page < 0 || page >= totalPages || page === currentPage) return
    setSlideClass(direction === 'right' ? 'animate-slide-out-left' : 'animate-slide-out-right')
    setTimeout(() => {
      setCurrentPage(page)
      setSlideClass(direction === 'right' ? 'animate-slide-in-right' : 'animate-slide-in-left')
      setTimeout(() => setSlideClass(''), 200)
    }, 150)
  }, [totalPages, currentPage])

  const goNext = useCallback(() => {
    if (currentPage < totalPages - 1) animateTo(currentPage + 1, 'right')
  }, [currentPage, totalPages, animateTo])

  const goPrev = useCallback(() => {
    if (currentPage > 0) animateTo(currentPage - 1, 'left')
  }, [currentPage, animateTo])

  // 章节跳转
  const goToChapter = useCallback((chapterStartIndex: number) => {
    if (totalPages === 0) return

    // 通过字符偏移找到段落索引
    let charCount = 0
    let targetPara = 0
    for (let i = 0; i < paragraphs.length; i++) {
      if (charCount >= chapterStartIndex) {
        targetPara = i
        break
      }
      charCount += paragraphs[i].length + 1
    }

    // 找到段落对应的页码
    for (let p = 0; p < pages.length; p++) {
      const paraIndices = pages[p]
      if (paraIndices.includes(targetPara) || (paraIndices.length > 0 && paraIndices[paraIndices.length - 1] >= targetPara)) {
        // 精确查找
        for (let pp = p; pp < pages.length; pp++) {
          if (pages[pp].includes(targetPara)) {
            setCurrentPage(pp)
            setShowSidebar(false)
            return
          }
          if (pages[pp][0] > targetPara) {
            setCurrentPage(Math.max(0, pp - 1))
            setShowSidebar(false)
            return
          }
        }
        setCurrentPage(p)
        setShowSidebar(false)
        return
      }
    }

    // 线性搜索 fallback
    for (let p = pages.length - 1; p >= 0; p--) {
      if (pages[p][0] <= targetPara) {
        setCurrentPage(p)
        break
      }
    }
    setShowSidebar(false)
  }, [totalPages, paragraphs, pages])

  // 键盘翻页
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [goNext, goPrev])

  // 保存进度
  useEffect(() => {
    if (!bookId || totalPages === 0) return
    const pct = Math.floor((currentPage / totalPages) * 100)
    updateProgress({
      bookId,
      location: String(currentPage),
      percentage: pct,
      updatedAt: Date.now(),
    })
  }, [currentPage, bookId, totalPages, updateProgress])

  const handleAddBookmark = useCallback(() => {
    if (!bookId) return
    const location = String(currentPage)
    const existing = bookmarks.find((b) => b.cfi === location)
    if (existing) {
      removeBookmark(bookId, existing.id)
    } else {
      addBookmark({
        id: crypto.randomUUID(),
        bookId,
        cfi: location,
        text: currentChapterName || `第 ${currentPage + 1} 页`,
        color: '#fbbf24',
        note: '',
        createdAt: Date.now(),
      })
    }
  }, [bookId, currentPage, bookmarks, currentChapterName, addBookmark, removeBookmark])

  const isBookmarked = bookmarks.some((b) => b.cfi === String(currentPage))
  const progress = totalPages > 0 ? Math.floor(((currentPage + 1) / totalPages) * 100) : 0

  return (
    <div className="h-screen flex flex-col select-none" style={{ background: THEME_BG[theme], color: THEME_TEXT[theme] }}>
      <style>{`
        @keyframes slideOutLeft { from { transform: translateX(0); opacity: 1; } to { transform: translateX(-30px); opacity: 0; } }
        @keyframes slideInRight { from { transform: translateX(30px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes slideOutRight { from { transform: translateX(0); opacity: 1; } to { transform: translateX(30px); opacity: 0; } }
        @keyframes slideInLeft { from { transform: translateX(-30px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .animate-slide-out-left { animation: slideOutLeft 0.15s ease-in forwards; }
        .animate-slide-in-right { animation: slideInRight 0.2s ease-out forwards; }
        .animate-slide-out-right { animation: slideOutRight 0.15s ease-in forwards; }
        .animate-slide-in-left { animation: slideInLeft 0.2s ease-out forwards; }
      `}</style>

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
          <span className="text-sm opacity-60 truncate max-w-[240px]">{currentChapterName || 'TXT 阅读'}</span>
        </div>
        <div className="flex items-center gap-1">
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
        <div ref={containerRef} className="flex-1 relative overflow-hidden">
          {!ready || !paginationDone || totalPages === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin h-8 w-8 border-[3px] border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : (
            <>
              {/* 翻页热区 */}
              <div className="absolute left-0 top-0 bottom-0 w-1/4 cursor-pointer z-10" onClick={goPrev} />
              <div className="absolute right-0 top-0 bottom-0 w-1/4 cursor-pointer z-10" onClick={goNext} />

              {/* 页面内容 */}
              <div
                ref={contentRef}
                className={`h-full max-w-3xl mx-auto px-6 py-8 overflow-hidden ${slideClass}`}
                style={{ fontSize: `${fontSize}px`, lineHeight: 1.8 }}
              >
                {currentPageParagraphs.map((para, i) => (
                  <p
                    key={`${currentPage}-${i}`}
                    className="mb-4"
                    style={{ textIndent: '2em' }}
                  >
                    {para.trim()}
                  </p>
                ))}
              </div>

              {/* 上一页 / 下一页 按钮 */}
              <div className="absolute bottom-4 left-0 right-0 flex items-center justify-between px-6 max-w-3xl mx-auto z-20 pointer-events-none">
                <button
                  onClick={goPrev}
                  disabled={currentPage <= 0}
                  className={`pointer-events-auto px-5 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer border ${
                    currentPage <= 0
                      ? 'opacity-30 cursor-not-allowed'
                      : 'hover:bg-black/5 active:scale-95'
                  }`}
                  style={{ borderColor: theme === 'dark' ? '#444' : '#d1d5db' }}
                >
                  ‹ 上一页
                </button>
                <span className="text-sm opacity-50">{currentPage + 1} / {totalPages}</span>
                <button
                  onClick={goNext}
                  disabled={currentPage >= totalPages - 1}
                  className={`pointer-events-auto px-5 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer border ${
                    currentPage >= totalPages - 1
                      ? 'opacity-30 cursor-not-allowed'
                      : 'hover:bg-black/5 active:scale-95'
                  }`}
                  style={{ borderColor: theme === 'dark' ? '#444' : '#d1d5db' }}
                >
                  下一页 ›
                </button>
              </div>
            </>
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
                    {chapters.map((ch, i) => {
                      const isActive = currentChapterName === ch.title
                      return (
                        <button
                          key={i}
                          onClick={() => goToChapter(ch.startIndex)}
                          className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors truncate cursor-pointer ${
                            isActive
                              ? 'bg-blue-50 text-blue-600 font-medium'
                              : 'hover:bg-black/5'
                          }`}
                          style={isActive && theme === 'dark' ? { background: 'rgba(59,130,246,0.15)', color: '#93c5fd' } : undefined}
                        >
                          {ch.title}
                        </button>
                      )
                    })}
                    {chapters.length === 0 && (
                      <p className="text-sm opacity-50 text-center py-8">暂无目录</p>
                    )}
                  </div>
                )}

                {sidebarTab === 'bookmarks' && (
                  <div className="space-y-2">
                    {bookmarks.map((bm) => (
                      <div
                        key={bm.id}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-black/5 transition-colors cursor-pointer"
                        onClick={() => {
                          const page = parseInt(bm.cfi)
                          if (!isNaN(page) && page >= 0 && page < totalPages) {
                            setCurrentPage(page)
                          }
                          setShowSidebar(false)
                        }}
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

      {/* 底部：页码 + 进度条 */}
      <footer
        className="px-4 py-2 border-t flex items-center gap-3 shrink-0"
        style={{ borderColor: theme === 'dark' ? '#333' : '#e5e7eb' }}
      >
        <span className="text-xs opacity-50 whitespace-nowrap">
          {totalPages > 0 ? `${currentPage + 1} / ${totalPages}` : '--'}
        </span>
        <div
          className="flex-1 h-1 rounded-full overflow-hidden cursor-pointer"
          style={{ background: theme === 'dark' ? '#333' : '#e5e7eb' }}
          onClick={(e) => {
            if (totalPages === 0) return
            const rect = e.currentTarget.getBoundingClientRect()
            const pct = (e.clientX - rect.left) / rect.width
            const page = Math.round(pct * (totalPages - 1))
            setCurrentPage(Math.max(0, Math.min(page, totalPages - 1)))
          }}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-xs opacity-50 w-10 text-right">{progress}%</span>
      </footer>
    </div>
  )
}
