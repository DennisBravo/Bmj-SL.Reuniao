import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { emailsFromAuthMePayload } from '../envConfig.js'
import '../App.css'

const CHECK_ADMIN_API_URL =
  import.meta.env.VITE_CHECK_ADMIN_ACCESS_URL || '/api/check-admin-access'

/**
 * Protege o Admin Center: identidade via `/.auth/me` (SWA) e permissão via `/api/check-admin-access`.
 * Falha de rede ou API → acesso negado (fail-closed).
 */
export default function AdminGuard({ children }) {
  const [phase, setPhase] = useState('loading')
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    const ac = new AbortController()
    const { signal } = ac

    async function run() {
      try {
        const resMe = await fetch('/.auth/me', { credentials: 'include', signal })
        if (!mountedRef.current || signal.aborted) return
        if (!resMe.ok) {
          setPhase('no-auth')
          return
        }
        const meData = await resMe.json().catch(() => ({}))
        if (!mountedRef.current || signal.aborted) return

        const emails = emailsFromAuthMePayload(meData)
        const email = emails[0] || ''
        if (!email) {
          setPhase('no-auth')
          return
        }

        const base = String(CHECK_ADMIN_API_URL || '').replace(/\/+$/, '')
        const checkUrl = `${base}?${new URLSearchParams({ email })}`
        const resCheck = await fetch(checkUrl, { credentials: 'include', signal })
        if (!mountedRef.current || signal.aborted) return

        if (!resCheck.ok) {
          setPhase('denied')
          return
        }

        const body = await resCheck.json().catch(() => null)
        if (!mountedRef.current || signal.aborted) return

        if (!body || body.isAdmin !== true) {
          setPhase('denied')
          return
        }

        setPhase('ok')
      } catch (e) {
        if (e?.name === 'AbortError' || signal.aborted) return
        if (mountedRef.current) setPhase('denied')
      }
    }

    run()

    return () => {
      mountedRef.current = false
      ac.abort()
    }
  }, [])

  if (phase === 'ok') {
    return children
  }

  return (
    <div className="recepcao-page">
      <header className="recepcao-page__header">
        <h2 className="recepcao-page__heading">Admin Center</h2>
      </header>
      <div className="recepcao-page__panel">
        {phase === 'loading' ? (
          <p className="recepcao-page__empty" role="status">
            Verificando acesso...
          </p>
        ) : null}
        {phase === 'no-auth' ? (
          <div className="recepcao-page__body">
            <p className="recepcao-page__empty">Faça login para acessar o Admin Center</p>
            <p>
              <a className="recepcao-layout__back" href="/.auth/login/aad">
                Entrar com Microsoft
              </a>
            </p>
            <p>
              <Link to="/" className="recepcao-layout__back">
                ← Voltar às reservas
              </Link>
            </p>
          </div>
        ) : null}
        {phase === 'denied' ? (
          <div className="recepcao-page__body">
            <p className="recepcao-page__empty">
              Acesso restrito - Solicite acesso ao administrador
            </p>
            <p>
              <Link to="/" className="recepcao-layout__back">
                ← Voltar às reservas
              </Link>
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
