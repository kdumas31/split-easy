import { useId, useMemo, useRef, useState } from 'react'
import { toast } from '../components/toastBus'
import { slugify } from '../lib/csv'
import { groupFileContents, linkSize, shareUrl } from '../lib/share/codec'
import { useGroup } from '../state/app'
import { GroupChrome, downloadBlob, useMissingRedirect, useTitle } from './common'

export function SharePage({ params }: { params: { gid: string } }) {
  const group = useGroup(params.gid)
  const id = useId()
  const ta = useRef<HTMLTextAreaElement>(null)
  const [copied, setCopied] = useState(false)
  useTitle(group ? `Share · ${group.name}` : '')
  useMissingRedirect(!group, 'That group isn’t on this device anymore.')
  const url = useMemo(() => (group ? shareUrl(window.location.origin, group) : ''), [group])
  if (!group) return null

  const size = linkSize(url)
  const canShare = typeof navigator.share === 'function'

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast({ message: 'Link copied. Paste it in a message.' })
    } catch {
      ta.current?.focus()
      ta.current?.select()
      toast({ message: 'Couldn’t copy automatically. The link is selected: copy it from there.' })
    }
  }

  const share = async () => {
    try {
      await navigator.share({ title: `Split Easy: ${group.name}`, text: `Here’s our “${group.name}” group on Split Easy.`, url })
    } catch {
      /* user cancelled */
    }
  }

  const downloadFile = () => {
    const blob = new Blob([groupFileContents(group)], { type: 'application/json' })
    void downloadBlob(blob, `${slugify(group.name)}.splitEasy.json`)
      .then((how) => toast({ message: how === 'shared' ? 'Group file ready to share.' : 'Group file downloaded.' }))
      .catch(() => undefined)
  }

  return (
    <GroupChrome group={group} title="Share">
      <div className="card stack">
        <p>
          Send this link to the group. When someone opens it, Split Easy shows what’s new and lets them save or merge it. Nothing is uploaded: the whole group is
          packed into the link itself.
        </p>
        <p className="remainder">Anyone with this link can see this group’s names and amounts.</p>

        {size !== 'too-long' ? (
          <>
            <div className="field">
              <label htmlFor={`${id}-url`}>Share link</label>
              <textarea id={`${id}-url`} ref={ta} className="share-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-describedby={`${id}-size`} />
              <span id={`${id}-size`} className="hint">
                {size === 'long' ? 'This is a long link. Some chat apps cut long links. If it doesn’t open, send the group file instead.' : `${url.length.toLocaleString()} characters.`}
              </span>
            </div>
            <div className="row wrap">
              <button type="button" className="btn btn-primary" onClick={() => void copy()}>
                {copied ? 'Copied' : 'Copy link'}
              </button>
              {canShare && (
                <button type="button" className="btn" onClick={() => void share()}>
                  Share…
                </button>
              )}
              <button type="button" className="btn btn-ghost" onClick={downloadFile}>
                Download group file
              </button>
            </div>
          </>
        ) : (
          <>
            <p>This group is too big for a link. Send the group file instead: the other person opens it from Split Easy’s Import page.</p>
            <button type="button" className="btn btn-primary" onClick={downloadFile}>
              Download group file
            </button>
          </>
        )}
      </div>
    </GroupChrome>
  )
}
