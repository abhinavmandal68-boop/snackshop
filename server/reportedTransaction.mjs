import { FieldValue } from 'firebase-admin/firestore'
import { orderContribution, ledgerContribution, contributionDelta, archivedContribution, REPORT_TYPE } from '../src/lib/monthlyReports.mjs'

// Buffer mutations so aggregate reads always happen before transaction writes.
// A per-record contribution makes payment retries and backfill safe to repeat.
export function runReportedTransaction(db, operation) {
  return db.runTransaction(async transaction => {
    const reads = new Map(), writes = [], changes = new Map()
    const reportRef = ref => ['orders', 'ledger'].includes(ref.parent.id) && !ref.id.startsWith('__report_')
      ? db.collection(ref.parent.id === 'orders' ? 'orderReports' : 'ledgerReports').doc(ref.id) : null
    const tx = {
      async get(ref) {
        const snap = await transaction.get(ref)
        if (ref.path) reads.set(ref.path, snap)
        return snap
      },
      async getAll(...refs) {
        if (!refs.length) return []
        const snapshots = await transaction.getAll(...refs)
        snapshots.forEach((snap, index) => {
          if (refs[index].path) reads.set(refs[index].path, snap)
        })
        return snapshots
      },
      async getWithReport(ref) { return (await tx.getAllWithReports(ref))[0] },
      async getAllWithReports(...refs) {
        // Read contribution state with the orders, avoiding a later round trip.
        const states = refs.map(reportRef).filter(Boolean)
        const snapshots = await tx.getAll(...refs, ...states)
        return snapshots.slice(0, refs.length)
      },
      report(ref) { track(ref, null, 'sync'); return tx },
      set(ref, data, options) { writes.push(['set', ref, data, options]); track(ref, data, options?.merge ? 'update' : 'set'); return tx },
      update(ref, data) { writes.push(['update', ref, data]); track(ref, data, 'update'); return tx },
      delete(ref) { writes.push(['delete', ref]); track(ref, null, 'delete'); return tx },
    }
    function track(ref, data, kind) {
      if (['orders', 'ledger'].includes(ref.parent.id) && !ref.id.startsWith('__report_')) {
        if (changes.has(ref.path)) throw new Error('Only one mutation per reported document is allowed')
        changes.set(ref.path, { ref, data, kind })
      }
    }
    const result = await operation(tx)
    const aggregateChanges = {}, states = []
    const records = await Promise.all([...changes.values()].map(async change => {
      const stateRef = reportRef(change.ref)
      const [current, state] = await Promise.all([reads.get(change.ref.path) || tx.get(change.ref), reads.get(stateRef.path) || tx.get(stateRef)])
      return { ...change, current, state, stateRef }
    }))
    for (const { ref, kind, data, current, state, stateRef } of records) {
      const compute = ref.parent.id === 'orders' ? orderContribution : ledgerContribution
      const previous = state.exists ? state.data().contribution : {}
      const full = kind === 'set' ? data : { ...(current.exists ? current.data() : {}), ...data }
      // Deleting archived orders keeps their counts and financial collections.
      // An untracked legacy order is counted before its history is removed.
      const next = kind === 'delete' && ref.parent.id === 'orders'
        ? archivedContribution(state.exists ? previous : compute(current.data()))
        : kind === 'delete' ? {} : compute(full)
      const delta = contributionDelta(previous, next)
      for (const [month, fields] of Object.entries(delta)) {
        const aggregate = aggregateChanges[month] ||= {}
        for (const [field, delta] of Object.entries(fields)) aggregate[field] = (aggregate[field] || 0) + delta
      }
      if (!state.exists || Object.keys(delta).length) states.push({ ref: stateRef, contribution: next })
    }
    for (const [month, fields] of Object.entries(aggregateChanges)) {
      const patch = { type: REPORT_TYPE, month, updatedAt: FieldValue.serverTimestamp() }
      for (const [field, delta] of Object.entries(fields)) {
        if (field.includes('.')) {
          const [map, key] = field.split('.');
          (patch[map] ||= {})[key] = FieldValue.increment(delta)
        } else patch[field] = FieldValue.increment(delta)
      }
      transaction.set(db.collection('ledger').doc(`__report_${month}`), patch, { merge: true })
    }
    for (const state of states) transaction.set(state.ref, { contribution: state.contribution })
    for (const [method, ref, ...args] of writes) transaction[method](ref, ...args.filter(arg => arg !== undefined))
    return result
  })
}
