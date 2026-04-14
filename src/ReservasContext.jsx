import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { appendAudit, loadReservations, saveReservations, isReservationActive } from './reservasUtils'
import { canAlterReservation, normalizeEmail } from './envConfig.js'

const ReservasContext = createContext(null)

export function ReservasProvider({ children }) {
  const [allReservations, setAllReservations] = useState(loadReservations)

  const reservations = useMemo(
    () => allReservations.filter(isReservationActive),
    [allReservations],
  )

  useEffect(() => {
    saveReservations(allReservations)
  }, [allReservations])

  const addReservation = useCallback((nova) => {
    setAllReservations((prev) => [...prev, nova])
  }, [])

  const removeReservation = useCallback((id) => {
    setAllReservations((prev) => prev.filter((r) => r.id !== id))
  }, [])

  const cancelReservationWithAudit = useCallback((r, { reason, reasonDetail, cancelledBy, cancelledByEmail }) => {
    if (!canAlterReservation(r)) {
      return false
    }
    const now = new Date().toISOString()
    const byEmail = normalizeEmail(cancelledByEmail || '')
    const byLabel = (cancelledBy || '').trim() || 'Recepção'

    setAllReservations((prev) =>
      prev.map((x) =>
        x.id === r.id
          ? {
              ...x,
              deletedAt: now,
              deletedByEmail: byEmail || null,
              updatedAt: now,
            }
          : x,
      ),
    )

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
      canceladoPor: byLabel,
      canceladoPorEmail: byEmail || null,
      deletedAt: now,
      deletedByEmail: byEmail || null,
      at: now,
    })
    return true
  }, [])

  const value = useMemo(
    () => ({
      reservations,
      allReservations,
      addReservation,
      setReservations: setAllReservations,
      removeReservation,
      cancelReservationWithAudit,
    }),
    [reservations, allReservations, addReservation, removeReservation, cancelReservationWithAudit],
  )

  return <ReservasContext.Provider value={value}>{children}</ReservasContext.Provider>
}

/* eslint-disable react-refresh/only-export-components */
export function useReservas() {
  const ctx = useContext(ReservasContext)
  if (!ctx) {
    throw new Error('useReservas deve ser usado dentro de ReservasProvider')
  }
  return ctx
}
/* eslint-enable react-refresh/only-export-components */
