import { Link } from 'wouter'
import { Wordmark } from '../components/Wordmark'
import { useTitle } from './common'

// Keep this page in step with PITCH.md. Every claim here must match what the code actually does.
export function About() {
  useTitle('About')
  return (
    <>
      <h1>About Split Easy</h1>
      <div className="card stack">
        <p>
          <Wordmark size={1.3} />
        </p>
        <p>
          <strong>Fair shares, no fuss.</strong> Trips, rent, dinners: we keep the math honest so you can keep the friends.
        </p>
      </div>

      <section className="card stack" aria-labelledby="about-who">
        <h2 id="about-who">Who it’s for</h2>
        <p>
          Friends on a trip, housemates splitting bills, or a table sharing dinner. Anyone who wants to know who owes whom without everyone signing up for
          something first.
        </p>
        <h2>The problem</h2>
        <p>
          One person books the cabin, another buys groceries, a third pays for gas. By the end, nobody is sure who owes what, the spreadsheet is off by a few
          cents, and the usual apps want everyone to make an account before they’ll do the math.
        </p>
        <h2>What it does</h2>
        <p>
          Add the people and who paid for what. Split each expense equally, by shares, or by exact amounts. Split Easy shows everyone’s balance and suggests the
          fewest payments that get everyone to zero when 16 or fewer people still have a balance (larger groups still settle, though the list can be longer than the minimum). Mark payments as they happen, then share the group as a link, export a CSV, or print a summary.
        </p>
      </section>

      <section className="card stack" aria-labelledby="about-why">
        <h2 id="about-why">Why Split Easy</h2>
        <ul>
          <li>
            <strong>Exact to the cent.</strong> Amounts are kept as whole cents, so every split adds up exactly. Leftover cents rotate fairly instead of always
            landing on the same person.
          </li>
          <li>
            <strong>Fewest payments.</strong> For everyday groups (16 or fewer people who are not already square), settle up suggests the smallest set of payments that squares the group, and remembers which ones are paid. Larger groups still settle to zero, though the list may not be the absolute minimum.
          </li>
          <li>
            <strong>Private by design.</strong> No account, no server, no tracking. Your groups are saved only in this browser, and it keeps working offline.
          </li>
        </ul>
      </section>

      <section className="card stack" aria-labelledby="about-try">
        <h2 id="about-try">Try it in 30 seconds</h2>
        <ol>
          <li>
            On the home screen, choose <strong>Start a group</strong>.
          </li>
          <li>
            Name it “Dinner”. Under <strong>People</strong>, type Ada, Ben, and Cy, pressing Enter after each. Choose <strong>Create group</strong>.
          </li>
          <li>
            Choose <strong>Add expense</strong>. Enter “Pizza”, amount 90, paid by Ada. The split is already <strong>Equally</strong> across everyone. Choose{' '}
            <strong>Save expense</strong>.
          </li>
          <li>
            Choose <strong>Add expense</strong> again: “Drinks”, 30, paid by Ben. <strong>Save expense</strong>.
          </li>
          <li>
            Choose <strong>Settle up</strong>. Ada gets back $50.00; the suggested payments are Ben pays Ada $10.00 and Cy pays Ada $40.00.
          </li>
          <li>
            Choose <strong>Mark paid</strong> on one payment, then open the <strong>Share</strong> tab and <strong>Copy link</strong>.
          </li>
        </ol>
        <p className="muted">
          Rather just look around? <Link href="/">Home</Link> has <strong>Try the demo trip</strong>, a made-up lakehouse weekend you can delete anytime.
        </p>
      </section>

      <section className="card stack" aria-labelledby="about-privacy">
        <h2 id="about-privacy">Privacy</h2>
        <p>
          Your groups are saved only in this browser. A share link carries the group inside the link itself (after the #), which browsers never send to a
          server. Anyone with the link can see that group’s names and amounts. Opening a link shows a preview first: Save to this device if the group is new here, or Merge / Save as a separate copy if this browser already has it.
        </p>
        <h2>Works offline</h2>
        <p>After the first visit, Split Easy keeps working without a connection. You can add it to your home screen like an app.</p>
        <h2>Credits</h2>
        <p>
          Typefaces: Fraunces (Undercase Type, Phaedra Charles, Flavia Zimbardi) and Figtree (Erik Kennedy), both under the SIL Open Font License.
        </p>
        <p className="muted">Version {__APP_VERSION__}</p>
      </section>
    </>
  )
}
