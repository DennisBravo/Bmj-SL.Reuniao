import { useMemo, useState } from 'react'
import '../App.css'
import { useReservas } from '../ReservasContext.jsx'
import {
  timeToMinutes,
  todayISO,
  reservationCoversDate,
  APP_UNIDADE,
  sharePointUnidadeFromAppId,
  filterReservasSalasPorUnidadeRecepcao,
  reservationIsCancelled,
  auditCancellationsAsReservationsForDay,
} from '../reservasUtils'
import { canAlterReservation, PERMISSAO_NEGADA_MSG } from '../envConfig.js'
import CancelarReservaModal from '../components/CancelarReservaModal.jsx'
import UnidadeSelector from '../components/UnidadeSelector.jsx'

export default function RecepcaoCancelar() {
  const {
    allReservations,
    allCarReservations,
    loading,
    carLoading,
    cancelReservationWithAudit,
  } = useReservas()
  const [recepcaoUnidade, setRecepcaoUnidade] = useState(APP_UNIDADE.BRASILIA)
  const [filtroData, setFiltroData] = useState(() => todayISO())
  const [cancelTarget, setCancelTarget] = useState(null)

  const isCarMode = recepcaoUnidade === APP_UNIDADE.CARRO

  const lista = useMemo(() => {
    let base
    if (isCarMode) {
      base = [...allCarReservations].filter((r) => reservationCoversDate(r, filtroData))
    } else {
      const label = sharePointUnidadeFromAppId(recepcaoUnidade)
      base = filterReservasSalasPorUnidadeRecepcao(allReservations, label).filter((r) =>
        reservationCoversDate(r, filtroData),
      )
    }
    const extras = auditCancellationsAsReservationsForDay(filtroData, { carOnly: isCarMode })
    const seen = new Set(base.map((r) => String(r.id)))
    for (const row of extras) {
      if (!seen.has(String(row.id))) {
        base.push(row)
        seen.add(String(row.id))
      }
    }
    return base.sort((a, b) => timeToMinutes(a.horaInicio) - timeToMinutes(b.horaInicio))
  }, [isCarMode, recepcaoUnidade, allReservations, allCarReservations, filtroData])

  return (
    <div className="recepcao-page">
      <header className="recepcao-page__header no-print">
        <h2 className="recepcao-page__heading">Cancelar reserva</h2>
        <p className="recepcao-page__intro">
          Escolha Brasília, São Paulo ou Carro, depois o dia. Localize a reserva e cancele com motivo
          (registo de auditoria).
        </p>
      </header>

      <div className="recepcao-page__panel no-print">
        <div className="recepcao-page__filters-row">
          <div className="recepcao-page__field">
            <label htmlFor="recepcao-cancel-data">Data</label>
            <input
              id="recepcao-cancel-data"
              type="date"
              value={filtroData}
              onChange={(e) => setFiltroData(e.target.value)}
            />
          </div>
          <UnidadeSelector value={recepcaoUnidade} onChange={setRecepcaoUnidade} />
        </div>

        {!isCarMode && loading ? (
          <p className="recepcao-page__empty">A carregar reservas…</p>
        ) : isCarMode && carLoading ? (
          <p className="recepcao-page__empty">A carregar reservas de carro…</p>
        ) : lista.length === 0 ? (
          <p className="recepcao-page__empty">Nenhuma reserva nesta data.</p>
        ) : (
          <ul className="app__modal-list recepcao-page__list">
            {lista.map((r) => {
              const isCar = r.tipoReserva === 'carro'
              const isCancelled = reservationIsCancelled(r)
              return (
                <li
                  key={r.id}
                  className={`app__modal-list-item${isCancelled ? ' app__modal-list-item--cancelada' : ''}`}
                >
                  <div className="app__modal-list-text">
                    <strong>{r.titulo}</strong>
                    {isCancelled ? (
                      <span className="recepcao-page__badge-cancelada"> Cancelada</span>
                    ) : null}
                    <span>
                      {r.horaInicio} – {r.horaFim}
                      {isCar
                        ? ` · ${r.veiculo || 'Carro'}${r.destino?.trim() ? ` · ${r.destino.trim()}` : ''}${r.unidade ? ` · ${r.unidade}` : ''}`
                        : ` · ${r.sala}`}
                      {r.dateFim && r.dateFim !== r.date ? ` · ${r.date} → ${r.dateFim}` : ''}
                    </span>
                    <span className="app__modal-list-sub">{r.solicitante}</span>
                  </div>
                  {isCancelled ? (
                    <span className="recepcao-page__status-cancelada" role="status">
                      —
                    </span>
                  ) : canAlterReservation(r) ? (
                    <button
                      type="button"
                      className="btn-ghost btn-ghost--danger"
                      onClick={() => setCancelTarget(r)}
                    >
                      Cancelar
                    </button>
                  ) : (
                    <span className="recepcao-page__no-perm" role="status">
                      {PERMISSAO_NEGADA_MSG}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {cancelTarget ? (
        <CancelarReservaModal
          reservation={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onConfirm={(payload) => cancelReservationWithAudit(cancelTarget, payload)}
        />
      ) : null}
    </div>
  )
}
