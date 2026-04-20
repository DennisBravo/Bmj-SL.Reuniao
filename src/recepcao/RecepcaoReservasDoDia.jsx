import { useEffect, useMemo, useState } from 'react'
import '../App.css'
import { useReservas } from '../ReservasContext.jsx'
import { timeToMinutes, todayISO, reservationCoversDate, formatShortDateBR } from '../reservasUtils'
import { canAlterReservation, PERMISSAO_NEGADA_MSG } from '../envConfig.js'
import CancelarReservaModal from '../components/CancelarReservaModal.jsx'
import EditarReservaModal from '../components/EditarReservaModal.jsx'

export default function RecepcaoReservasDoDia() {
  const { reservations, loading, updateReservation, cancelReservationWithAudit } = useReservas()
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

  const reservationsForDay = useMemo(
    () => reservations.filter((r) => reservationCoversDate(r, selectedDate)),
    [reservations, selectedDate],
  )

  const sortedDayList = useMemo(() => {
    return [...reservationsForDay].sort(
      (a, b) => timeToMinutes(a.horaInicio) - timeToMinutes(b.horaInicio),
    )
  }, [reservationsForDay])

  return (
    <div className="recepcao-page recepcao-reservas-dia">
      <header className="recepcao-page__header no-print">
        <h2 className="recepcao-page__heading">Reserva do dia</h2>
        <p className="recepcao-page__intro">
          Consulte e faça a gestão das reservas por data (editar ou cancelar).
        </p>
      </header>

      <div className="recepcao-page__panel no-print">
        <div className="recepcao-page__field">
          <label htmlFor="recepcao-dia-data">Data</label>
          <input
            id="recepcao-dia-data"
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </div>

        <section className="panel list-panel recepcao-reservas-dia__lista">
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
                    Tipo:{' '}
                    {String(r.tipoReuniao || '').toLowerCase() === 'externa' ? 'Externa' : 'Interna'}
                    {r.nomeCliente?.trim() &&
                    String(r.tipoReuniao || '').toLowerCase() === 'externa' ? (
                      <>
                        <br />
                        Cliente: {r.nomeCliente.trim()}
                      </>
                    ) : null}
                    <br />
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
                        {r.graphItemId ? (
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
              ))}
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
      {editTarget ? (
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
