import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'

export default function CustomerAuth() {
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleGoogleSignIn = async () => {
    setLoading(true)
    try {
      const provider = new GoogleAuthProvider()
      const result = await signInWithPopup(auth, provider)
      const user = result.user

      // Check if profile already exists so we don't clobber an existing role (e.g. admin)
      const ref = doc(db, 'users', user.uid)
      const snap = await getDoc(ref)

      if (!snap.exists()) {
        await setDoc(ref, {
          name: user.displayName || 'Customer',
          email: user.email,
          photoURL: user.photoURL || null,
          role: 'customer',
          createdAt: serverTimestamp(),
        })
      } else {
        // Keep name/photo fresh on repeat logins, but never touch role
        await setDoc(ref, {
          name: user.displayName || snap.data().name || 'Customer',
          email: user.email,
          photoURL: user.photoURL || null,
        }, { merge: true })
      }

      toast.success(`Welcome, ${(user.displayName || 'there').split(' ')[0]}!`)
      navigate('/')
    } catch (err) {
      if (err.code === 'auth/popup-closed-by-user') {
        // user just closed the popup, no need to show an error
      } else {
        console.error(err)
        toast.error('Google sign-in failed, try again')
      }
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 380 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🛒</div>
          <h1 style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 28, letterSpacing: '-0.02em' }}>SnackShop</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>Fresh snacks, always in stock</p>
        </div>

        {/* Card */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 28, textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 22, lineHeight: 1.6 }}>
            Sign in with Google to start ordering — no forms, no passwords.
          </p>

          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            style={{
              width: '100%', padding: '13px 16px', borderRadius: 12,
              background: loading ? 'var(--surface2)' : '#fff',
              color: loading ? 'var(--text-secondary)' : '#1f1f1f',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              fontFamily: 'Syne', fontWeight: 700, fontSize: 14,
              border: '1px solid var(--border)',
            }}
          >
            {!loading && (
              <svg width="18" height="18" viewBox="0 0 18 18">
                <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z"/>
                <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.33z"/>
                <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58z"/>
              </svg>
            )}
            {loading ? 'Signing in...' : 'Continue with Google'}
          </button>
        </div>

        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-hint)', marginTop: 16 }}>
          Admin? <a href="/admin" style={{ color: 'var(--text-hint)', textDecoration: 'underline' }}>Login here</a>
        </p>
      </div>
    </div>
  )
}