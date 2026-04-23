import { useEffect, useMemo, useState } from 'react'
import '../App.css'
import { useReservas } from '../ReservasContext.jsx'
import {
  timeToMinutes,
  todayISO,
  reservationCoversDate,
  formatShortDateBR,
  APP_UNIDADE,
  sharePointUnidadeFromAppId,
  filterReservasSalasPorUnidadeRecepcao,
} from '../reservasUtils'
import { canAlterReservation, PERMISSAO_NEGADA_MSG } from '../envConfig.js'
import CancelarReservaModal from '../components/CancelarReservaModal.jsx'
import EditarReservaModal from '../components/EditarReservaModal.jsx'
import UnidadeSelector from '../components/UnidadeSelector.jsx'

export default function RecepcaoReservasDoDia() {
  const {
    reservations,
    carReservations,
    carLoading,
    loading,
    updateReservation,
    cancelReservationWithAudit,
  } = useReservas()
  const [recepcaoUnidade, setRecepcaoUnidade] = useState(APP_UNIDADE.BRASILIA)
  const [selectedDate, setSelectedDate] = useState(() => todayISO())
  const [cancelTarget, setCancelTarget] = useState(null)
  const [editTarget, setEditTarget] = useState(null)

  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return
      setCancelTarget(null)
      if (!loading) setEditTarget(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [loading])

  const sortedDayList = useMemo(() => {
    if (recepcaoUnidade === APP_UNIDADE.CARRO) {
      return [...carReservations]
        .filter((r) => reservationCoversDate(r, selectedDate))
        .sort((a, b) => timeToMinutes(a.horaInicio) - timeToMinutes(b.horaInicio))
    }
    const label = sharePointUnidadeFromAppId(recepcaoUnidade)
    return filterReservasSalasPorUnidadeRecepcao(reservations, label)
      .filter((r) => reservationCoversDate(r, selectedDate))
      .sort((a, b) => timeToMinutes(a.horaInicio) - timeToMinutes(b.horaInicio))
  }, [recepcaoUnidade, reservations, carReservations, selectedDate])

  const isCarMode = recepcaoUnidade === APP_UNIDADE.CARRO

  return (
    <div className="recepcao-page recepcao-reservas-dia">
      <header className="recepcao-page__header no-print">
        <h2 className="recepcao-page__heading">Reserva do dia</h2>
        <p className="recepcao-page__intro">
          Escolha Brasília, São Paulo ou Carro, depois a data. Consulte e faça a gestão (editar ou
          cancelar).
        </p>
      </header>

      <div className="recepcao-page__panel no-print">
        <div className="recepcao-page__filters-row">
          <div className="recepcao-page__field">
            <label htmlFor="recepcao-dia-data">Data</label>
            <input
              id="recepcao-dia-data"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>
          <UnidadeSelector value={recepcaoUnidade} onChange={setRecepcaoUnidade} />
        </div>

        <section className="panel list-panel recepcao-reservas-dia__lista">
          <h3>
            {isCarMode ? 'Reservas de carro' : 'Reservas de salas'} ({formatShortDateBR(selectedDate)})
          </h3>
          {isCarMode && carLoading ? (
            <p className="empty-state">A carregar reservas de carro…</p>
          ) : sortedDayList.length === 0 ? (
            <p className="empty-state">Nenhuma reserva para esta data.</p>
          ) : (
            <ul className="reservations">
              {sortedDayList.map((r) => {
                const isCar = r.tipoReserva === 'carro'
                return (
                  <li key={r.id} className="reservation-card">
                    <div className="reservation-card__time">
                      {r.horaInicio} – {r.horaFim}
                      {isCar
                        ? ` · ${r.veiculo || 'Carro'}${r.unidade ? ` · ${r.unidade}` : ''}`
                        : ` · ${r.sala}`}
                    </div>
                    <div className="reservation-card__title">{r.titulo}</div>
                    <div className="reservation-card__meta">
                      {isCar ? (
                        <>
                          {r.destino?.trim() ? (
                            <>
                              Destino: {r.destino.trim()}
                              <br />
                            </>
                          ) : null}
                          {r.motivo?.trim() ? (
                            <>
                              Motivo: {r.motivo.trim()}
                              <br />
                            </>
                          ) : null}
                          {r.motorista?.trim() ? (
                            <>
                              Motorista: {r.motorista.trim()}
                              <br />
                            </>
                          ) : null}
                        </>
                      ) : (
                        <>
                          Tipo:{' '}
                          {String(r.tipoReuniao || '').toLowerCase() === 'externa'
                            ? 'Externa'
                            : 'Interna'}
                          {r.nomeCliente?.trim() &&
                          String(r.tipoReuniao || '').toLowerCase() === 'externa' ? (
                            <>
                              <br />
                              Cliente: {r.nomeCliente.trim()}
                            </>
                          ) : null}
                          <br />
                        </>
                      )}
                      Responsável: {r.solicitante}
                      {r.emailSolicitante ? (
                        <>
                          <br />
                          E-mail: {r.emailSolicitante}
                        </>
                      ) : null}
                      {!isCar && r.participantes ? (
                        <>
                          <br />
                          Participantes: {r.participantes.replace(/\n/g, ', ')}
                        </>
                      ) : null}
                      {r.observacoes ? (
                        <>
                          <br />
                          <span className="reservation-card__obs">Observações: {r.observacoes}</span>
                        </>
                      ) : null}
                    </div>
                    <div className="reservation-card__actions">
                      {canAlterReservation(r) ? (
                        <>
                          {!isCar && r.graphItemId ? (
                            <button
                              type="button"
                              className="btn-ghost"
                              onClick={() => setEditTarget(r)}
                            >
                              Editar
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={() => setCancelTarget(r)}
                          >
                            Cancelar reserva
                          </button>
                        </>
                      ) : (
                        <p className="reservation-card__no-perm" role="status">
                          {PERMISSAO_NEGADA_MSG}
                        </p>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      {cancelTarget ? (
        <CancelarReservaModal
          reservation={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onConfirm={(payload) => cancelReservationWithAudit(cancelTarget, payload)}
        />
      ) : null}
      {editTarget && editTarget.tipoReserva !== 'carro' ? (
        <EditarReservaModal
          key={editTarget.id}
          reservation={editTarget}
          reservations={reservations}
          loading={loading}
          onClose={() => setEditTarget(null)}
          onSave={async (payload) => {
            await updateReservation(payload)
          }}
        />
      ) : null}
    </div>
  )
}
