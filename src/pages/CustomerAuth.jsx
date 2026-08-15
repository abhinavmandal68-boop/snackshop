import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { motion } from 'framer-motion'
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

      const userDoc = await getDoc(doc(db, 'users', user.uid))

      if (userDoc.exists() && userDoc.data().role === 'admin') {
        navigate('/admin/dashboard')
      } else {
        navigate('/')
      }
    } catch (err) {
      console.error('Google sign-in error:', err)

      if (err.code !== 'auth/popup-closed-by-user') {
        toast.error('Google sign-in failed, try again')
      }
    }

    setLoading(false)
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0d0d0d',
        backgroundImage:
          'radial-gradient(circle at 50% 20%, #1e1b00 0%, #0d0d0d 70%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        fontFamily: "'Syne', sans-serif",
      }}
    >
      <div style={{ width: '100%', maxWidth: 400, position: 'relative' }}>

        <motion.div
          animate={{
            scale: [1, 1.25, 1],
            opacity: [0.12, 0.22, 0.12],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          style={{
            position: 'absolute',
            top: -40,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 220,
            height: 220,
            background: '#ffd700',
            filter: 'blur(80px)',
            borderRadius: '50%',
            pointerEvents: 'none',
          }}
        />

        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          style={{
            textAlign: 'center',
            marginBottom: 36,
            position: 'relative',
          }}
        >
          <h1
            style={{
              fontWeight: 800,
              fontSize: 34,
              letterSpacing: '-0.03em',
              color: '#ffffff',
              margin: 0,
            }}
          >
            Snack<span style={{ color: '#ffd700' }}>Shop</span>
          </h1>

          <p
            style={{
              color: '#a1a1aa',
              fontSize: 14,
              marginTop: 6,
              fontWeight: 500,
            }}
          >
            Fresh snacks, always in stock
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{
            duration: 0.4,
            delay: 0.15,
            ease: [0.16, 1, 0.3, 1],
          }}
          style={{
            background: '#141414',
            border: '1px solid #27272a',
            borderRadius: 20,
            padding: 32,
            textAlign: 'center',
            boxShadow:
              '0 20px 40px -15px rgba(0, 0, 0, 0.7), 0 0 20px rgba(255, 215, 0, 0.05)',
          }}
        >
          <div
            style={{
              display: 'inline-block',
              background: '#221f06',
              border: '1px solid #423806',
              color: '#ffd700',
              padding: '6px 14px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              marginBottom: 18,
            }}
          >
            Express Order
          </div>

          <p
            style={{
              fontSize: 15,
              color: '#d4d4d8',
              marginBottom: 28,
              lineHeight: 1.5,
              fontWeight: 500,
            }}
          >
            Sign in with Google to start exploring your favorite snacks.
          </p>

          <motion.button
            whileHover={{
              scale: loading ? 1 : 1.02,
              backgroundColor: loading ? '#27272a' : '#ffe44d',
            }}
            whileTap={{ scale: loading ? 1 : 0.97 }}
            onClick={handleGoogleSignIn}
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px 18px',
              borderRadius: 14,
              background: loading ? '#27272a' : '#ffd700',
              color: loading ? '#71717a' : '#000000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              fontWeight: 700,
              fontSize: 15,
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 14px rgba(255, 215, 0, 0.25)',
            }}
          >
            {!loading && (
              <svg width="20" height="20" viewBox="0 0 18 18">
                <path
                  fill="#4285F4"
                  d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z"
                />
                <path
                  fill="#34A853"
                  d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z"
                />
                <path
                  fill="#FBBC05"
                  d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.33z"
                />
                <path
                  fill="#EA4335"
                  d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58z"
                />
              </svg>
            )}

            {loading ? 'Signing in...' : 'Continue with Google'}
          </motion.button>
        </motion.div>
      </div>
    </div>
  )
}