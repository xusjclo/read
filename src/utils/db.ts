const API_BASE = '/api'

// crypto.randomUUID 在非 HTTPS 环境不可用，使用兼容方案
export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export type BookFormat = 'epub' | 'txt' | 'pdf'

export interface BookMeta {
  id: string
  title: string
  author: string
  cover: string | null
  format: BookFormat
  addedAt: number
  fileSize: number
}

export interface ReadingProgress {
  bookId: string
  location: string
  percentage: number
  updatedAt: number
}

export interface Bookmark {
  id: string
  bookId: string
  cfi: string
  text: string
  color: string
  note: string
  createdAt: number
}

// ============ 书籍文件 ============

export async function saveBookFile(id: string, file: ArrayBuffer, meta: Omit<BookMeta, 'addedAt' | 'fileSize'> & { addedAt: number; fileSize: number }): Promise<void> {
  const formData = new FormData()
  const ext = meta.format === 'epub' ? '.epub' : meta.format === 'pdf' ? '.pdf' : '.txt'
  const blob = new Blob([file], { type: 'application/octet-stream' })
  // 确保文本字段在 file 字段之前，以便 multer 能先解析 body
  formData.append('id', id)
  formData.append('title', meta.title)
  formData.append('author', meta.author)
  formData.append('cover', meta.cover || '')
  formData.append('format', meta.format)
  formData.append('addedAt', String(meta.addedAt))
  formData.append('fileSize', String(meta.fileSize))
  formData.append('file', blob, `${id}${ext}`)

  const res = await fetch(`${API_BASE}/books`, { method: 'POST', body: formData })
  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error')
    throw new Error(`上传失败 (${res.status}): ${text}`)
  }
}

export async function getBookFile(id: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(`${API_BASE}/books/${id}/file`)
    if (!res.ok) return null
    return await res.arrayBuffer()
  } catch {
    return null
  }
}

// ============ 书籍元数据 ============

export async function saveBookMeta(_meta: BookMeta): Promise<void> {
  // 元数据已在 saveBookFile 中一起上传，此处为兼容接口保留空实现
}

export async function getBookList(): Promise<BookMeta[]> {
  try {
    const res = await fetch(`${API_BASE}/books`)
    if (!res.ok) return []
    return await res.json()
  } catch {
    return []
  }
}

export async function deleteBook(id: string): Promise<void> {
  await fetch(`${API_BASE}/books/${id}`, { method: 'DELETE' })
}

// ============ 阅读进度 ============

export async function saveProgress(progress: ReadingProgress): Promise<void> {
  await fetch(`${API_BASE}/progress/${progress.bookId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(progress),
  })
}

export async function getProgress(bookId: string): Promise<ReadingProgress | null> {
  try {
    const res = await fetch(`${API_BASE}/progress/${bookId}`)
    if (!res.ok) return null
    const data = await res.json()
    return data || null
  } catch {
    return null
  }
}

// ============ 书签 ============

export async function saveBookmarks(_bookId: string, _bookmarks: Bookmark[]): Promise<void> {
  // 书签改为单条操作，此接口保留兼容
}

export async function getBookmarks(bookId: string): Promise<Bookmark[]> {
  try {
    const res = await fetch(`${API_BASE}/bookmarks/${bookId}`)
    if (!res.ok) return []
    return await res.json()
  } catch {
    return []
  }
}

export async function addBookmarkApi(bookmark: Bookmark): Promise<void> {
  await fetch(`${API_BASE}/bookmarks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bookmark),
  })
}

export async function removeBookmarkApi(bookmarkId: string): Promise<void> {
  await fetch(`${API_BASE}/bookmarks/${bookmarkId}`, { method: 'DELETE' })
}
