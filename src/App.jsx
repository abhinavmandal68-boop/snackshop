import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './lib/AuthContext'
import ShopPage from './pages/ShopPage'
import CustomerAuth from './pages/CustomerAuth'
import AdminPage from './pages/AdminPage'

// Protects shop — redirects to /login if not signed in
function RequireCustomer({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontFamily: 'Syne', color: 'var(--text-secondary)', fontSize: 14 }}>Loading...</div>
    </div>
  )
  return user ? children : <Navigate to="/login" replace />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<CustomerAuth />} />
      <Route path="/" element={<RequireCustomer><ShopPage /></RequireCustomer>} />
      <Route path="/admin" element={<CustomerAuth />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
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
      <AppRoutes />
    </AuthProvider>
  )
}