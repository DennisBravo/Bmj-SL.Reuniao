import { useMemo, useState } from 'react'
import { useReservas } from '../ReservasContext.jsx'
import { timeToMinutes, todayISO, reservationCoversDate } from '../reservasUtils'
import { canAlterReservation, PERMISSAO_NEGADA_MSG } from '../envConfig.js'
import CancelarReservaModal from '../components/CancelarReservaModal.jsx'

export default function RecepcaoCancelar() {
  const { reservations, cancelReservationWithAudit } = useReservas()
  const [filtroData, setFiltroData] = useState(() => todayISO())
  const [cancelTarget, setCancelTarget] = useState(null)

  const lista = useMemo(() => {
    return reservations
      .filter((r) => reservationCoversDate(r, filtroData))
      .sort((a, b) => timeToMinutes(a.horaInicio) - timeToMinutes(b.horaInicio))
  }, [reservations, filtroData])

  return (
    <div className="recepcao-page">
      <header className="recepcao-page__header no-print">
        <h2 className="recepcao-page__heading">Cancelar reserva</h2>
        <p className="recepcao-page__intro">
          Escolha o dia, localize a reserva e cancele com motivo (registo de auditoria).
        </p>
      </header>

      <div className="recepcao-page__panel no-print">
        <div className="recepcao-page__field">
          <label htmlFor="recepcao-cancel-data">Data</label>
          <input
            id="recepcao-cancel-data"
            type="date"
            value={filtroData}
            onChange={(e) => setFiltroData(e.target.value)}
          />
        </div>

        {lista.length === 0 ? (
          <p className="recepcao-page__empty">Nenhuma reserva nesta data.</p>
        ) : (
          <ul className="app__modal-list recepcao-page__list">
            {lista.map((r) => (
              <li key={r.id} className="app__modal-list-item">
                <div className="app__modal-list-text">
                  <strong>{r.titulo}</strong>
                  <span>
                    {r.horaInicio} – {r.horaFim} · {r.sala}
                    {r.dateFim && r.dateFim !== r.date ? ` · ${r.date} → ${r.dateFim}` : ''}
                  </span>
                  <span className="app__modal-list-sub">{r.solicitante}</span>
                </div>
                {canAlterReservation(r) ? (
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
            ))}
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
