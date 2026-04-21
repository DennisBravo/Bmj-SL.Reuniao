export const STORAGE_KEY = 'bmj-salareuniao-reservas-v1'

export const SALAS = [
  'Sala 01 – Ipê',
  'Sala 02 – Aroeira',
  'Sala 03 – Cedro',
  'Sala 04 – Jatobá',
  'Sala 05 – Peroba',
  'Sala 06 – Mogno',
  'Sala 07 – Angico',
  'Sala 08 – Cumaru',
  'Sala 09 – Garapeira',
  'Sala 10 – Copaíba',
  'Sala 11 – Pequi',
  'Sala 12 – Jequitibá',
  'Sala 13 – Baraúna',
  'Sala 14 – Quaresmeira',
  'Sala 15 – Sucupira',
]

export const SLOT_MINUTES = 30
export const DAY_START_MIN = 7 * 60
export const DAY_END_MIN = 20 * 60

/** Início da **grade** de disponibilidade (primeiro slot = 08:00). Reservas continuam limitadas por `DAY_START_MIN`. */
export const DAY_GRID_START_MIN = 8 * 60

/** Slots da grade de disponibilidade (08:00 … `DAY_END_MIN`). */
export function buildGridTimeSlots() {
  const slots = []
  for (let m = DAY_GRID_START_MIN; m < DAY_END_MIN; m += SLOT_MINUTES) {
    slots.push({ startMin: m, endMin: m + SLOT_MINUTES, label: minutesToTime(m) })
  }
  return slots
}

/** Grade do carro: igual a `buildGridTimeSlots`, sem a coluna 19:00. */
export function buildCarGridTimeSlots() {
  return buildGridTimeSlots().filter((s) => s.startMin !== 19 * 60)
}

export function pad2(n) {
  return String(n).padStart(2, '0')
}

export function timeToMinutes(t) {
  if (!t || typeof t !== 'string') return NaN
  const [h, m] = t.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return NaN
  return h * 60 + m
}

export function minutesToTime(min) {
  return `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`
}

/** Validação pragmática para UX (não cobre 100% do RFC 5322). */
export function isValidEmail(email) {
  const t = String(email ?? '').trim()
  if (!t || t.length > 254) return false
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/i.test(t)
}

export function todayISO() {
  const d = new Date()
  return d.toISOString().slice(0, 10)
}

/** Data ISO (YYYY-MM-DD) → exibição curta pt-BR (ex.: 19/04/26). */
export function formatShortDateBR(iso) {
  if (!iso) return ''
  const d = new Date(`${iso}T12:00:00`)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export function toISODateLocal(d) {
  const y = d.getFullYear()
  const m = pad2(d.getMonth() + 1)
  const day = pad2(d.getDate())
  return `${y}-${m}-${day}`
}

/** Período em datas locais (YYYY-MM-DD), inclusive */
export function getPeriodRange(period) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  if (period === 'today') {
    const s = toISODateLocal(today)
    return { start: s, end: s }
  }
  if (period === 'week') {
    const dow = today.getDay()
    const mondayOffset = dow === 0 ? -6 : 1 - dow
    const monday = new Date(today)
    monday.setDate(today.getDate() + mondayOffset)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    return { start: toISODateLocal(monday), end: toISODateLocal(sunday) }
  }
  if (period === 'month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1)
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    return { start: toISODateLocal(start), end: toISODateLocal(end) }
  }
  if (period === 'year') {
    const start = new Date(today.getFullYear(), 0, 1)
    const end = new Date(today.getFullYear(), 11, 31)
    return { start: toISODateLocal(start), end: toISODateLocal(end) }
  }
  const s = toISODateLocal(today)
  return { start: s, end: s }
}

export function daysInclusive(startISO, endISO) {
  const a = new Date(`${startISO}T12:00:00`)
  const b = new Date(`${endISO}T12:00:00`)
  return Math.max(1, Math.round((b - a) / 86400000) + 1)
}

export function dateInClosedRange(dateStr, startISO, endISO) {
  return dateStr >= startISO && dateStr <= endISO
}

export function reservationDurationMinutes(r) {
  const a = timeToMinutes(r.horaInicio)
  const b = timeToMinutes(r.horaFim)
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return 0
  return b - a
}

/** Minutos desde meia-noite local "agora" */
export function nowMinutesLocal() {
  const n = new Date()
  return n.getHours() * 60 + n.getMinutes()
}

/** Reserva ativa (não cancelada por soft-delete). */
export function isReservationActive(r) {
  return r && !r.deletedAt
}

/** `interna` | `externa` (reservas antigas sem campo → interna). */
export function reservationTipoReuniao(r) {
  const t = String(r?.tipoReuniao ?? '').toLowerCase()
  return t === 'externa' ? 'externa' : 'interna'
}

/** Normaliza lista de e-mails: quebras de linha, vírgulas ou ponto e vírgula. */
export function splitParticipantesEmails(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return []
  const parts = s.split(/[\r\n,;]+/).map((x) => x.trim()).filter(Boolean)
  const seen = new Set()
  const out = []
  for (const p of parts) {
    const k = p.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(p)
  }
  return out
}

/**
 * Nome na grade / selects: remove o prefixo «Sala » no início (ex.: «Sala Reunião 01» → «Reunião 01»).
 * «Espaço Multiuso» abreviado para caber na coluna sem cortar só a «M».
 */
export function salaNomeGradeExibicao(salaNome) {
  const s = String(salaNome || '')
    .replace(/^\s*Sala\s+/i, '')
    .trim()
  if (!s) return '—'
  const n = s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (n.includes('multiuso') && n.includes('espaco')) return 'Espaço Mult.'
  return s
}

/** @deprecated Use `salaNomeGradeExibicao`. */
export function salaRowLabelReuniao(salaNome) {
  return salaNomeGradeExibicao(salaNome)
}

/**
 * Quantidade na coluna «QTD Pessoas»: 0–9 com um zero à esquerda (ex. 4 → 04);
 * 10–99 sem alteração; ≥100 sem zeros extra (nunca «010» para dez).
 */
export function formatQtdPessoasDisplay(n) {
  const x = Math.max(0, Math.floor(Number(n)) || 0)
  if (x < 10) return String(x).padStart(2, '0')
  if (x <= 99) return String(x)
  return String(Math.min(x, 999))
}

/** Nomes de cliente(s): linhas, vírgulas ou ponto e vírgula (sem deduplicar). */
export function splitClienteNomes(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return []
  return s.split(/[\r\n,;]+/).map((x) => x.trim()).filter(Boolean)
}

/** Texto curto para o formulário após guardar participantes no modal. */
export function participantesResumoLabel(raw) {
  const n = splitParticipantesEmails(raw).length
  if (n === 0) return 'Nenhum participante adicionado'
  return `${n} participante${n === 1 ? '' : 's'} adicionado${n === 1 ? '' : 's'}`
}

/** Texto curto para o formulário após guardar clientes no modal. */
export function clientesResumoLabel(raw) {
  const n = splitClienteNomes(raw).length
  if (n === 0) return 'Nenhum cliente adicionado'
  return `${n} cliente${n === 1 ? '' : 's'} adicionado${n === 1 ? '' : 's'}`
}

/** Participantes só com e-mails válidos (lista pode estar vazia). */
export function validateParticipantesEmailsOnly(raw) {
  const list = splitParticipantesEmails(raw)
  for (const em of list) {
    if (!isValidEmail(em)) {
      return {
        ok: false,
        error: `Participantes: “${em}” não é um e-mail válido. Use só e-mails, um por linha ou separados por vírgula.`,
      }
    }
  }
  return { ok: true, emails: list }
}

export function migrateReservation(r) {
  if (!r || typeof r !== 'object') return r
  const createdAt = r.createdAt || r.criadoEm || new Date().toISOString()
  const createdByEmail = String(r.createdByEmail || r.emailSolicitante || '')
    .trim()
    .toLowerCase()
  return {
    ...r,
    tipoReuniao: reservationTipoReuniao(r),
    unidade: r.unidade != null ? String(r.unidade).trim() : '',
    nomeCliente: r.nomeCliente != null ? String(r.nomeCliente).trim() : '',
    observacoes: r.observacoes != null ? String(r.observacoes) : '',
    createdByEmail,
    createdAt,
    updatedAt: r.updatedAt || createdAt,
    deletedAt: r.deletedAt || null,
    deletedByEmail: r.deletedByEmail ? String(r.deletedByEmail).trim().toLowerCase() : null,
  }
}

export function loadReservations() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(migrateReservation)
  } catch {
    return []
  }
}

export function saveReservations(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

export const AUDIT_STORAGE_KEY = 'bmj-salareuniao-audit-v1'

/** Reserva cobre o dia local YYYY-MM-DD (inclui intervalo date…dateFim). */
export function reservationCoversDate(r, dateISO) {
  const end = r.dateFim || r.date
  return dateISO >= r.date && dateISO <= end
}

/** E-mails únicos em participantes, todas as reservas ativas da sala no dia. */
export function countUniqueParticipantesPorSalaDia(reservations, sala, dateISO) {
  const list = (reservations || []).filter(
    (r) => r && !r.deletedAt && r.sala === sala && reservationCoversDate(r, dateISO),
  )
  const seen = new Set()
  for (const r of list) {
    for (const em of splitParticipantesEmails(r.participantes)) {
      seen.add(em.toLowerCase())
    }
  }
  return seen.size
}

/**
 * Primeira reserva (menor hora de início) que ocupa o intervalo [slotStart, slotEnd) em minutos na sala.
 */
export function findReservationForSlot(reservations, sala, slotStart, slotEnd) {
  const matches = reservations.filter((r) => {
    if (r.sala !== sala) return false
    const rs = timeToMinutes(r.horaInicio)
    const re = timeToMinutes(r.horaFim)
    if (Number.isNaN(rs) || Number.isNaN(re)) return false
    return rs < slotEnd && slotStart < re
  })
  if (matches.length === 0) return null
  return [...matches].sort((a, b) => timeToMinutes(a.horaInicio) - timeToMinutes(b.horaInicio))[0]
}

/** Uma linha para tooltip nativo / pré-visualização rápida. */
export function reservationQuickSummaryLine(r, sala) {
  const tipo = reservationTipoReuniao(r) === 'externa' ? 'Ext' : 'Int'
  const tit = (r.titulo || 'Reunião').trim().slice(0, 72)
  const sol = (r.solicitante || '').trim().slice(0, 40)
  const tail = sol ? ` · ${sol}` : ''
  return `${tipo} · ${tit} · ${r.horaInicio}–${r.horaFim} · ${sala}${tail} — Clique para detalhes`
}

/** Resumo curto para tooltip na grade de carro. */
export function carReservationSlotSummary(r) {
  const d = (r.destino || r.titulo || 'Carro').trim().slice(0, 52)
  const sol = (r.solicitante || '').trim().slice(0, 38)
  const tail = sol ? ` · ${sol}` : ''
  return `${d} · ${r.horaInicio}–${r.horaFim}${tail}`
}

/** Lista de ISO dates de start a end inclusive (ordem crescente). */
export function eachDateISOInRange(startISO, endISO) {
  const out = []
  const d = new Date(`${startISO}T12:00:00`)
  const last = new Date(`${endISO}T12:00:00`)
  while (d <= last) {
    out.push(toISODateLocal(d))
    d.setDate(d.getDate() + 1)
  }
  return out
}

/** Segunda-feira da semana que contém dateISO (local). */
export function mondayOfWeekContaining(dateISO) {
  const d = new Date(`${dateISO}T12:00:00`)
  const dow = d.getDay()
  const mondayOffset = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + mondayOffset)
  return toISODateLocal(d)
}

/** Seg, Ter, … Dom como ISO a partir da segunda da semana. */
export function weekDayISOsFromMonday(mondayISO) {
  const d = new Date(`${mondayISO}T12:00:00`)
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d)
    x.setDate(d.getDate() + i)
    return toISODateLocal(x)
  })
}

export function appendAudit(entry) {
  try {
    const raw = localStorage.getItem(AUDIT_STORAGE_KEY)
    let prev = []
    try {
      const p = JSON.parse(raw || '[]')
      if (Array.isArray(p)) prev = p
    } catch {
      prev = []
    }
    prev.push(entry)
    localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(prev.slice(-500)))
  } catch {
    /* ignore */
  }
}

/** Reserva intersecta [startISO, endISO] em qualquer dia. */
export function reservationOverlapsRange(r, startISO, endISO) {
  const rs = r.date
  const re = r.dateFim || r.date
  return !(re < startISO || rs > endISO)
}

/** Minutos “consumidos” no período (duração diária × dias de interseção). */
export function reservationMinutesInPeriod(r, periodStart, periodEnd) {
  const rs = r.date
  const re = r.dateFim || r.date
  const overlapStart = rs > periodStart ? rs : periodStart
  const overlapEnd = re < periodEnd ? re : periodEnd
  if (overlapStart > overlapEnd) return 0
  const n = eachDateISOInRange(overlapStart, overlapEnd).length
  const dm = reservationDurationMinutes(r)
  return n * dm
}

function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd
}

/** Conflito num único dia (mesma sala). `excludeId` ignora a própria reserva na edição. */
export function findReservationConflict(sala, date, startMin, endMin, reservations, excludeId) {
  if (endMin <= startMin) {
    return 'O horário de fim deve ser depois do horário de início.'
  }
  for (const r of reservations) {
    if (r.id === excludeId) continue
    if (r.sala !== sala || r.date !== date) continue
    const rs = timeToMinutes(r.horaInicio)
    const re = timeToMinutes(r.horaFim)
    if (intervalsOverlap(startMin, endMin, rs, re)) {
      return `Conflito: já existe reserva nesta sala entre ${r.horaInicio} e ${r.horaFim} (“${r.titulo}”).`
    }
  }
  return null
}

/** Conflito em intervalo de vários dias (mesmo horário em cada dia). */
export function findReservationConflictRange(
  sala,
  startISO,
  endISO,
  startMin,
  endMin,
  reservations,
  excludeId,
) {
  for (const d of eachDateISOInRange(startISO, endISO)) {
    const c = findReservationConflict(sala, d, startMin, endMin, reservations, excludeId)
    if (c) return `${c} (em ${d})`
  }
  return null
}

/** Chave interna única para conflitos de horário do veículo (lista CarrosReserva_BMJ). */
export const CARRO_CONFLICT_SALA_KEY = '__BMJ_CARRO_COROLLA__'

export const CARRO_VEICULO_LABEL = 'Toyota Corolla'

export const CARRO_MOTORISTA_LABEL = 'Charles Bueno'

/** Horário permitido para reserva de carro (07h–20h), em minutos desde meia-noite. */
export const CAR_DAY_START_MIN = 7 * 60
export const CAR_DAY_END_MIN = 20 * 60

export const APP_UNIDADE = {
  BRASILIA: 'brasilia',
  SAO_PAULO: 'sao-paulo',
  CARRO: 'carro',
}

/** Opções do seletor no topo da app. */
export const UNIDADES_APP = [
  { id: APP_UNIDADE.BRASILIA, label: 'Brasília' },
  { id: APP_UNIDADE.SAO_PAULO, label: 'São Paulo' },
  { id: APP_UNIDADE.CARRO, label: 'Carro' },
]

/** Valor da coluna SharePoint `Unidade` conforme o id da app. */
export function sharePointUnidadeFromAppId(appUnidadeId) {
  if (appUnidadeId === APP_UNIDADE.BRASILIA) return 'Brasília'
  if (appUnidadeId === APP_UNIDADE.SAO_PAULO) return 'São Paulo'
  return ''
}

function normCapKey(s) {
  return String(s || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

const CAP_QTD_BRASILIA_RAW = Object.freeze({
  'Espaço Multiuso': '100',
  'Reunião 01': '04',
  'Reunião 02': '04',
  'Reunião 03': '06',
  'Reunião 04': '10',
  'Reunião 05': '06',
  'Reunião 06': '08',
  'Reunião 07': '04',
  'Reunião 08': '04',
  'Reunião 09': '04',
  'Reunião 10': '04',
  'Reunião 11': '04',
})

const CAP_QTD_SAO_PAULO_RAW = Object.freeze({
  'Sala Principal': '25',
  Principal: '25',
  'Reunião 01': '08',
  'Reunião 02': '09',
  'Aquário 01': '02',
  'Aquário 02': '02',
})

function buildCapLookup(raw) {
  const m = new Map()
  for (const [label, value] of Object.entries(raw)) {
    const keys = new Set([
      normCapKey(label),
      normCapKey(label.replace(/^\s*Sala\s+/i, '')),
    ])
    for (const k of keys) {
      if (k) m.set(k, value)
    }
  }
  return m
}

const CAP_LOOKUP_BRASILIA = buildCapLookup(CAP_QTD_BRASILIA_RAW)
const CAP_LOOKUP_SAO_PAULO = buildCapLookup(CAP_QTD_SAO_PAULO_RAW)

/** Reservas de carro ativas num dia e unidade (SharePoint `Unidade`). Sem unidade: assume Brasília. */
export function filterCarReservationsForUnitOnDate(carList, dateISO, unidadeLabel) {
  const target = normCapKey(unidadeLabel)
  return (carList || []).filter((r) => {
    if (!r || r.deletedAt) return false
    if (!reservationCoversDate(r, dateISO)) return false
    const u = normCapKey(String(r.unidade || '').trim())
    if (!u) return target === normCapKey('Brasília')
    return u === target
  })
}

/** Capacidade «QTD Pessoas» estática por unidade (dados operação BMJ). */
export function capacidadeQtdPessoasExibicao(salaNome, appUnidadeId) {
  if (!appUnidadeId || appUnidadeId === APP_UNIDADE.CARRO) return '—'
  const map =
    appUnidadeId === APP_UNIDADE.SAO_PAULO ? CAP_LOOKUP_SAO_PAULO : CAP_LOOKUP_BRASILIA
  const tries = [normCapKey(salaNome), normCapKey(salaNomeGradeExibicao(salaNome))]
  for (const k of tries) {
    if (k && map.has(k)) return map.get(k)
  }
  return '—'
}

/** Nome exibido na lista para a sala «Espaço Multiuso» (Brasília). */
export const SALA_ESPACO_MULTIUSO = 'Espaço Multiuso'

export function isSalaEspaçoMultiuso(salaNome) {
  const s = String(salaNome || '')
    .trim()
    .toLowerCase()
  return s.includes('espaço multiuso') || s.includes('espaco multiuso')
}

export const MULTIUSO_BLOCK_START_MIN = 11 * 60 + 30
export const MULTIUSO_BLOCK_END_MIN = 14 * 60

export function isWeekendISO(dateISO) {
  const d = new Date(`${dateISO}T12:00:00`)
  const w = d.getDay()
  return w === 0 || w === 6
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher), ano civil `year`. */
export function easterSundayYMD(year) {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return { month, day }
}

export function easterISO(year) {
  const { month, day } = easterSundayYMD(year)
  return `${year}-${pad2(month)}-${pad2(day)}`
}

function addDaysToISO(dateISO, deltaDays) {
  const d = new Date(`${dateISO}T12:00:00`)
  d.setDate(d.getDate() + deltaDays)
  return toISODateLocal(d)
}

/** Feriados nacionais comuns (fixos + Carnaval terça, Sexta-feira Santa, Corpus Christi). */
export function isBrasilFeriadoNacional(dateISO) {
  const y = Number(dateISO.slice(0, 4))
  if (!y) return false
  const fixos = new Set([
    `${y}-01-01`,
    `${y}-04-21`,
    `${y}-05-01`,
    `${y}-09-07`,
    `${y}-10-12`,
    `${y}-11-02`,
    `${y}-11-15`,
    `${y}-12-25`,
  ])
  if (fixos.has(dateISO)) return true
  const e = easterISO(y)
  const moveis = new Set([
    addDaysToISO(e, -47),
    addDaysToISO(e, -2),
    addDaysToISO(e, 60),
  ])
  return moveis.has(dateISO)
}

/** Slot [slotStartMin, slotEndMin) sobreposto ao bloqueio de almoço do Espaço Multiuso? */
export function isMultiusoSlotBlocked(salaNome, dateISO, slotStartMin, slotEndMin) {
  if (!isSalaEspaçoMultiuso(salaNome)) return false
  if (isWeekendISO(dateISO) || isBrasilFeriadoNacional(dateISO)) return false
  const b0 = MULTIUSO_BLOCK_START_MIN
  const b1 = MULTIUSO_BLOCK_END_MIN
  return slotStartMin < b1 && slotEndMin > b0
}

function intervalOverlapMin(a0, a1, b0, b1) {
  return a0 < b1 && b0 < a1
}

/** Impede reserva em horário bloqueado (11h30–14h dias úteis sem feriado). */
export function findMultiusoBloqueioRange(sala, startISO, endISO, startMin, endMin) {
  if (!isSalaEspaçoMultiuso(sala)) return null
  const b0 = MULTIUSO_BLOCK_START_MIN
  const b1 = MULTIUSO_BLOCK_END_MIN
  for (const d of eachDateISOInRange(startISO, endISO)) {
    if (isWeekendISO(d) || isBrasilFeriadoNacional(d)) continue
    if (intervalOverlapMin(startMin, endMin, b0, b1)) {
      return `A sala «${SALA_ESPACO_MULTIUSO}» não pode ser reservada entre 11h30 e 14h00 em dias úteis (exceto feriados nacionais e fins de semana). Ajuste as datas ou horários (ex.: conflito em ${formatShortDateBR(d)}).`
    }
  }
  return null
}

/** Reservas de salas visíveis na unidade: sala no catálogo e, se existir campo Unidade, deve coincidir. */
export function filterReservasPorUnidade(reservations, catalogSalas, unidadeSpLabel) {
  const set = new Set(catalogSalas)
  return reservations.filter((r) => {
    if (!set.has(r.sala)) return false
    const u = String(r.unidade || '').trim()
    if (!u) return true
    return u === unidadeSpLabel
  })
}
