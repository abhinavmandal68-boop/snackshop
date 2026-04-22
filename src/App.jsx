import { Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import ShopPage from './pages/ShopPage'
import AdminLogin from './pages/AdminLogin'
import AdminPage from './pages/AdminPage'

export default function App() {
  return (
    <>
      <Toaster
        position="bottom-center"
        toastOptions={{
          style: {
            background: '#222',
            color: '#f0ede8',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '100px',
            fontSize: '13px',
            fontFamily: 'DM Sans, sans-serif',
            padding: '10px 18px',
          },
          success: { iconTheme: { primary: '#f5c842', secondary: '#1a1200' } },
        }}
      />
      <Routes>
        <Route path="/" element={<ShopPage />} />
        <Route path="/admin" element={<AdminLogin />} />
        <Route path="/admin/dashboard" element={<AdminPage />} />
      </Routes>
    </>
  )
}
