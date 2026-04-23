/** E-mails admin (separados por vírgula ou ponto e vírgula). */
export function parseAdminEmails() {
  const raw = import.meta.env.VITE_ADMIN_EMAILS || ''
  return raw
    .split(/[,;]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

/** Lista de administradores no build (`VITE_ADMIN_EMAILS`). */
export const ADMIN_EMAILS = parseAdminEmails()

export function normalizeEmail(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
}

/** E-mails do utilizador em `VITE_USER_EMAIL` (vários alias: vírgula ou `;`). */
export function getCurrentUserEmailAliasesFromEnv() {
  const raw = import.meta.env.VITE_USER_EMAIL || ''
  return raw
    .split(/[,;]/)
    .map((s) => normalizeEmail(s))
    .filter(Boolean)
}

/** Identidade principal (primeiro alias em `VITE_USER_EMAIL`). */
export function getCurrentUserEmail() {
  const aliases = getCurrentUserEmailAliasesFromEnv()
  return aliases[0] || ''
}

/** Junta listas de e-mail já normalizados (únicos). */
export function mergeNormalizedEmailLists(...lists) {
  const s = new Set()
  for (const list of lists) {
    if (!Array.isArray(list)) continue
    for (const e of list) {
      const n = normalizeEmail(e)
      if (n) s.add(n)
    }
  }
  return [...s]
}

/**
 * E-mails devolvidos por `GET /.auth/me` no Azure Static Web Apps (AAD).
 * @param {unknown} data JSON parseado da resposta
 */
export function emailsFromAuthMePayload(data) {
  const cp = data?.clientPrincipal
  if (!cp || typeof cp !== 'object') return []
  const out = []
  const ud = cp.userDetails
  if (typeof ud === 'string' && ud.includes('@')) out.push(ud)

  const claims = Array.isArray(cp.claims) ? cp.claims : []
  for (const c of claims) {
    const typ = String(c.typ || '').toLowerCase()
    const val = String(c.val ?? '').trim()
    if (!val.includes('@')) continue
    if (
      typ.includes('emailaddress') ||
      typ.endsWith('/email') ||
      typ.includes('preferred_username') ||
      typ.includes('identity/claims/upn') ||
      typ.includes('/upn')
    ) {
      out.push(val)
    }
  }
  return mergeNormalizedEmailLists(out)
}

/**
 * Pode cancelar/editar reserva: criador (createdByEmail) ou e-mail em ADMIN_EMAILS.
 * Sem VITE_USER_EMAIL e sem admins configurados: comportamento permissivo (dev).
 */
export function canAlterReservation(reservation) {
  if (!reservation || reservation.deletedAt) return false
  const ids = getCurrentUserEmailAliasesFromEnv()
  const admins = parseAdminEmails()
  const creator = normalizeEmail(reservation.createdByEmail || reservation.emailSolicitante || '')

  if (ids.length === 0 && admins.length === 0) return true

  if (ids.some((id) => admins.includes(id))) return true
  if (creator && ids.some((id) => id === creator)) return true
  return false
}

/**
 * Grade principal (app): só o criador pode cancelar a própria reserva.
 * Compara `identityEmails` (ou aliases em `VITE_USER_EMAIL`) com `createdByEmail` / `emailSolicitante`.
 * Admins não têm bypass aqui — usar Admin Center (`canAlterReservation`).
 * Sem identidade e sem admins configurados: permissivo (dev), igual a `canAlterReservation`.
 *
 * @param {object} reservation
 * @param {string[] | undefined} identityEmails Lista resolvida na app (env + `/.auth/me` no SWA).
 */
export function canUserCancel(reservation, identityEmails) {
  if (!reservation || reservation.deletedAt) return false
  const creator = normalizeEmail(reservation.createdByEmail || reservation.emailSolicitante || '')
  const admins = parseAdminEmails()
  const ids =
    Array.isArray(identityEmails) && identityEmails.length > 0
      ? mergeNormalizedEmailLists(identityEmails)
      : getCurrentUserEmailAliasesFromEnv()

  if (ids.length === 0 && admins.length === 0) return true
  if (ids.length === 0) return false
  return Boolean(creator && ids.some((id) => id === creator))
}

export const PERMISSAO_NEGADA_MSG = 'Você não possui permissão para alterar esta reserva.'
