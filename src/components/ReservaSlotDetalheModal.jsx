import { useEffect } from 'react'

export default function ReservaSlotDetalheModal({ reservation, onClose }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!reservation) return null

  const r = reservation
  const periodo =
    r.dateFim && r.dateFim !== r.date ? `${r.date} → ${r.dateFim}` : r.date || '—'

  return (
    <div className="app__modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="app__modal app__modal--slot-detail"
        role="dialog"
        aria-modal="true"
        aria-labelledby="slot-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="slot-detail-title" className="app__modal-title">
          Detalhe da reserva
        </h2>
        <p className="app__modal-hint">
          {r.horaInicio} – {r.horaFim} · {r.sala}
        </p>

        <div className="app__modal-field app__modal-field--readonly">
          <span className="app__modal-static-label">Título</span>
          <p className="app__modal-static-value">{r.titulo || '—'}</p>
        </div>
        <div className="app__modal-field app__modal-field--readonly">
          <span className="app__modal-static-label">Datas</span>
          <p className="app__modal-static-value">{periodo}</p>
        </div>
        <div className="app__modal-field app__modal-field--readonly">
          <span className="app__modal-static-label">Solicitante</span>
          <p className="app__modal-static-value">{r.solicitante || '—'}</p>
        </div>
        <div className="app__modal-field app__modal-field--readonly">
          <span className="app__modal-static-label">E-mail</span>
          <p className="app__modal-static-value">{r.emailSolicitante || r.createdByEmail || '—'}</p>
        </div>
        <div className="app__modal-field app__modal-field--readonly">
          <span className="app__modal-static-label">Participantes</span>
          <p className="app__modal-static-value app__modal-static-value--multiline">
            {r.participantes?.trim() ? r.participantes : '—'}
          </p>
        </div>
        <div className="app__modal-field app__modal-field--readonly">
          <span className="app__modal-static-label">Observações</span>
          <p className="app__modal-static-value app__modal-static-value--multiline">
            {r.observacoes?.trim() ? r.observacoes : '—'}
          </p>
        </div>

        <div className="app__modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
