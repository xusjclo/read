import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Library from './pages/Library'
import ReaderRouter from './pages/ReaderRouter'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Library />} />
        <Route path="/read/:bookId" element={<ReaderRouter />} />
      </Routes>
    </BrowserRouter>
  )
}
