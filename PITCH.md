# Split Easy — pitch

**Fair shares, no fuss.** Trips, rent, dinners: we keep the math honest so you can keep the friends.

Every claim below is checked against the code in this repo (v1.0.0). The in-app About page (`/about`, `src/pages/About.tsx`) says the same things.

## Who it's for

Friends on a trip, housemates splitting bills, or a table sharing dinner. It's for anyone who wants to know who owes whom without making everyone sign up for something first.

## The problem

One person books the cabin, another buys groceries, a third pays for gas. By the end, nobody is sure who owes what. The spreadsheet is off by a few cents, and the usual apps want everyone to make an account before they'll do the math.

## What it does

- You add a group and its people, then record who paid for each expense. Each expense can be split **Equally**, **By shares**, or by **Exact amounts**. Exact mode won't save until the amounts add up (for example, "1¢ left to assign").
- **Settle up** shows each person's balance ("Ada gets back $50.00", "Ben owes $10.00") and the **Suggested payments**, which are the fewest payments that get everyone to zero when 16 or fewer people still have a balance (for a larger group, everyone still gets to zero, though the list can be longer than the absolute minimum). **Mark paid** records a payment and comes with Undo. When everyone's done, **Mark group settled**.
- **Share** packs the whole group into a link (inside the `#` part, which browsers never send to a server). When someone opens the link for the first time, they see a preview and can **Save to this device**. If this browser already has that group, they can **Merge** or **Save as a separate copy**. Very large groups use **Download group file** instead.
- Also: **Export CSV**, a printable summary (**Print** tab), categories and notes, Light/Dark/System theme, a sample **demo trip**, and offline use as an installable web app.

What it does **not** do: there are no accounts, no server, no cloud sync, no currency conversion (the currency symbol is display only), and no payment processing. Data lives in this browser's `localStorage`. To move a group to another device or person, you use a share link or a group file.

## 3 key benefits

1. **Exact to the cent.** Money is stored as whole cents, so every split adds up exactly. Leftover cents rotate fairly between people instead of always landing on the same one.
2. **Fewest payments.** For everyday groups (16 or fewer people who are not already square), settle up finds the smallest set of payments that squares the group, and it keeps track of which ones are paid. Larger groups still settle to zero, though the list may not be the absolute minimum.
3. **Private by design.** You don't need an account, nothing goes to a server, and there's no tracking. It works offline after the first visit.

## 30-second demo script

Start from an empty browser at `http://localhost:8840`.

1. **(0s)** Home shows "No groups yet." Click **Start a group**.
2. **(3s)** In **Group name**, type `Dinner`. In **People**, type `Ada` and press Enter, then `Ben` and Enter, then `Cy` and Enter. Click **Create group**.
3. **(10s)** Click **Add expense**. **What was it?** `Pizza`. **Amount** `90`. **Paid by** Ada. The split is already **Equally** with everyone ticked. Click **Save expense**.
4. **(17s)** Click **＋ Add expense**. `Drinks`, `30`, **Paid by** Ben. Click **Save expense**.
5. **(23s)** Click **Settle up**. Balances read: Ada gets back $50.00, Ben owes $10.00, Cy owes $40.00. **Suggested payments** shows 2: Ben → Ada $10.00, Cy → Ada $40.00.
6. **(27s)** Click **Mark paid** next to Ben → Ada. Only one payment is left. Open the **Share** tab and click **Copy link**. That link is the whole group, and no server is involved.

Backup if time is short: on Home, click **Try the demo trip** to open "Lakehouse Weekend", which is already filled in. Then click **Settle up**.

## Launch-post blurb

> Split Easy: a free expense splitter for trips, rent, and dinners. No account, no server, works offline. It keeps money to the exact cent and suggests payments to settle up. Share a group as a link; your data stays on your device.

(229 characters.)
