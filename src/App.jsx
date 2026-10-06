import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import toast from 'react-hot-toast'
import { lazy, Suspense, useEffect } from 'react'
import { AuthProvider, useAuth } from './lib/AuthContext'
import ShopPage from './pages/ShopPage'
import CustomerAuth from './pages/CustomerAuth'
import AdminPage from './pages/AdminPage'
import { MotionConfig } from 'framer-motion'
import { quickTransition } from './lib/motion'
const DesignPreview = import.meta.env.DEV ? lazy(() => import('./pages/DesignPreview')) : null
const AdminPreview = import.meta.env.DEV ? lazy(() => import('./pages/AdminPreview')) : null

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

// Protects the admin dashboard — bounces anyone who isn't signed in as
// admin straight back to the shop, instead of showing a blank/broken page.
function RequireAdmin({ children }) {
  const { user, loading, isAdmin } = useAuth()

  useEffect(() => {
    if (!loading && user && !isAdmin) {
      toast.error("You don't have access to that page")
    }
  }, [loading, user, isAdmin])

  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontFamily: 'Syne', color: 'var(--text-secondary)', fontSize: 14 }}>Loading...</div>
    </div>
  )

  if (!user) return <Navigate to="/admin" replace />
  if (!isAdmin) return <Navigate to="/" replace />

  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<CustomerAuth />} />
      <Route path="/" element={<RequireCustomer><ShopPage /></RequireCustomer>} />
      <Route path="/admin" element={<CustomerAuth />} />
      <Route path="/admin/dashboard" element={<RequireAdmin><AdminPage /></RequireAdmin>} />
    </Routes>
  )
}

export default function App() {
  if (import.meta.env.DEV && window.location.pathname === '/preview') {
    return <Suspense fallback={null}><MotionConfig reducedMotion="user" transition={quickTransition}><DesignPreview /></MotionConfig></Suspense>
  }
  if (import.meta.env.DEV && window.location.pathname === '/admin-preview') {
    return <Suspense fallback={null}><MotionConfig reducedMotion="user" transition={quickTransition}><AdminPreview /></MotionConfig></Suspense>
  }
  return (
    <MotionConfig reducedMotion="user" transition={quickTransition}>
    <AuthProvider>
      <Toaster
        position="bottom-center"
        toastOptions={{
          style: {
            background: 'var(--surface)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            borderRadius: '100px',
            fontSize: '13px',
            fontFamily: 'DM Sans, sans-serif',
            padding: '10px 18px',
          },
          success: { iconTheme: { primary: '#466345', secondary: '#fff4d6' } },
        }}
      />
      <AppRoutes />
    </AuthProvider>
    </MotionConfig>
  )
}
