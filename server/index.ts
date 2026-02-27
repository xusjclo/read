import express from 'express'
import cors from 'cors'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import initSqlJs, { type Database } from 'sql.js'

const app = express()
const PORT = process.env.PORT || 3001
const DATA_DIR = path.join(process.cwd(), 'data')
const FILES_DIR = path.join(DATA_DIR, 'files')
const DB_PATH = path.join(DATA_DIR, 'yuedu.db')

// 确保目录存在
fs.mkdirSync(FILES_DIR, { recursive: true })

app.use(cors())
app.use(express.json())

// 文件上传配置
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, FILES_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname)
      const id = _req.body.id || Date.now().toString()
      cb(null, `${id}${ext}`)
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
})

let db: Database

function saveDb() {
  const data = db.export()
  const buffer = Buffer.from(data)
  fs.writeFileSync(DB_PATH, buffer)
}

async function initDb() {
  const SQL = await initSqlJs()

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH)
    db = new SQL.Database(fileBuffer)
  } else {
    db = new SQL.Database()
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      author TEXT DEFAULT '',
      cover TEXT,
      format TEXT NOT NULL,
      addedAt INTEGER NOT NULL,
      fileSize INTEGER DEFAULT 0,
      filePath TEXT
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS progress (
      bookId TEXT PRIMARY KEY,
      location TEXT,
      percentage INTEGER DEFAULT 0,
      updatedAt INTEGER,
      FOREIGN KEY (bookId) REFERENCES books(id) ON DELETE CASCADE
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS bookmarks (
      id TEXT PRIMARY KEY,
      bookId TEXT NOT NULL,
      cfi TEXT,
      text TEXT,
      color TEXT DEFAULT '#fbbf24',
      note TEXT DEFAULT '',
      createdAt INTEGER,
      FOREIGN KEY (bookId) REFERENCES books(id) ON DELETE CASCADE
    )
  `)

  saveDb()
  console.log('Database initialized')
}

// ============ 书籍 API ============

// 获取书籍列表
app.get('/api/books', (_req, res) => {
  const rows = db.exec('SELECT id, title, author, cover, format, addedAt, fileSize FROM books ORDER BY addedAt DESC')
  if (rows.length === 0) return res.json([])
  const columns = rows[0].columns
  const books = rows[0].values.map((row) => {
    const obj: Record<string, unknown> = {}
    columns.forEach((col, i) => { obj[col] = row[i] })
    return obj
  })
  res.json(books)
})

// 上传书籍
app.post('/api/books', upload.single('file'), (req, res) => {
  try {
    const { id, title, author, cover, format, addedAt, fileSize } = req.body
    const filePath = req.file ? req.file.filename : null

    db.run(
      'INSERT OR REPLACE INTO books (id, title, author, cover, format, addedAt, fileSize, filePath) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, title, author || '', cover || null, format, Number(addedAt), Number(fileSize), filePath]
    )
    saveDb()
    res.json({ success: true })
  } catch (err) {
    console.error('Upload error:', err)
    res.status(500).json({ error: 'Upload failed' })
  }
})

// 下载书籍文件
app.get('/api/books/:id/file', (req, res) => {
  const rows = db.exec('SELECT filePath, format FROM books WHERE id = ?', [req.params.id])
  if (rows.length === 0 || rows[0].values.length === 0) {
    return res.status(404).json({ error: 'Book not found' })
  }
  const filePath = rows[0].values[0][0] as string
  if (!filePath) return res.status(404).json({ error: 'File not found' })
  const fullPath = path.join(FILES_DIR, filePath)
  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not found' })
  res.sendFile(fullPath)
})

// 删除书籍
app.delete('/api/books/:id', (req, res) => {
  const rows = db.exec('SELECT filePath FROM books WHERE id = ?', [req.params.id])
  if (rows.length > 0 && rows[0].values.length > 0) {
    const filePath = rows[0].values[0][0] as string
    if (filePath) {
      const fullPath = path.join(FILES_DIR, filePath)
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath)
    }
  }
  db.run('DELETE FROM bookmarks WHERE bookId = ?', [req.params.id])
  db.run('DELETE FROM progress WHERE bookId = ?', [req.params.id])
  db.run('DELETE FROM books WHERE id = ?', [req.params.id])
  saveDb()
  res.json({ success: true })
})

// ============ 进度 API ============

app.get('/api/progress/:bookId', (req, res) => {
  const rows = db.exec('SELECT bookId, location, percentage, updatedAt FROM progress WHERE bookId = ?', [req.params.bookId])
  if (rows.length === 0 || rows[0].values.length === 0) return res.json(null)
  const columns = rows[0].columns
  const obj: Record<string, unknown> = {}
  columns.forEach((col, i) => { obj[col] = rows[0].values[0][i] })
  res.json(obj)
})

app.put('/api/progress/:bookId', (req, res) => {
  const { location, percentage, updatedAt } = req.body
  db.run(
    'INSERT OR REPLACE INTO progress (bookId, location, percentage, updatedAt) VALUES (?, ?, ?, ?)',
    [req.params.bookId, location, percentage, updatedAt]
  )
  saveDb()
  res.json({ success: true })
})

// ============ 书签 API ============

app.get('/api/bookmarks/:bookId', (req, res) => {
  const rows = db.exec(
    'SELECT id, bookId, cfi, text, color, note, createdAt FROM bookmarks WHERE bookId = ? ORDER BY createdAt DESC',
    [req.params.bookId]
  )
  if (rows.length === 0) return res.json([])
  const columns = rows[0].columns
  const bookmarks = rows[0].values.map((row) => {
    const obj: Record<string, unknown> = {}
    columns.forEach((col, i) => { obj[col] = row[i] })
    return obj
  })
  res.json(bookmarks)
})

app.post('/api/bookmarks', (req, res) => {
  const { id, bookId, cfi, text, color, note, createdAt } = req.body
  db.run(
    'INSERT OR REPLACE INTO bookmarks (id, bookId, cfi, text, color, note, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, bookId, cfi, text, color || '#fbbf24', note || '', createdAt]
  )
  saveDb()
  res.json({ success: true })
})

app.delete('/api/bookmarks/:id', (req, res) => {
  db.run('DELETE FROM bookmarks WHERE id = ?', [req.params.id])
  saveDb()
  res.json({ success: true })
})

// ============ 静态文件（生产模式）============

const distPath = path.join(process.cwd(), 'dist')
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

// 启动
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`)
  })
})
