import { generateId, type BookMeta } from './db'

export function parsePdfMeta(fileName: string, fileSize: number): Omit<BookMeta, 'addedAt'> {
  const title = fileName.replace(/\.pdf$/i, '') || '未知书名'
  return {
    id: generateId(),
    title,
    author: '未知作者',
    cover: null,
    format: 'pdf',
    fileSize,
  }
}
