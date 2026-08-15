import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { auth } from '../lib/firebase'

export default function CustomerAuth() {
  const [loading, setLoading] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const navigate = useNavigate()

  const handleGoogleSignIn = async () => {
    setLoading(true)
    try {
      const provider = new GoogleAuthProvider()
      await signInWithPopup(auth, provider)
      navigate('/')
    } catch (err) {
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
        backgroundImage: 'radial-gradient(circle at 50% 20%, #1e1b00 0%, #0d0d0d 70%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        fontFamily: "'Syne', sans-serif",
      }}
    >
      <div style={{ width: '100%', maxWidth: 400, position: 'relative' }}>
        {/* Decorative Ambient Glow */}
        <div
          style={{
            position: 'absolute',
            top: -40,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 200,
            height: 200,
            background: '#ffd700',
            opacity: 0.15,
            filter: 'blur(80px)',
            borderRadius: '50%',
            pointerEvents: 'none',
          }}
        />

        {/* Logo Section */}
        <div style={{ textAlign: 'center', marginBottom: 36, position: 'relative' }}>
          <div
            style={{
              fontSize: 44,
              marginBottom: 12,
              display: 'inline-block',
              filter: 'drop-shadow(0 0 12px rgba(255, 215, 0, 0.4))',
            }}
          >
            🛒
          </div>
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
        </div>

        {/* Main Card */}
        <div
          style={{
            background: '#141414',
            border: '1px solid #27272a',
            borderRadius: 20,
            padding: 32,
            textAlign: 'center',
            boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.7), 0 0 20px rgba(255, 215, 0, 0.05)',
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
            ⚡ Express Order
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

          <button
            onClick={handleGoogleSignIn}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px 18px',
              borderRadius: 14,
              background: loading ? '#27272a' : isHovered ? '#ffe44d' : '#ffd700',
              color: loading ? '#71717a' : '#000000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              fontWeight: 700,
              fontSize: 15,
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: loading
                ? 'none'
                : isHovered
                ? '0 6px 20px rgba(255, 215, 0, 0.4)'
                : '0 4px 14px rgba(255, 215, 0, 0.25)',
              transition: 'all 0.2s ease',
              transform: isHovered && !loading ? 'translateY(-2px)' : 'translateY(0)',
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
          </button>
        </div>

        {/* Admin Link Footer */}
        <p
          style={{
            textAlign: 'center',
            fontSize: 12,
            color: '#71717a',
            marginTop: 20,
          }}
        >
          Admin access?{' '}
          <a
            href="/admin"
            style={{
              color: '#ffd700',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Login here &rarr;
          </a>
        </p>
      </div>
    </div>
  )
}