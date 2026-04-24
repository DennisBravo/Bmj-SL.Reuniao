import { useMemo, useState } from 'react'
import '../App.css'
import { useReservas } from '../ReservasContext.jsx'
import {
  APP_UNIDADE,
  sharePointUnidadeFromAppId,
  filterReservasSalasPorUnidadeRecepcao,
  reservationIsCancelled,
  auditAllCancellationsAsReservations,
  formatShortDateBR,
} from '../reservasUtils'
import UnidadeSelector from '../components/UnidadeSelector.jsx'

function cancelledSortKey(r) {
  const d = String(r.deletedAt || '').trim()
  if (d) return d
  return `${r.date || ''}T${r.horaInicio || '00:00'}:00`
}

function mergeApiWithAudit(apiRows, auditRows) {
  const seen = new Set(apiRows.map((x) => String(x.id)))
  const out = [...apiRows]
  for (const row of auditRows) {
    const k = String(row.id)
    if (!seen.has(k)) {
      out.push(row)
      seen.add(k)
    }
  }
  return out.sort((a, b) => cancelledSortKey(b).localeCompare(cancelledSortKey(a)))
}

export default function RecepcaoReservasCanceladas() {
  const { allReservations, allCarReservations, loading, carLoading } = useReservas()
  const [recepcaoUnidade, setRecepcaoUnidade] = useState(APP_UNIDADE.BRASILIA)
  const isCarMode = recepcaoUnidade === APP_UNIDADE.CARRO

  const lista = useMemo(() => {
    if (isCarMode) {
      const api = allCarReservations.filter((r) => reservationIsCancelled(r))
      const audit = auditAllCancellationsAsReservations({ carOnly: true })
      return mergeApiWithAudit(api, audit)
    }
    const label = sharePointUnidadeFromAppId(recepcaoUnidade)
    const api = filterReservasSalasPorUnidadeRecepcao(allReservations, label).filter((r) =>
      reservationIsCancelled(r),
    )
    const audit = auditAllCancellationsAsReservations({ carOnly: false })
    return mergeApiWithAudit(api, audit)
  }, [isCarMode, recepcaoUnidade, allReservations, allCarReservations])

  return (
    <div className="recepcao-page recepcao-reservas-canceladas">
      <header className="recepcao-page__header no-print">
        <h2 className="recepcao-page__heading">Reservas canceladas</h2>
        <p className="recepcao-page__intro">
          Lista de todas as reservas com estado cancelado para a unidade selecionada, incluindo
          registos da auditoria local quando o SharePoint ainda não reflete o cancelamento.
        </p>
      </header>

      <div className="recepcao-page__panel no-print">
        <div className="recepcao-page__filters-row">
          <UnidadeSelector value={recepcaoUnidade} onChange={setRecepcaoUnidade} />
        </div>

        {!isCarMode && loading ? (
          <p className="recepcao-page__empty">A carregar reservas…</p>
        ) : isCarMode && carLoading ? (
          <p className="recepcao-page__empty">A carregar reservas de carro…</p>
        ) : lista.length === 0 ? (
          <p className="recepcao-page__empty">Nenhuma reserva cancelada para esta unidade.</p>
        ) : (
          <div className="recepcao-canceladas__scroll" role="region" aria-label="Reservas canceladas">
            <table className="recepcao-canceladas__table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Horário</th>
                  <th>Título</th>
                  <th>{isCarMode ? 'Destino / veículo' : 'Sala'}</th>
                  <th>Solicitante</th>
                  <th>Cancelado</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((r) => {
                  const isCar = r.tipoReserva === 'carro'
                  const dataLabel =
                    r.dateFim && r.dateFim !== r.date
                      ? `${formatShortDateBR(r.date)} → ${formatShortDateBR(r.dateFim)}`
                      : formatShortDateBR(r.date)
                  const extraCar = isCar
                    ? [r.veiculo, r.destino, r.unidade].filter((x) => String(x || '').trim()).join(' · ')
                    : ''
                  return (
                    <tr key={r.id}>
                      <td>{dataLabel || '—'}</td>
                      <td>
                        {r.horaInicio || '—'} – {r.horaFim || '—'}
                      </td>
                      <td>{r.titulo || '—'}</td>
                      <td>{isCar ? extraCar || '—' : r.sala || '—'}</td>
                      <td>{r.solicitante || '—'}</td>
                      <td className="recepcao-canceladas__cell-muted">
                        {formatShortDateBR(String(r.deletedAt || '').slice(0, 10)) || '—'}
                        {r.observacoes ? (
                          <span className="recepcao-canceladas__obs" title={r.observacoes}>
                            {' '}
                            · {r.observacoes.length > 48 ? `${r.observacoes.slice(0, 48)}…` : r.observacoes}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
