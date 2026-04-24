import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  appendAudit,
  loadReservations,
  saveReservations,
  isReservationActive,
  CARRO_CONFLICT_SALA_KEY,
} from './reservasUtils'
import { canAlterReservation, normalizeEmail } from './envConfig.js'

const ReservasContext = createContext(null)

const RESERVAS_API_URL = import.meta.env.VITE_RESERVAS_API_URL || '/api/reservas'
const CARROS_API_URL = import.meta.env.VITE_CARROS_API_URL || '/api/carros-reservas'

function emailFromSharePointFields(f) {
  if (!f || typeof f !== 'object') return ''
  const v =
    f.EmailSolicitante ||
    f.Email_x0020_Solicitante ||
    f.EmaildoSolicitante ||
    ''
  return typeof v === 'string' ? v : String(v ?? '')
}

/** Item devolvido pelo GET /api/reservas → objeto de reserva da app */
function graphListItemToReservation(item) {
  const f = item.fields || {}
  const email = emailFromSharePointFields(f)
  const tipoRaw = (f.TipoReuniao != null ? String(f.TipoReuniao) : '').trim().toLowerCase()
  const tipoReuniao = tipoRaw === 'externa' ? 'externa' : 'interna'
  return {
    graphItemId: String(item.id),
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
    emailSolicitante: email,
    tipoReuniao,
    nomeCliente: f.NomeCliente != null ? String(f.NomeCliente).trim() : '',
    participantes: f.ParticipantesTexto || '',
    observacoes: f.Observacao || '',
    unidade: f.Unidade != null ? String(f.Unidade).trim() : '',
    status: f.Status || 'ativo',
    criadoVia: f.CriadoVia || '',
    createdAt: item.createdDateTime || '',
    updatedAt: item.lastModifiedDateTime || '',
    deletedAt: (() => {
      const st = (f.Status != null ? String(f.Status) : '').trim().toLowerCase()
      if (f.DeletadoEm) return f.DeletadoEm
      if (st === 'cancelado' || st === 'inativo') {
        return item.lastModifiedDateTime || new Date().toISOString()
      }
      return null
    })(),
    deletedByEmail: f.DeletadoPorEmail || null,
    createdByEmail: email,
  }
}

/** Item da lista CarrosReserva_BMJ → objeto usado na app (conflitos via `sala` fixa). */
function graphListItemToCarReservation(item) {
  const f = item.fields || {}
  const email = emailFromSharePointFields(f)
  const st = (f.Status != null ? String(f.Status) : 'ativo').trim().toLowerCase()
  const soft =
    f.DeletadoEm ||
    (st === 'cancelado' || st === 'inativo' ? item.lastModifiedDateTime || new Date().toISOString() : null)
  return {
    graphItemId: String(item.id),
    id: f.ReservaID || String(item.id),
    tipoReserva: 'carro',
    sala: CARRO_CONFLICT_SALA_KEY,
    date: f.DataReserva ? f.DataReserva.slice(0, 10) : '',
    dateFim: null,
    horaInicio: f.HoraInicio || '',
    horaFim: f.HoraFim || f['Hor_x00e1_riodeFim'] || '',
    titulo: f.Title || '',
    destino: f.Destino != null ? String(f.Destino).trim() : '',
    motivo: f.Motivo != null ? String(f.Motivo).trim() : '',
    solicitante: f.NomedoSolicitante || '',
    emailSolicitante: email,
    observacoes: f.Observacao || '',
    veiculo: f.Veiculo != null ? String(f.Veiculo).trim() : '',
    motorista: f.Motorista != null ? String(f.Motorista).trim() : '',
    status: f.Status || 'ativo',
    criadoVia: f.CriadoVia || '',
    createdAt: item.createdDateTime || '',
    updatedAt: item.lastModifiedDateTime || '',
    deletedAt: soft || null,
    deletedByEmail: f.DeletadoPorEmail || null,
    createdByEmail: email,
    unidade: f.Unidade != null ? String(f.Unidade).trim() : '',
  }
}

/** Lista já mapeada (GET) → id Graph do item, por `ReservaID`/id da app ou pelo próprio id Graph. */
function resolveGraphItemIdFromMappedList(r, list) {
  const rid = String(r?.id ?? '').trim()
  if (!rid || !Array.isArray(list)) return ''
  for (const x of list) {
    if (!x) continue
    const gid = String(x.graphItemId ?? '').trim()
    if (!gid) continue
    const xid = String(x.id ?? '').trim()
    if (xid === rid || gid === rid) return gid
  }
  return ''
}

async function fetchSalasMappedFromApi(apiUrl) {
  const res = await fetch(apiUrl, { method: 'GET' })
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
  return items.map(graphListItemToReservation).filter(Boolean)
}

async function fetchCarsMappedFromApi(apiUrl) {
  const res = await fetch(apiUrl, { method: 'GET' })
  const text = await res.text()
  let data = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = {}
  }
  if (!res.ok) {
    const msg = data.detail || data.error || `Erro ${res.status} ao carregar reservas de carro.`
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }
  const items = Array.isArray(data.items) ? data.items : []
  return items.map(graphListItemToCarReservation).filter(Boolean)
}

/** Preserva soft-delete feito só no cliente após um GET ao servidor */
function mergeLocalCancellations(prevList, serverList) {
  const cancelledById = new Map()
  const cancelledByGraphId = new Map()
  for (const r of prevList) {
    if (r.deletedAt) {
      const meta = { deletedAt: r.deletedAt, deletedByEmail: r.deletedByEmail }
      cancelledById.set(r.id, meta)
      if (r.graphItemId != null && String(r.graphItemId).trim() !== '') {
        cancelledByGraphId.set(String(r.graphItemId).trim(), meta)
      }
    }
  }
  return serverList.map((r) => {
    let c = cancelledById.get(r.id)
    if (!c && r.graphItemId != null) {
      c = cancelledByGraphId.get(String(r.graphItemId).trim())
    }
    if (!c) return r
    return { ...r, deletedAt: c.deletedAt, deletedByEmail: c.deletedByEmail }
  })
}

export function ReservasProvider({ children }) {
  const [allReservations, setAllReservations] = useState(() => [])
  const [allCarReservations, setAllCarReservations] = useState(() => [])
  const [loading, setLoading] = useState(true)
  const [carLoading, setCarLoading] = useState(true)
  const [error, setError] = useState(null)
  const [carError, setCarError] = useState(null)

  const reservations = useMemo(
    () => allReservations.filter(isReservationActive),
    [allReservations],
  )

  const carReservations = useMemo(
    () => allCarReservations.filter(isReservationActive),
    [allCarReservations],
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

  const loadCarReservationsFromServer = useCallback(async () => {
    setCarError(null)
    setCarLoading(true)
    try {
      const res = await fetch(CARROS_API_URL, { method: 'GET' })
      const text = await res.text()
      let data = {}
      try {
        data = text ? JSON.parse(text) : {}
      } catch {
        data = {}
      }
      if (!res.ok) {
        const msg = data.detail || data.error || `Erro ${res.status} ao carregar reservas de carro.`
        throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
      }
      const items = Array.isArray(data.items) ? data.items : []
      setAllCarReservations(items.map(graphListItemToCarReservation).filter(Boolean))
      return true
    } catch (e) {
      const msg = e.message || 'Não foi possível carregar reservas de carro.'
      setCarError(msg)
      setAllCarReservations([])
      return false
    } finally {
      setCarLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await loadCarReservationsFromServer()
      if (cancelled) return
    })()
    return () => {
      cancelled = true
    }
  }, [loadCarReservationsFromServer])

  useEffect(() => {
    if (loading) return
    saveReservations(allReservations)
  }, [allReservations, loading])

  const clearError = useCallback(() => setError(null), [])
  const clearCarError = useCallback(() => setCarError(null), [])

  const reloadReservations = useCallback(
    () => loadFromServer({ useFallbackOnError: true, mergeCancellations: true }),
    [loadFromServer],
  )

  const updateReservation = useCallback(
    async (payload) => {
      setError(null)
      setLoading(true)
      try {
        const res = await fetch(RESERVAS_API_URL, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, _patch: true }),
        })
        const text = await res.text()
        let data = {}
        try {
          data = text ? JSON.parse(text) : {}
        } catch {
          data = {}
        }
        if (!res.ok) {
          const msg = data.detail || data.error || `Erro ${res.status} ao atualizar reserva.`
          throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
        }
        const refreshed = await loadFromServer({ useFallbackOnError: false, mergeCancellations: true })
        if (!refreshed) {
          throw new Error('Reserva atualizada, mas não foi possível recarregar a lista.')
        }
      } catch (e) {
        const msg = e.message || 'Não foi possível atualizar a reserva.'
        setError(msg)
        throw e
      } finally {
        setLoading(false)
      }
    },
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

  const addCarReservation = useCallback(
    async (nova) => {
      setCarError(null)
      setCarLoading(true)
      try {
        const res = await fetch(CARROS_API_URL, {
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
          const msg = data.detail || data.error || `Erro ${res.status} ao criar reserva de carro.`
          throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
        }
        const ok = await loadCarReservationsFromServer()
        if (!ok) {
          throw new Error('Reserva criada, mas não foi possível recarregar a lista de carros.')
        }
      } catch (e) {
        const msg = e.message || 'Não foi possível criar a reserva de carro.'
        setCarError(msg)
        throw e
      } finally {
        setCarLoading(false)
      }
    },
    [loadCarReservationsFromServer],
  )

  const updateCarReservation = useCallback(
    async (payload) => {
      setCarError(null)
      setCarLoading(true)
      try {
        const res = await fetch(CARROS_API_URL, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, _patch: true }),
        })
        const text = await res.text()
        let data = {}
        try {
          data = text ? JSON.parse(text) : {}
        } catch {
          data = {}
        }
        if (!res.ok) {
          const msg = data.detail || data.error || `Erro ${res.status} ao atualizar reserva de carro.`
          throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
        }
        const refreshed = await loadCarReservationsFromServer()
        if (!refreshed) {
          throw new Error('Reserva atualizada, mas não foi possível recarregar a lista de carros.')
        }
      } catch (e) {
        const msg = e.message || 'Não foi possível atualizar a reserva de carro.'
        setCarError(msg)
        throw e
      } finally {
        setCarLoading(false)
      }
    },
    [loadCarReservationsFromServer],
  )

  const removeReservation = useCallback((id) => {
    setAllReservations((prev) => prev.filter((r) => r.id !== id))
  }, [])

  const cancelReservationWithAudit = useCallback(
    async (r, { reason, reasonDetail, cancelledBy, cancelledByEmail }) => {
      if (!canAlterReservation(r)) {
        return false
      }
      const now = new Date().toISOString()
      const byEmail = normalizeEmail(cancelledByEmail || '')
      const byLabel = (cancelledBy || '').trim() || 'Recepção'
      const isCar = r && r.tipoReserva === 'carro'

      let graphItemId = String(r.graphItemId ?? '').trim()
      if (!graphItemId) {
        try {
          const list = isCar
            ? await fetchCarsMappedFromApi(CARROS_API_URL)
            : await fetchSalasMappedFromApi(RESERVAS_API_URL)
          graphItemId = resolveGraphItemIdFromMappedList(r, list)
        } catch {
          graphItemId = ''
        }
      }

      /** PATCH mínimo no SharePoint: só `Status` (item permanece na lista). `deletedAt` vem do GET após reload. */
      const patchBody = {
        graphItemId: graphItemId || undefined,
        _patch: true,
        fields: { Status: 'Cancelado' },
      }

      try {
        if (isCar) {
          if (!graphItemId) {
            setAllCarReservations((prev) =>
              prev.map((x) =>
                x.id === r.id
                  ? {
                      ...x,
                      deletedAt: now,
                      deletedByEmail: byEmail || null,
                      status: 'Cancelado',
                      updatedAt: now,
                    }
                  : x,
              ),
            )
          } else {
            await updateCarReservation(patchBody)
          }
        } else if (!graphItemId) {
          setAllReservations((prev) =>
            prev.map((x) =>
              x.id === r.id
                ? {
                    ...x,
                    deletedAt: now,
                    deletedByEmail: byEmail || null,
                    status: 'Cancelado',
                    updatedAt: now,
                  }
                : x,
            ),
          )
        } else {
          await updateReservation(patchBody)
        }
      } catch (e) {
        throw e instanceof Error ? e : new Error(String(e))
      }

      appendAudit({
        tipo: 'cancelamento',
        origem: isCar ? 'carro' : 'salas',
        reservaId: r.id,
        titulo: r.titulo,
        sala: r.sala,
        destino: r.destino || null,
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
    },
    [updateReservation, updateCarReservation],
  )

  const value = useMemo(
    () => ({
      reservations,
      allReservations,
      addReservation,
      updateReservation,
      setReservations: setAllReservations,
      removeReservation,
      cancelReservationWithAudit,
      loading,
      error,
      clearError,
      reloadReservations,
      carReservations,
      allCarReservations,
      addCarReservation,
      carLoading,
      carError,
      clearCarError,
      reloadCarReservations: loadCarReservationsFromServer,
    }),
    [
      reservations,
      allReservations,
      addReservation,
      updateReservation,
      removeReservation,
      cancelReservationWithAudit,
      loading,
      error,
      clearError,
      reloadReservations,
      carReservations,
      allCarReservations,
      addCarReservation,
      carLoading,
      carError,
      clearCarError,
      loadCarReservationsFromServer,
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
