import { useCallback, useEffect, useMemo, useState } from 'react'
import Painel from './Painel.jsx'
import {
  SALAS,
  SLOT_MINUTES,
  DAY_START_MIN,
  DAY_END_MIN,
  timeToMinutes,
  minutesToTime,
  isValidEmail,
  todayISO,
  loadReservations,
  saveReservations,
} from './reservasUtils'
import BmjLogo from './components/BmjLogo.jsx'
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

function formatShortDateBR(iso) {
  if (!iso) return ''
  const d = new Date(`${iso}T12:00:00`)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

/** Intervalos [start, end) em minutos do mesmo dia — conflito se houver sobreposição */
function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd
}

function slotCoveredByReservation(slotStart, slotEnd, resStart, resEnd) {
  return resStart < slotEnd && slotStart < resEnd
}

function findConflict(sala, date, startMin, endMin, reservations, excludeId) {
  if (endMin <= startMin) {
    return 'O horário de fim deve ser depois do horário de início.'
  }
  for (const r of reservations) {
    if (r.id === excludeId) continue
    if (r.sala !== sala || r.date !== date) continue
    const rs = timeToMinutes(r.horaInicio)
    const re = timeToMinutes(r.horaFim)
    if (intervalsOverlap(startMin, endMin, rs, re)) {
      return `Conflito: já existe reserva nesta sala entre ${r.horaInicio} e ${r.horaFim} (“${r.titulo}”).`
    }
  }
  return null
}

export default function App() {
  const [activeTab, setActiveTab] = useState('reservas')
  const [selectedDate, setSelectedDate] = useState(() => todayISO())
  const [reservations, setReservations] = useState(loadReservations)

  const [form, setForm] = useState({
    sala: SALAS[0],
    horaInicio: '09:00',
    horaFim: '10:00',
    titulo: '',
    solicitante: '',
    emailSolicitante: '',
    participantes: '',
  })
  const [formError, setFormError] = useState('')

  useEffect(() => {
    saveReservations(reservations)
  }, [reservations])

  const reservationsForDay = useMemo(
    () => reservations.filter((r) => r.date === selectedDate),
    [reservations, selectedDate],
  )

  const sortedDayList = useMemo(() => {
    return [...reservationsForDay].sort(
      (a, b) => timeToMinutes(a.horaInicio) - timeToMinutes(b.horaInicio),
    )
  }, [reservationsForDay])

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
  }

  function handleSubmit(e) {
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

    const conflict = findConflict(
      form.sala,
      selectedDate,
      startMin,
      endMin,
      reservations,
      null,
    )
    if (conflict) {
      setFormError(conflict)
      return
    }

    const novo = {
      id: crypto.randomUUID(),
      sala: form.sala,
      date: selectedDate,
      horaInicio: form.horaInicio,
      horaFim: form.horaFim,
      titulo,
      solicitante,
      emailSolicitante,
      participantes: form.participantes.trim(),
      criadoEm: new Date().toISOString(),
    }
    setReservations((prev) => [...prev, novo])
    setForm((f) => ({
      ...f,
      titulo: '',
      participantes: '',
    }))
  }

  function removeReservation(id) {
    setReservations((prev) => prev.filter((r) => r.id !== id))
  }

  return (
    <div className="app">
      <header className="app__header">
        <div
          className={`app__header-row${activeTab === 'painel' ? ' app__header-row--painel' : ''}`}
        >
          <div
            className="app__header-logo app__header-grid-logo"
            style={{ transform: `translateX(${HEADER_LOGO_SHIFT_X_PX}px)` }}
          >
            <BmjLogo />
          </div>
          <div className="app__header-top-right app__header-grid-nav">
            <nav className="app__tabs" aria-label="Navegação principal">
              <button
                type="button"
                className={`app__tab ${activeTab === 'reservas' ? 'app__tab--active' : ''}`}
                aria-current={activeTab === 'reservas' ? 'page' : undefined}
                onClick={() => setActiveTab('reservas')}
              >
                Reservas
              </button>
              <button
                type="button"
                className={`app__tab ${activeTab === 'painel' ? 'app__tab--active' : ''}`}
                aria-current={activeTab === 'painel' ? 'page' : undefined}
                onClick={() => setActiveTab('painel')}
              >
                Painel
              </button>
            </nav>
            <div className="app__user-chip" title="Posto de utilização">
              <span className="app__user-chip-label">Recepção</span>
              <span className="app__user-chip-chevron" aria-hidden>
                ▾
              </span>
            </div>
          </div>

          <h1
            className={`app__title app__header-grid-title${activeTab === 'painel' ? ' app__header-grid-title--full' : ''}`}
          >
            {activeTab === 'reservas' ? 'Reserva de salas' : 'Painel de reservas'}
          </h1>
          {activeTab === 'reservas' ? (
            <div className="app__date app__date--title-row app__header-grid-date">
              <label htmlFor="dia">Data</label>
              <input
                id="dia"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>
          ) : null}

          <p className="app__subtitle app__header-grid-subtitle">
            {activeTab === 'reservas'
              ? 'Faça sua reserva e evite conflitos de horário nas salas.'
              : 'Indicadores e relatório do período selecionado.'}
          </p>
        </div>
      </header>

      {activeTab === 'painel' ? (
        <Painel reservations={reservations} />
      ) : (
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
                    onChange={(e) => setSelectedDate(e.target.value)}
                  />
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

                <div className="form__actions">
                  <button type="submit" className="btn">
                    Confirmar reserva
                  </button>
                </div>
              </form>
            </section>

            <section className="panel list-panel">
              <h3>Reservas do dia ({formatShortDateBR(selectedDate)})</h3>
              {sortedDayList.length === 0 ? (
                <p className="empty-state">Nenhuma reserva para esta data.</p>
              ) : (
                <ul className="reservations">
                  {sortedDayList.map((r) => (
                    <li key={r.id} className="reservation-card">
                      <div className="reservation-card__time">
                        {r.horaInicio} – {r.horaFim} · {r.sala}
                      </div>
                      <div className="reservation-card__title">{r.titulo}</div>
                      <div className="reservation-card__meta">
                        Responsável: {r.solicitante}
                        {r.emailSolicitante ? (
                          <>
                            <br />
                            E-mail: {r.emailSolicitante}
                          </>
                        ) : null}
                        {r.participantes ? (
                          <>
                            <br />
                            Participantes: {r.participantes.replace(/\n/g, ', ')}
                          </>
                        ) : null}
                      </div>
                      <div className="reservation-card__actions">
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => removeReservation(r.id)}
                        >
                          Cancelar reserva
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  )
}
