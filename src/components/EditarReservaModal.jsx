import { useMemo, useState } from 'react'
import {
  SALAS,
  SLOT_MINUTES,
  DAY_START_MIN,
  DAY_END_MIN,
  timeToMinutes,
  isValidEmail,
  findReservationConflictRange,
} from '../reservasUtils'

function buildForm(r) {
  const end = r.dateFim && r.dateFim !== r.date ? r.dateFim : ''
  return {
    titulo: r.titulo || '',
    sala: r.sala || SALAS[0],
    dataInicio: r.date || '',
    dataFim: end,
    horaInicio: r.horaInicio || '09:00',
    horaFim: r.horaFim || '10:00',
    solicitante: r.solicitante || '',
    emailSolicitante: r.emailSolicitante || r.createdByEmail || '',
    participantes: r.participantes || '',
    observacoes: r.observacoes || '',
  }
}

export default function EditarReservaModal({ reservation, reservations, loading, onClose, onSave }) {
  const [form, setForm] = useState(() => buildForm(reservation))
  const [formError, setFormError] = useState('')

  const salas = useMemo(() => {
    const s = reservation?.sala
    if (s && !SALAS.includes(s)) return [s, ...SALAS]
    return SALAS
  }, [reservation?.sala])

  if (!reservation?.graphItemId) return null

  function updateField(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
    setFormError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')

    const titulo = form.titulo.trim()
    const solicitante = form.solicitante.trim()
    const emailSolicitante = form.emailSolicitante.trim()
    if (!titulo) {
      setFormError('Informe o título da reunião.')
      return
    }
    if (!solicitante) {
      setFormError('Informe o solicitante.')
      return
    }
    if (!emailSolicitante) {
      setFormError('Informe o e-mail do solicitante.')
      return
    }
    if (!isValidEmail(emailSolicitante)) {
      setFormError('Digite um e-mail válido (ex.: nome@empresa.com.br).')
      return
    }

    const dataInicio = form.dataInicio.trim()
    if (!dataInicio) {
      setFormError('Informe a data de início.')
      return
    }

    const startMin = timeToMinutes(form.horaInicio)
    const endMin = timeToMinutes(form.horaFim)
    if (Number.isNaN(startMin) || Number.isNaN(endMin)) {
      setFormError('Horários inválidos. Use o formato HH:MM.')
      return
    }
    if (startMin < DAY_START_MIN || endMin > DAY_END_MIN) {
      setFormError('Horários fora do intervalo permitido para reservas.')
      return
    }

    const dataFim = (form.dataFim || '').trim() || dataInicio
    if (dataFim < dataInicio) {
      setFormError('A data fim não pode ser anterior à data de início.')
      return
    }

    const conflict = findReservationConflictRange(
      form.sala,
      dataInicio,
      dataFim,
      startMin,
      endMin,
      reservations,
      reservation.id,
    )
    if (conflict) {
      setFormError(conflict)
      return
    }

    const hiMin = timeToMinutes(form.horaInicio)
    const hfMin = timeToMinutes(form.horaFim)
    const payload = {
      graphItemId: reservation.graphItemId,
      id: reservation.id,
      titulo,
      sala: form.sala,
      date: dataInicio,
      dateFim: dataFim,
      horaInicio: form.horaInicio,
      horaFim: form.horaFim,
      horaInicioMin: Number.isFinite(hiMin) ? hiMin : undefined,
      horaFimMin: Number.isFinite(hfMin) ? hfMin : undefined,
      solicitante,
      emailSolicitante,
      participantes: form.participantes.trim(),
      observacoes: form.observacoes.trim(),
      status: reservation.status || 'ativo',
    }
    if (reservation.salaId) payload.salaId = reservation.salaId

    try {
      await onSave(payload)
      onClose()
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Não foi possível guardar as alterações. Tente novamente.'
      setFormError(msg)
    }
  }

  return (
    <div
      className="app__modal-backdrop"
      role="presentation"
      onClick={() => {
        if (!loading) onClose()
      }}
    >
      <div
        className="app__modal app__modal--edit"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-reserva-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="edit-reserva-title" className="app__modal-title">
          Editar reunião
        </h2>
        <p className="app__modal-hint">
          Altere qualquer campo, incluindo observações. As mudanças são guardadas no SharePoint.
        </p>
        <form className="form" onSubmit={handleSubmit} noValidate>
          {formError ? <p className="form__error">{formError}</p> : null}

          <div className="form__row">
            <label htmlFor="edit-titulo">Título da reunião</label>
            <input
              id="edit-titulo"
              type="text"
              autoComplete="off"
              value={form.titulo}
              onChange={(e) => updateField('titulo', e.target.value)}
            />
          </div>

          <div className="form__row">
            <label htmlFor="edit-sala">Sala</label>
            <select
              id="edit-sala"
              value={form.sala}
              onChange={(e) => updateField('sala', e.target.value)}
            >
              {salas.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="form__row form__row--2">
            <div className="form__row">
              <label htmlFor="edit-data-ini">Data início</label>
              <input
                id="edit-data-ini"
                type="date"
                value={form.dataInicio}
                onChange={(e) => updateField('dataInicio', e.target.value)}
              />
            </div>
            <div className="form__row">
              <label htmlFor="edit-data-fim">Último dia (vários dias)</label>
              <input
                id="edit-data-fim"
                type="date"
                min={form.dataInicio}
                value={form.dataFim}
                onChange={(e) => updateField('dataFim', e.target.value)}
              />
            </div>
          </div>

          <div className="form__row form__row--2">
            <div className="form__row">
              <label htmlFor="edit-ini">Hora início</label>
              <input
                id="edit-ini"
                type="time"
                step={SLOT_MINUTES * 60}
                value={form.horaInicio}
                onChange={(e) => updateField('horaInicio', e.target.value)}
              />
            </div>
            <div className="form__row">
              <label htmlFor="edit-fim">Hora fim</label>
              <input
                id="edit-fim"
                type="time"
                step={SLOT_MINUTES * 60}
                value={form.horaFim}
                onChange={(e) => updateField('horaFim', e.target.value)}
              />
            </div>
          </div>

          <div className="form__row">
            <label htmlFor="edit-solicitante">Solicitante</label>
            <input
              id="edit-solicitante"
              type="text"
              autoComplete="name"
              value={form.solicitante}
              onChange={(e) => updateField('solicitante', e.target.value)}
            />
          </div>

          <div className="form__row">
            <label htmlFor="edit-email">E-mail do solicitante</label>
            <input
              id="edit-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={form.emailSolicitante}
              onChange={(e) => updateField('emailSolicitante', e.target.value)}
            />
          </div>

          <div className="form__row">
            <label htmlFor="edit-participantes">Participantes</label>
            <textarea
              id="edit-participantes"
              rows={3}
              placeholder="Nomes ou e-mails, um por linha"
              value={form.participantes}
              onChange={(e) => updateField('participantes', e.target.value)}
            />
          </div>

          <div className="form__row">
            <label htmlFor="edit-observacoes">Observações e necessidades da reunião</label>
            <textarea
              id="edit-observacoes"
              className="form__textarea form__textarea--observacoes"
              rows={5}
              value={form.observacoes}
              onChange={(e) => updateField('observacoes', e.target.value)}
            />
          </div>

          <div className="app__modal-actions app__modal-actions--form">
            <button type="button" className="btn-ghost" disabled={loading} onClick={() => !loading && onClose()}>
              Cancelar
            </button>
            <button type="submit" className="btn" disabled={loading}>
              {loading ? 'A guardar…' : 'Guardar alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
