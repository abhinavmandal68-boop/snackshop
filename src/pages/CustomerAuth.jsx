import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, ShoppingBag, UserPlus, LogIn } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'firebase/auth'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'

export default function CustomerAuth() {
  const [mode, setMode] = useState('login') // login | signup
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async () => {
    if (!email || !password) { toast.error('Fill in all fields'); return }
    if (mode === 'signup' && !name.trim()) { toast.error('Enter your name'); return }
    setLoading(true)

    try {
      if (mode === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth, email, password)
        // Save profile to Firestore
        await setDoc(doc(db, 'users', cred.user.uid), {
          name: name.trim(),
          email: email.trim(),
          role: 'customer',
          createdAt: serverTimestamp(),
        })
        toast.success(`Welcome, ${name.trim()}!`)
      } else {
        await signInWithEmailAndPassword(auth, email, password)
        toast.success('Welcome back!')
      }
      navigate('/')
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') toast.error('Email already registered — please login')
      else if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') toast.error('Wrong email or password')
      else if (err.code === 'auth/weak-password') toast.error('Password must be at least 6 characters')
      else toast.error('Something went wrong')
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
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 28 }}>

          {/* Mode toggle */}
          <div style={{ display: 'flex', background: 'var(--surface2)', borderRadius: 10, padding: 4, marginBottom: 24 }}>
            {[{ id: 'login', label: 'Login', icon: LogIn }, { id: 'signup', label: 'Sign Up', icon: UserPlus }].map(m => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                style={{ flex: 1, padding: '8px', borderRadius: 8, background: mode === m.id ? 'var(--accent)' : 'transparent', color: mode === m.id ? 'var(--accent-text)' : 'var(--text-secondary)', fontFamily: 'Syne', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all 0.15s' }}
              >
                <m.icon size={13} /> {m.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {mode === 'signup' && (
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Your name</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Abhinav Mandal"
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                />
              </div>
            )}

            <div>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Min. 6 characters"
                  style={{ paddingRight: 42 }}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                />
                <button onClick={() => setShow(s => !s)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-hint)', padding: 4, display: 'flex' }}>
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={loading}
              style={{ marginTop: 4, padding: 13, borderRadius: 12, background: loading ? 'var(--surface2)' : 'var(--accent)', color: loading ? 'var(--text-secondary)' : 'var(--accent-text)', fontFamily: 'Syne', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              {loading ? 'Please wait...' : mode === 'login' ? '→ Enter shop' : '→ Create account'}
            </button>
          </div>

          <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-hint)', marginTop: 16 }}>
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button onClick={() => setMode(mode === 'login' ? 'signup' : 'login')} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 600, padding: 0, textDecoration: 'underline' }}>
              {mode === 'login' ? 'Sign up' : 'Login'}
            </button>
          </p>
        </div>

        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-hint)', marginTop: 16 }}>
          Admin? <a href="/admin" style={{ color: 'var(--text-hint)', textDecoration: 'underline' }}>Login here</a>
        </p>
      </div>
    </div>
  )
}