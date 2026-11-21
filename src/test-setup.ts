import fc from 'fast-check'

// The seed is pinned in the `npm test` script (FC_SEED) so property runs are reproducible.
const seed = Number(process.env.FC_SEED ?? 20261120)
fc.configureGlobal({ seed, numRuns: 200 })
