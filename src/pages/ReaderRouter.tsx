import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useBookStore } from '../stores/bookStore'
import type { BookFormat } from '../utils/db'
import EpubReader from './Reader'
import TxtReader from './TxtReader'
import PdfReader from './PdfReader'

export default function ReaderRouter() {
  const { bookId } = useParams<{ bookId: string }>()
  const navigate = useNavigate()
  const { books, loadBooks } = useBookStore()
  const [format, setFormat] = useState<BookFormat | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      let bookList = books
      if (bookList.length === 0) {
        await loadBooks()
        bookList = useBookStore.getState().books
      }

      const book = bookList.find((b) => b.id === bookId)
      if (!book) {
        navigate('/')
        return
      }

      setFormat(book.format || 'epub')
      setLoading(false)
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId])

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-[3px] border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  switch (format) {
    case 'txt':
      return <TxtReader />
    case 'pdf':
      return <PdfReader />
    case 'epub':
    default:
      return <EpubReader />
  }
}
