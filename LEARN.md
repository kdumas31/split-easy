# How Split Easy was built (a beginner's walk-through)

This guide explains, step by step, how Split Easy works and why it's built the way it is. You don't need to know React yet. Read it top to bottom with the code open next to it.

---

## Part 1: The tools

1. **Node.js and npm.** Node runs JavaScript outside the browser. npm installs libraries ("packages") into the project's `node_modules/` folder. Everything here is installed *locally*, so you never need `sudo`. `package.json` lists the packages and the commands (`npm run dev`, `npm test`, …).

2. **TypeScript.** JavaScript plus *types*. You write `amountCents: number` and the TypeScript compiler (`tsc`) complains before you even run the code if you pass it a string by mistake. We turned on the strictest settings (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), so for example reading `list[0]` forces you to handle "what if the list is empty?". Run `npm run typecheck`.

3. **React.** A library for building screens out of *components*: functions that return what the screen should look like (written in JSX, which looks like HTML inside JavaScript). When data changes, React re-runs the components and updates only what changed. Look at `src/pages/NotFound.tsx` for the smallest example.

4. **Vite.** The build tool. `npm run dev` starts a fast development server with hot reload. `npm run build` bundles everything into small files in `dist/`, which is what gets deployed. Settings are in `vite.config.ts` (port 8840, `strictPort` so it fails loudly instead of drifting to another port).

5. **No backend at all.** Split Easy is a *static site*: just HTML, CSS, JavaScript, and fonts. That's why it can be hosted for free and works offline.

## Part 2: How the project was created

6. **Scaffolding.** Vite has a starter template (`npm create vite@latest … --template react-ts`). This folder already held the plan and notes, so the template was generated in a temporary folder and only the app files were copied in. That avoided any risk of wiping existing files.

7. **Dependencies.** Runtime: `react`, `react-dom`, `wouter` (tiny router: which page to show for which URL), `lz-string` (compresses share links), and two font packages. Dev-only: `vitest` and `fast-check` (tests), `vite-plugin-pwa` (offline support), Playwright and axe (browser test plus accessibility checks). No big UI component library: buttons, dialogs, and radio groups are plain HTML elements, which keeps the app small (about 90 KB of JavaScript on first load).

8. **Four phases, one commit each.** (1) The math and data logic with tests. (2) All the screens. (3) Offline, dark mode, accessibility, print, and CSV. (4) Polish, the browser test, docs, and the launcher. After each phase: `npm run typecheck && npm test && npm run build`, then `git commit`.

## Part 3: Money is stored as whole cents

9. **Why not dollars?** Computers store decimals in binary, so `0.1 + 0.2` is `0.30000000000000004`. Add that up over a trip and someone ends up a cent off. Split Easy stores every amount as an **integer number of cents** (`$12.50` → `1250`), and every function checks `Number.isSafeInteger` (`src/lib/types.ts`, `assertCents`).

10. **Reading what people type** (`src/lib/money.ts`, `parseCents`). It never uses `parseFloat`. It splits the text into the dollars part and the cents part and builds `dollars * 100 + cents`. Commas are read *by shape*: `1,234.56` has a thousands comma, while `12,50` uses a European decimal comma, so it means `$12.50`. Anything over $10,000,000.00 is refused, and the input box and the data validator use the same limit.

11. **Showing money** (`formatCents`) uses integer division and remainder: `123456` → `$1,234.56`.

## Part 4: Splitting an expense

12. **One fair-rounding routine** (`src/lib/split.ts`, `allocate`). $100.00 split three ways is 3333.33… cents each, but cents can't be split. Everyone gets the rounded-down amount (3333), and the leftover cents (here, 1) go to the people with the biggest remainders. That's the "largest remainder" method.

13. **Who gets the odd cent?** If it always went to the same person, they'd pay a little extra on every expense. So the order rotates using a hash of the expense's id (`src/lib/hash.ts`, FNV-1a). It's random-looking but **deterministic**: every phone computes exactly the same numbers. (One gotcha: the hash must be read as an *unsigned* number with `>>> 0`, or the rotation picks the wrong person. There's a regression test for that.)

14. **Three modes.** *Equal* = everyone weight 1. *Shares* = whole-number weights (use 3 and 2 instead of 1.5 and 1). *Exact* = you type each amount, and it must add up to the total exactly. Otherwise you see "1¢ left to assign" or "40¢ over the total", and Save stays disabled.

## Part 5: Settling up with the fewest payments

15. **Balances** (`src/lib/balances.ts`). For each person: what they paid, minus their share, plus payments they made, minus payments they received. Positive means they get money back; negative means they owe. The balances always add up to exactly 0, and the code checks that.

16. **The naive way loses.** "Biggest debtor pays biggest creditor" sounds right, but look at this example (D in the plan):

    | Ada | Ben | Cy | Dee | Eli |
    |---|---|---|---|---|
    | +$50 | +$40 | +$30 | −$50 | −$70 |

    The greedy approach makes **4** payments. But notice that Ada and Dee cancel each other out (+50 −50), and so do Ben, Cy, and Eli (+40 +30 −70). A group of *m* people that sums to zero needs *m − 1* payments, so the answer is (2−1) + (3−1) = **3**: Dee → Ada $50, Eli → Ben $40, Eli → Cy $30.

17. **The trick** (`src/lib/settle.ts`): *minimum payments = number of people − the most zero-sum groups you can split them into.* For up to 16 people the code tries every subset with a technique called dynamic programming over bitmasks (each person is one bit of a number). That's about a million quick steps, well under 50 ms. Ties are broken by fixed rules, so everyone sees the same suggestion. For more than 16 people it falls back to a simple method that is still correct, just not always minimal.

## Part 6: Saving data and sharing links

18. **localStorage** is a small key-value store built into every browser. The whole document (all groups plus settings) is saved under `split-easy:data` about 150 ms after each change, and saved immediately when you leave the page (`src/state/store.ts`). It has a `schemaVersion`, so future versions can upgrade old data step by step (`src/lib/migrations.ts`), keeping a backup copy first.

19. **Never trust stored or shared data blindly.** `src/lib/validate.ts` checks everything on load and on import: amounts must be whole cents within the cap, ids must be unique, every reference must point to a real person, and so on. If saved data is damaged, it's moved aside, not deleted.

20. **Share links** (`src/lib/share/codec.ts`). The group is converted into a compact JSON form with short keys, compressed with lz-string, and put after the `#` in the URL. Browsers never send the `#` part to the server. A four-person, 40-expense trip makes a link of about 2,000 characters.

21. **Merging two copies** (`src/lib/share/merge.ts`). Every record has an `updatedAt` stamp. When the same expense exists on both sides, the newer one wins. Deleted records leave a small "tombstone" behind, so an old link can't bring them back. Records only you have are always kept. The merge is a *pure function*: it never reads the clock, so both phones get the identical result no matter who imports whom. Tests prove it is idempotent, commutative, and associative using random inputs. You always see a preview first, and you can Undo.

## Part 7: Offline, dark mode, accessibility

22. **Service worker.** A small script the browser keeps installed. `vite-plugin-pwa` generates one that saves every app file (code, CSS, fonts, icons) on the first visit, so later visits work with no connection. When a new version is deployed, a banner offers "Refresh" instead of reloading on its own, so nobody loses a half-typed expense. It only runs in production builds.

23. **Dark mode.** All colours are CSS variables in `src/styles/tokens.css`, with a light set and a dark set. A tiny script in `index.html` picks the theme *before* the page draws, so there's no white flash. A unit test checks every text/background colour pair against the WCAG contrast formula.

24. **Accessibility.** Real buttons, labels on every input, error messages linked with `aria-describedby`, toasts announced through an `aria-live` region, native `<dialog>` for confirmations, a "Skip to content" link, keyboard focus moved to the page heading after navigation, and amounts that always use words ("owes", "gets back"), not just colour.

## Part 8: Tests

25. **Unit tests** (`src/**/*.test.ts`, run with `npm test`). Ordinary tests check worked examples, such as "$100 among Ada, Ben, Cy gives Ben the extra cent". **Property tests** with fast-check generate hundreds of random inputs and check rules that must *always* hold: splits add up to the total, settle-up zeroes every balance, decode(encode(group)) gives the same group back, and so on. The random seed is pinned in `package.json`, so a failure can be replayed exactly.

26. **Browser smoke test** (`tests/e2e/smoke.spec.ts`, `npm run test:e2e`). Playwright drives a real headless Chromium: it creates "Test Dinner", adds two expenses, checks "Ada gets back $50.00", marks a payment, reloads, checks the exact-mode "1¢ left to assign" guard, runs the axe accessibility scanner, and opens the demo.

## Part 9: Running and deploying

27. **Locally:** `npm run dev`, or double-click `start-split-easy.command`, which builds and serves the production version on port 8840 and won't touch another app on that port.

28. **Deploying:** import the repo into Vercel (free Hobby plan), choose the Vite preset, and deploy. No environment variables. `vercel.json` sends every page URL to `index.html` (so `/g/abc` works on refresh) and sets the caching rules. See the README for the click-by-click steps.

### Where to go next

- Change a colour in `tokens.css`, then run `npm test` to see whether the contrast test still passes.
- Add a console log in `settle.ts`, run `npm test -- settle`, and watch example D.
- Read `PLAN.md`, the design document the code follows.
