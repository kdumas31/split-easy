# Split Easy — Build Plan

> Status: planning only. Nothing is scaffolded yet. Dev port **8840**. Launcher **`start-split-easy.command`**.

---

## 1. Goal and who it's for

Split Easy helps regular people (families on a trip, roommates splitting rent and groceries, friends after a dinner) keep track of who paid for what and settle up with the fewest possible payments. It runs entirely in the browser with no account and no server: data lives on the device, and a whole group can be handed to someone else as a single link. v1 must feel warm, be correct to the cent, work offline, and be usable one-handed on a phone.

---

## 2. Branding

**Name:** Split Easy
**Tagline:** *Fair shares, no fuss.*
**Secondary line (home / About):** "Trips, rent, dinners: we keep the math honest so you can keep the friends."

### Palette (warm "kitchen table" look: terracotta, saffron, cream, espresso)

Contrast ratios were calculated by hand when writing this plan. The build re-checks every pair in a unit test (§7).

| Token | Light | Dark | Use | Contrast check |
|---|---|---|---|---|
| `--paper` (page bg) | `#FBF5EC` cream | `#1C1410` cocoa | background | — |
| `--surface` (cards) | `#FFFBF5` | `#2A1F19` | cards, sheets | — |
| `--ink` (text) | `#2B1D14` espresso | `#F6EDE1` | body text | ≥ 14:1 both modes |
| `--ink-muted` | `#6B5647` | `#C9B8A6` | secondary text | ~6.4:1 / ~9.4:1 |
| `--primary` | `#B4482A` terracotta | `#E8784F` | primary buttons, links | white on light ≈ 5.4:1; `#1C1410` on dark ≈ 6.3:1 |
| `--accent` | `#E9A23B` saffron | `#F2B65A` | highlights, wordmark coin, chips (decoration only, never body text on cream) | ink on saffron ≈ 7.5:1 |
| `--gets-back` | `#2F6B40` sage | `#8CCB9B` | "gets back" amounts | ~5.9:1 on cream |
| `--owes` | `#9A3324` brick | `#F08F7A` | "owes" amounts | ~6.7:1 on cream |
| `--focus` | `#1D4E89` ink-blue | `#F2B65A` saffron | 3px `:focus-visible` ring, drawn **outside** the control (`outline-offset: 2px`) so it sits on, and is measured against, the page background | ≥ 3:1 against `--paper`/`--surface` (non-text) |
| `--line` | `#E8DCCB` | `#3A2C23` | dividers | decorative |

Color never carries meaning alone. Amounts always come with words and a sign: "Maya gets back $42.10", "Sam owes $18.00".

### Typography (self-hosted, works offline)
- **Display / wordmark / headings:** *Fraunces* (variable, SIL OFL). A soft, slightly wonky serif with a hand-made feel. Use moderate `SOFT`/`WONK` axis values.
- **UI / body:** *Figtree* (variable, SIL OFL). A friendly, very readable geometric sans.
- **Amounts:** Figtree with `font-variant-numeric: tabular-nums` so columns line up. (Phase 1 checks that the font supports `tnum`. If it doesn't, amounts fall back to `ui-rounded, system-ui` with tabular-nums.)
- Fonts come from `@fontsource-variable/fraunces` and `@fontsource-variable/figtree` (npm packages with woff2 files that Vite bundles into `/assets`). **No Google Fonts request at runtime.** Fonts are precached by the service worker. Use `font-display: swap`.
- **Exactly which files to import** (the package's default `index.css` for Fraunces is the weight axis only, so `SOFT`/`WONK` would never load):
  - Fraunces: the **latin "full" normal** file, the one that carries `wght` + `opsz` + `SOFT` + `WONK` (≈ 121 KB woff2). Don't import the package's multi-subset CSS (Vite would bundle and precache every subset). Instead write our own `@font-face` in `styles/fonts.css` whose `src` points at that single woff2 (e.g. `@fontsource-variable/fraunces/files/fraunces-latin-full-normal.woff2`). Phase 1 confirms the exact filename in `node_modules` and that the file contains the `SOFT`/`WONK` axes.
  - Figtree: the **latin weight-axis normal** woff2 only (≈ 20 KB, e.g. `figtree-latin-wght-normal.woff2`), same hand-written `@font-face` approach.
  - **No italic files, no latin-ext, no other subsets.** Total ≈ 141 KB, under the 150 KB font budget, and both are precached for offline. The build-output budget check (§8) fails if fonts exceed 150 KB.

### Wordmark and icon
- Wordmark: **split easy**, all lowercase in Fraunces SemiBold. The dot on the "i" in *split* is a small coin cut into two halves (terracotta + saffron) with a hairline gap between them. Built as an inline SVG component (`<Wordmark/>`) so it inherits theme colors.
- App icon: the same split coin, large, in cream on a terracotta rounded square. A maskable variant gets extra padding. The source SVG is committed and the PNGs are generated once with `@vite-pwa/assets-generator`, then committed too.

### Tone
Plainspoken, warm, a little wry. Never guilt-trippy. Say "owes" and "gets back", never "debt" or "debtor". Keep sentences short.
- Home empty: "No groups yet. Start one for a trip, a house, or tonight's dinner." [Start a group] · [Try the demo trip]
- Group with no expenses: "Nothing spent yet. The first round's on someone. Add it here."
- Everyone square: "All square. Nobody owes anybody. Enjoy it while it lasts."
- Exact-split mismatch: "$1.25 left to assign" / "$0.40 over the total". These two phrases are the **only** wording for a remainder, used identically in the editor, the lib error, tests, and examples (e.g. "1¢ left to assign").
- Import merged: "Merged. 3 new expenses, 1 updated. Nothing of yours was removed." [Undo]

---

## 3. Architecture

### Stack (decision: Vite + React + TypeScript, static)
- **Vite 6+ + React 19 + TypeScript (strict).** This is a pure client-side SPA with no SSR or SEO needs, so Next.js static export would only add weight and complexity. No strong reason for Next.js, so it isn't used.
- **Routing:** `wouter` (~2 KB) with history-API paths. `vercel.json` rewrites unknown paths to `/index.html`; Vercel serves real files first. The service worker's `navigateFallback` covers offline.
- **State:** a tiny store (`useSyncExternalStore`) holding the whole persisted document, plus pure action functions. No Redux or Zustand.
- **Compression:** `lz-string` (`compressToEncodedURIComponent`). It's synchronous, ~5 KB, and its output is URL-safe.
- **PWA:** `vite-plugin-pwa` (Workbox `generateSW`).
- **Tests:** Vitest + `fast-check` (property tests). Playwright (Chromium only) + `@axe-core/playwright` for one light smoke spec.
- **Node:** v24 is already installed. All deps are project-local (`npm install` / `npx`). No global installs.
- **Runtime deps (complete list):** `react`, `react-dom`, `wouter`, `lz-string`, `@fontsource-variable/fraunces`, `@fontsource-variable/figtree`.
- **Dev deps:** `vite`, `@vitejs/plugin-react`, `typescript`, `@types/react`, `@types/react-dom`, `vitest`, `fast-check`, `vite-plugin-pwa`, `@vite-pwa/assets-generator`, `@playwright/test`, `@axe-core/playwright`.
- **No component library** (no MUI/Chakra/Radix etc.). Components are hand-written on native elements (`<dialog>`, `<button>`, radio groups) to stay inside the JS budget.
- **Budget:** initial JS ≤ 100 KB gzipped. Fonts ≤ 150 KB total.

### Folder map
```
split-easy/
├─ PLAN.md  README.md  LEARN.md
├─ start-split-easy.command        # launcher (copied to ~/Desktop in Phase 4)
├─ index.html                      # inline pre-paint theme script, manifest link
├─ vite.config.ts                  # port 8840 strictPort, PWA plugin
├─ vitest.config.ts  playwright.config.ts  tsconfig.json
├─ vercel.json                     # SPA rewrite + cache headers
├─ public/
│  ├─ favicon.svg  icon.svg
│  └─ icons/ pwa-192.png pwa-512.png maskable-512.png apple-touch-icon-180.png
├─ src/
│  ├─ main.tsx  App.tsx  routes.tsx
│  ├─ lib/                         # PURE, framework-free, 100% unit tested
│  │  ├─ types.ts                  # data model (§4)
│  │  ├─ money.ts                  # parseCents, formatCents (string math only)
│  │  ├─ split.ts                  # equal / shares / exact → per-person cents
│  │  ├─ balances.ts               # net balance per person
│  │  ├─ settle.ts                 # minimum-transfer settle-up
│  │  ├─ hash.ts                   # fnv1a32 (deterministic remainder rotation)
│  │  ├─ ids.ts  clock.ts          # random ids; monotonic updatedAt stamps
│  │  ├─ validate.ts               # hand-written guards for stored + imported data
│  │  ├─ storage.ts  migrations.ts # localStorage load/save/version/migrate
│  │  ├─ share/codec.ts            # Group ⇄ compact JSON ⇄ lz-string fragment
│  │  ├─ share/merge.ts            # safe merge + MergeReport
│  │  ├─ csv.ts                    # CSV export
│  │  └─ demo.ts                   # "Lakehouse Weekend" demo group
│  ├─ state/ store.ts actions.ts
│  ├─ pages/ Home.tsx Group.tsx ExpenseEditor.tsx SettleUp.tsx People.tsx
│  │         Share.tsx Import.tsx Settings.tsx About.tsx PrintSummary.tsx NotFound.tsx
│  ├─ components/ Wordmark.tsx AmountInput.tsx PersonPicker.tsx SplitEditor.tsx
│  │              BalanceList.tsx TransferList.tsx Toast.tsx UpdateBanner.tsx Dialog.tsx
│  └─ styles/ tokens.css base.css components.css print.css
├─ tests/e2e/smoke.spec.ts
└─ docs/screenshots/               # (already exists) README screenshots
```
Unit tests sit next to their code (`src/lib/*.test.ts`).

### Routes
`/` home (group list + demo button) · `/g/:gid` group (expenses list, totals, "Settle up" CTA) · `/g/:gid/people` · `/g/:gid/expense/new` · `/g/:gid/expense/:eid` · `/g/:gid/settle` · `/g/:gid/share` · `/g/:gid/print` · `/import` (reads the hash) · `/settings` · `/about` (stub: what it is, privacy note, version, open-source font credits).

### PWA / offline
- `vite-plugin-pwa` with `registerType: 'prompt'` and `generateSW`. It precaches every built asset (JS, CSS, fonts, icons, `index.html`), sets `navigateFallback: '/index.html'`, and has `cleanupOutdatedCaches: true`. No runtime caching is needed because nothing is fetched at runtime.
- When a new build is detected, a polite `UpdateBanner` appears ("A fresh version of Split Easy is ready. [Refresh]"). It never auto-reloads, so nobody loses an expense halfway through typing it.
- The SW is registered only in production builds (`vite preview`, Vercel), never in `vite dev`.
- `vercel.json` headers: `Cache-Control: no-cache` for `/sw.js`, `/index.html`, and `/manifest.webmanifest`; `public, max-age=31536000, immutable` for `/assets/*` (file names are hashed).
- Manifest: `name: "Split Easy"`, `short_name: "Split Easy"`, `start_url: "/"`, `scope: "/"`, `display: "standalone"`, `background_color: #FBF5EC`, `theme_color: #B4482A`, plus the 192, 512, and maskable icons. iOS gets `apple-touch-icon` and `apple-mobile-web-app-*` meta tags.
- On the first save, call `navigator.storage.persist()` (best effort) to lower the chance the browser evicts the data.

### localStorage layout and versioning
| Key | Contents |
|---|---|
| `split-easy:data` | `{ schemaVersion: 1, groups: Group[], settings: Settings, lastStamp: number }` |
| `split-easy:theme` | `"system" \| "light" \| "dark"`. A separate tiny key so the inline pre-paint script in `index.html` can set `data-theme` before React loads (no flash). Mirrored in `settings.theme`. |
| `split-easy:backup:v{n}` | Full copy of the raw data saved right before a migration from version *n*. |
| `split-easy:corrupt:{ts}` | Raw string kept aside if `data` fails to parse or validate. |
| `split-easy:undo` | `{ groupId, before: Group \| null, afterStamp }`: the pre-import state of the last imported group (`null` = the group was not on this device before), for "Undo". |
- **Load:** read → `JSON.parse` → run `migrations[v]` step by step until it reaches `CURRENT_SCHEMA` (a backup is written first) → `validate`. If parsing or validation fails, the raw string is moved to `split-easy:corrupt:{ts}`, the app starts with an empty document, and a banner explains what happened and offers a download of the raw data. **Data is never silently thrown away.**
- **Save:** debounced (~150 ms) full-document write, plus a flush on `visibilitychange` (hidden) and `pagehide`. The flush is a plain **synchronous** `localStorage.setItem` (no `await`, no timer) so it completes before the page is frozen. A quota error shows a toast.
- **Multiple tabs:** listen for the `storage` event on `split-easy:data`. **Do not auto-merge** (groups have no tombstone, so merging would bring back a group the other tab just deleted). Instead: cancel any pending debounced save in this tab, show the banner "Updated in another tab", and replace this tab's in-memory document with the newly saved one (re-run load → migrate → validate on `event.newValue`; `null`, from "Erase all data" in the other tab, means an empty document). If the current route's group or expense no longer exists, go to Home with a toast. CRDT-style merging happens only on the Import screen.
- A newer `schemaVersion` than this build knows about (an old cached build opening newer data) → read-only mode plus the "refresh to update" banner. Never write over newer data: in read-only mode the debounced save **and** the `visibilitychange`/`pagehide` flush are disabled, and every mutating action is blocked.

---

## 4. Data model and share-URL format

```ts
type Id = string;        // 12 chars, base62, from crypto.getRandomValues (~71 bits)
type Cents = number;     // ALWAYS a safe integer. Never a float. Validated on every boundary.
type Stamp = number;     // ms epoch, strictly increasing per device (see clock.ts)

interface Person {
  id: Id;
  name: string;          // 1–40 chars after trim, any Unicode. KEPT on tombstones too (see integrity pass)
  updatedAt: Stamp;
  deleted?: true;        // tombstone
}

type Split =
  | { mode: 'equal';  participants: Id[] }               // ≥1 person, no duplicate ids
  | { mode: 'shares'; weights: Record<Id, number> }      // integers 0–100, at least one > 0
  | { mode: 'exact';  amounts: Record<Id, Cents> };      // integers 0 … 10_000_000_00, must sum to amountCents
// A group member not listed in a shares/exact split has weight/amount 0.
// paidBy may be someone who is not a participant (e.g. a parent pays for the kids).

type Category = 'food' | 'groceries' | 'lodging' | 'transport'
              | 'activities' | 'shopping' | 'utilities' | 'other';

interface Expense {
  id: Id;
  title: string;          // 1–80 chars
  amountCents: Cents;     // 1 … 10_000_000_00 ($10M cap, = 10^9 cents; same cap in UI and validate), 0 allowed only in lib
  paidBy: Id;
  split: Split;
  category?: Category;
  note?: string;          // ≤ 280 chars
  date: string;           // 'YYYY-MM-DD' (local date, no time zone math)
  createdAt: Stamp;
  updatedAt: Stamp;
  deleted?: true;
}

interface Settlement {    // a recorded real-world payment: `from` paid `to`
  id: Id;
  from: Id;
  to: Id;                 // from !== to
  amountCents: Cents;     // 1 … 10_000_000_00
  date: string;
  updatedAt: Stamp;
  deleted?: true;
}

interface Group {
  id: Id;
  name: string;           // 1–60 chars
  emoji?: string;         // exactly one grapheme (counted with Intl.Segmenter, so 👩‍👩‍👧 is one), optional
  currencySymbol: string; // default '$', ≤ 3 chars, display only
  settledAt?: Stamp | null; // "marked settled" (archived look); null = active
  isDemo?: true;
  createdAt: Stamp;
  metaUpdatedAt: Stamp;   // LWW stamp for name/emoji/currencySymbol/settledAt
  people: Person[];
  expenses: Expense[];
  settlements: Settlement[];
}

interface Settings {
  theme: 'system' | 'light' | 'dark';
  defaultCurrencySymbol: string;   // used for new groups, default '$'
  lastGroupId?: Id;
}
```

Rules:
- A person can't be deleted while any live expense or settlement refers to them. The UI says "Maya is in 3 expenses. Take her out of those first." Renaming is always allowed.
- **Monotonic stamps (`clock.ts`):** `stamp() = lastStamp = max(Date.now(), lastStamp + 1)`. After an import, `lastStamp = max(lastStamp, maxStampSeen)`, so any edit made after merging always beats whatever was just imported, even when the clocks on the two devices disagree. `stamp()` is used only by local user actions, **never inside `mergeGroup`**.
- **Tombstones are kept for the life of the group** in v1 (no garbage collection). They are tiny, and dropping them would let an old link resurrect deleted records.
- **Dates:** "today" (default expense date, settlement date, CSV filename) is the **local calendar date** built from `getFullYear()/getMonth()/getDate()`, never `toISOString().slice(0,10)` (which is UTC and can be off by a day).
- Derived values (balances, transfers, totals) are **never stored**. They're computed with `useMemo` from the records.

### Validation (`validate.ts`), applied to stored data on load **and** to every import
Reject (with a typed error) if any of these hold:
- duplicate ids within `people`, `expenses`, or `settlements`; duplicate ids in an equal-split `participants` list; duplicate person keys in a shares/exact split (checked on the wire's `[[personId, n], …]` arrays, before they become a `Record`);
- any cent value that is not an integer (`Number.isInteger`), or an `amountCents` outside `0 … 10_000_000_00` (lib) / `1 … 10_000_000_00` (expenses and settlements as stored); exact amounts outside `0 … 10_000_000_00`;
- share weights that are not integers in `0 … 100`, or all zero;
- a settlement with `from === to`;
- any `paidBy`, split person id, or settlement `from`/`to` that is not an id in `people` (tombstoned people count as known; the integrity pass revives them);
- strings outside their length limits, an invalid `date`, an unknown `category` or split `mode`, an `emoji` that isn't one grapheme.

The UI enforces the **same** caps (`AmountInput` refuses more than $10,000,000.00; the shares stepper stops at 0 and 100). With `total ≤ 10^9` and `weight ≤ 100`, every intermediate `total * weight ≤ 10^11 < 10^12 < 2^53`, so all split math is exact integer math. (A larger "safe" total times a weight of 100 would not be a safe product, which is why the UI cap and the validate cap are the same number.)

### Share URL
```
https://<host>/import#s1.<payload>
```
- **Hash fragment:** browsers never send it to the server, so group data never reaches Vercel logs.
- `s1` is the format version. The decoder rejects unknown versions with "This link was made by a newer Split Easy. Refresh to update."
- `<payload>` = `LZString.compressToEncodedURIComponent(JSON.stringify(wire))`. Its alphabet is `A–Z a–z 0–9 + - $`. **Read `location.hash` raw. Never put the payload through `URLSearchParams`, which turns `+` into a space.**
- `wire` (short keys, positional arrays to save bytes):
  ```
  { v:1,
    g:[id, name, currencySymbol, emoji|0, settledAt|0, createdAt, metaUpdatedAt],
    p:[[id, name, updatedAt]  | [id, updatedAt, 1, name]],    // second form = tombstone (keeps the name)
    e:[[id, title, amountCents, paidBy, mode, splitData, date, category|0, note|0, createdAt, updatedAt]
       | [id, updatedAt, 1]],
    t:[[id, from, to, amountCents, date, updatedAt] | [id, updatedAt, 1]] }
  ```
  `mode` is `0` equal, `1` shares, or `2` exact. `splitData` is an array of person ids (equal) or `[[personId, n], …]` (shares and exact). `isDemo` isn't shared.
- **Decoder rules:**
  - A row whose element `[1]` is a number and element `[2]` is the number `1` is a **tombstone**. Expense and settlement tombstones are exactly 3 long (`id`, `updatedAt`, `1`). Person tombstones are 4 long and carry the name, so a resurrected person is never nameless. Any other shape is a validation error.
  - The **numeric `0`** in `emoji|0`, `settledAt|0`, `category|0`, and `note|0` means **absent** (the field is omitted on decode, never stored as `0` or `""`). An empty string is not a valid value for those fields.
  - Split pairs are decoded into a `Record` only after the duplicate-key check (§4 Validation).
- **Size limits** (measured on the final URL length):
  - ≤ 6,000 chars: fine.
  - 6,001–60,000: allowed, with the note "This is a long link. Some chat apps cut long links. If it doesn't open, send the group file instead."
  - > 60,000: link disabled. Use **Download group file** (`.splitEasy.json`, same `wire` JSON uncompressed) instead. It imports through the same validate + merge path (Import page → "Open a file").
  - Rough size: ~45–60 chars per expense after compression, so a 4-person, 40-expense trip is about 2–3 KB.
  - **Decoder guards:** reject a payload longer than 200,000 chars or decompressed JSON longer than 2,000,000 chars, `null` decompression output, invalid JSON, or anything failing `validate` (the full list in §4 Validation: duplicate ids/keys, integer cents within the cap, weights 0–100, `from !== to`, every reference pointing at a known person id, exact splits summing correctly). Every failure gets a friendly message. Never a crash or a partial import.
- **Share screen:** "Copy link" (Clipboard API, with a select-the-text fallback). "Share…" uses `navigator.share({ title, text, url })`, shown only when available. "Download group file". A privacy note: "Anyone with this link can see this group's names and amounts."

### Import and merge rules (exact)
1. On `/import`, decode → validate. On failure, show the friendly error with a link home.
2. **No local group with that `id`** → preview ("Join *Lakehouse Weekend*: 4 people, 9 expenses") → [Save to this device] / [Cancel].
3. **A local group with the same `id` exists** → compute `merged = mergeGroup(local, incoming)` and a `MergeReport` without saving anything, then show the preview: *N new, N updated by them, N removed by them, N kept that only you have, N where your newer edit wins*. Beside each count, list the **titles** affected (expense titles, person names, and "Payment: Ben → Ada $10.00" for settlements) for added, updated, and removed; collapse to the first 5 plus "and N more". Buttons: [Merge] / [Save as a separate copy] / [Cancel].
   - **Save as a separate copy:** build a fresh id map for the group, **every** person, expense, and settlement in the incoming document (tombstones included), then rewrite every reference through it: each expense's `paidBy`, every person id in `participants` / `weights` / `amounts`, and each settlement's `from` and `to`. Name gets " (copy)". The copy is validated before it is saved (a missed reference fails validation instead of pointing at the original people). Tested: no id in the copy appears in the original.
4. `mergeGroup` per record collection (`people`, `expenses`, `settlements`), keyed by `id`:
   - Only in local → **keep** (local-only data is never removed by an import).
   - Only in incoming → **add**.
   - In both → the record with the **greater `updatedAt` wins** as a whole record. A tombstone counts as a record, so a deletion only applies if it's newer than the local version. **Tie** (same stamp, different content) → the record whose canonical JSON (sorted keys) compares lexicographically greater wins. That rule is symmetric, so both devices end up with the same data no matter who imports whom.
   - Group meta (`name`, `emoji`, `currencySymbol`, `settledAt`): greater `metaUpdatedAt` wins, with the same tie rule.
5. **Integrity pass:** if a live expense or settlement refers to a person who is tombstoned after the merge, bring that person back and count it in the report:
   - `deleted` removed;
   - **name** = the name from the newest non-tombstone version of that person in either copy; if neither copy has a live version, the name carried on the tombstone (tombstones always keep the name, locally and on the wire);
   - `updatedAt = M + 1`, where `M` is the largest stamp anywhere in either input document (`createdAt`, `metaUpdatedAt`, and every record's `updatedAt`/`createdAt`). **Never `stamp()` or `Date.now()`**: `mergeGroup` is a pure function of its two inputs, so both phones compute the identical result. After the import, `lastStamp = max(lastStamp, M + 1)` as usual.
   A reference to a completely unknown id can't get past validation.
6. **Undo.** Before writing, save `{ groupId, before, afterStamp }` to `split-easy:undo`, where `before` is the local pre-merge group, or `null` if the group was **not on this device yet** (a fresh "Save to this device"). After writing, show the toast "Merged … [Undo]" (or "Saved … [Undo]").
   - Undo with `before` = a group → put that group back exactly.
   - Undo with `before = null` → **remove the group** from the device.
   - Undo **expires** (key cleared, toast button disabled) on the **next local edit** to any data (any action that calls `stamp()`) **and** on the next import. That way Undo can never wipe expenses added after the merge.
7. `history.replaceState` removes the fragment, so reloading doesn't import again.
8. Properties tested (§7): `merge(a,a) = a` (idempotent); `merge(a,b) ≡ merge(b,a)` (commutative); `merge(merge(a,b),c) ≡ merge(a,merge(b,c))` (associative); local-only ids always survive; nothing is deleted except by a strictly newer tombstone (or an equal-stamp tombstone winning the deterministic tie); `mergeGroup` never reads the clock (tested by stubbing `Date.now` to throw).

---

## 5. Algorithms

### 5.1 Money input and output (`money.ts`)
- `parseCents(input)`: trim; strip one leading currency symbol and spaces. Then handle commas **by shape, never by a blanket strip**:
  - integer part matches `^\d{1,3}(,\d{3})+` (optionally followed by `.dd`) → commas are thousands separators and are removed (`"1,234.56"`, `"12,345"`);
  - exactly one comma followed by **1–2 trailing digits** and no `.` (`"12,50"`, `"3,5"`) → that comma is the **decimal point**;
  - any other comma (`"1,23,4"`, `"12,3456"`, `"1,234,5"`) → rejected.
  The result must match `^\d{0,8}(\.\d{0,2})?$` with at least one digit, and be ≤ `10_000_000_00` cents (the §4 cap). Cents are built **from the string parts** (`dollars*100 + paddedCents`). There's **no `parseFloat`**. `"12"→1200`, `"12.3"→1230`, `".5"→50`, `"1,234.56"→123456`, `"12,50"→1250`, `"$12,345"→1234500`. Rejects `"12.345"`, `"-1"`, `"1e3"`, `"abc"`, `""`, `"10000000.01"`.
- `formatCents(c, symbol)`: integer division and modulo, then group the digits by hand → `"$1,234.05"`. Negative values get a leading `−` (only used in debug and CSV balances).
- Every lib function asserts `Number.isSafeInteger` on its cent inputs and throws on violation (tests cover this).

### 5.2 Split rules (`split.ts`) → `Map<Id, Cents>` whose values always sum to exactly `amountCents`

**One core routine (largest remainder with deterministic tie-breaks).** Equal and shares both use it:
```
allocate(total, weights: [id, w][]  /* w integer ≥ 0, Σw = W > 0 */, expenseId):
  P      = ids with w > 0
  order  = P sorted by id ascending (plain UTF-16 code-unit compare), then rotated left by (fnv1a32(expenseId) mod |P|)
  for each i in P: base_i = floor(total * w_i / W);  rem_i = (total * w_i) mod W   // integer math
  r      = total − Σ base_i            // 0 ≤ r < |P|
  give +1 cent to the r people with the largest rem_i; ties broken by position in `order`
  people with w = 0 get 0
```
- `total * w_i` ≤ 10⁹ × 100 = 10¹¹ (the §4 cap), well inside 2⁵³, so the integer math is exact. `allocate` throws if `total` exceeds the cap or a weight is outside 0–100.
- **`fnv1a32` (`hash.ts`), pinned exactly:** 32-bit FNV-1a over the **UTF-8 bytes** of the string (ids are base62, so this is the same as ASCII; encode with `TextEncoder`). Offset basis **`2166136261`**, prime **`16777619`**.
  ```ts
  let h = 2166136261;
  for (const b of new TextEncoder().encode(s)) { h ^= b; h = Math.imul(h, 16777619); }
  return h >>> 0;            // UNSIGNED: 0 … 2^32 − 1
  ```
  The return value is **unsigned** (`>>> 0`), and the rotation is `hash % P.length` on that unsigned value. Using the signed value (`h | 0`) is a bug: for `e_groceries` it is `-2114244036`, and `-2114244036 % 3` is `-0`, which would give the extra cent to Ada instead of Ben. **Regression tests:** `fnv1a32("e_groceries") === 2180723260`, `fnv1a32("e_pizza") === 1531476333`, and the signed remainder `0` for `e_groceries` is asserted to be the wrong answer (the example A result must be Ben +1¢).
- **Equal** = `allocate(total, participants.map(id => [id, 1]))`. All remainders tie, so the extra cents go to the first `r` people in the rotated order. Everyone's share differs by at most 1¢.
- **Shares** = `allocate(total, weights)`. Weights are whole numbers 0–100 (UI hint: "use 3 and 2 instead of 1.5 and 1"). A group member who isn't in `weights` has weight 0.
- **Who's in a split:** members omitted from a shares or exact split count as weight / amount 0. `paidBy` may be someone outside the participant list (they paid but owe no share).
- **Why rotate?** If the extra cent always went to the same person (say, the lowest id), one person would eat every odd cent across 30 expenses. Rotating by a hash of the expense id spreads them out, and it's still deterministic. Every device computes the same numbers from the same records.
- **Exact:** every amount is an integer ≥ 0 for a known person, and `Σ amounts === total` **exactly**. Otherwise it's **rejected** with the difference ("$1.25 left to assign" / "$0.40 over the total"). It's never auto-adjusted. People with 0 are listed but owe nothing.
- **Rejected inputs:** non-integer or negative total; empty participant list; all-zero weights; non-integer or negative weights/amounts; unknown person ids; exact mismatch. `total = 0` is allowed in the lib (everyone gets 0). The UI requires ≥ 1¢.

**Worked example A, equal split with remainder.** Expense `e_groceries`, $100.00 split equally among `p_ada`, `p_ben`, `p_cy`.
`fnv1a32("e_groceries") = 2180723260` (unsigned), and `2180723260 mod 3 = 1` → order = [`p_ben`, `p_cy`, `p_ada`].
`base = floor(10000/3) = 3333` each, `r = 10000 − 9999 = 1` → `p_ben` gets the extra cent.
Result: Ben **$33.34**, Cy **$33.33**, Ada **$33.33**. Sum = $100.00 ✓

**Worked example B, shares with remainder.** Expense `e_pizza`, $100.01, weights Ada 2, Ben 1, Cy 1 (W = 4).
`fnv1a32("e_pizza") = 1531476333`, `mod 3 = 0` → order = [Ada, Ben, Cy].
Ada: 10001×2 = 20002 → base 5000, rem 2. Ben: 10001 → base 2500, rem 1. Cy: base 2500, rem 1.
Σ base = 10000 → r = 1 → the largest rem is Ada (2) → Ada 5001.
Result: Ada **$50.01**, Ben **$25.00**, Cy **$25.00**. Sum = $100.01 ✓

**Worked example C, exact mismatch.** $45.00 exact: Ada 20.00, Ben 15.00, Cy 9.99 → Σ 4499 ≠ 4500 → rejected: "1¢ left to assign". Save is disabled and the message is announced through `aria-live`.

### 5.3 Balances (`balances.ts`)
`balance[p] = Σ(amount of live expenses p paid) − Σ(p's share of live expenses) + Σ(live settlements p paid) − Σ(live settlements p received)`.
Positive = gets back, negative = owes. **Invariant: Σ balance = 0** (asserted in tests, and in dev builds at runtime).

### 5.4 Minimum-transfer settle-up (`settle.ts`)
Finding the absolute minimum number of transfers is NP-hard in general (it's a partitioning problem), but real groups are small, so:
0. If there are no people, or every balance is 0, return `[]` (`n === 0` → `[]`).
1. Drop people with balance 0. Sort the rest by `(balance, id)` to make it deterministic; person `i` in that order is bit `i` of a mask. Let `n` be how many are left.
2. **If `n ≤ 16`: exact.** The minimum number of transfers is `n − k`, where `k` is the largest number of disjoint groups of people whose balances each sum to 0. Find `k` with subset DP:
   `sum[mask]` = sum of balances in `mask`. `dp[0] = 0`; `dp[mask] = max over i in mask of dp[mask without i]`, `+1 if sum[mask] = 0`. Then `k = dp[full]`. That's 16 × 2¹⁶ ≈ 1M steps, well under 50 ms on a phone. `Int32Array`/`Float64Array`s hold the integers exactly.
   **Recovering the groups (exact procedure):**
   - A mask `s` is **atomic** when `sum[s] === 0` and `dp[s] === 1` (it has no smaller zero-sum subset).
   - Start with `mask = full`. While `mask ≠ 0`: enumerate the non-empty submasks `s` of `mask` and pick the **atomic** `s` with the **smallest numeric bitmask value** such that `dp[mask ^ s] === dp[mask] − 1`. Record `s` as a group and set `mask = mask ^ s`.
   - Such an `s` always exists (any part of an optimal partition is atomic, and the rest still achieves `dp[mask] − 1`). Implementation: collect all atomic masks once in ascending numeric order (one 2¹⁶ scan), then for each peel take the first one with `(s & mask) === s` that satisfies the `dp` condition. That's ≤ k × 2¹⁶ cheap checks. The "smallest bitmask" rule makes the chosen partition, and so the payer names, deterministic when two optimal partitions exist.
3. **Inside each zero-sum group** (atomic, so no smaller zero-sum subgroup): repeat "the **most negative** balance pays the **most positive** balance `min(|debt|, credit)`". Ties (equal debts or equal credits) go to the **lowest id**. Each step zeroes at least one person and the last step zeroes two, so a group of size *m* needs exactly *m − 1* transfers.
4. **If `n > 16`: fallback.** First pair off exact opposites (+x / −x, by id order), then use the greedy from step 3 on everyone left. This always needs ≤ n − 1 transfers and settles every balance. The UI says nothing different.
5. Output: `Transfer { from, to, amountCents }[]`, with every amount a positive integer, never `from === to`, sorted by from-name then to-name (then from-id, to-id) for display. This display order is the golden order in tests.

**Worked example D (where the simple greedy loses).** Balances: Ada +$50, Ben +$40, Cy +$30, Dee −$50, Eli −$70 (sum 0).
- Plain greedy (biggest debtor pays biggest creditor): Eli→Ada 50, Dee→Ben 40, Eli→Cy 20, Dee→Cy 10 = **4 transfers**.
- Split Easy: the zero-sum groups are {Ada, Dee} and {Ben, Cy, Eli}, so k = 2 → 5 − 2 = **3 transfers**: **Dee → Ada $50**, **Eli → Ben $40**, **Eli → Cy $30** ✓

**Worked example E (a full mini trip).** Ada paid Cabin $600.00, Ben paid Gas $80.00, Cy paid Dinner $120.00, each split equally among Ada, Ben, Cy, Dee (no remainders). Each person's share = 150 + 20 + 30 = $200.
Balances: Ada +600−200 = **+$400**, Ben +80−200 = **−$120**, Cy +120−200 = **−$80**, Dee **−$200** (sum 0). No smaller zero-sum group exists → 3 transfers. Golden display order (sorted by from-name): **Ben → Ada $120, Cy → Ada $80, Dee → Ada $200**.
If Ben then taps "Mark paid" on his transfer, that records `Settlement{from: Ben, to: Ada, 12000}` → Ben 0, Ada +$280 → the 2 transfers that remain are recomputed.

### 5.5 Marking settled
- **Per transfer:** "Mark paid" creates a `Settlement` (date = today, the local calendar date), with a 5-second Undo toast. Recorded payments are listed under "Payments" and can be edited or deleted.
- **Group:** "Mark group settled" sets `settledAt`. If balances aren't all zero, a dialog offers "Record the N suggested payments and mark settled" or cancel. Settled groups drop into a "Settled" section on Home with a muted card and can be reopened.

---

## 6. Tasks by phase (commit after each phase)

Each phase ends with: `npm run typecheck && npm test && npm run build` passing, then `git add -A && git commit` (local only, no remote). `git add -A` honors `.gitignore`, which must list `node_modules/`, `dist/`, `logs/`, `build.log`, `playwright-report/`, `test-results/`, and `coverage/` **before** the first add, so `logs/` and build output never get committed (check `git status` before committing). No dev server or watcher is left running between phases.

### Phase 1: Scaffold + core math/lib + unit tests
1. **This repo is not empty** (`PLAN.md`, `prompts/`, `reviews/`, `docs/`, `logs/`, `.gitignore`, and other files already exist). **Never run a scaffold in `.`**: `npm create vite@latest .` offers to empty a non-empty directory. Instead scaffold into a throwaway temp directory outside the repo (`npm create vite@latest "$TMPDIR/split-easy-scaffold" -- --template react-ts`), then copy only the app files in (`package.json`, `index.html`, `vite.config.ts`, `tsconfig*.json`, `src/`, `public/`), never overwriting an existing file (`cp -n`; merge Vite's `.gitignore` lines into ours by hand). Delete the temp directory afterwards. Trim the boilerplate. Turn on `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
2. Install the runtime and dev deps from §3. Add scripts: `dev` (vite, port 8840 strictPort), `build`, `preview` (8840 strictPort), `typecheck` (`tsc -p tsconfig.app.json --noEmit`, plus `tsc -p tsconfig.node.json --noEmit` for the config files; **not** `tsc -b --noEmit`, which fails with TS5094), `test` (`vitest run`, with the fast-check seed pinned in the script, e.g. `FC_SEED=20261120 vitest run`, read by a shared `fc.configureGlobal({ seed, numRuns: 200 })` in the Vitest setup file), `test:e2e` (`playwright test`).
3. `vite.config.ts`: `server`/`preview` `{ port: 8840, strictPort: true, host: 'localhost' }`. Add the PWA plugin now (configured in Phase 3).
4. `lib/types.ts`, `ids.ts`, `clock.ts`, `hash.ts`.
5. `lib/money.ts` + tests.
6. `lib/split.ts` + tests (examples A–C as fixed tests, plus property tests).
7. `lib/balances.ts`, `lib/settle.ts` + tests (examples D–E, plus the brute-force oracle).
8. `lib/validate.ts`, `lib/share/codec.ts`, `lib/share/merge.ts` + tests.
9. `lib/storage.ts`, `lib/migrations.ts` (v1 baseline + a fake v0→v1 fixture to exercise the migration path) + tests.
10. `lib/csv.ts`, `lib/demo.ts` + tests.
11. Commit: "Phase 1: scaffold, integer-cent split math, settle-up, share codec/merge, storage, with tests".

### Phase 2: UI (all screens working, plain styling + tokens)
1. `styles/tokens.css` (both palettes), `base.css` (layout, type scale, 44px tap targets, focus ring outside the control), `fonts.css` (the two hand-written `@font-face` rules from §2).
2. `state/store.ts` (load, debounced save, synchronous flush on `pagehide`, read-only guard, `storage`-event "Updated in another tab" reload per §3, Undo expiry on any local edit per §4) + `actions.ts` (create/rename/delete group; add/rename/remove person; add/edit/delete expense; record/delete settlement; mark settled). Every mutation stamps `updatedAt`.
3. **Home:** group cards (name, emoji, **group total spent**, people count, and "All square" or "N payments to settle"), [New group], [Try the demo trip], Settled section, empty state. There is no "your total": the model has no shared notion of which person is "me", and v1 doesn't add one.
4. **New group:** name + emoji (one grapheme, checked with `Intl.Segmenter`) + currency symbol + people chips (add by typing a name and pressing Enter) in one sheet. Changing the currency symbol on an existing group shows a confirm: "This only changes the symbol. Amounts stay the same numbers and are not converted."
5. **Group page:** header (name, total spent), expenses grouped by date (title, category icon + label, payer, amount), FAB "Add expense", tabs/links for Settle up · People · Share · Print. Empty state.
6. **Expense editor:** title, `AmountInput` (`inputmode="decimal"`, live formatted, capped at $10,000,000.00 like `validate`), paid-by picker (any group member, even one not in the split), date (defaults to today's local calendar date), category, note, `SplitEditor` with 3 segmented modes: Equal (checkbox per person, "about $X each"), Shares (± steppers, 0–100), Exact (amount per person + live "left to assign"). Live per-person preview from `split.ts`. Save is disabled with a reason while invalid. Delete with a confirm dialog.
7. **Settle up:** balances list (gets back / owes, words + sign + color), minimum transfers list with "Mark paid", Payments history, "Mark group settled".
8. **People:** rename and remove (guarded), add person.
9. **Share:** copy link, Web Share, size note, download file. **Import:** preview with counts **and titles** → save / merge / save as a separate copy (full re-id) → report, Undo (removes the group if it was new to this device).
10. **Settings:** theme (System/Light/Dark), default currency symbol (for new groups only; no conversion), "Erase all data on this device" (typed confirmation), app version. **About** stub.
11. Load the demo: creates "Lakehouse Weekend" (Maya, Theo, Priya, Sam; ~9 expenses using all three split modes and categories, including **one equal split that doesn't divide evenly** (e.g. $100.00 among 3) so the rotating extra cent is visible; one recorded payment; fresh ids; a "Sample data, delete anytime" banner).
12. Commit: "Phase 2: core UI: home, group, expenses, settle-up, share/import, settings, demo".

### Phase 3: PWA, accessibility, dark mode, print, CSV
1. PWA: manifest, icons generated from `public/icon.svg` with `@vite-pwa/assets-generator` (output committed), `UpdateBanner`, SW only in prod, `vercel.json` headers + rewrites. Check: `npm run build && npm run preview`, open DevTools → offline → reload works.
2. Dark mode: `[data-theme]` tokens, `prefers-color-scheme` when "system", inline pre-paint script in `index.html`, `color-scheme` + `<meta name="theme-color">` updated on change, persisted.
3. Accessibility pass: landmarks, one `h1` per page, focus moves to the `h1` on route change, skip link, every input labelled, errors tied in with `aria-describedby`, `aria-live="polite"` region for toasts / "left to assign" / merge results, native `<dialog>` + `showModal()` for confirms, keyboard-reachable segmented controls (radio-group semantics), `prefers-reduced-motion`, nothing conveyed by color alone. Contrast unit test (§7).
4. Print: `/g/:gid/print` summary (group name, date range, total; per-person table: paid / share / balance; settle-up transfers; full expense table) + `print.css` (`@media print`: hide nav/buttons/FAB, black on white, `break-inside: avoid` on rows, repeated table headers, URL-free footer with print date). A "Print" button calls `window.print()`.
5. CSV export (button on Group and Print pages): see the §7 csv spec. Downloaded as a `Blob`. If `a[download]` isn't supported (iOS standalone) and `navigator.canShare({files})` is, use Web Share instead.
6. Commit: "Phase 3: PWA offline, dark mode, accessibility, print summary, CSV export".

### Phase 4: Polish, e2e, docs, launcher
1. Visual polish: Fraunces headings, wordmark SVG, empty-state copy, subtle motion (≤ 150 ms, reduced-motion aware), the split-coin favicon. Check at 360px, 768px, and desktop widths in light and dark.
2. Playwright config + `tests/e2e/smoke.spec.ts` (§7). `npx playwright install chromium` only.
3. `README.md`: what it is, `npm install`, `npm run dev` (http://localhost:8840), `npm test`, `npm run test:e2e`, build/preview, deploy to Vercel Hobby (import the repo or `npx vercel` later, Framework preset Vite, build `npm run build`, output `dist`, **no environment variables**), privacy and data-storage notes, iOS notes.
4. `LEARN.md`: beginner-friendly numbered steps (what Vite/React/TS are; how the project was created; why money is stored as integer cents; how the split and settle-up code works, with example D; how localStorage and the share link work; what a service worker is; how the tests work; how to deploy).
5. `start-split-easy.command` (below). `chmod +x`. Copy it to `~/Desktop/start-split-easy.command`. *This is the only write outside the project folder, and it was explicitly requested.*
6. Screenshots into `docs/screenshots/` (light, dark, settle-up, print preview) for the README.
7. Final full check: typecheck, unit tests, build, e2e, manual offline test, Lighthouse once by hand (PWA installable, a11y ≥ 95).
8. Commit: "Phase 4: polish, e2e smoke, README/LEARN, desktop launcher".

### Launcher: `start-split-easy.command`
```bash
#!/bin/bash
# Split Easy launcher. Works from the project folder OR when copied to ~/Desktop.
set -euo pipefail
PROJECT_DIR="/Users/kevindumas/Projects/split-easy"
if [ ! -f "$PROJECT_DIR/package.json" ]; then           # project moved? try the script's own folder
  PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
fi
[ -f "$PROJECT_DIR/package.json" ] || { echo "Can't find the Split Easy project."; read -r -p "Press Enter to close"; exit 1; }
cd "$PROJECT_DIR"
PORT=8840; URL="http://localhost:$PORT/"
command -v npm >/dev/null || { echo "Node.js/npm not found. Install Node first."; read -r -p "Press Enter"; exit 1; }
if lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  if curl -fsS "$URL" | grep -q "<title>Split Easy"; then open "$URL"; exit 0; fi
  echo "Port $PORT is being used by another app. Split Easy won't touch it."; read -r -p "Press Enter"; exit 1
fi
[ -d node_modules ] || npm install
if [ ! -f dist/index.html ] || [ -n "$(find src public index.html vite.config.ts -newer dist/index.html -print -quit)" ]; then
  npm run build
fi
( for _ in $(seq 1 40); do curl -fsS "$URL" >/dev/null 2>&1 && { open "$URL"; break; }; sleep 0.25; done ) &
echo "Split Easy is running at $URL. Close this window (or press Ctrl+C) to stop."
exec npx vite preview --port $PORT --strictPort --host localhost
```
It serves the **production build** (lighter than dev, and the service worker works) on the single origin `http://localhost:8840`. It never kills anything.

---

## 7. Test plan

**Unit (Vitest, Node environment, no DOM needed).** Target ≥ 95% line coverage of `src/lib`. Property tests use `fast-check` with a fixed seed **pinned in the `npm test` script** (§6 Phase 1), at ~200 runs per property to keep it fast. A failing run prints the seed and path so it can be replayed.

| Area | Fixed cases | Properties |
|---|---|---|
| `money` | parse table from §5.1 (valid + rejected, including `"12,50"→1250`, `"1,234.56"→123456`, `"1,23,4"` rejected, over-cap rejected), format `0`, `1`, `5`, `100`, `123456789`, symbol variants | `parseCents(formatCents(c).slice(sym)) === c` for c in 0…10⁹ |
| `hash` | `fnv1a32("e_groceries") === 2180723260`; `fnv1a32("e_pizza") === 1531476333`; result always in `0 … 2^32−1`; signed remainder `0` for `e_groceries` is the wrong answer | output is an unsigned 32-bit integer |
| `split` equal | example A (Ben gets the extra cent); single person gets all; total 0 → all 0; 1¢ among 3 → [1,0,0] by rotation; 50 people | Σ = total; every share ≥ 0; max−min ≤ 1; deterministic; **input order doesn't change the result** |
| `split` shares | example B; zero-weight person gets 0; omitted member gets 0; all-zero weights rejected; non-integer weight rejected; weight 101 rejected; total over cap rejected | Σ = total; `|share_i − total·w_i/W| < 1`; deterministic; order-independent |
| `split` exact | example C rejected (±1¢); negative rejected; unknown id rejected; zeros allowed | valid exact input returns exactly the input amounts |
| `balances` | example E; settlements shift balances; deleted records ignored; payer outside the participant list | Σ balances = 0 for random groups (1–30 people, 0–200 expenses, mixed modes) |
| `settle` | example D → exactly Dee → Ada $50, Eli → Ben $40, Eli → Cy $30; example E → golden order Ben → Ada $120, Cy → Ada $80, Dee → Ada $200; no people (`n === 0`) → `[]`; already balanced → `[]`; single person → `[]`; two people; a case with two optimal partitions → the smallest-bitmask one is chosen; 17+ nonzero → fallback still settles | applying the transfers zeroes every balance; every amount is a positive integer; no self-transfers; count ≤ n−1; **count equals a brute-force backtracking oracle** for n ≤ 7, limited to **20 runs** so the oracle stays light; deterministic |
| `codec` | unicode names (emoji 👩‍👩‍👧, CJK, Arabic RTL, combining accents, quotes and `#&?+`); tombstones (person tombstone keeps its name); `0` decodes as absent for emoji/note/category/settledAt; `+` survives in the fragment; unknown version, truncated payload, garbage, oversize, invalid cents, over-cap amount, weight > 100, duplicate ids, duplicate split keys, `from === to`, dangling reference → typed errors, no throw escaping | `decode(encode(g)) ≡ g` for random groups; a 30-person / 300-expense group round-trips, and its length is reported in the test output to calibrate the §4 thresholds |
| `merge` | new group; local-only kept; newer edit wins each way; newer tombstone deletes; older tombstone loses; tie rule; resurrect a referenced person **with their name** and `updatedAt = M + 1`; MergeReport counts and titles; "save as a separate copy" re-ids everything and rewrites `paidBy` / split ids / `from` / `to` (no original id remains, copy validates); Undo of a newly saved group removes it; Undo expires after a local edit and after another import | idempotent, commutative, associative; never reads the clock; local-only ids always kept; Σ balances still 0 |
| `storage` | empty → defaults; v0 fixture migrates + backup written; corrupt JSON kept aside, not lost; newer schema → read-only flag and **no write on flush**; a `storage` event replaces the in-memory document (no merge, a group deleted in the other tab stays deleted) | — |
| `csv` | header + rows; quotes/commas/newlines escaped; `=`, `+`, `-`, `@`, tab, CR at the start of a text cell get a `'` prefix; UTF-8 BOM; for **`Type=Expense` rows only**, the share columns sum to the amount; `Type=Payment` rows have blank share cells | — |
| `contrast` | every text/background token pair in both themes ≥ 4.5:1, focus/UI pairs ≥ 3:1 (WCAG formula in the test) | — |
| `demo` | demo validates; Σ balances 0; uses all 3 split modes; contains at least one equal split with a remainder | — |

**CSV spec:** columns `Type, Date, Description, Category, Paid by, Paid to, Amount, Split, <one column per person: their share>, Note`. Expense rows fill the share columns. Payment rows use `Type=Payment`, fill `Paid by`/`Paid to`, and leave the shares blank (so the "shares sum to the amount" check applies only to `Type=Expense` rows). Amounts are plain `1234.56` (no symbol) so spreadsheets read them as numbers. Filename: `split-easy-<group-slug>-<YYYY-MM-DD>.csv`.

**E2E smoke (Playwright, deliberately light):** Chromium only, `workers: 1`, `retries: 0`, headless, no video, trace `on-first-retry`, screenshots only on failure. `webServer: npm run build && npx vite preview --port 8840 --strictPort` with `reuseExistingServer: false`. If 8840 is busy the run fails with a clear message ("close the Split Easy launcher first"). One spec file, < 30 s:
1. Visit `/`, see the empty state. Create group "Test Dinner" with Ada, Ben, Cy.
2. Add "Pizza" $90.00 paid by Ada, equal among all three. Add "Drinks" $30.00 paid by Ben, equal (no remainders, so the on-screen numbers are deterministic despite random ids).
3. Settle up: assert Ada **gets back $50.00**, Ben **owes $10.00**, Cy **owes $40.00**, and exactly two transfers: **Ben → Ada $10.00**, **Cy → Ada $40.00**.
4. Mark "Ben → Ada" paid → one transfer remains; reload → it persists.
5. Open the expense editor in Exact mode, enter amounts that are 1¢ short → "1¢ left to assign" is visible and Save is disabled.
6. Run `@axe-core/playwright` on Home, the Group page, and Settle up → no serious or critical violations.
7. Load the demo trip → the group renders with expenses.

**Manual checklist (once per phase 3–4):** offline reload, install prompt (Chrome) / Add to Home Screen (iOS), keyboard-only walk-through, VoiceOver spot check, print preview, dark/light, 360px width.

---

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| **Share URL too long** (chat apps truncate; old browsers limit length) | Compact positional wire format + lz-string; measured thresholds (6k note, 60k hard stop); the group-file fallback uses the same import path; tombstones carry only id + stamp. |
| **Merge conflicts / data loss** | Per-record LWW with monotonic stamps and a symmetric tie-break (converges); `mergeGroup` is pure (no clock reads; resurrection stamp = max input stamp + 1); local-only records always kept; deletes only via newer tombstones, kept for the life of the group; preview with titles before applying; one-step Undo that expires on the next local edit or import; "save as copy" escape hatch with a full re-id; property tests for idempotence, commutativity, and associativity. |
| **Two tabs open at once** | No automatic merge on `storage` events (it would resurrect deleted groups); the other tab shows "Updated in another tab" and reloads the saved document. |
| **Clock skew between devices** | `lastStamp` jumps past every imported stamp, so edits after an import always win. A device far in the future can still win older conflicts; documented, and recoverable via Undo or edit. |
| **Service worker serving a stale build** | `registerType: 'prompt'` + update banner; `no-cache` headers on `sw.js` / `index.html` / manifest; hashed assets; `cleanupOutdatedCaches`; schema-version guard puts an old build into read-only mode on newer data; no SW in dev. |
| **Cents rounding** | Integers everywhere; string-based parsing; one largest-remainder allocator; exact splits must match to the cent; Σ invariants asserted in tests and dev builds. |
| **Storage eviction / iOS separate storage** (Safari tab vs installed app have separate storage; ITP may clear unused site data) | `navigator.storage.persist()`; README note; share link / group file to move or back up data. |
| **localStorage is per-origin** (`localhost` vs `127.0.0.1` look like different apps) | Launcher, README, and Vite config all use `http://localhost:8840` only. |
| **Playwright on a busy 16 GB Mac** | Chromium only, 1 worker, 1 spec, no video; browsers installed into the project's default cache once; e2e run only at the end of Phase 4 and on request, never in a watch loop. |
| **Port clash** | `strictPort: true` on 8840 (fails loudly instead of drifting onto another port like 3000); the launcher detects an existing Split Easy and just opens it, otherwise refuses to touch the other app. None of the reserved ports are used. |
| **Untrusted import data** (malformed or malicious link) | Size caps before and after decompression; full validation before any state change; names rendered as text only (React escaping; no `dangerouslySetInnerHTML`); CSV formula-injection guard. |
| **Font or icon weight hurting speed** | Latin-subset variable fonts, precached; budget check on build output. |

---

## 9. Out of scope (v1)

Accounts or login, any backend or database, live or real-time sync, multi-currency or FX conversion, payment integrations (Venmo/PayPal/etc.), receipt photos or OCR, recurring expenses, notifications, analytics or telemetry, AI features, i18n beyond Unicode names (English UI only), itemized receipts / per-item splits, percentage split mode (shares cover it), charts.

---

## 10. Port and launcher

- **Dev and preview port: 8840** (`strictPort`, origin `http://localhost:8840`). No other port is used; Playwright reuses 8840 when the launcher isn't running.
- **Launcher:** `start-split-easy.command` in the project root, copied to **`~/Desktop/start-split-easy.command`**. It `cd`s to the absolute project path (falling back to its own folder), installs deps if missing, rebuilds if the source changed, serves on 8840, and opens the page.
- **Deploy later:** Vercel Hobby, static `dist/`, zero environment variables, zero secrets. No git remote is configured in this repo during the build.
