import { useState } from 'react'
import { getCurrentUserEmail, PERMISSAO_NEGADA_MSG } from '../envConfig.js'

const MOTIVOS = [
  { value: 'reuniao_cancelada', label: 'Reunião cancelada' },
  { value: 'cliente_desistiu', label: 'Cliente desistiu' },
  { value: 'conflito_agenda', label: 'Conflito de agenda' },
  { value: 'outro', label: 'Outro' },
]

export default function CancelarReservaModal({ reservation, onClose, onConfirm }) {
  const [motivo, setMotivo] = useState('reuniao_cancelada')
  const [detalhe, setDetalhe] = useState('')
  const [quem, setQuem] = useState('Recepção')
  const [emailCancelador, setEmailCancelador] = useState(() => getCurrentUserEmail() || '')

  if (!reservation) return null

  function handleSubmit(e) {
    e.preventDefault()
    const label = MOTIVOS.find((m) => m.value === motivo)?.label || motivo
    const reasonDetail = motivo === 'outro' ? detalhe.trim() : detalhe.trim()
    const ok = onConfirm({
      reason: label,
      reasonDetail,
      cancelledBy: quem.trim() || 'Recepção',
      cancelledByEmail: emailCancelador.trim(),
    })
    if (ok === false) {
      window.alert(PERMISSAO_NEGADA_MSG)
      return
    }
    onClose()
  }

  return (
    <div className="app__modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="app__modal app__modal--cancel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-reserva-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="cancel-reserva-title" className="app__modal-title">
          Cancelar reserva
        </h2>
        <p className="app__modal-hint">
          <strong>{reservation.titulo}</strong>
          <br />
          {reservation.sala} · {reservation.horaInicio} – {reservation.horaFim}
          {reservation.dateFim && reservation.dateFim !== reservation.date ? (
            <>
              <br />
              Período: {reservation.date} → {reservation.dateFim}
            </>
          ) : (
            <>
              <br />
              Data: {reservation.date}
            </>
          )}
        </p>
        <form className="form" onSubmit={handleSubmit}>
          <div className="form__row">
            <label htmlFor="cancel-motivo">Motivo do cancelamento</label>
            <select
              id="cancel-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            >
              {MOTIVOS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form__row">
            <label htmlFor="cancel-detalhe">Observações (opcional)</label>
            <textarea
              id="cancel-detalhe"
              rows={2}
              placeholder={motivo === 'outro' ? 'Descreva o motivo…' : 'Detalhes adicionais…'}
              value={detalhe}
              onChange={(e) => setDetalhe(e.target.value)}
            />
          </div>
          <div className="form__row">
            <label htmlFor="cancel-quem">Quem cancelou</label>
            <input
              id="cancel-quem"
              type="text"
              autoComplete="name"
              value={quem}
              onChange={(e) => setQuem(e.target.value)}
            />
          </div>
          <div className="form__row">
            <label htmlFor="cancel-email">E-mail de quem cancela (auditoria)</label>
            <input
              id="cancel-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="mesmo e-mail configurado em VITE_USER_EMAIL, se aplicável"
              value={emailCancelador}
              onChange={(e) => setEmailCancelador(e.target.value)}
            />
          </div>
          <div className="app__modal-actions app__modal-actions--form">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Voltar
            </button>
            <button type="submit" className="btn btn--danger">
              Confirmar cancelamento
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
