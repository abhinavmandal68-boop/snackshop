import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: "AIzaSyAOODeZpL8XXsbpAECBS2bTCRV8KkCcQmc",
  authDomain: "snackshop-7bb80.firebaseapp.com",
  projectId: "snackshop-7bb80",
  storageBucket: "snackshop-7bb80.firebasestorage.app",
  messagingSenderId: "508763703135",
  appId: "1:508763703135:web:70714881a10387757118ea",
  measurementId: "G-9JGDFNZK2K"
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
export const auth = getAuth(app)
