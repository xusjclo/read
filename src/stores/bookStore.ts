import { create } from 'zustand'
import type { BookMeta, ReadingProgress, Bookmark } from '../utils/db'
import * as db from '../utils/db'

interface BookState {
  books: BookMeta[]
  currentProgress: ReadingProgress | null
  bookmarks: Bookmark[]
  loading: boolean

  loadBooks: () => Promise<void>
  addBook: (meta: BookMeta, file: ArrayBuffer) => Promise<void>
  removeBook: (id: string) => Promise<void>

  loadProgress: (bookId: string) => Promise<void>
  updateProgress: (progress: ReadingProgress) => Promise<void>

  loadBookmarks: (bookId: string) => Promise<void>
  addBookmark: (bookmark: Bookmark) => Promise<void>
  removeBookmark: (bookId: string, bookmarkId: string) => Promise<void>

  theme: 'light' | 'dark' | 'sepia'
  fontSize: number
  setTheme: (theme: 'light' | 'dark' | 'sepia') => void
  setFontSize: (size: number) => void
}

export const useBookStore = create<BookState>((set, get) => ({
  books: [],
  currentProgress: null,
  bookmarks: [],
  loading: false,
  theme: (localStorage.getItem('theme') as 'light' | 'dark' | 'sepia') || 'light',
  fontSize: Number(localStorage.getItem('fontSize')) || 18,

  loadBooks: async () => {
    set({ loading: true })
    const books = await db.getBookList()
    set({ books, loading: false })
  },

  addBook: async (meta, file) => {
    await db.saveBookFile(meta.id, file, meta)
    const books = await db.getBookList()
    set({ books })
  },

  removeBook: async (id) => {
    await db.deleteBook(id)
    const books = await db.getBookList()
    set({ books })
  },

  loadProgress: async (bookId) => {
    const progress = await db.getProgress(bookId)
    set({ currentProgress: progress })
  },

  updateProgress: async (progress) => {
    await db.saveProgress(progress)
    set({ currentProgress: progress })
  },

  loadBookmarks: async (bookId) => {
    const bookmarks = await db.getBookmarks(bookId)
    set({ bookmarks })
  },

  addBookmark: async (bookmark) => {
    await db.addBookmarkApi(bookmark)
    const { bookmarks } = get()
    set({ bookmarks: [...bookmarks, bookmark] })
  },

  removeBookmark: async (_bookId, bookmarkId) => {
    await db.removeBookmarkApi(bookmarkId)
    const { bookmarks } = get()
    set({ bookmarks: bookmarks.filter((b) => b.id !== bookmarkId) })
  },

  setTheme: (theme) => {
    localStorage.setItem('theme', theme)
    set({ theme })
  },

  setFontSize: (size) => {
    localStorage.setItem('fontSize', String(size))
    set({ fontSize: size })
  },
}))
