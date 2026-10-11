import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import toast from 'react-hot-toast'
import { lazy, Suspense, useEffect } from 'react'
import { AuthProvider, useAuth } from './lib/AuthContext'
import CustomerAuth from './pages/CustomerAuth'
import { MotionConfig } from 'framer-motion'
import { quickTransition } from './lib/motion'
import useViewportHeight from './hooks/useViewportHeight'

const ShopPage = lazy(() => import('./pages/ShopPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))

function PageLoading() {
  return <div className="page-loading" role="status">Loading SnackShop…</div>
}

// Protects shop — redirects to /login if not signed in
function RequireCustomer({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <PageLoading />
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

  if (loading) return <PageLoading />

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
  useViewportHeight()
  return (
    <MotionConfig reducedMotion="user" transition={quickTransition}>
    <AuthProvider>
      <Toaster
        position="top-center"
        containerStyle={{ top: 'max(16px, env(safe-area-inset-top))' }}
        toastOptions={{
          style: {
            background: 'var(--surface)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            borderRadius: '14px',
            fontSize: '13px',
            fontFamily: 'DM Sans, sans-serif',
            padding: '12px 16px',
            maxWidth: 'min(380px, calc(100vw - 32px))',
            boxShadow: 'var(--shadow-raised)',
            overflowWrap: 'anywhere',
          },
          success: { iconTheme: { primary: '#466345', secondary: '#fff4d6' } },
        }}
      />
      <Suspense fallback={<PageLoading />}><AppRoutes /></Suspense>
    </AuthProvider>
    </MotionConfig>
  )
}
