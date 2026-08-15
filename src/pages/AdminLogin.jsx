import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { motion } from 'framer-motion'
import { auth } from '../lib/firebase'

export default function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleLogin = async () => {
    if (!email || !password) { toast.error('Fill in all fields'); return }
    setLoading(true)
    try {
      await signInWithEmailAndPassword(auth, email, password)
      navigate('/admin/dashboard')
    } catch {
      toast.error('Wrong email or password')
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <motion.div 
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        style={{ width: '100%', maxWidth: 360, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 32, boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}
      >
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 17, delay: 0.1 }}
            style={{ width: 48, height: 48, background: 'var(--accent-dim)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}
          >
            <Lock size={20} color="var(--accent)" />
          </motion.div>
          <h1 style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 22, margin: 0 }}>Admin Login</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>SnackShop management</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input 
            type="email" 
            value={email} 
            onChange={e => setEmail(e.target.value)} 
            placeholder="Admin email" 
            onKeyDown={e => e.key === 'Enter' && handleLogin()} 
          />
          <div style={{ position: 'relative' }}>
            <input 
              type={show ? 'text' : 'password'} 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              placeholder="Password" 
              style={{ paddingRight: 40 }} 
              onKeyDown={e => e.key === 'Enter' && handleLogin()} 
            />
            <motion.button 
              whileTap={{ scale: 0.85 }}
              onClick={() => setShow(s => !s)} 
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-hint)', padding: 4, cursor: 'pointer' }}
            >
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </motion.button>
          </div>

          <motion.button 
            whileHover={{ scale: loading ? 1 : 1.01 }}
            whileTap={{ scale: loading ? 1 : 0.98 }}
            onClick={handleLogin} 
            disabled={loading} 
            style={{ 
              padding: 12, 
              borderRadius: 10, 
              background: 'var(--accent)', 
              color: 'var(--accent-text)', 
              fontFamily: 'Syne', 
              fontWeight: 700, 
              fontSize: 14, 
              marginTop: 4, 
              opacity: loading ? 0.6 : 1, 
              border: 'none', 
              cursor: loading ? 'not-allowed' : 'pointer' 
            }}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </motion.button>
        </div>
      </motion.div>
    </div>
  )
}