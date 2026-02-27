import ePub from 'epubjs'
import type { BookMeta } from './db'

export async function parseEpubMeta(file: ArrayBuffer): Promise<Omit<BookMeta, 'addedAt' | 'fileSize'>> {
  const book = ePub(file)
  await book.ready

  const metadata = await book.loaded.metadata
  let cover: string | null = null

  try {
    const coverUrl = await book.coverUrl()
    if (coverUrl) {
      const resp = await fetch(coverUrl)
      const blob = await resp.blob()
      cover = await blobToBase64(blob)
    }
  } catch {
    // no cover
  }

  const id = crypto.randomUUID()

  book.destroy()

  return {
    id,
    title: metadata.title || '未知书名',
    author: metadata.creator || '未知作者',
    cover,
    format: 'epub' as const,
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
