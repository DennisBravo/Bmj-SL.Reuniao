import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { appendAudit, loadReservations, saveReservations, isReservationActive } from './reservasUtils'
import { canAlterReservation, normalizeEmail } from './envConfig.js'

const ReservasContext = createContext(null)

const RESERVAS_API_URL = import.meta.env.VITE_RESERVAS_API_URL || '/api/reservas'

/** Item devolvido pelo GET /api/reservas → objeto de reserva da app */
function graphListItemToReservation(item) {
  const f = item.fields || {}
  return {
    id: f.ReservaID || String(item.id),
    titulo: f.Title || '',
    sala: f.NomeSala || '',
    salaId: f.SalaID || '',
    date: f.DataReserva ? f.DataReserva.slice(0, 10) : '',
    dateFim: f.DataReservaFim ? f.DataReservaFim.slice(0, 10) : null,
    horaInicio: f.HoraInicio || '',
    horaFim: f['Hor_x00e1_riodeFim'] || '',
    horaInicioMin: f.HoraInicioMinutos ? Number(f.HoraInicioMinutos) : undefined,
    horaFimMin: f.HoraFimMinutos ? Number(f.HoraFimMinutos) : undefined,
    solicitante: f.NomedoSolicitante || '',
    emailSolicitante: f.EmailSolicitante || '',
    participantes: f.ParticipantesTexto || '',
    observacoes: f.Observacao || '',
    status: f.Status || 'ativo',
    criadoVia: f.CriadoVia || '',
    createdAt: item.createdDateTime || '',
    updatedAt: item.lastModifiedDateTime || '',
    deletedAt: f.DeletadoEm || null,
    deletedByEmail: f.DeletadoPorEmail || null,
    createdByEmail: f.EmailSolicitante || '',
  }
}

/** Preserva soft-delete feito só no cliente após um GET ao servidor */
function mergeLocalCancellations(prevList, serverList) {
  const cancelledById = new Map()
  for (const r of prevList) {
    if (r.deletedAt) {
      cancelledById.set(r.id, { deletedAt: r.deletedAt, deletedByEmail: r.deletedByEmail })
    }
  }
  return serverList.map((r) => {
    const c = cancelledById.get(r.id)
    if (!c) return r
    return { ...r, deletedAt: c.deletedAt, deletedByEmail: c.deletedByEmail }
  })
}

export function ReservasProvider({ children }) {
  const [allReservations, setAllReservations] = useState(() => [])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const reservations = useMemo(
    () => allReservations.filter(isReservationActive),
    [allReservations],
  )

  const loadFromServer = useCallback(
    async ({ useFallbackOnError = true, mergeCancellations = false } = {}) => {
      setError(null)
      setLoading(true)
      try {
        const res = await fetch(RESERVAS_API_URL, { method: 'GET' })
        const text = await res.text()
        let data = {}
        try {
          data = text ? JSON.parse(text) : {}
        } catch {
          data = {}
        }
        if (!res.ok) {
          const msg = data.detail || data.error || `Erro ${res.status} ao carregar reservas.`
          throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
        }
        const items = Array.isArray(data.items) ? data.items : []
        const list = items.map(graphListItemToReservation).filter(Boolean)
        setAllReservations((prev) =>
          mergeCancellations ? mergeLocalCancellations(prev, list) : list,
        )
        return true
      } catch (e) {
        const msg = e.message || 'Não foi possível carregar as reservas.'
        setError(msg)
        if (useFallbackOnError) {
          setAllReservations(loadReservations())
        }
        return false
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await loadFromServer({ useFallbackOnError: true, mergeCancellations: false })
      if (cancelled) return
    })()
    return () => {
      cancelled = true
    }
  }, [loadFromServer])

  useEffect(() => {
    if (loading) return
    saveReservations(allReservations)
  }, [allReservations, loading])

  const clearError = useCallback(() => setError(null), [])

  const reloadReservations = useCallback(
    () => loadFromServer({ useFallbackOnError: true, mergeCancellations: true }),
    [loadFromServer],
  )

  const addReservation = useCallback(
    async (nova) => {
      setError(null)
      setLoading(true)
      try {
        const res = await fetch(RESERVAS_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nova),
        })
        const text = await res.text()
        let data = {}
        try {
          data = text ? JSON.parse(text) : {}
        } catch {
          data = {}
        }
        if (!res.ok) {
          const msg = data.detail || data.error || `Erro ${res.status} ao criar reserva.`
          throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
        }
        const refreshed = await loadFromServer({ useFallbackOnError: false, mergeCancellations: true })
        if (!refreshed) {
          throw new Error('Reserva criada, mas não foi possível atualizar a lista.')
        }
      } catch (e) {
        const msg = e.message || 'Não foi possível criar a reserva.'
        setError(msg)
        throw e
      } finally {
        setLoading(false)
      }
    },
    [loadFromServer],
  )

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
      loading,
      error,
      clearError,
      reloadReservations,
    }),
    [
      reservations,
      allReservations,
      addReservation,
      removeReservation,
      cancelReservationWithAudit,
      loading,
      error,
      clearError,
      reloadReservations,
    ],
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
