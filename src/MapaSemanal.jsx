import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  SALAS,
  DAY_START_MIN,
  DAY_END_MIN,
  timeToMinutes,
  reservationCoversDate,
  mondayOfWeekContaining,
  weekDayISOsFromMonday,
  todayISO,
} from './reservasUtils'
import { useReservas } from './ReservasContext.jsx'
import CancelarReservaModal from './components/CancelarReservaModal.jsx'
import './App.css'

const DIAS_LABEL = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

function formatCellDateBR(iso) {
  const d = new Date(`${iso}T12:00:00`)
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

/** Razão de ocupação do dia útil (0–1) para uma sala num dia. */
function ocupacaoDia(sala, dateISO, reservations) {
  const list = reservations.filter((r) => r.sala === sala && reservationCoversDate(r, dateISO))
  if (list.length === 0) return { ratio: 0, list: [] }
  const span = DAY_END_MIN - DAY_START_MIN
  let covered = 0
  for (const r of list) {
    const a = Math.max(DAY_START_MIN, timeToMinutes(r.horaInicio))
    const b = Math.min(DAY_END_MIN, timeToMinutes(r.horaFim))
    covered += Math.max(0, b - a)
  }
  return { ratio: Math.min(1, covered / span), list }
}

function cellVariant(ratio, list) {
  if (list.length === 0) return 'livre'
  if (ratio >= 0.88) return 'ocupada'
  return 'parcial'
}

export default function MapaSemanal() {
  const { reservations, cancelReservationWithAudit } = useReservas()
  const [searchParams, setSearchParams] = useSearchParams()
  const [weekMonday, setWeekMonday] = useState(() => mondayOfWeekContaining(todayISO()))
  const [salaFilter, setSalaFilter] = useState('')
  const [cellModal, setCellModal] = useState(null)
  const [cancelTarget, setCancelTarget] = useState(null)

  useEffect(() => {
    if (searchParams.get('print') !== '1') return
    const t = window.setTimeout(() => window.print(), 400)
    setSearchParams({}, { replace: true })
    return () => window.clearTimeout(t)
  }, [searchParams, setSearchParams])

  const weekDays = useMemo(() => weekDayISOsFromMonday(weekMonday), [weekMonday])

  const salasFiltradas = useMemo(() => {
    const q = salaFilter.trim().toLowerCase()
    if (!q) return SALAS
    return SALAS.filter((s) => s.toLowerCase().includes(q))
  }, [salaFilter])

  function prevWeek() {
    const d = new Date(`${weekMonday}T12:00:00`)
    d.setDate(d.getDate() - 7)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    setWeekMonday(`${y}-${m}-${day}`)
  }

  function nextWeek() {
    const d = new Date(`${weekMonday}T12:00:00`)
    d.setDate(d.getDate() + 7)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    setWeekMonday(`${y}-${m}-${day}`)
  }

  function thisWeek() {
    setWeekMonday(mondayOfWeekContaining(todayISO()))
  }

  function handlePrint() {
    window.print()
  }

  return (
    <div className="mapa-semanal">
      <header className="mapa-semanal__header no-print">
        <div className="mapa-semanal__header-row">
          <Link to="/" className="mapa-semanal__back">
            ← Voltar às reservas
          </Link>
          <h1 className="mapa-semanal__title">Mapa semanal de reservas</h1>
        </div>
        <p className="mapa-semanal__lead">
          Visão por sala e por dia (Seg–Dom). Cores: verde livre, amarelo ocupação parcial, vermelho
          muito ocupado. Clique numa célula para ver detalhes e cancelar.
        </p>

        <div className="mapa-semanal__toolbar">
          <div className="mapa-semanal__week-nav">
            <button type="button" className="btn-ghost" onClick={prevWeek}>
              Semana anterior
            </button>
            <button type="button" className="btn-ghost" onClick={thisWeek}>
              Semana atual
            </button>
            <button type="button" className="btn-ghost" onClick={nextWeek}>
              Próxima semana
            </button>
          </div>
          <div className="mapa-semanal__field">
            <label htmlFor="mapa-semana-inicio">Início da semana (segunda)</label>
            <input
              id="mapa-semana-inicio"
              type="date"
              value={weekMonday}
              onChange={(e) => setWeekMonday(mondayOfWeekContaining(e.target.value))}
            />
          </div>
          <div className="mapa-semanal__field mapa-semanal__field--grow">
            <label htmlFor="mapa-filtro-sala">Filtrar salas (nome)</label>
            <input
              id="mapa-filtro-sala"
              type="search"
              placeholder="Ex.: Ipê, Sala 03…"
              value={salaFilter}
              onChange={(e) => setSalaFilter(e.target.value)}
            />
          </div>
          <button type="button" className="btn btn--secondary" onClick={handlePrint}>
            Exportar PDF / Imprimir
          </button>
        </div>

        <div className="mapa-semanal__legend no-print">
          <span>
            <span className="mapa-semanal__swatch mapa-semanal__swatch--livre" /> Livre
          </span>
          <span>
            <span className="mapa-semanal__swatch mapa-semanal__swatch--parcial" /> Parcial
          </span>
          <span>
            <span className="mapa-semanal__swatch mapa-semanal__swatch--ocupada" /> Ocupada
          </span>
        </div>
      </header>

      <div className="mapa-semanal__table-wrap">
        <table className="mapa-semanal__grid">
          <thead>
            <tr>
              <th scope="col" className="mapa-semanal__th-sala">
                Sala
              </th>
              {weekDays.map((iso, i) => (
                <th key={iso} scope="col" className="mapa-semanal__th-day">
                  <span className="mapa-semanal__th-dow">{DIAS_LABEL[i]}</span>
                  <span className="mapa-semanal__th-date">{formatCellDateBR(iso)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {salasFiltradas.map((sala) => (
              <tr key={sala}>
                <th scope="row" className="mapa-semanal__row-sala">
                  {sala}
                </th>
                {weekDays.map((iso) => {
                  const { ratio, list } = ocupacaoDia(sala, iso, reservations)
                  const v = cellVariant(ratio, list)
                  const title = list
                    .map(
                      (r) =>
                        `${r.titulo} · ${r.horaInicio}–${r.horaFim} · ${r.solicitante}`,
                    )
                    .join('\n')
                  return (
                    <td key={`${sala}-${iso}`} className="mapa-semanal__td">
                      <button
                        type="button"
                        className={`mapa-semanal__cell mapa-semanal__cell--${v}`}
                        title={list.length ? title : `${sala} · ${iso} · Livre`}
                        onClick={() => setCellModal({ sala, dateISO: iso, list })}
                      >
                        {list.length === 0 ? (
                          <span className="mapa-semanal__cell-label">Livre</span>
                        ) : (
                          <span className="mapa-semanal__cell-label">
                            {list.length} reserva{list.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {cellModal ? (
        <div
          className="app__modal-backdrop no-print"
          role="presentation"
          onClick={() => setCellModal(null)}
        >
          <div
            className="app__modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="app__modal-title">
              {cellModal.sala} · {cellModal.dateISO}
            </h2>
            {cellModal.list.length === 0 ? (
              <p className="app__modal-empty">Nenhuma reserva neste dia.</p>
            ) : (
              <ul className="app__modal-list">
                {cellModal.list.map((r) => (
                  <li key={r.id} className="app__modal-list-item">
                    <div className="app__modal-list-text">
                      <strong>{r.titulo}</strong>
                      <span>
                        {r.horaInicio} – {r.horaFim}
                        {r.dateFim && r.dateFim !== r.date
                          ? ` · período ${r.date} → ${r.dateFim}`
                          : ''}
                      </span>
                      <span className="app__modal-list-sub">{r.solicitante}</span>
                    </div>
                    <button
                      type="button"
                      className="btn-ghost btn-ghost--danger"
                      onClick={() => {
                        setCellModal(null)
                        setCancelTarget(r)
                      }}
                    >
                      Cancelar
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="app__modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setCellModal(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {cancelTarget ? (
        <div className="no-print">
          <CancelarReservaModal
            reservation={cancelTarget}
            onClose={() => setCancelTarget(null)}
            onConfirm={(payload) => cancelReservationWithAudit(cancelTarget, payload)}
          />
        </div>
      ) : null}
    </div>
  )
}
