import { useCallback, useEffect, useMemo, useState } from 'react'
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
} from './reservasUtils'
import { useReservas } from './ReservasContext.jsx'
import BmjLogo from './components/BmjLogo.jsx'
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

function slotCoveredByReservation(slotStart, slotEnd, resStart, resEnd) {
  return resStart < slotEnd && slotStart < resEnd
}

export default function App() {
  const { reservations, addReservation, loading, error, clearError } = useReservas()
  const [selectedDate, setSelectedDate] = useState(() => todayISO())

  const [form, setForm] = useState({
    sala: SALAS[0],
    horaInicio: '09:00',
    horaFim: '10:00',
    dataFim: '',
    titulo: '',
    solicitante: '',
    emailSolicitante: '',
    participantes: '',
    observacoes: '',
  })
  const [formError, setFormError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
    if (!saveSuccess) return
    const t = window.setTimeout(() => setSaveSuccess(false), 5000)
    return () => window.clearTimeout(t)
  }, [saveSuccess])

  const reservationsForDay = useMemo(
    () => reservations.filter((r) => reservationCoversDate(r, selectedDate)),
    [reservations, selectedDate],
  )

  const isSlotBusy = useCallback(
    (sala, slotStart, slotEnd) => {
      return reservationsForDay.some((r) => {
        if (r.sala !== sala) return false
        const rs = timeToMinutes(r.horaInicio)
        const re = timeToMinutes(r.horaFim)
        return slotCoveredByReservation(slotStart, slotEnd, rs, re)
      })
    },
    [reservationsForDay],
  )

  function updateField(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
    setFormError('')
    setSaveSuccess(false)
    clearError()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    setSaveSuccess(false)
    clearError()

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

    const dataFim = (form.dataFim || '').trim() || selectedDate
    if (dataFim < selectedDate) {
      setFormError('A data fim não pode ser anterior à data de início.')
      return
    }

    const conflict = findReservationConflictRange(
      form.sala,
      selectedDate,
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
    const novo = {
      id: crypto.randomUUID(),
      sala: form.sala,
      date: selectedDate,
      ...(dataFim !== selectedDate ? { dateFim: dataFim } : {}),
      horaInicio: form.horaInicio,
      horaFim: form.horaFim,
      titulo,
      solicitante,
      emailSolicitante,
      participantes: form.participantes.trim(),
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
      })
      setForm((f) => ({
        ...f,
        titulo: '',
        participantes: '',
        observacoes: '',
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
            <label htmlFor="dia">Data</label>
            <input
              id="dia"
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value)
                setFormError('')
                setSaveSuccess(false)
                clearError()
              }}
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
                <span className="legend__swatch legend__swatch--busy" aria-hidden />
                Ocupado
              </span>
              <span className="legend__item">Slots de {SLOT_MINUTES} min</span>
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
                        const busy = isSlotBusy(sala, slot.startMin, slot.endMin)
                        return (
                          <td key={slot.startMin}>
                            <div
                              className={`slot ${busy ? 'slot--busy' : 'slot--free'}`}
                              title={`${sala} · ${slot.label}–${minutesToTime(slot.endMin)} · ${busy ? 'Ocupado' : 'Disponível'}`}
                              role="img"
                              aria-label={`${sala}, ${slot.label}, ${busy ? 'ocupado' : 'disponível'}`}
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

                <div className="form__row">
                  <label htmlFor="data">Data</label>
                  <input
                    id="data"
                    type="date"
                    value={selectedDate}
                    onChange={(e) => {
                      setSelectedDate(e.target.value)
                      setSaveSuccess(false)
                    }}
                  />
                </div>

                <div className="form__row">
                  <label htmlFor="dataFim">Último dia (reunião em vários dias)</label>
                  <input
                    id="dataFim"
                    type="date"
                    min={selectedDate}
                    value={form.dataFim}
                    onChange={(e) => updateField('dataFim', e.target.value)}
                  />
                  <span className="hint" style={{ marginTop: 6 }}>
                    Opcional. Deixe vazio para um único dia. O mesmo horário repete em cada dia.
                  </span>
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
                  <input
                    id="emailSolicitante"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    required
                    placeholder="nome@bmj.com.br"
                    value={form.emailSolicitante}
                    onChange={(e) => updateField('emailSolicitante', e.target.value)}
                  />
                </div>

                <div className="form__row">
                  <label htmlFor="participantes">Participantes</label>
                  <textarea
                    id="participantes"
                    placeholder="Nomes ou e-mails, um por linha"
                    value={form.participantes}
                    onChange={(e) => updateField('participantes', e.target.value)}
                  />
                </div>

                <div className="form__row">
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
    </div>
  )
}
