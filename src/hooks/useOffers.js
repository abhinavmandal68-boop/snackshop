import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { offerList } from '../lib/bundleOffers.mjs'

export default function useOffers() {
  const [offers, setOffers] = useState([])
  const [status, setStatus] = useState('loading')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    setStatus('loading')
    return onSnapshot(doc(db, 'settings', 'offers'), snapshot => {
      setOffers(offerList(snapshot.data())); setStatus('ready')
    }, () => { setOffers([]); setStatus('error') })
  }, [revision])
  return { offers, status, retry: () => setRevision(value => value + 1) }
}
