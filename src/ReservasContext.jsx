import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  appendAudit,
  loadReservations,
  saveReservations,
  isReservationActive,
  migrateReservation,
} from './reservasUtils'
import { canAlterReservation, normalizeEmail } from './envConfig.js'

const ReservasContext = createContext(null)

const RESERVAS_API_URL = import.meta.env.VITE_RESERVAS_API_URL || '/api/reservas'

function toDateOnly(v) {
  if (v == null || v === '') return ''
  const s = String(v)
  return s.length >= 10 ? s.slice(0, 10) : s
}

function fieldValue(fields, ...names) {
  for (const name of names) {
    if (fields[name] != null && fields[name] !== '') return fields[name]
    const key = Object.keys(fields).find((k) => k.toLowerCase() === name.toLowerCase())
    if (key != null && fields[key] != null && fields[key] !== '') return fields[key]
  }
  return ''
}

/** Item devolvido pelo GET /api/reservas → objeto de reserva da app */
function graphListItemToReservation(item) {
  const f = item.fields || {}
  const reservaId = String(fieldValue(f, 'ReservaId', 'reservaId') || '').trim()
  const id = reservaId || (item.id != null ? `sp-${item.id}` : '')
  if (!id) return null

  const date = toDateOnly(fieldValue(f, 'DataReserva', 'dataReserva'))
  const dateFimRaw = fieldValue(f, 'DataFim', 'dataFim')
  const dateFim = dateFimRaw ? toDateOnly(dateFimRaw) : ''

  const createdAt =
    item.createdDateTime || fieldValue(f, 'Created', 'created') || new Date().toISOString()
  const updatedAt = item.lastModifiedDateTime || fieldValue(f, 'Modified', 'modified') || createdAt

  return migrateReservation({
    id,
    titulo: String(fieldValue(f, 'Title', 'title') || 'Reserva'),
    sala: String(fieldValue(f, 'Sala', 'sala') || ''),
    date,
    ...(dateFim && dateFim !== date ? { dateFim } : {}),
    horaInicio: String(fieldValue(f, 'HoraInicio', 'horainicio') || ''),
    horaFim: String(fieldValue(f, 'HoraFim', 'horafim') || ''),
    solicitante: String(fieldValue(f, 'Solicitante', 'solicitante') || ''),
    emailSolicitante: String(fieldValue(f, 'EmailSolicitante', 'emailsolicitante') || ''),
    participantes: String(fieldValue(f, 'Participantes', 'participantes') || ''),
    observacoes: String(fieldValue(f, 'Observacoes', 'observacoes') || ''),
    createdByEmail: String(
      fieldValue(f, 'CreatedByEmail', 'createdbyemail', 'emailSolicitante') || '',
    ),
    createdAt,
    updatedAt,
    deletedAt: fieldValue(f, 'DeletedAt', 'deletedat') || null,
    deletedByEmail: fieldValue(f, 'DeletedByEmail', 'deletedbyemail') || null,
  })
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
