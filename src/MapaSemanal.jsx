import { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import {
  SALAS,
  DAY_START_MIN,
  DAY_END_MIN,
  timeToMinutes,
  reservationCoversDate,
  mondayOfWeekContaining,
  weekDayISOsFromMonday,
  todayISO,
  APP_UNIDADE,
  sharePointUnidadeFromAppId,
  filterReservasSalasPorUnidadeRecepcao,
  SALAS_RECEPCAO_SAO_PAULO,
  CARRO_CONFLICT_SALA_KEY,
  CARRO_VEICULO_LABEL,
  CAR_DAY_START_MIN,
  CAR_DAY_END_MIN,
  minutesToTime,
  salaNomeGradeExibicao,
  capacidadeQtdPessoasExibicao,
} from './reservasUtils'
import { canAlterReservation, PERMISSAO_NEGADA_MSG } from './envConfig.js'
import { useReservas } from './ReservasContext.jsx'
import CancelarReservaModal from './components/CancelarReservaModal.jsx'
import UnidadeSelector from './components/UnidadeSelector.jsx'
import './App.css'

const DIAS_LABEL = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

function formatCellDateBR(iso) {
  const d = new Date(`${iso}T12:00:00`)
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

/** Razão de ocupação (0–1) num dia; `timeWindow` opcional (ex.: janela do carro). */
function ocupacaoDia(sala, dateISO, reservations, timeWindow) {
  const dayStart = timeWindow?.startMin ?? DAY_START_MIN
  const dayEnd = timeWindow?.endMin ?? DAY_END_MIN
  const list = reservations.filter((r) => r.sala === sala && reservationCoversDate(r, dateISO))
  if (list.length === 0) return { ratio: 0, list: [] }
  const span = dayEnd - dayStart
  if (span <= 0) return { ratio: 0, list }
  let covered = 0
  for (const r of list) {
    const a = Math.max(dayStart, timeToMinutes(r.horaInicio))
    const b = Math.min(dayEnd, timeToMinutes(r.horaFim))
    covered += Math.max(0, b - a)
  }
  return { ratio: Math.min(1, covered / span), list }
}

function cellVariant(ratio, list) {
  if (list.length === 0) return 'livre'
  if (ratio >= 0.88) return 'ocupada'
  return 'parcial'
}

const CAR_TIME_WINDOW = { startMin: CAR_DAY_START_MIN, endMin: CAR_DAY_END_MIN }

const MAPA_SEMANAL_CAR_ROW_KEYS = Object.freeze([CARRO_CONFLICT_SALA_KEY])

export default function MapaSemanal() {
  const { reservations, carReservations, carLoading, cancelReservationWithAudit } = useReservas()
  const embedded = Boolean(useOutletContext()?.embedded)
  const [searchParams, setSearchParams] = useSearchParams()
  const [mapaUnidade, setMapaUnidade] = useState(APP_UNIDADE.BRASILIA)
  const [weekMonday, setWeekMonday] = useState(() => mondayOfWeekContaining(todayISO()))
  /** Salas (ou chave do carro) visíveis no mapa; vazio = nenhuma linha. */
  const [salasMarcadas, setSalasMarcadas] = useState(() => new Set(SALAS))
  const [cellModal, setCellModal] = useState(null)
  const [cancelTarget, setCancelTarget] = useState(null)

  const salasCatalog = useMemo(() => {
    if (mapaUnidade === APP_UNIDADE.CARRO) return MAPA_SEMANAL_CAR_ROW_KEYS
    if (mapaUnidade === APP_UNIDADE.SAO_PAULO) return SALAS_RECEPCAO_SAO_PAULO
    return SALAS
  }, [mapaUnidade])

  const reservationsFiltered = useMemo(() => {
    if (mapaUnidade === APP_UNIDADE.CARRO) return carReservations
    const label = sharePointUnidadeFromAppId(mapaUnidade)
    return filterReservasSalasPorUnidadeRecepcao(reservations, label)
  }, [mapaUnidade, reservations, carReservations])

  useEffect(() => {
    setSalasMarcadas(new Set(salasCatalog))
  }, [mapaUnidade, salasCatalog])

  useEffect(() => {
    if (searchParams.get('print') !== '1') return
    const t = window.setTimeout(() => window.print(), 400)
    setSearchParams({}, { replace: true })
    return () => window.clearTimeout(t)
  }, [searchParams, setSearchParams])

  const weekDays = useMemo(() => weekDayISOsFromMonday(weekMonday), [weekMonday])

  const salasFiltradas = useMemo(() => {
    return salasCatalog.filter((s) => salasMarcadas.has(s))
  }, [salasCatalog, salasMarcadas])

  const isCarMode = mapaUnidade === APP_UNIDADE.CARRO

  const capUnidadeSalas =
    mapaUnidade === APP_UNIDADE.SAO_PAULO ? APP_UNIDADE.SAO_PAULO : APP_UNIDADE.BRASILIA

  function toggleSala(sala) {
    setSalasMarcadas((prev) => {
      const next = new Set(prev)
      if (next.has(sala)) next.delete(sala)
      else next.add(sala)
      return next
    })
  }

  function marcarTodasSalas() {
    setSalasMarcadas(new Set(salasCatalog))
  }

  function desmarcarTodasSalas() {
    setSalasMarcadas(new Set())
  }

  function rowLabel(salaKey) {
    return salaKey === CARRO_CONFLICT_SALA_KEY ? CARRO_VEICULO_LABEL : salaNomeGradeExibicao(salaKey)
  }

  function qtdLabel(salaKey) {
    if (salaKey === CARRO_CONFLICT_SALA_KEY) return '—'
    return capacidadeQtdPessoasExibicao(salaKey, capUnidadeSalas)
  }

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
    <div className={`mapa-semanal${embedded ? ' mapa-semanal--embedded' : ''}`}>
      <header className="mapa-semanal__header no-print">
        {!embedded ? (
          <div className="mapa-semanal__header-row">
            <Link to="/" className="mapa-semanal__back">
              ← Voltar às reservas
            </Link>
            <h1 className="mapa-semanal__title">Mapa semanal de reservas</h1>
          </div>
        ) : null}
        {!embedded ? (
          <p className="mapa-semanal__lead">
            Visão por sala e por dia (Seg–Dom). Cores: verde livre, amarelo ocupação parcial, vermelho
            muito ocupado. Clique numa célula para ver detalhes e cancelar.
          </p>
        ) : null}

        <div className="mapa-semanal__toolbar">
          <div className="mapa-semanal__toolbar-unidade no-print">
            <UnidadeSelector value={mapaUnidade} onChange={setMapaUnidade} />
          </div>
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
          {!isCarMode ? (
            <div className="mapa-semanal__field mapa-semanal__field--grow mapa-semanal__field--salas">
              <div className="mapa-semanal__salas-head">
                <span className="mapa-semanal__salas-label" id="mapa-salas-legend">
                  Salas a mostrar
                </span>
                <div className="mapa-semanal__salas-actions">
                  <button type="button" className="btn-ghost" onClick={marcarTodasSalas}>
                    Todas
                  </button>
                  <button type="button" className="btn-ghost" onClick={desmarcarTodasSalas}>
                    Nenhuma
                  </button>
                </div>
              </div>
              <ul className="mapa-semanal__salas-menu" aria-labelledby="mapa-salas-legend">
                {salasCatalog.map((sala) => {
                  const qtd = qtdLabel(sala)
                  return (
                    <li key={sala} className="mapa-semanal__salas-menu-item">
                      <label className="mapa-semanal__sala-chip">
                        <input
                          type="checkbox"
                          checked={salasMarcadas.has(sala)}
                          onChange={() => toggleSala(sala)}
                        />
                        <span className="mapa-semanal__sala-chip-body">
                          <span className="mapa-semanal__sala-chip-name">
                            {salaNomeGradeExibicao(sala)}
                          </span>
                          <span className="mapa-semanal__sala-chip-qtd" title={`QTD pessoas: ${qtd}`}>
                            {qtd}
                          </span>
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
              {salasFiltradas.length === 0 ? (
                <p className="mapa-semanal__salas-hint">
                  Marque pelo menos uma sala para ver linhas na grelha.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="mapa-semanal__field mapa-semanal__field--grow">
              <span className="mapa-semanal__salas-label">Veículo</span>
              <p className="mapa-semanal__salas-hint" style={{ margin: 0 }}>
                {CARRO_VEICULO_LABEL} — ocupação na semana (janela {minutesToTime(CAR_DAY_START_MIN)}–
                {minutesToTime(CAR_DAY_END_MIN)}).
              </p>
            </div>
          )}
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
        {isCarMode && carLoading ? (
          <p className="mapa-semanal__salas-hint no-print">A carregar reservas de carro…</p>
        ) : null}
        <table className="mapa-semanal__grid">
          <thead>
            <tr>
              <th scope="col" className="mapa-semanal__th-sala">
                {isCarMode ? (
                  'Veículo'
                ) : (
                  <>
                    <span className="mapa-semanal__th-sala-line">Sala</span>
                    <span className="mapa-semanal__th-sala-line mapa-semanal__th-sala-line--sub">
                      QTD
                    </span>
                  </>
                )}
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
                  {isCarMode ? (
                    rowLabel(sala)
                  ) : (
                    <span className="mapa-semanal__row-sala-inner">
                      <span className="mapa-semanal__row-sala-name">{salaNomeGradeExibicao(sala)}</span>
                      <span
                        className="mapa-semanal__row-sala-qtd"
                        title={`Capacidade: ${qtdLabel(sala)}`}
                      >
                        {qtdLabel(sala)}
                      </span>
                    </span>
                  )}
                </th>
                {weekDays.map((iso) => {
                  const { ratio, list } = ocupacaoDia(
                    sala,
                    iso,
                    reservationsFiltered,
                    isCarMode ? CAR_TIME_WINDOW : null,
                  )
                  const v = cellVariant(ratio, list)
                  const label = rowLabel(sala)
                  const title = list
                    .map((r) =>
                      r.tipoReserva === 'carro'
                        ? `${r.titulo} · ${r.horaInicio}–${r.horaFim} · ${r.solicitante}${r.destino ? ` · ${r.destino}` : ''}`
                        : `${r.titulo} · ${r.horaInicio}–${r.horaFim} · ${r.solicitante}`,
                    )
                    .join('\n')
                  return (
                    <td key={`${sala}-${iso}`} className="mapa-semanal__td">
                      <button
                        type="button"
                        className={`mapa-semanal__cell mapa-semanal__cell--${v}`}
                        title={list.length ? title : `${label} · ${iso} · Livre`}
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
              {rowLabel(cellModal.sala)} · {cellModal.dateISO}
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
                        {r.tipoReserva === 'carro' && r.destino?.trim()
                          ? ` · destino: ${r.destino.trim()}`
                          : ''}
                      </span>
                      <span className="app__modal-list-sub">{r.solicitante}</span>
                    </div>
                    {canAlterReservation(r) ? (
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
                    ) : (
                      <span className="app__modal-list-denied" role="status">
                        {PERMISSAO_NEGADA_MSG}
                      </span>
                    )}
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
