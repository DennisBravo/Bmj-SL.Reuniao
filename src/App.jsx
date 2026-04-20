import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  SALAS,
  SLOT_MINUTES,
  DAY_START_MIN,
  DAY_END_MIN,
  timeToMinutes,
  minutesToTime,
  isValidEmail,
  todayISO,
  reservationCoversDate,
  findReservationConflictRange,
  findReservationForSlot,
  reservationQuickSummaryLine,
  validateParticipantesEmailsOnly,
  reservationTipoReuniao,
  participantesResumoLabel,
  clientesResumoLabel,
} from './reservasUtils'
import { useReservas } from './ReservasContext.jsx'
import BmjLogo from './components/BmjLogo.jsx'
import ReservaSlotDetalheModal from './components/ReservaSlotDetalheModal.jsx'
import { M365EmailAutocomplete, M365ParticipantesAutocomplete } from './components/M365UserAutocompleteFields.jsx'
import ReservaFormTextModal from './components/ReservaFormTextModal.jsx'
import { getCurrentUserEmail, normalizeEmail } from './envConfig.js'
import { notifyTeamsNewReservationWithNotes } from './teamsWebhook.js'
import './App.css'

function buildTimeSlots() {
  const slots = []
  for (let m = DAY_START_MIN; m < DAY_END_MIN; m += SLOT_MINUTES) {
    slots.push({ startMin: m, endMin: m + SLOT_MINUTES, label: minutesToTime(m) })
  }
  return slots
}

const TIME_SLOTS = buildTimeSlots()

/** Desloca a logo para a esquerda (px). Negativo = esquerda. ~113px ≈ 3cm em ecrã típico. */
const HEADER_LOGO_SHIFT_X_PX = -266

export default function App() {
  const { reservations, addReservation, loading, error, clearError } = useReservas()

  const [form, setForm] = useState({
    sala: SALAS[0],
    horaInicio: '09:00',
    horaFim: '10:00',
    dataInicio: todayISO(),
    dataFim: todayISO(),
    titulo: '',
    solicitante: '',
    emailSolicitante: '',
    participantes: '',
    observacoes: '',
    tipoReuniao: '',
    nomeCliente: '',
  })
  const [formError, setFormError] = useState('')
  const [fieldHighlight, setFieldHighlight] = useState({
    tipo: false,
    nomeCliente: false,
    participantes: false,
  })
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [detalheReserva, setDetalheReserva] = useState(null)
  const [slotHoverPreview, setSlotHoverPreview] = useState(null)
  const hoverHideTimerRef = useRef(null)
  const prevTipoReuniaoRef = useRef(form.tipoReuniao)

  const [participantesModalOpen, setParticipantesModalOpen] = useState(false)
  const [participantesDraft, setParticipantesDraft] = useState('')
  const [participantesModalError, setParticipantesModalError] = useState('')

  const [clienteModalOpen, setClienteModalOpen] = useState(false)
  const [clienteDraft, setClienteDraft] = useState('')

  const cancelHoverHide = useCallback(() => {
    if (hoverHideTimerRef.current) {
      window.clearTimeout(hoverHideTimerRef.current)
      hoverHideTimerRef.current = null
    }
  }, [])

  const scheduleHoverHide = useCallback(() => {
    cancelHoverHide()
    hoverHideTimerRef.current = window.setTimeout(() => {
      setSlotHoverPreview(null)
      hoverHideTimerRef.current = null
    }, 240)
  }, [cancelHoverHide])

  useEffect(() => () => cancelHoverHide(), [cancelHoverHide])

  useEffect(() => {
    if (!saveSuccess) return
    const t = window.setTimeout(() => setSaveSuccess(false), 5000)
    return () => window.clearTimeout(t)
  }, [saveSuccess])

  const reservationsForDay = useMemo(
    () => reservations.filter((r) => reservationCoversDate(r, form.dataInicio)),
    [reservations, form.dataInicio],
  )

  const getSlotReservation = useCallback(
    (sala, slotStart, slotEnd) =>
      findReservationForSlot(reservationsForDay, sala, slotStart, slotEnd),
    [reservationsForDay],
  )

  useEffect(() => {
    setSlotHoverPreview(null)
    cancelHoverHide()
    setDetalheReserva(null)
  }, [form.dataInicio, cancelHoverHide])

  /** Ao escolher «Externa», abre o modal de clientes (rascunho = valor actual). */
  useEffect(() => {
    const prev = prevTipoReuniaoRef.current
    prevTipoReuniaoRef.current = form.tipoReuniao
    if (form.tipoReuniao !== 'externa' || prev === 'externa') return
    setClienteDraft(form.nomeCliente)
    setClienteModalOpen(true)
  }, [form.tipoReuniao, form.nomeCliente])

  useEffect(() => {
    if (!participantesModalOpen && !clienteModalOpen) return
    function onKeyDown(e) {
      if (e.key !== 'Escape') return
      if (participantesModalOpen) {
        setParticipantesModalOpen(false)
        setParticipantesModalError('')
        return
      }
      if (clienteModalOpen) setClienteModalOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [participantesModalOpen, clienteModalOpen])

  function handleBusySlotEnter(e, res) {
    cancelHoverHide()
    const rect = e.currentTarget.getBoundingClientRect()
    setSlotHoverPreview({
      reservation: res,
      left: rect.left + rect.width / 2,
      top: rect.bottom + 6,
    })
  }

  function handleBusySlotClick(e, res) {
    e.preventDefault()
    e.stopPropagation()
    cancelHoverHide()
    setSlotHoverPreview(null)
    setDetalheReserva(res)
  }

  function updateField(key, value) {
    setForm((f) => {
      const next = { ...f, [key]: value }
      if (key === 'tipoReuniao' && value === 'interna') next.nomeCliente = ''
      if (key === 'dataInicio') {
        const di = String(value).trim()
        const df = (next.dataFim || '').trim()
        if (!df) next.dataFim = di
        else if (df < di) next.dataFim = di
      }
      return next
    })
    setFormError('')
    setSaveSuccess(false)
    clearError()
    setFieldHighlight((h) => ({
      ...h,
      ...(key === 'tipoReuniao' ? { tipo: false } : {}),
      ...(key === 'nomeCliente' ? { nomeCliente: false } : {}),
      ...(key === 'participantes' ? { participantes: false } : {}),
    }))
  }

  function openParticipantesModal() {
    setParticipantesDraft(form.participantes)
    setParticipantesModalError('')
    setParticipantesModalOpen(true)
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

  function cancelParticipantesModal() {
    setParticipantesModalOpen(false)
    setParticipantesModalError('')
  }

  function openClienteModal() {
    setClienteDraft(form.nomeCliente)
    setClienteModalOpen(true)
  }

  function confirmClienteModal() {
    updateField('nomeCliente', clienteDraft)
    setClienteModalOpen(false)
  }

  function cancelClienteModal() {
    setClienteModalOpen(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    setSaveSuccess(false)
    clearError()
    setFieldHighlight({ tipo: false, nomeCliente: false, participantes: false })

    if (form.tipoReuniao !== 'interna' && form.tipoReuniao !== 'externa') {
      setFormError('Selecione o tipo de reunião (interna ou externa) antes de continuar.')
      setFieldHighlight((h) => ({ ...h, tipo: true }))
      return
    }
    if (form.tipoReuniao === 'externa' && !form.nomeCliente.trim()) {
      setFormError('Informe o cliente.')
      setFieldHighlight((h) => ({ ...h, nomeCliente: true }))
      return
    }
    const partCheck = validateParticipantesEmailsOnly(form.participantes)
    if (!partCheck.ok) {
      setFormError(partCheck.error)
      setFieldHighlight((h) => ({ ...h, participantes: true }))
      return
    }

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

    const startMin = timeToMinutes(form.horaInicio)
    const endMin = timeToMinutes(form.horaFim)
    if (Number.isNaN(startMin) || Number.isNaN(endMin)) {
      setFormError('Horários inválidos. Use o formato HH:MM.')
      return
    }
    if (startMin < DAY_START_MIN || endMin > DAY_END_MIN) {
      setFormError(
        `Reservas só podem ser entre ${minutesToTime(DAY_START_MIN)} e ${minutesToTime(DAY_END_MIN)}.`,
      )
      return
    }

    const dataInicio = (form.dataInicio || '').trim()
    if (!dataInicio) {
      setFormError('Informe a data de início.')
      return
    }
    const dataFimRaw = (form.dataFim || '').trim()
    const dataFim = dataFimRaw || dataInicio
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
      null,
    )
    if (conflict) {
      setFormError(conflict)
      return
    }

    const now = new Date().toISOString()
    const createdByEmail =
      normalizeEmail(getCurrentUserEmail() || emailSolicitante) || normalizeEmail(emailSolicitante)
    const observacoes = form.observacoes.trim()
    const participantesNorm = partCheck.emails.join('\n')
    const novo = {
      id: crypto.randomUUID(),
      sala: form.sala,
      date: dataInicio,
      ...(dataFim !== dataInicio ? { dateFim: dataFim } : {}),
      horaInicio: form.horaInicio,
      horaFim: form.horaFim,
      titulo,
      solicitante,
      emailSolicitante,
      tipoReuniao: form.tipoReuniao,
      ...(form.tipoReuniao === 'externa' ? { nomeCliente: form.nomeCliente.trim() } : {}),
      participantes: participantesNorm,
      observacoes,
      criadoEm: now,
      createdAt: now,
      updatedAt: now,
      createdByEmail,
      deletedAt: null,
      deletedByEmail: null,
    }
    try {
      await addReservation(novo)
      void notifyTeamsNewReservationWithNotes({
        sala: novo.sala,
        date: novo.date,
        dateFim: novo.dateFim,
        horaInicio: novo.horaInicio,
        horaFim: novo.horaFim,
        solicitante: novo.solicitante,
        participantes: novo.participantes,
        observacoes: novo.observacoes,
        tipoReuniao: novo.tipoReuniao,
        nomeCliente: novo.nomeCliente,
      })
      setForm((f) => ({
        ...f,
        titulo: '',
        participantes: '',
        observacoes: '',
        tipoReuniao: '',
        nomeCliente: '',
      }))
      setSaveSuccess(true)
    } catch {
      setFormError('Não foi possível guardar a reserva. Tente novamente ou verifique a ligação ao servidor.')
    }
  }

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__header-row">
          <div
            className="app__header-logo app__header-grid-logo"
            style={{ transform: `translateX(${HEADER_LOGO_SHIFT_X_PX}px)` }}
          >
            <BmjLogo />
          </div>
          <div className="app__header-top-right app__header-grid-nav">
            <nav className="app__tabs" aria-label="Navegação principal">
              <span className="app__tab app__tab--active" aria-current="page">
                Reserva de salas
              </span>
            </nav>
            <NavLink
              to="/recepcao"
              className={({ isActive }) =>
                `app__user-chip app__rececao-link${isActive ? ' app__user-chip--open' : ''}`
              }
              title="Área Recepção — mapa, cancelamentos e relatórios"
            >
              <span className="app__user-chip-label">Recepção</span>
            </NavLink>
          </div>

          <h1 className="app__title app__header-grid-title">Reserva de salas</h1>
          <div className="app__date app__date--title-row app__header-grid-date">
            <label htmlFor="dia">Data início</label>
            <input
              id="dia"
              type="date"
              value={form.dataInicio}
              onChange={(e) => updateField('dataInicio', e.target.value)}
            />
          </div>

          <p className="app__subtitle app__header-grid-subtitle">
            Faça sua reserva e evite conflitos de horário nas salas.
          </p>
          {loading && reservations.length === 0 ? (
            <p className="app__subtitle app__header-grid-subtitle app__sync-hint" aria-live="polite">
              A carregar reservas…
            </p>
          ) : null}
          {error ? (
            <div
              className="form__error app__context-alert"
              role="alert"
              style={{ maxWidth: 560, marginTop: 8 }}
            >
              <span>{error}</span>{' '}
              <button type="button" className="btn-ghost" onClick={clearError}>
                Fechar
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <div className="app__layout">
          <section className="panel panel--grid">
            <h2 className="panel__title">Disponibilidade por sala e horário</h2>
            <div className="legend">
              <span className="legend__item">
                <span className="legend__swatch legend__swatch--free" aria-hidden />
                Disponível
              </span>
              <span className="legend__item">
                <span className="legend__swatch legend__swatch--interna" aria-hidden />
                Interna
              </span>
              <span className="legend__item">
                <span className="legend__swatch legend__swatch--externa" aria-hidden />
                Externa
              </span>
              <span className="legend__item">Slots de {SLOT_MINUTES} min</span>
              <span className="legend__item legend__item--hint">
                Passe o rato ou clique num horário reservado para ver detalhes
              </span>
            </div>
            <div className="grid-wrap">
              <table className="availability-grid">
                <thead>
                  <tr>
                    <th className="room-head" scope="col">
                      Sala
                    </th>
                    {TIME_SLOTS.map((s) => (
                      <th key={s.startMin} scope="col">
                        {s.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SALAS.map((sala) => (
                    <tr key={sala}>
                      <th className="room-head" scope="row">
                        {sala}
                      </th>
                      {TIME_SLOTS.map((slot) => {
                        const res = getSlotReservation(sala, slot.startMin, slot.endMin)
                        const busy = res != null
                        const tipoSlot = busy ? reservationTipoReuniao(res) : null
                        const slotClass = busy
                          ? tipoSlot === 'externa'
                            ? 'slot slot--busy-externa'
                            : 'slot slot--busy-interna'
                          : 'slot slot--free'
                        const slotTitle = busy
                          ? reservationQuickSummaryLine(res, sala)
                          : `${sala} · ${slot.label}–${minutesToTime(slot.endMin)} · Disponível`
                        return (
                          <td key={slot.startMin}>
                            <div
                              className={slotClass}
                              title={slotTitle}
                              role="img"
                              aria-label={
                                busy
                                  ? `${res.titulo || 'Reserva'}, ${res.horaInicio} a ${res.horaFim}, ocupado. Passe o rato ou clique para ver detalhes.`
                                  : `${sala}, ${slot.label}, disponível`
                              }
                              onMouseEnter={busy ? (e) => handleBusySlotEnter(e, res) : undefined}
                              onMouseLeave={busy ? scheduleHoverHide : undefined}
                              onClick={busy ? (e) => handleBusySlotClick(e, res) : undefined}
                            />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="app__below-grid">
            <section className="panel form-panel">
              <h2>Nova reserva</h2>
              <p className="hint">
                Horários no intervalo exibido na grade. O sistema bloqueia sobreposição na mesma sala
                e data.
              </p>
              <form className="form" onSubmit={handleSubmit}>
                {saveSuccess ? (
                  <p className="form__success" role="status" aria-live="polite">
                    Reserva criada com sucesso.
                  </p>
                ) : null}
                {formError ? <p className="form__error">{formError}</p> : null}

                <div className="form__grid-2col" aria-label="Dados da reserva">
                  <div className="form__col">
                    <div className="form__row">
                      <label htmlFor="sala">Nome da sala</label>
                      <select
                        id="sala"
                        value={form.sala}
                        onChange={(e) => updateField('sala', e.target.value)}
                      >
                        {SALAS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form__row form__row--2">
                      <div className="form__row">
                        <label htmlFor="dataInicio">Data início</label>
                        <input
                          id="dataInicio"
                          type="date"
                          value={form.dataInicio}
                          onChange={(e) => updateField('dataInicio', e.target.value)}
                        />
                      </div>
                      <div className="form__row">
                        <label htmlFor="dataFim">Data fim</label>
                        <input
                          id="dataFim"
                          type="date"
                          min={form.dataInicio}
                          value={form.dataFim || form.dataInicio}
                          onChange={(e) => updateField('dataFim', e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="form__row form__row--2">
                      <div className="form__row">
                        <label htmlFor="ini">Hora início</label>
                        <input
                          id="ini"
                          type="time"
                          step={SLOT_MINUTES * 60}
                          value={form.horaInicio}
                          onChange={(e) => updateField('horaInicio', e.target.value)}
                        />
                      </div>
                      <div className="form__row">
                        <label htmlFor="fim">Hora fim</label>
                        <input
                          id="fim"
                          type="time"
                          step={SLOT_MINUTES * 60}
                          value={form.horaFim}
                          onChange={(e) => updateField('horaFim', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="form__col">
                    <div className="form__row">
                      <label htmlFor="titulo">Título da reunião</label>
                      <input
                        id="titulo"
                        type="text"
                        autoComplete="off"
                        placeholder="Ex.: Alinhamento trimestral"
                        value={form.titulo}
                        onChange={(e) => updateField('titulo', e.target.value)}
                      />
                    </div>

                    <div className="form__row">
                      <label htmlFor="solicitante">Solicitante</label>
                      <input
                        id="solicitante"
                        type="text"
                        autoComplete="name"
                        placeholder="Nome de quem reserva"
                        value={form.solicitante}
                        onChange={(e) => updateField('solicitante', e.target.value)}
                      />
                    </div>

                    <div className="form__row">
                      <label htmlFor="emailSolicitante">E-mail do solicitante</label>
                      <M365EmailAutocomplete
                        id="emailSolicitante"
                        required
                        placeholder="nome@bmj.com.br"
                        value={form.emailSolicitante}
                        onValueChange={(v) => updateField('emailSolicitante', v)}
                      />
                    </div>
                  </div>
                </div>

                <div className="form__tipo-participantes-row" aria-label="Tipo e participantes">
                  <div className="form__tipo-participantes-cell form__tipo-participantes-cell--tipo">
                    <div
                      className={`form__panel form__panel--stack${fieldHighlight.tipo || fieldHighlight.nomeCliente ? ' form__panel--error' : ''}`}
                    >
                      <fieldset
                        className={`form__tipo-fieldset form__tipo-fieldset--compact${fieldHighlight.tipo ? ' form__tipo-fieldset--error' : ''}`}
                      >
                        <legend className="form__tipo-legend form__panel__legend">Tipo de reunião</legend>
                        {form.tipoReuniao === 'externa' ? (
                          <button
                            type="button"
                            className="btn-ghost form__panel-edit-btn"
                            onClick={openClienteModal}
                          >
                            Gerir clientes
                          </button>
                        ) : null}
                        <div className="form__tipo-options" role="presentation">
                          <label className="form__tipo-label">
                            <input
                              type="radio"
                              name="tipoReuniao"
                              value="interna"
                              checked={form.tipoReuniao === 'interna'}
                              onChange={() => updateField('tipoReuniao', 'interna')}
                            />
                            Interna
                          </label>
                          <label className="form__tipo-label">
                            <input
                              type="radio"
                              name="tipoReuniao"
                              value="externa"
                              checked={form.tipoReuniao === 'externa'}
                              onChange={() => updateField('tipoReuniao', 'externa')}
                            />
                            Externa
                          </label>
                        </div>
                        {form.tipoReuniao === 'externa' ? (
                          <p
                            className={`form__panel-summary form__panel-summary--sub${fieldHighlight.nomeCliente ? ' form__panel-summary--error' : ''}`}
                            aria-live="polite"
                          >
                            {clientesResumoLabel(form.nomeCliente)}
                          </p>
                        ) : null}
                      </fieldset>
                    </div>
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

                <div className="form__row form__row--full">
                  <label htmlFor="observacoes">Observações e necessidades da reunião</label>
                  <textarea
                    id="observacoes"
                    className="form__textarea form__textarea--observacoes"
                    rows={5}
                    placeholder="Descreva recursos ou preparações necessárias para a reunião"
                    value={form.observacoes}
                    onChange={(e) => updateField('observacoes', e.target.value)}
                  />
                </div>

                <div className="form__actions">
                  <button type="submit" className="btn" disabled={loading}>
                    {loading && reservations.length > 0
                      ? 'A guardar…'
                      : loading
                        ? 'Aguarde…'
                        : 'Confirmar reserva'}
                  </button>
                </div>
              </form>
            </section>
          </div>
        </div>

      {slotHoverPreview ? (
        <div
          className="slot-preview-popover"
          role="tooltip"
          style={{
            left: Math.min(
              Math.max(slotHoverPreview.left, 136),
              (typeof window !== 'undefined' ? window.innerWidth : 800) - 136,
            ),
            top: slotHoverPreview.top,
          }}
          onMouseEnter={cancelHoverHide}
          onMouseLeave={scheduleHoverHide}
        >
          <strong className="slot-preview-popover__title">
            {slotHoverPreview.reservation.titulo || 'Reunião'}
          </strong>
          <span className="slot-preview-popover__tipo">
            {reservationTipoReuniao(slotHoverPreview.reservation) === 'externa'
              ? 'Reunião externa'
              : 'Reunião interna'}
          </span>
          <span className="slot-preview-popover__meta">
            {slotHoverPreview.reservation.horaInicio}–{slotHoverPreview.reservation.horaFim} ·{' '}
            {slotHoverPreview.reservation.sala}
          </span>
          {slotHoverPreview.reservation.solicitante ? (
            <span className="slot-preview-popover__sub">{slotHoverPreview.reservation.solicitante}</span>
          ) : null}
          {slotHoverPreview.reservation.emailSolicitante ||
          slotHoverPreview.reservation.createdByEmail ? (
            <span className="slot-preview-popover__sub">
              {slotHoverPreview.reservation.emailSolicitante ||
                slotHoverPreview.reservation.createdByEmail}
            </span>
          ) : null}
          <span className="slot-preview-popover__hint">Clique para ver tudo</span>
        </div>
      ) : null}
      {detalheReserva ? (
        <ReservaSlotDetalheModal
          reservation={detalheReserva}
          onClose={() => setDetalheReserva(null)}
        />
      ) : null}

      <ReservaFormTextModal
        open={participantesModalOpen}
        title="Adicionar participantes"
        titleId="reserva-modal-add-participantes-title"
        error={participantesModalError}
        onConfirm={confirmParticipantesModal}
        onCancel={cancelParticipantesModal}
      >
        <div className="app__modal-field">
          <label htmlFor="modal-participantes-field">E-mails (várias linhas ou separados por vírgula)</label>
          <M365ParticipantesAutocomplete
            id="modal-participantes-field"
            className="form__textarea form__textarea--participantes-compact form__textarea--modal-body"
            placeholder="Um por linha ou separados por vírgula"
            value={participantesDraft}
            onValueChange={setParticipantesDraft}
          />
        </div>
      </ReservaFormTextModal>

      <ReservaFormTextModal
        open={clienteModalOpen}
        title="Adicionar cliente(s)"
        titleId="reserva-modal-add-clientes-title"
        error=""
        onConfirm={confirmClienteModal}
        onCancel={cancelClienteModal}
      >
        <div className="app__modal-field">
          <label htmlFor="modal-cliente-field">Nomes</label>
          <textarea
            id="modal-cliente-field"
            autoComplete="organization"
            className="form__textarea form__textarea--modal-body"
            placeholder="Um ou vários nomes (várias linhas)"
            rows={6}
            value={clienteDraft}
            onChange={(e) => setClienteDraft(e.target.value)}
          />
        </div>
      </ReservaFormTextModal>
    </div>
  )
}
