/**
 * Notifica canal Teams (Incoming Webhook) quando há observações na nova reserva.
 * URL: VITE_TEAMS_WEBHOOK_URL
 */
export async function notifyTeamsNewReservationWithNotes(payload) {
  const url = String(import.meta.env.VITE_TEAMS_WEBHOOK_URL || '').trim()
  if (!url) return

  const observacoes = String(payload.observacoes || '').trim()
  if (!observacoes) return

  const periodo =
    payload.dateFim && payload.dateFim !== payload.date
      ? `${payload.date} → ${payload.dateFim}`
      : payload.date

  const tipo = String(payload.tipoReuniao || '').toLowerCase() === 'externa' ? 'Externa' : 'Interna'
  const cliente = String(payload.nomeCliente || '').trim()
  const text = [
    '**Nova reserva — observações / necessidades**',
    '',
    `**Tipo:** ${tipo}`,
    cliente ? `**Cliente:** ${cliente}` : null,
    `**Sala:** ${payload.sala}`,
    `**Data:** ${periodo}`,
    `**Horário:** ${payload.horaInicio} – ${payload.horaFim}`,
    `**Solicitante:** ${payload.solicitante}`,
    `**Participantes:** ${payload.participantes?.trim() ? payload.participantes.trim().replace(/\r?\n/g, ', ') : '—'}`,
    '',
    `**Observações:** ${observacoes}`,
  ]
    .filter(Boolean)
    .join('\n')

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
  } catch (err) {
    console.warn('[Teams webhook]', err)
  }
}
