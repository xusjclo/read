import { generateId, type BookMeta } from './db'

/**
 * 检测 ArrayBuffer 的文本编码并解码为字符串
 * 支持 UTF-8、GBK、GB2312、Big5、UTF-16 等常见中文编码
 */
export function decodeTextBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)

  // 1. 检测 BOM (Byte Order Mark)
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return new TextDecoder('utf-8').decode(buffer)
  }
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return new TextDecoder('utf-16le').decode(buffer)
  }
  if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
    return new TextDecoder('utf-16be').decode(buffer)
  }

  // 2. 尝试 UTF-8 解码，如果出现替换字符则说明不是 UTF-8
  const utf8Text = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
  const replacementCount = (utf8Text.match(/\uFFFD/g) || []).length
  const totalChars = utf8Text.length

  // 如果替换字符占比很低（< 0.1%），认为是有效的 UTF-8
  if (totalChars > 0 && replacementCount / totalChars < 0.001) {
    return utf8Text
  }

  // 3. 尝试 GBK（最常见的中文编码）
  try {
    const gbkText = new TextDecoder('gbk', { fatal: false }).decode(buffer)
    // 验证：GBK 解码后应该包含较多中文字符
    const chineseChars = (gbkText.match(/[\u4e00-\u9fff]/g) || []).length
    if (chineseChars > totalChars * 0.05) {
      return gbkText
    }
  } catch {
    // GBK 不被支持
  }

  // 4. 尝试 Big5（繁体中文）
  try {
    const big5Text = new TextDecoder('big5', { fatal: false }).decode(buffer)
    const chineseChars = (big5Text.match(/[\u4e00-\u9fff]/g) || []).length
    if (chineseChars > totalChars * 0.05) {
      return big5Text
    }
  } catch {
    // Big5 不被支持
  }

  // 5. 最终回退到 GBK（对中文 TXT 最常见）
  try {
    return new TextDecoder('gbk').decode(buffer)
  } catch {
    return utf8Text
  }
}

export function parseTxtMeta(fileName: string, fileSize: number): Omit<BookMeta, 'addedAt'> {
  const title = fileName.replace(/\.txt$/i, '') || '未知书名'
  return {
    id: generateId(),
    title,
    author: '未知作者',
    cover: null,
    format: 'txt',
    fileSize,
  }
}

export interface TxtChapter {
  title: string
  startIndex: number
}

const CHAPTER_PATTERNS = [
  /^第[零一二三四五六七八九十百千万\d]+[章节回卷集部篇]/m,
  /^Chapter\s+\d+/im,
  /^CHAPTER\s+\d+/m,
  /^卷[零一二三四五六七八九十百千万\d]+/m,
]

export function parseTxtContent(text: string): { content: string; chapters: TxtChapter[] } {
  const chapters: TxtChapter[] = []
  const lines = text.split('\n')

  let currentIndex = 0
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.length > 0 && trimmed.length < 50) {
      for (const pattern of CHAPTER_PATTERNS) {
        if (pattern.test(trimmed)) {
          chapters.push({ title: trimmed, startIndex: currentIndex })
          break
        }
      }
    }
    currentIndex += line.length + 1
  }

  // 如果没有识别到章节，按一定字数切分
  if (chapters.length === 0 && text.length > 5000) {
    const chunkSize = 3000
    for (let i = 0; i < text.length; i += chunkSize) {
      const idx = Math.min(i, text.length - 1)
      chapters.push({ title: `第 ${Math.floor(i / chunkSize) + 1} 节`, startIndex: idx })
    }
  }

  return { content: text, chapters }
}
