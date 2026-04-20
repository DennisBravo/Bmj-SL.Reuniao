import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { fetchGraphUsers } from '../graphUsersApi.js'

const MIN_CHARS = 2
const DEBOUNCE_MS = 320

/** Fragmento de e-mail em edição antes do cursor (lista separada por vírgula, `;` ou quebra de linha). */
export function getEmailTokenAtCursor(value, caret) {
  const v = String(value ?? '')
  const c = Math.min(Math.max(0, Math.floor(Number(caret) || 0)), v.length)
  const before = v.slice(0, c)
  const lastDelim = Math.max(
    before.lastIndexOf(','),
    before.lastIndexOf(';'),
    before.lastIndexOf('\n'),
    before.lastIndexOf('\r'),
  )
  const segStart = lastDelim + 1
  const segment = before.slice(segStart)
  const lead = segment.length - segment.trimStart().length
  const tokenStart = segStart + lead
  const token = before.slice(tokenStart)
  return { token, tokenStart, tokenEnd: c }
}

function useDebouncedGraphQuery(query, { enabled }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const ac = new AbortController()
    const q = String(query ?? '').trim()

    if (!enabled || q.length < MIN_CHARS) {
      setUsers([])
      setLoading(false)
      return () => ac.abort()
    }

    setLoading(true)
    const timer = window.setTimeout(async () => {
      try {
        const list = await fetchGraphUsers(q, ac.signal)
        if (!ac.signal.aborted) setUsers(list)
      } catch (e) {
        if (e.name !== 'AbortError' && !ac.signal.aborted) setUsers([])
      } finally {
        if (!ac.signal.aborted) setLoading(false)
      }
    }, DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
      ac.abort()
      setLoading(false)
    }
  }, [query, enabled])

  return { users, loading }
}

function SuggestionsDropdown({ listId, open, users, loading, highlightIndex, onPick, onHighlight }) {
  if (!open) return null
  return (
    <ul
      id={listId}
      role="listbox"
      className="m365-ac__list"
    >
      {loading && users.length === 0 ? (
        <li className="m365-ac__item m365-ac__item--muted" role="presentation">
          A pesquisar…
        </li>
      ) : null}
      {!loading && users.length === 0 ? (
        <li className="m365-ac__item m365-ac__item--muted" role="presentation">
          Nenhum resultado
        </li>
      ) : null}
      {users.map((u, i) => (
        <li
          key={u.email.toLowerCase()}
          role="option"
          aria-selected={i === highlightIndex}
          className={`m365-ac__item${i === highlightIndex ? ' m365-ac__item--active' : ''}`}
          onMouseEnter={() => onHighlight(i)}
          onMouseDown={(e) => {
            e.preventDefault()
            onPick(u)
          }}
        >
          <span className="m365-ac__name">{u.displayName}</span>
          <span className="m365-ac__email">{u.email}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Campo de um e-mail com sugestões Graph (substitui o valor pelo e-mail escolhido).
 */
export function M365EmailAutocomplete({
  id,
  value,
  onValueChange,
  className = '',
  placeholder,
  required,
  autoComplete = 'off',
  inputMode = 'email',
}) {
  const listId = useId()
  const wrapRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const q = String(value ?? '').trim()
  const { users, loading } = useDebouncedGraphQuery(q, { enabled: open })

  useEffect(() => {
    setHighlightIndex(0)
  }, [users])

  const close = useCallback(() => {
    setOpen(false)
  }, [])

  const pick = useCallback(
    (u) => {
      onValueChange(u.email)
      close()
    },
    [onValueChange, close],
  )

  useEffect(() => {
    if (!open) return
    function onDocMouseDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) close()
    }
    function onKey(e) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  function handleKeyDown(e) {
    if (!open || users.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex((i) => Math.min(i + 1, users.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      const u = users[highlightIndex]
      if (u) {
        e.preventDefault()
        pick(u)
      }
    }
  }

  return (
    <div className="m365-ac-wrap" ref={wrapRef}>
      <input
        id={id}
        type="text"
        inputMode={inputMode}
        autoComplete={autoComplete}
        spellCheck={false}
        required={required}
        placeholder={placeholder}
        className={className}
        value={value}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
        onChange={(e) => onValueChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
      />
      <SuggestionsDropdown
        listId={listId}
        open={open && q.length >= MIN_CHARS}
        users={users}
        loading={loading}
        highlightIndex={highlightIndex}
        onPick={pick}
        onHighlight={setHighlightIndex}
      />
    </div>
  )
}

/**
 * Textarea de participantes: sugere com base no fragmento antes do cursor; ao escolher, insere o e-mail (e quebra de linha).
 */
export function M365ParticipantesAutocomplete({
  id,
  value,
  onValueChange,
  className = '',
  placeholder,
}) {
  const listId = useId()
  const wrapRef = useRef(null)
  const taRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const [cursor, setCursor] = useState(0)
  const tokenInfo = getEmailTokenAtCursor(value, cursor)
  const searchQ = tokenInfo.token.trim()
  const { users, loading } = useDebouncedGraphQuery(searchQ, { enabled: open })

  useEffect(() => {
    setHighlightIndex(0)
  }, [users])

  const close = useCallback(() => setOpen(false), [])

  const pick = useCallback(
    (u) => {
      const v = String(value ?? '')
      const caret = taRef.current?.selectionStart ?? cursor
      const { tokenStart, tokenEnd } = getEmailTokenAtCursor(v, caret)
      const email = u.email
      const insertion = `${email}\n`
      const next = v.slice(0, tokenStart) + insertion + v.slice(tokenEnd)
      onValueChange(next)
      close()
      requestAnimationFrame(() => {
        const el = taRef.current
        if (!el) return
        const pos = tokenStart + insertion.length
        el.focus()
        el.setSelectionRange(pos, pos)
      })
    },
    [value, cursor, onValueChange, close],
  )

  useEffect(() => {
    if (!open) return
    function onDocMouseDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) close()
    }
    function onKey(e) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  function handleKeyDown(e) {
    if (!open || users.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex((i) => Math.min(i + 1, users.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      const u = users[highlightIndex]
      if (u) {
        e.preventDefault()
        pick(u)
      }
    } else if (e.key === 'Tab') {
      close()
    }
  }

  return (
    <div className="m365-ac-wrap m365-ac-wrap--textarea" ref={wrapRef}>
      <textarea
        id={id}
        ref={taRef}
        spellCheck={false}
        autoComplete="off"
        placeholder={placeholder}
        className={className}
        value={value}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
        onChange={(e) => {
          onValueChange(e.target.value)
          setCursor(e.target.selectionStart ?? 0)
        }}
        onSelect={(e) => {
          const t = e.target
          setCursor(t.selectionStart ?? 0)
        }}
        onClick={(e) => {
          const t = e.target
          setCursor(t.selectionStart ?? 0)
        }}
        onKeyUp={(e) => {
          const t = e.target
          setCursor(t.selectionStart ?? 0)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
      />
      <SuggestionsDropdown
        listId={listId}
        open={open && searchQ.length >= MIN_CHARS}
        users={users}
        loading={loading}
        highlightIndex={highlightIndex}
        onPick={pick}
        onHighlight={setHighlightIndex}
      />
    </div>
  )
}
