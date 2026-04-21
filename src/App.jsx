import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  SALAS,
  SLOT_MINUTES,
  DAY_START_MIN,
  DAY_END_MIN,
  timeToMinutes,
  minutesToTime,
  buildGridTimeSlots,
  isValidEmail,
  todayISO,
  reservationCoversDate,
  findReservationConflictRange,
  findReservationForSlot,
  reservationQuickSummaryLine,
  validateParticipantesEmailsOnly,
  reservationTipoReuniao,
  participantesResumoLabel,
  clientesResumoLabel,
  APP_UNIDADE,
  sharePointUnidadeFromAppId,
  filterReservasPorUnidade,
  isMultiusoSlotBlocked,
  findMultiusoBloqueioRange,
  salaNomeGradeExibicao,
  capacidadeQtdPessoasExibicao,
} from './reservasUtils'
import { useReservas } from './ReservasContext.jsx'
import BmjLogo from './components/BmjLogo.jsx'
import ReservaSlotDetalheModal from './components/ReservaSlotDetalheModal.jsx'
import { M365EmailAutocomplete, M365ParticipantesAutocomplete } from './components/M365UserAutocompleteFields.jsx'
import ReservaFormTextModal from './components/ReservaFormTextModal.jsx'
import UnidadeSelector from './components/UnidadeSelector.jsx'
import ReservaCarroView from './components/ReservaCarroView.jsx'
import { getCurrentUserEmail, normalizeEmail } from './envConfig.js'
import { notifyTeamsNewReservationWithNotes } from './teamsWebhook.js'
import './App.css'

const TIME_SLOTS = buildGridTimeSlots()

const SALAS_CATALOGO_API =
  import.meta.env.VITE_SALAS_CATALOGO_API_URL || import.meta.env.VITE_SALAS_CATALOG_API_URL || '/api/salas-catalogo'

/** Desloca a logo para a esquerda (px). Negativo = esquerda. ~113px ≈ 3cm em ecrã típico. */
const HEADER_LOGO_SHIFT_X_PX = -266

export default function App() {
  const {
    reservations,
    addReservation,
    loading,
    error,
    clearError,
    carReservations,
    addCarReservation,
    carLoading,
    carError,
    clearCarError,
  } = useReservas()

  const [appUnidade, setAppUnidade] = useState(APP_UNIDADE.BRASILIA)
  const [salasCatalog, setSalasCatalog] = useState(null)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState('')

  const [form, setForm] = useState({
    sala: SALAS[0],
    horaInicio: '09:00',
    horaFim: '10:00',
    dataInicio: todayISO(),
    dataFim: todayISO(),
    titulo: '',
    solicitante: '',
    emailSolicitante: '',
    participantes: '',
    observacoes: '',
    tipoReuniao: '',
    nomeCliente: '',
  })
  const [formError, setFormError] = useState('')
  const [fieldHighlight, setFieldHighlight] = useState({
    tipo: false,
    nomeCliente: false,
    participantes: false,
  })
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [detalheReserva, setDetalheReserva] = useState(null)
  const [slotHoverPreview, setSlotHoverPreview] = useState(null)
  const hoverHideTimerRef = useRef(null)
  const prevTipoReuniaoRef = useRef(form.tipoReuniao)

  const [participantesModalOpen, setParticipantesModalOpen] = useState(false)
  const [participantesDraft, setParticipantesDraft] = useState('')
  const [participantesModalError, setParticipantesModalError] = useState('')

  const [clienteModalOpen, setClienteModalOpen] = useState(false)
  const [clienteDraft, setClienteDraft] = useState('')

  const cancelHoverHide = useCallback(() => {
    if (hoverHideTimerRef.current) {
      window.clearTimeout(hoverHideTimerRef.current)
      hoverHideTimerRef.current = null
    }
  }, [])

  const scheduleHoverHide = useCallback(() => {
    cancelHoverHide()
    hoverHideTimerRef.current = window.setTimeout(() => {
      setSlotHoverPreview(null)
      hoverHideTimerRef.current = null
    }, 240)
  }, [cancelHoverHide])

  useEffect(() => () => cancelHoverHide(), [cancelHoverHide])

  useEffect(() => {
    if (!saveSuccess) return
    const t = window.setTimeout(() => setSaveSuccess(false), 5000)
    return () => window.clearTimeout(t)
  }, [saveSuccess])

  const salasNomes = useMemo(() => {
    if (appUnidade === APP_UNIDADE.CARRO) return []
    if (Array.isArray(salasCatalog) && salasCatalog.length > 0) {
      return salasCatalog
        .map((x) => (typeof x === 'string' ? x : String(x.nome || '').trim()))
        .filter(Boolean)
    }
    if (appUnidade === APP_UNIDADE.BRASILIA) return [...SALAS]
    return []
  }, [appUnidade, salasCatalog])

  const unidadeSpLabel = sharePointUnidadeFromAppId(appUnidade)

  const reservationsConflictScope = useMemo(() => {
    if (appUnidade === APP_UNIDADE.CARRO) return []
    return reservations.filter((r) => {
      const u = String(r.unidade || '').trim()
      if (!u) return true
      return u === unidadeSpLabel
    })
  }, [reservations, appUnidade, unidadeSpLabel])

  const reservationsForGrid = useMemo(() => {
    if (appUnidade === APP_UNIDADE.CARRO) return []
    const byUnit = filterReservasPorUnidade(reservations, salasNomes, unidadeSpLabel)
    return byUnit.filter((r) => reservationCoversDate(r, form.dataInicio))
  }, [reservations, salasNomes, unidadeSpLabel, form.dataInicio, appUnidade])

  const getSlotReservation = useCallback(
    (sala, slotStart, slotEnd) =>
      findReservationForSlot(reservationsForGrid, sala, slotStart, slotEnd),
    [reservationsForGrid],
  )

  const qtdCapacidadePorSala = useMemo(() => {
    const map = new Map()
    for (const sala of salasNomes) {
      map.set(sala, capacidadeQtdPessoasExibicao(sala, appUnidade))
    }
    return map
  }, [salasNomes, appUnidade])

  useEffect(() => {
    if (appUnidade === APP_UNIDADE.CARRO) {
      setSalasCatalog(null)
      setCatalogError('')
      setCatalogLoading(false)
      return
    }
    let cancelled = false
    const label = sharePointUnidadeFromAppId(appUnidade)
    setCatalogLoading(true)
    setCatalogError('')
    ;(async () => {
      try {
        const res = await fetch(`${SALAS_CATALOGO_API}?unidade=${encodeURIComponent(label)}`)
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(
            typeof data.detail === 'string'
              ? data.detail
              : typeof data.error === 'string'
                ? data.error
                : `Erro ${res.status}`,
          )
        }
        const list = Array.isArray(data.salas) ? data.salas : []
        if (!cancelled) {
          setSalasCatalog(list)
          if (list.length === 0) {
            setCatalogError(`Nenhuma sala no catálogo para «${label}». Verifique a lista SharePoint.`)
          }
        }
      } catch (e) {
        if (!cancelled) {
          setCatalogError(e.message || 'Não foi possível carregar o catálogo de salas.')
          setSalasCatalog([])
        }
      } finally {
        if (!cancelled) setCatalogLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [appUnidade])

  useEffect(() => {
    if (appUnidade === APP_UNIDADE.CARRO) return
    if (!salasNomes.length) return
    setForm((f) => (salasNomes.includes(f.sala) ? f : { ...f, sala: salasNomes[0] }))
  }, [salasNomes, appUnidade])

  useEffect(() => {
    setSlotHoverPreview(null)
    cancelHoverHide()
    setDetalheReserva(null)
  }, [form.dataInicio, cancelHoverHide])

  /** Ao escolher «Externa», abre o modal de clientes (rascunho = valor actual). */
  useEffect(() => {
    const prev = prevTipoReuniaoRef.current
    prevTipoReuniaoRef.current = form.tipoReuniao
    if (form.tipoReuniao !== 'externa' || prev === 'externa') return
    setClienteDraft(form.nomeCliente)
    setClienteModalOpen(true)
  }, [form.tipoReuniao, form.nomeCliente])

  useEffect(() => {
    if (!participantesModalOpen && !clienteModalOpen) return
    function onKeyDown(e) {
      if (e.key !== 'Escape') return
      if (participantesModalOpen) {
        setParticipantesModalOpen(false)
        setParticipantesModalError('')
        return
      }
      if (clienteModalOpen) setClienteModalOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [participantesModalOpen, clienteModalOpen])

  function handleBusySlotEnter(e, res) {
    cancelHoverHide()
    const rect = e.currentTarget.getBoundingClientRect()
    setSlotHoverPreview({
      reservation: res,
      left: rect.left + rect.width / 2,
      top: rect.bottom + 6,
    })
  }

  function handleBusySlotClick(e, res) {
    e.preventDefault()
    e.stopPropagation()
    cancelHoverHide()
    setSlotHoverPreview(null)
    setDetalheReserva(res)
  }

  function updateField(key, value) {
    setForm((f) => {
      const next = { ...f, [key]: value }
      if (key === 'tipoReuniao' && value === 'interna') next.nomeCliente = ''
      if (key === 'dataInicio') {
        const di = String(value).trim()
        const df = (next.dataFim || '').trim()
        if (!df) next.dataFim = di
        else if (df < di) next.dataFim = di
      }
      return next
    })
    setFormError('')
    setSaveSuccess(false)
    clearError()
    setFieldHighlight((h) => ({
      ...h,
      ...(key === 'tipoReuniao' ? { tipo: false } : {}),
      ...(key === 'nomeCliente' ? { nomeCliente: false } : {}),
      ...(key === 'participantes' ? { participantes: false } : {}),
    }))
  }

  function openParticipantesModal() {
    setParticipantesDraft(form.participantes)
    setParticipantesModalError('')
    setParticipantesModalOpen(true)
  }

  function confirmParticipantesModal() {
    const check = validateParticipantesEmailsOnly(participantesDraft)
    if (!check.ok) {
      setParticipantesModalError(check.error)
      return
    }
    updateField('participantes', participantesDraft)
    setParticipantesModalOpen(false)
    setParticipantesModalError('')
  }

  function cancelParticipantesModal() {
    setParticipantesModalOpen(false)
    setParticipantesModalError('')
  }

  function openClienteModal() {
    setClienteDraft(form.nomeCliente)
    setClienteModalOpen(true)
  }

  function confirmClienteModal() {
    updateField('nomeCliente', clienteDraft)
    setClienteModalOpen(false)
  }

  function cancelClienteModal() {
    setClienteModalOpen(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    setSaveSuccess(false)
    clearError()
    setFieldHighlight({ tipo: false, nomeCliente: false, participantes: false })

    if (form.tipoReuniao !== 'interna' && form.tipoReuniao !== 'externa') {
      setFormError('Selecione o tipo de reunião (interna ou externa) antes de continuar.')
      setFieldHighlight((h) => ({ ...h, tipo: true }))
      return
    }
    if (form.tipoReuniao === 'externa' && !form.nomeCliente.trim()) {
      setFormError('Informe o cliente.')
      setFieldHighlight((h) => ({ ...h, nomeCliente: true }))
      return
    }
    const partCheck = validateParticipantesEmailsOnly(form.participantes)
    if (!partCheck.ok) {
      setFormError(partCheck.error)
      setFieldHighlight((h) => ({ ...h, participantes: true }))
      return
    }

    const titulo = form.titulo.trim()
    const solicitante = form.solicitante.trim()
    const emailSolicitante = form.emailSolicitante.trim()
    if (!titulo) {
      setFormError('Informe o título da reunião.')
      return
    }
    if (!solicitante) {
      setFormError('Informe o solicitante.')
      return
    }
    if (!emailSolicitante) {
      setFormError('Informe o e-mail do solicitante.')
      return
    }
    if (!isValidEmail(emailSolicitante)) {
      setFormError('Digite um e-mail válido (ex.: nome@empresa.com.br).')
      return
    }

    const startMin = timeToMinutes(form.horaInicio)
    const endMin = timeToMinutes(form.horaFim)
    if (Number.isNaN(startMin) || Number.isNaN(endMin)) {
      setFormError('Horários inválidos. Use o formato HH:MM.')
      return
    }
    if (startMin < DAY_START_MIN || endMin > DAY_END_MIN) {
      setFormError(
        `Reservas só podem ser entre ${minutesToTime(DAY_START_MIN)} e ${minutesToTime(DAY_END_MIN)}.`,
      )
      return
    }

    const dataInicio = (form.dataInicio || '').trim()
    if (!dataInicio) {
      setFormError('Informe a data de início.')
      return
    }
    const dataFimRaw = (form.dataFim || '').trim()
    const dataFim = dataFimRaw || dataInicio
    if (dataFim < dataInicio) {
      setFormError('A data fim não pode ser anterior à data de início.')
      return
    }

    const multiusoMsg = findMultiusoBloqueioRange(form.sala, dataInicio, dataFim, startMin, endMin)
    if (multiusoMsg) {
      setFormError(multiusoMsg)
      return
    }

    const conflict = findReservationConflictRange(
      form.sala,
      dataInicio,
      dataFim,
      startMin,
      endMin,
      reservationsConflictScope,
      null,
    )
    if (conflict) {
      setFormError(conflict)
      return
    }

    const now = new Date().toISOString()
    const createdByEmail =
      normalizeEmail(getCurrentUserEmail() || emailSolicitante) || normalizeEmail(emailSolicitante)
    const observacoes = form.observacoes.trim()
    const participantesNorm = partCheck.emails.join('\n')
    const novo = {
      id: crypto.randomUUID(),
      sala: form.sala,
      unidade: unidadeSpLabel,
      date: dataInicio,
      ...(dataFim !== dataInicio ? { dateFim: dataFim } : {}),
      horaInicio: form.horaInicio,
      horaFim: form.horaFim,
      titulo,
      solicitante,
      emailSolicitante,
      tipoReuniao: form.tipoReuniao,
      ...(form.tipoReuniao === 'externa' ? { nomeCliente: form.nomeCliente.trim() } : {}),
      participantes: participantesNorm,
      observacoes,
      criadoEm: now,
      createdAt: now,
      updatedAt: now,
      createdByEmail,
      deletedAt: null,
      deletedByEmail: null,
    }
    try {
      await addReservation(novo)
      void notifyTeamsNewReservationWithNotes({
        sala: novo.sala,
        date: novo.date,
        dateFim: novo.dateFim,
        horaInicio: novo.horaInicio,
        horaFim: novo.horaFim,
        solicitante: novo.solicitante,
        participantes: novo.participantes,
        observacoes: novo.observacoes,
        tipoReuniao: novo.tipoReuniao,
        nomeCliente: novo.nomeCliente,
      })
      setForm((f) => ({
        ...f,
        titulo: '',
        participantes: '',
        observacoes: '',
        tipoReuniao: '',
        nomeCliente: '',
      }))
      setSaveSuccess(true)
    } catch {
      setFormError('Não foi possível guardar a reserva. Tente novamente ou verifique a ligação ao servidor.')
    }
  }

  const isCarro = appUnidade === APP_UNIDADE.CARRO
  const pageTitle = isCarro ? 'Reserva de carro' : 'Reserva de salas'

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__header-row">
          <div
            className="app__header-logo app__header-grid-logo"
            style={{ transform: `translateX(${HEADER_LOGO_SHIFT_X_PX}px)` }}
          >
            <BmjLogo />
          </div>
          <nav className="app__header-top-right app__header-grid-nav" aria-label="Navegação principal">
            <NavLink
              to="/recepcao"
              className={({ isActive }) =>
                `app__user-chip app__rececao-link${isActive ? ' app__user-chip--open' : ''}`
              }
              title="Admin Center — mapa semanal, cancelamentos e relatórios"
            >
              <span className="app__user-chip-label">Admin Center</span>
            </NavLink>
          </nav>

          <h1 className="app__title app__header-grid-title">{pageTitle}</h1>
          {!isCarro ? (
            <div className="app__date app__date--title-row app__header-grid-date">
              <label htmlFor="dia">Data início</label>
              <input
                id="dia"
                type="date"
                value={form.dataInicio}
                onChange={(e) => updateField('dataInicio', e.target.value)}
              />
            </div>
          ) : (
            <div className="app__header-grid-date" aria-hidden="true" />
          )}

          <p className="app__subtitle app__header-grid-subtitle">
            {isCarro
              ? 'Reserve o veículo institucional no horário disponível.'
              : 'Escolha a unidade, consulte a grade e evite conflitos de horário.'}
          </p>
          {loading && reservations.length === 0 ? (
            <p className="app__subtitle app__header-grid-subtitle app__sync-hint" aria-live="polite">
              A carregar reservas…
            </p>
          ) : null}
          {!isCarro && catalogLoading ? (
            <p className="app__subtitle app__header-grid-subtitle app__sync-hint" aria-live="polite">
              A carregar catálogo de salas…
            </p>
          ) : null}
          {!isCarro && catalogError ? (
            <div className="form__error app__context-alert" role="alert" style={{ maxWidth: 560, marginTop: 8 }}>
              {catalogError}
            </div>
          ) : null}
          {error ? (
            <div
              className="form__error app__context-alert"
              role="alert"
              style={{ maxWidth: 560, marginTop: 8 }}
            >
              <span>{error}</span>{' '}
              <button type="button" className="btn-ghost" onClick={clearError}>
                Fechar
              </button>
            </div>
          ) : null}
        </div>
        <div className="app__header-unidade">
          <UnidadeSelector value={appUnidade} onChange={setAppUnidade} disabled={false} />
        </div>
      </header>

      {isCarro ? (
        <div className="app__layout app__layout--carro">
          <ReservaCarroView
            carReservations={carReservations}
            addCarReservation={addCarReservation}
            carLoading={carLoading}
            carError={carError}
            clearCarError={clearCarError}
          />
        </div>
      ) : (
      <div className="app__layout">
          <section className="panel panel--grid">
            <h2 className="panel__title">Disponibilidade por sala e horário</h2>
            <div className="legend">
              <span className="legend__item">
                <span className="legend__swatch legend__swatch--free" aria-hidden />
                Disponível
              </span>
              <span className="legend__item">
                <span className="legend__swatch legend__swatch--interna" aria-hidden />
                Interna
              </span>
              <span className="legend__item">
                <span className="legend__swatch legend__swatch--externa" aria-hidden />
                Externa
              </span>
              <span className="legend__item">
                <span className="legend__swatch legend__swatch--blocked-lunch" aria-hidden />
                Bloqueado (Espaço Multiuso 11h30–14h, dias úteis)
              </span>
              <span className="legend__item">Slots de {SLOT_MINUTES} min</span>
            </div>
            <div className="grid-wrap">
              {!salasNomes.length && !catalogLoading ? (
                <p className="hint" style={{ margin: '12px 0' }}>
                  Não há salas para mostrar nesta unidade. Verifique o catálogo SharePoint ou a ligação à API.
                </p>
              ) : null}
              <table className="availability-grid">
                <thead>
                  <tr className="availability-grid__head-row-primary">
                    <th className="room-head availability-grid__head-salas availability-grid__head-title" rowSpan={2} scope="col">
                      Salas
                    </th>
                    <th
                      className="availability-grid__head-qtd availability-grid__head-title"
                      rowSpan={2}
                      scope="col"
                      aria-label="Quantidade de pessoas (capacidade)"
                    >
                      <span className="availability-grid__head-qtd-stack">
                        <span className="availability-grid__head-qtd-line">Qtd</span>
                        <span className="availability-grid__head-qtd-line">Pessoas</span>
                      </span>
                    </th>
                    <th
                      className="availability-grid__head-horarios availability-grid__head-title"
                      colSpan={TIME_SLOTS.length}
                      scope="colgroup"
                    >
                      Horários
                    </th>
                  </tr>
                  <tr className="availability-grid__head-row-slots">
                    {TIME_SLOTS.map((s) => (
                      <th key={s.startMin} scope="col" className="availability-grid__th-slot">
                        {s.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {salasNomes.map((sala) => (
                    <tr key={sala}>
                      <th className="room-head availability-grid__sala-cell" scope="row" title={sala}>
                        {salaNomeGradeExibicao(sala)}
                      </th>
                      <td
                        className="availability-grid__qtd-cell"
                        title={`Capacidade: ${qtdCapacidadePorSala.get(sala) ?? '—'}`}
                      >
                        {qtdCapacidadePorSala.get(sala) ?? '—'}
                      </td>
                      {TIME_SLOTS.map((slot) => {
                        const res = getSlotReservation(sala, slot.startMin, slot.endMin)
                        const busy = res != null
                        const blocked = !busy && isMultiusoSlotBlocked(sala, form.dataInicio, slot.startMin, slot.endMin)
                        const tipoSlot = busy ? reservationTipoReuniao(res) : null
                        let slotClass = 'slot slot--free'
                        if (busy) {
                          slotClass =
                            tipoSlot === 'externa' ? 'slot slot--busy-externa' : 'slot slot--busy-interna'
                        } else if (blocked) {
                          slotClass = 'slot slot--blocked-lunch'
                        }
                        const slotTitle = busy
                          ? reservationQuickSummaryLine(res, sala)
                          : blocked
                            ? `${sala} · ${slot.label}–${minutesToTime(slot.endMin)} · Bloqueado (almoço, dias úteis)`
                            : `${sala} · ${slot.label}–${minutesToTime(slot.endMin)} · Disponível`
                        const aria = busy
                          ? `${res.titulo || 'Reserva'}, ${res.horaInicio} a ${res.horaFim}, ocupado.`
                          : blocked
                            ? `${sala}, ${slot.label}, bloqueado para reserva (horário institucional).`
                            : `${sala}, ${slot.label}, disponível`
                        return (
                          <td key={slot.startMin}>
                            <div
                              className={slotClass}
                              title={slotTitle}
                              role="img"
                              aria-label={aria}
                              onMouseEnter={busy ? (e) => handleBusySlotEnter(e, res) : undefined}
                              onMouseLeave={busy ? scheduleHoverHide : undefined}
                              onClick={busy ? (e) => handleBusySlotClick(e, res) : undefined}
                            />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="app__below-grid">
            <section className="panel form-panel">
              <h2>Nova reserva</h2>
              <p className="hint">
                A grade mostra horários a partir das 08:00. O sistema bloqueia sobreposição na mesma
                sala e data.
              </p>
              <form className="form" onSubmit={handleSubmit}>
                {saveSuccess ? (
                  <p className="form__success" role="status" aria-live="polite">
                    Reserva criada com sucesso.
                  </p>
                ) : null}
                {formError ? <p className="form__error">{formError}</p> : null}

                <div className="form__grid-2col" aria-label="Dados da reserva">
                  <div className="form__col">
                    <div className="form__row">
                      <label htmlFor="sala">Nome da sala</label>
                      <select
                        id="sala"
                        value={form.sala}
                        onChange={(e) => updateField('sala', e.target.value)}
                      >
                        {salasNomes.map((s) => (
                          <option key={s} value={s}>
                            {salaNomeGradeExibicao(s)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form__row form__row--2">
                      <div className="form__row">
                        <label htmlFor="dataInicio">Data início</label>
                        <input
                          id="dataInicio"
                          type="date"
                          value={form.dataInicio}
                          onChange={(e) => updateField('dataInicio', e.target.value)}
                        />
                      </div>
                      <div className="form__row">
                        <label htmlFor="dataFim">Data fim</label>
                        <input
                          id="dataFim"
                          type="date"
                          min={form.dataInicio}
                          value={form.dataFim || form.dataInicio}
                          onChange={(e) => updateField('dataFim', e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="form__row form__row--2">
                      <div className="form__row">
                        <label htmlFor="ini">Hora início</label>
                        <input
                          id="ini"
                          type="time"
                          step={SLOT_MINUTES * 60}
                          value={form.horaInicio}
                          onChange={(e) => updateField('horaInicio', e.target.value)}
                        />
                      </div>
                      <div className="form__row">
                        <label htmlFor="fim">Hora fim</label>
                        <input
                          id="fim"
                          type="time"
                          step={SLOT_MINUTES * 60}
                          value={form.horaFim}
                          onChange={(e) => updateField('horaFim', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="form__col">
                    <div className="form__row">
                      <label htmlFor="titulo">Título da reunião</label>
                      <input
                        id="titulo"
                        type="text"
                        autoComplete="off"
                        placeholder="Ex.: Alinhamento trimestral"
                        value={form.titulo}
                        onChange={(e) => updateField('titulo', e.target.value)}
                      />
                    </div>

                    <div className="form__row">
                      <label htmlFor="solicitante">Solicitante</label>
                      <input
                        id="solicitante"
                        type="text"
                        autoComplete="name"
                        placeholder="Nome de quem reserva"
                        value={form.solicitante}
                        onChange={(e) => updateField('solicitante', e.target.value)}
                      />
                    </div>

                    <div className="form__row">
                      <label htmlFor="emailSolicitante">E-mail do solicitante</label>
                      <M365EmailAutocomplete
                        id="emailSolicitante"
                        required
                        placeholder="nome@bmj.com.br"
                        value={form.emailSolicitante}
                        onValueChange={(v) => updateField('emailSolicitante', v)}
                      />
                    </div>
                  </div>
                </div>

                <div className="form__tipo-participantes-row" aria-label="Tipo e participantes">
                  <div className="form__tipo-participantes-cell form__tipo-participantes-cell--tipo">
                    <div
                      className={`form__panel form__panel--stack${fieldHighlight.tipo || fieldHighlight.nomeCliente ? ' form__panel--error' : ''}`}
                    >
                      <fieldset
                        className={`form__tipo-fieldset form__tipo-fieldset--compact${fieldHighlight.tipo ? ' form__tipo-fieldset--error' : ''}`}
                      >
                        <legend className="form__tipo-legend form__panel__legend">Tipo de reunião</legend>
                        {form.tipoReuniao === 'externa' ? (
                          <button
                            type="button"
                            className="btn-ghost form__panel-edit-btn"
                            onClick={openClienteModal}
                          >
                            Gerir clientes
                          </button>
                        ) : null}
                        <div className="form__tipo-options" role="presentation">
                          <label className="form__tipo-label">
                            <input
                              type="radio"
                              name="tipoReuniao"
                              value="interna"
                              checked={form.tipoReuniao === 'interna'}
                              onChange={() => updateField('tipoReuniao', 'interna')}
                            />
                            Interna
                          </label>
                          <label className="form__tipo-label">
                            <input
                              type="radio"
                              name="tipoReuniao"
                              value="externa"
                              checked={form.tipoReuniao === 'externa'}
                              onChange={() => updateField('tipoReuniao', 'externa')}
                            />
                            Externa
                          </label>
                        </div>
                        {form.tipoReuniao === 'externa' ? (
                          <p
                            className={`form__panel-summary form__panel-summary--sub${fieldHighlight.nomeCliente ? ' form__panel-summary--error' : ''}`}
                            aria-live="polite"
                          >
                            {clientesResumoLabel(form.nomeCliente)}
                          </p>
                        ) : null}
                      </fieldset>
                    </div>
                  </div>
                  <div
                    className={`form__tipo-participantes-cell form__tipo-participantes-cell--part${fieldHighlight.participantes ? ' form__tipo-participantes-cell--error' : ''}`}
                  >
                    <div className={`form__panel form__panel--stack${fieldHighlight.participantes ? ' form__panel--error' : ''}`}>
                      <div className="form__panel-head">
                        <span className="form__panel__legend">Participantes (só e-mails)</span>
                        <button
                          type="button"
                          className="btn-ghost form__panel-edit-btn"
                          onClick={openParticipantesModal}
                        >
                          Gerir participantes
                        </button>
                      </div>
                      <p
                        className={`form__panel-summary form__panel-summary--sub${fieldHighlight.participantes ? ' form__panel-summary--error' : ''}`}
                        aria-live="polite"
                      >
                        {participantesResumoLabel(form.participantes)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="form__row form__row--full">
                  <label htmlFor="observacoes">Observações e necessidades da reunião</label>
                  <textarea
                    id="observacoes"
                    className="form__textarea form__textarea--observacoes"
                    rows={5}
                    placeholder="Descreva recursos ou preparações necessárias para a reunião"
                    value={form.observacoes}
                    onChange={(e) => updateField('observacoes', e.target.value)}
                  />
                </div>

                <div className="form__actions">
                  <button type="submit" className="btn" disabled={loading}>
                    {loading && reservations.length > 0
                      ? 'A guardar…'
                      : loading
                        ? 'Aguarde…'
                        : 'Confirmar reserva'}
                  </button>
                </div>
              </form>
            </section>
          </div>
        </div>
      )}

      {slotHoverPreview ? (
        <div
          className="slot-preview-popover"
          role="tooltip"
          style={{
            left: Math.min(
              Math.max(slotHoverPreview.left, 136),
              (typeof window !== 'undefined' ? window.innerWidth : 800) - 136,
            ),
            top: slotHoverPreview.top,
          }}
          onMouseEnter={cancelHoverHide}
          onMouseLeave={scheduleHoverHide}
        >
          <strong className="slot-preview-popover__title">
            {slotHoverPreview.reservation.titulo || 'Reunião'}
          </strong>
          <span className="slot-preview-popover__tipo">
            {reservationTipoReuniao(slotHoverPreview.reservation) === 'externa'
              ? 'Reunião externa'
              : 'Reunião interna'}
          </span>
          <span className="slot-preview-popover__meta">
            {slotHoverPreview.reservation.horaInicio}–{slotHoverPreview.reservation.horaFim} ·{' '}
            {slotHoverPreview.reservation.sala}
          </span>
          {slotHoverPreview.reservation.solicitante ? (
            <span className="slot-preview-popover__sub">{slotHoverPreview.reservation.solicitante}</span>
          ) : null}
          {slotHoverPreview.reservation.emailSolicitante ||
          slotHoverPreview.reservation.createdByEmail ? (
            <span className="slot-preview-popover__sub">
              {slotHoverPreview.reservation.emailSolicitante ||
                slotHoverPreview.reservation.createdByEmail}
            </span>
          ) : null}
          <span className="slot-preview-popover__hint">Clique para ver tudo</span>
        </div>
      ) : null}
      {detalheReserva ? (
        <ReservaSlotDetalheModal
          reservation={detalheReserva}
          onClose={() => setDetalheReserva(null)}
        />
      ) : null}

      <ReservaFormTextModal
        open={participantesModalOpen}
        title="Adicionar participantes"
        titleId="reserva-modal-add-participantes-title"
        error={participantesModalError}
        onConfirm={confirmParticipantesModal}
        onCancel={cancelParticipantesModal}
      >
        <div className="app__modal-field">
          <label htmlFor="modal-participantes-field">E-mails (várias linhas ou separados por vírgula)</label>
          <M365ParticipantesAutocomplete
            id="modal-participantes-field"
            className="form__textarea form__textarea--participantes-compact form__textarea--modal-body"
            placeholder="Um por linha ou separados por vírgula"
            value={participantesDraft}
            onValueChange={setParticipantesDraft}
          />
        </div>
      </ReservaFormTextModal>

      <ReservaFormTextModal
        open={clienteModalOpen}
        title="Adicionar cliente(s)"
        titleId="reserva-modal-add-clientes-title"
        error=""
        onConfirm={confirmClienteModal}
        onCancel={cancelClienteModal}
      >
        <div className="app__modal-field">
          <label htmlFor="modal-cliente-field">Nomes</label>
          <textarea
            id="modal-cliente-field"
            autoComplete="organization"
            className="form__textarea form__textarea--modal-body"
            placeholder="Um ou vários nomes (várias linhas)"
            rows={6}
            value={clienteDraft}
            onChange={(e) => setClienteDraft(e.target.value)}
          />
        </div>
      </ReservaFormTextModal>
    </div>
  )
}
