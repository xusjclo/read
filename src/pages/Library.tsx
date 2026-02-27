import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBookStore } from '../stores/bookStore'
import { parseEpubMeta } from '../utils/epub'
import { parseTxtMeta } from '../utils/txt'
import { parsePdfMeta } from '../utils/pdf'
import type { BookMeta } from '../utils/db'

const FORMAT_COLORS: Record<string, string> = {
  epub: 'from-indigo-400 to-purple-500',
  txt: 'from-emerald-400 to-teal-500',
  pdf: 'from-red-400 to-rose-500',
}

const FORMAT_LABELS: Record<string, string> = {
  epub: 'EPUB',
  txt: 'TXT',
  pdf: 'PDF',
}

export default function Library() {
  const { books, loading, loadBooks, addBook, removeBook } = useBookStore()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ bookId: string; x: number; y: number } | null>(null)

  useEffect(() => {
    loadBooks()
  }, [loadBooks])

  useEffect(() => {
    const handleClick = () => setContextMenu(null)
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [])

  const getFileExt = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase()
    return ext || ''
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return

    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const ext = getFileExt(file.name)
        const buffer = await file.arrayBuffer()
        let bookMeta: BookMeta

        if (ext === 'epub') {
          const meta = await parseEpubMeta(buffer)
          bookMeta = { ...meta, addedAt: Date.now(), fileSize: file.size }
        } else if (ext === 'txt') {
          const meta = parseTxtMeta(file.name, file.size)
          bookMeta = { ...meta, addedAt: Date.now() }
        } else if (ext === 'pdf') {
          const meta = parsePdfMeta(file.name, file.size)
          bookMeta = { ...meta, addedAt: Date.now() }
        } else {
          continue
        }

        await addBook(bookMeta, buffer)
      }
    } catch (err) {
      console.error('上传失败:', err)
      alert('上传失败，请确保文件格式有效')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleContextMenu = (e: React.MouseEvent, bookId: string) => {
    e.preventDefault()
    setContextMenu({ bookId, x: e.clientX, y: e.clientY })
  }

  const handleDelete = async (id: string) => {
    if (confirm('确定要删除这本书吗？')) {
      await removeBook(id)
    }
    setContextMenu(null)
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* 顶部导航 */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-gray-200/60">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-gray-800">悦读</h1>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-200 disabled:opacity-50 cursor-pointer"
          >
            {uploading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                导入中...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                导入书籍
              </span>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".epub,.txt,.pdf"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
      </header>

      {/* 书架内容 */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin h-8 w-8 border-[3px] border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : books.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[60vh] text-gray-400">
            <svg className="w-24 h-24 mb-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <p className="text-lg font-medium mb-2">书架空空如也</p>
            <p className="text-sm">点击右上角「导入书籍」添加电子书</p>
            <p className="text-xs mt-2 opacity-60">支持 EPUB、TXT、PDF 格式</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
            {books.map((book) => (
              <div
                key={book.id}
                className="group cursor-pointer"
                onClick={() => navigate(`/read/${book.id}`)}
                onContextMenu={(e) => handleContextMenu(e, book.id)}
              >
                <div className="relative aspect-[3/4] rounded-lg overflow-hidden shadow-md group-hover:shadow-xl transition-all duration-300 group-hover:-translate-y-1">
                  {book.cover ? (
                    <img src={book.cover} alt={book.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className={`w-full h-full bg-gradient-to-br ${FORMAT_COLORS[book.format] || FORMAT_COLORS.epub} flex flex-col items-center justify-center p-4`}>
                      <span className="text-white text-center font-medium text-sm leading-tight mb-3">
                        {book.title}
                      </span>
                      <span className="px-2 py-0.5 bg-white/20 rounded text-[10px] text-white font-medium">
                        {FORMAT_LABELS[book.format] || 'EPUB'}
                      </span>
                    </div>
                  )}
                  {/* 格式标签 (有封面时) */}
                  {book.cover && (
                    <span className="absolute top-2 right-2 px-1.5 py-0.5 bg-black/50 backdrop-blur-sm rounded text-[10px] text-white font-medium">
                      {FORMAT_LABELS[book.format] || 'EPUB'}
                    </span>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className="mt-3 px-1">
                  <p className="text-sm font-medium text-gray-800 truncate">{book.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{book.author}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatSize(book.fileSize)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white rounded-xl shadow-2xl border border-gray-200 py-2 min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => handleDelete(contextMenu.bookId)}
            className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
          >
            删除书籍
          </button>
        </div>
      )}
    </div>
  )
}
