import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { motion } from 'framer-motion'
import { auth, db } from '../lib/firebase'
import { press, reveal } from '../lib/motion'

export default function CustomerAuth() {
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const handleGoogleSignIn = async () => {
    if (loading) return
    setLoading(true)
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider())
      const userDoc = await getDoc(doc(db, 'users', result.user.uid))
      navigate(userDoc.exists() && userDoc.data().role === 'admin' ? '/admin/dashboard' : '/')
    } catch (err) {
      console.error('Google sign-in error:', err)
      if (err.code !== 'auth/popup-closed-by-user') toast.error('Google sign-in failed, try again')
    } finally {
      setLoading(false)
    }
  }
  return (
    <div className="auth-page">
      <header className="auth-header"><a className="store-brand" href="/login"><span className="brand-stamp">s.</span>snackshop<span className="brand-period">.</span></a><span>Your campus corner shop.</span></header>
      <main className="auth-layout">
        <motion.section className="auth-story" {...reveal}><span className="eyebrow">FOR THE BREAKS IN BETWEEN</span><h1>Good snacks.<br /><span>Better breaks.</span></h1><p>From a quick bite before class to something sweet after a long day. Your campus favourites, all in one little shop.</p><div className="auth-signature">Browse the shelves. Fill your bag. See you at pickup.</div></motion.section>
        <motion.section className="auth-card" {...reveal}>
          <span className="eyebrow">COME ON IN</span><h2>Your next break starts here.</h2><p>Sign in to browse live stock, place an order, and keep track of your pickup.</p>
          <motion.button className="auth-google" whileTap={loading ? undefined : press} disabled={loading} onClick={handleGoogleSignIn}>
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z" /><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z" /><path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.33z" /><path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58z" /></svg>
            <span aria-live="polite">{loading ? 'Signing in…' : 'Continue with Google'}</span>
          </motion.button>
          <p className="auth-privacy">No new password to remember. Just your Google account.</p>
          {import.meta.env.DEV && <a className="auth-preview-link" href="/preview">Explore the local design preview ↗</a>}
        </motion.section>
      </main>
      <footer className="auth-footer">A small shop for your everyday breaks.</footer>
    </div>
  )
}
