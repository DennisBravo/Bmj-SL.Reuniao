import { useMemo, useState } from 'react'
import {
  todayISO,
  timeToMinutes,
  minutesToTime,
  isValidEmail,
  validateParticipantesEmailsOnly,
  participantesResumoLabel,
  splitParticipantesEmails,
  findReservationConflictRange,
  findReservationForSlot,
  CARRO_CONFLICT_SALA_KEY,
  CARRO_VEICULO_LABEL,
  CARRO_VEICULO_GRADE_LABEL,
  CARRO_MOTORISTA_LABEL,
  CAR_DAY_START_MIN,
  CAR_DAY_END_MIN,
  SLOT_MINUTES,
  buildCarGridTimeSlots,
  filterCarReservationsByUnidade,
  filterCarReservationsForUnitOnDate,
  carReservationSlotSummary,
} from '../reservasUtils'
import { M365EmailAutocomplete, M365ParticipantesAutocomplete } from './M365UserAutocompleteFields.jsx'
import ReservaFormTextModal from './ReservaFormTextModal.jsx'
import { getCurrentUserEmail, normalizeEmail } from '../envConfig.js'

const defaultForm = () => ({
  date: todayISO(),
  horaInicio: '09:00',
  horaFim: '10:00',
  destino: '',
  motivo: '',
  solicitante: '',
  emailSolicitante: '',
  participantes: '',
  observacoes: '',
})

const CAR_GRID_SLOTS = buildCarGridTimeSlots()

export default function ReservaCarroView({ carReservations, addCarReservation, carLoading, carError, clearCarError }) {
  const [form, setForm] = useState(defaultForm)
  const [formError, setFormError] = useState('')
  const [fieldHighlight, setFieldHighlight] = useState({ participantes: false })
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [participantesModalOpen, setParticipantesModalOpen] = useState(false)
  const [participantesDraft, setParticipantesDraft] = useState('')
  const [participantesModalError, setParticipantesModalError] = useState('')

  const carReservasBrasilia = useMemo(
    () => filterCarReservationsByUnidade(carReservations, 'Brasília'),
    [carReservations],
  )

  const carrosBsbDia = useMemo(
    () => filterCarReservationsForUnitOnDate(carReservations, form.date, 'Brasília'),
    [carReservations, form.date],
  )

  function updateField(key, v) {
    setForm((f) => ({ ...f, [key]: v }))
    setFormError('')
    setFieldHighlight((h) => ({ ...h, ...(key === 'participantes' ? { participantes: false } : {}) }))
    clearCarError()
  }

  function openParticipantesModal() {
    setParticipantesDraft(form.participantes)
    setParticipantesModalError('')
    setParticipantesModalOpen(true)
  }

  function cancelParticipantesModal() {
    setParticipantesModalOpen(false)
    setParticipantesModalError('')
  }

  function confirmParticipantesModal() {
    const check = validateParticipantesEmailsOnly(participantesDraft)
    if (!check.ok) {
      setParticipantesModalError(check.error)
      return
    }
    updateField('participantes', participantesDraft)
    setParticipantesModalOpen(false)
    setParticipantesModalError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    setFieldHighlight((h) => ({ ...h, participantes: false }))
    setSaveSuccess(false)
    clearCarError()

    const destino = form.destino.trim()
    const motivo = form.motivo.trim()
    const solicitante = form.solicitante.trim()
    const emailSolicitante = form.emailSolicitante.trim()
    const observacoes = form.observacoes.trim()
    const partCheck = validateParticipantesEmailsOnly(form.participantes)
    let participantesNorm = ''
    if (partCheck.ok) {
      participantesNorm = partCheck.emails.join('\n')
    } else {
      // Sinaliza visualmente, mas NÃO bloqueia o envio.
      setFormError(partCheck.error)
      setFieldHighlight((h) => ({ ...h, participantes: true }))
      participantesNorm = splitParticipantesEmails(form.participantes).join('\n')
    }

    if (!destino) {
      setFormError('Informe o destino.')
      return
    }
    if (!motivo) {
      setFormError('Informe o motivo.')
      return
    }
    if (!solicitante) {
      setFormError('Informe o nome do solicitante.')
      return
    }
    if (!emailSolicitante || !isValidEmail(emailSolicitante)) {
      setFormError('Informe um e-mail válido do solicitante.')
      return
    }

    const date = (form.date || '').trim()
    if (!date) {
      setFormError('Informe a data.')
      return
    }

    const startMin = timeToMinutes(form.horaInicio)
    const endMin = timeToMinutes(form.horaFim)
    if (Number.isNaN(startMin) || Number.isNaN(endMin) || endMin <= startMin) {
      setFormError('Horários inválidos: a hora de fim deve ser depois da de início.')
      return
    }
    if (startMin < CAR_DAY_START_MIN || endMin > CAR_DAY_END_MIN) {
      setFormError(
        `O carro só pode ser reservado entre ${minutesToTime(CAR_DAY_START_MIN)} e ${minutesToTime(CAR_DAY_END_MIN)}.`,
      )
      return
    }

    const conflict = findReservationConflictRange(
      CARRO_CONFLICT_SALA_KEY,
      date,
      date,
      startMin,
      endMin,
      carReservasBrasilia,
      null,
    )
    if (conflict) {
      setFormError(conflict.replace('nesta sala', 'neste horário para o carro'))
      return
    }

    const now = new Date().toISOString()
    const createdByEmail =
      normalizeEmail(getCurrentUserEmail() || emailSolicitante) || normalizeEmail(emailSolicitante)

    const titulo = `Carro — ${destino}`.slice(0, 255)
    const payload = {
      id: crypto.randomUUID(),
      date,
      horaInicio: form.horaInicio,
      horaFim: form.horaFim,
      titulo,
      destino,
      motivo,
      solicitante,
      emailSolicitante,
      observacoes,
      participantes: participantesNorm,
      veiculo: CARRO_VEICULO_LABEL,
      motorista: CARRO_MOTORISTA_LABEL,
      unidade: 'Brasília',
      criadoEm: now,
      createdAt: now,
      updatedAt: now,
      createdByEmail,
      deletedAt: null,
      deletedByEmail: null,
    }

    try {
      await addCarReservation(payload)
      setForm(defaultForm())
      setSaveSuccess(true)
    } catch {
      setFormError('Não foi possível guardar. Tente novamente.')
    }
  }

  return (
    <div className="carro-view">
      <div className="carro-view__shell">
        <section className="panel carro-view__info">
          <h2 className="carro-view__vehicle-heading">
            Veículo disponível: <span className="carro-view__vehicle-name">{CARRO_VEICULO_LABEL}</span>
          </h2>
          <p className="carro-view__driver">
            Motorista: <strong>{CARRO_MOTORISTA_LABEL}</strong>
          </p>
        </section>

        <section className="panel panel--grid carro-view__occ-panel">
          <h2 className="panel__title carro-view__occ-section-title">Ocupação do veículo</h2>
          <p className="carro-view__occ-hint">A grade segue a data escolhida no formulário (Brasília).</p>
          <div className="carro-view__occ-wrap">
            <div className="carro-view__occ-unit">
              <div className="grid-wrap carro-view__occ-grid-wrap">
                <table
                  className="availability-grid availability-grid--carro"
                  aria-label="Ocupação do veículo — Brasília"
                >
                  <thead>
                    <tr className="availability-grid__head-row-primary">
                      <th className="availability-grid__head-carro-spacer" rowSpan={2} scope="col" aria-hidden="true" />
                      <th
                        className="availability-grid__head-horarios availability-grid__head-title availability-grid__head-title--carro-horarios"
                        colSpan={CAR_GRID_SLOTS.length}
                        scope="colgroup"
                      >
                        Horários
                      </th>
                    </tr>
                    <tr className="availability-grid__head-row-slots">
                      {CAR_GRID_SLOTS.map((s) => (
                        <th key={s.startMin} scope="col" className="availability-grid__th-slot">
                          {s.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th
                        className="room-head availability-grid__sala-cell availability-grid__sala-cell--carro"
                        scope="row"
                        title={CARRO_VEICULO_LABEL}
                      >
                        {CARRO_VEICULO_GRADE_LABEL}
                      </th>
                      {CAR_GRID_SLOTS.map((slot) => {
                        const res = findReservationForSlot(
                          carrosBsbDia,
                          CARRO_CONFLICT_SALA_KEY,
                          slot.startMin,
                          slot.endMin,
                        )
                        const busy = res != null
                        const slotClass = busy ? 'slot slot--busy-interna' : 'slot slot--free'
                        const slotTitle = busy
                          ? carReservationSlotSummary(res)
                          : `${CARRO_VEICULO_GRADE_LABEL} · ${slot.label}–${minutesToTime(slot.endMin)} · Disponível`
                        const aria = busy
                          ? `${res.titulo || 'Reserva'}, ${res.horaInicio} a ${res.horaFim}, ocupado.`
                          : `${CARRO_VEICULO_GRADE_LABEL}, ${slot.label}, disponível`
                        return (
                          <td key={slot.startMin}>
                            <div className={slotClass} title={slotTitle} role="img" aria-label={aria} />
                          </td>
                        )
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <section className="panel form-panel carro-view__form-panel">
          <h2 className="panel__title carro-view__form-title">Nova reserva de carro</h2>
          {saveSuccess ? (
            <p className="form__success" role="status">
              Reserva de carro registada com sucesso.
            </p>
          ) : null}
          {formError ? <p className="form__error">{formError}</p> : null}
          {carError ? (
            <div className="form__error" role="alert">
              {carError}{' '}
              <button type="button" className="btn-ghost" onClick={clearCarError}>
                Fechar
              </button>
            </div>
          ) : null}

          <form className="form carro-view__form" onSubmit={handleSubmit}>
            <div className="form__grid-2col carro-view__form-grid">
              <div className="form__col">
                <div className="form__row">
                  <label htmlFor="car-data">Data</label>
                  <input
                    id="car-data"
                    type="date"
                    value={form.date}
                    onChange={(e) => updateField('date', e.target.value)}
                    required
                  />
                </div>
                <div className="form__row form__row--2">
                  <div className="form__row">
                    <label htmlFor="car-ini">Hora início</label>
                    <input
                      id="car-ini"
                      type="time"
                      step={SLOT_MINUTES * 60}
                      value={form.horaInicio}
                      onChange={(e) => updateField('horaInicio', e.target.value)}
                    />
                  </div>
                  <div className="form__row">
                    <label htmlFor="car-fim">Hora fim</label>
                    <input
                      id="car-fim"
                      type="time"
                      step={SLOT_MINUTES * 60}
                      value={form.horaFim}
                      onChange={(e) => updateField('horaFim', e.target.value)}
                    />
                  </div>
                </div>
                <div className="form__row">
                  <label htmlFor="car-destino">Destino</label>
                  <input
                    id="car-destino"
                    type="text"
                    autoComplete="off"
                    value={form.destino}
                    onChange={(e) => updateField('destino', e.target.value)}
                    placeholder="Ex.: Ministério da Saúde"
                  />
                </div>
                <div className="form__row">
                  <label htmlFor="car-motivo">Motivo</label>
                  <input
                    id="car-motivo"
                    type="text"
                    autoComplete="off"
                    value={form.motivo}
                    onChange={(e) => updateField('motivo', e.target.value)}
                    placeholder="Ex.: Reunião externa"
                  />
                </div>
              </div>
              <div className="form__col">
                <div className="form__row">
                  <label htmlFor="car-solicitante">Nome do solicitante</label>
                  <input
                    id="car-solicitante"
                    type="text"
                    autoComplete="name"
                    value={form.solicitante}
                    onChange={(e) => updateField('solicitante', e.target.value)}
                  />
                </div>
                <div className="form__row">
                  <label htmlFor="car-email">E-mail do solicitante</label>
                  <M365EmailAutocomplete
                    id="car-email"
                    required
                    placeholder="nome@bmj.com.br"
                    value={form.emailSolicitante}
                    onValueChange={(v) => updateField('emailSolicitante', v)}
                  />
                </div>
                <div
                  className={`form__tipo-participantes-cell form__tipo-participantes-cell--part${fieldHighlight.participantes ? ' form__tipo-participantes-cell--error' : ''}`}
                >
                  <div className={`form__panel form__panel--stack${fieldHighlight.participantes ? ' form__panel--error' : ''}`}>
                    <div className="form__panel-head">
                      <span className="form__panel__legend">Participantes (só e-mails)</span>
                      <button
                        type="button"
                        className="btn-ghost form__panel-edit-btn"
                        onClick={openParticipantesModal}
                      >
                        Gerir participantes
                      </button>
                    </div>
                    <p
                      className={`form__panel-summary form__panel-summary--sub${fieldHighlight.participantes ? ' form__panel-summary--error' : ''}`}
                      aria-live="polite"
                    >
                      {participantesResumoLabel(form.participantes)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="form__row form__row--full">
              <label htmlFor="car-obs">Observações</label>
              <textarea
                id="car-obs"
                className="form__textarea form__textarea--observacoes"
                rows={5}
                value={form.observacoes}
                onChange={(e) => updateField('observacoes', e.target.value)}
                placeholder="Detalhes adicionais (opcional)"
              />
            </div>
            <div className="form__actions">
              <button type="submit" className="btn" disabled={carLoading}>
                {carLoading ? 'A guardar…' : 'Reservar carro'}
              </button>
            </div>
          </form>
          <ReservaFormTextModal
            open={participantesModalOpen}
            title="Adicionar participantes"
            titleId="carro-modal-add-participantes-title"
            error={participantesModalError}
            onConfirm={confirmParticipantesModal}
            onCancel={cancelParticipantesModal}
          >
            <div className="app__modal-field">
              <label htmlFor="carro-modal-participantes-field">
                E-mails (várias linhas ou separados por vírgula)
              </label>
              <M365ParticipantesAutocomplete
                id="carro-modal-participantes-field"
                className="form__textarea form__textarea--participantes-compact form__textarea--modal-body"
                placeholder="Um por linha ou separados por vírgula"
                value={participantesDraft}
                onValueChange={setParticipantesDraft}
              />
            </div>
          </ReservaFormTextModal>
        </section>
      </div>
    </div>
  )
}
