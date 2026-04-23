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

/** Identidade do utilizador atual (build/deploy). Obrigatório para permissões quando há admins. */
export function getCurrentUserEmail() {
  return String(import.meta.env.VITE_USER_EMAIL || '')
    .trim()
    .toLowerCase()
}

export function normalizeEmail(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
}

/**
 * Pode cancelar/editar reserva: criador (createdByEmail) ou e-mail em ADMIN_EMAILS.
 * Sem VITE_USER_EMAIL e sem admins configurados: comportamento permissivo (dev).
 */
export function canAlterReservation(reservation) {
  if (!reservation || reservation.deletedAt) return false
  const me = getCurrentUserEmail()
  const admins = parseAdminEmails()
  const creator = normalizeEmail(reservation.createdByEmail || reservation.emailSolicitante || '')

  if (!me && admins.length === 0) return true

  if (me && admins.includes(me)) return true
  if (me && creator && me === creator) return true
  return false
}

/**
 * Grade principal (app): só o criador pode cancelar a própria reserva (`VITE_USER_EMAIL` vs criador).
 * Admins não têm bypass aqui — usar Admin Center (`canAlterReservation`).
 * Sem `VITE_USER_EMAIL` e sem admins configurados: permissivo (dev), igual a `canAlterReservation`.
 */
export function canUserCancel(reservation) {
  if (!reservation || reservation.deletedAt) return false
  const me = getCurrentUserEmail()
  const creator = normalizeEmail(reservation.createdByEmail || reservation.emailSolicitante || '')
  const admins = parseAdminEmails()

  if (!me && admins.length === 0) return true
  if (!me) return false
  return Boolean(creator && me === creator)
}

export const PERMISSAO_NEGADA_MSG = 'Você não possui permissão para alterar esta reserva.'
