// Document updaters for the Import page. Each one advances the local clock past every stamp
// in the imported data *inside* the updater, so Store.update persists
// lastStamp = max(doc.lastStamp, seen) with the same write. After a reload the clock
// starts from that lastStamp, so a later local edit still beats the imported records.

import { observeStamp } from '../lib/clock'
import { stampsSeen } from '../lib/share/merge'
import type { DataDoc, Group } from '../lib/types'

/** Add a group that isn't on this device yet (a fresh import or a separate copy). */
export function importAddGroup(doc: DataDoc, g: Group): DataDoc {
  observeStamp(stampsSeen(g))
  return { ...doc, groups: [...doc.groups, g] }
}

/** Replace the local group with the merge result. */
export function importMergeGroup(doc: DataDoc, local: Group, incoming: Group, merged: Group): DataDoc {
  observeStamp(stampsSeen(local, incoming, merged))
  return { ...doc, groups: doc.groups.map((x) => (x.id === local.id ? merged : x)) }
}
