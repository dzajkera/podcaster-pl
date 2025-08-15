import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import MyFeeds from './pages/MyFeeds'       // ⬅️ NOWE
import FeedDetail from './pages/FeedDetail' // ⬅️ NOWE
import Navbar from './components/Navbar'
import './App.css'

function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/login" element={<Login />} />
        <Route path="/my-feeds" element={<MyFeeds />} />         {/* ⬅️ NOWE */}
        <Route path="/feeds/:feedId" element={<FeedDetail />} /> {/* ⬅️ NOWE */}
      </Routes>
    </>
  )
}

export default App