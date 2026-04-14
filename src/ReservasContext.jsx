import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { appendAudit, loadReservations, saveReservations } from './reservasUtils'

const ReservasContext = createContext(null)

export function ReservasProvider({ children }) {
  const [reservations, setReservations] = useState(loadReservations)

  useEffect(() => {
    saveReservations(reservations)
  }, [reservations])

  const removeReservation = useCallback((id) => {
    setReservations((prev) => prev.filter((r) => r.id !== id))
  }, [])

  const cancelReservationWithAudit = useCallback(
    (r, { reason, reasonDetail, cancelledBy }) => {
      setReservations((prev) => prev.filter((x) => x.id !== r.id))
      appendAudit({
        tipo: 'cancelamento',
        reservaId: r.id,
        titulo: r.titulo,
        sala: r.sala,
        date: r.date,
        dateFim: r.dateFim || null,
        horaInicio: r.horaInicio,
        horaFim: r.horaFim,
        solicitante: r.solicitante,
        motivo: reason,
        motivoDetalhe: reasonDetail || '',
        canceladoPor: cancelledBy || 'Recepção',
        at: new Date().toISOString(),
      })
    },
    [],
  )

  const value = useMemo(
    () => ({
      reservations,
      setReservations,
      removeReservation,
      cancelReservationWithAudit,
    }),
    [reservations, removeReservation, cancelReservationWithAudit],
  )

  return <ReservasContext.Provider value={value}>{children}</ReservasContext.Provider>
}

// Hook exposto junto ao provider (padrão comum em apps pequenos).
/* eslint-disable react-refresh/only-export-components */
export function useReservas() {
  const ctx = useContext(ReservasContext)
  if (!ctx) {
    throw new Error('useReservas deve ser usado dentro de ReservasProvider')
  }
  return ctx
}
/* eslint-enable react-refresh/only-export-components */
