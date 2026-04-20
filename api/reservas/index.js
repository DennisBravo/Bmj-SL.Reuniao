const fetch = require('node-fetch')

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'
const DEFAULT_LIST_NAME = 'SalasReuniao_BMJ'

function readEnv() {
  const tenantId = process.env.SHAREPOINT_TENANT_ID
  const clientId = process.env.SHAREPOINT_CLIENT_ID
  const clientSecret = process.env.SHAREPOINT_CLIENT_SECRET
  const siteUrl = process.env.SHAREPOINT_SITE_URL
  const listName = process.env.SHAREPOINT_LIST_NAME || DEFAULT_LIST_NAME
  return { tenantId, clientId, clientSecret, siteUrl, listName }
}

function jsonRes(context, status, body) {
  context.res = {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  }
}

async function getAccessToken(tenantId, clientId, clientSecret) {
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  })
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data.error_description || data.error || res.statusText
    throw new Error(`Token: ${msg}`)
  }
  if (!data.access_token) {
    throw new Error('Token: resposta sem access_token')
  }
  return data.access_token
}

/** Site URL → segmento `hostname:/serverRelativePath` usado pelo Graph */
function siteResourceFromUrl(siteUrl) {
  const u = new URL(siteUrl)
  const hostname = u.hostname
  let path = u.pathname.replace(/\/+$/, '') || '/'
  if (!path.startsWith('/')) path = `/${path}`
  return `${hostname}:${path}`
}

async function graphGetJson(url, token) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data.error?.message || JSON.stringify(data.error || data)
    throw new Error(`${res.status} ${msg}`)
  }
  return data
}

async function graphPostJson(url, token, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data.error?.message || JSON.stringify(data.error || data)
    throw new Error(`${res.status} ${msg}`)
  }
  return data
}

async function graphPatchJson(url, token, payload) {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data.error?.message || JSON.stringify(data.error || data)
    throw new Error(`${res.status} ${msg}`)
  }
  return data
}

async function resolveSiteId(token, siteUrl) {
  const resource = siteResourceFromUrl(siteUrl)
  const url = `${GRAPH_BASE}/sites/${encodeURIComponent(resource)}`
  const site = await graphGetJson(url, token)
  return site.id
}

async function resolveListId(token, siteId, listDisplayName) {
  const esc = listDisplayName.replace(/'/g, "''")
  const filter = encodeURIComponent(`displayName eq '${esc}'`)
  const url = `${GRAPH_BASE}/sites/${encodeURIComponent(siteId)}/lists?$filter=${filter}`
  const data = await graphGetJson(url, token)
  const list = data.value && data.value[0]
  if (!list) {
    throw new Error(`Lista não encontrada: ${listDisplayName}`)
  }
  return list.id
}

async function fetchListItems(token, siteId, listId) {
  const out = []
  let next = `${GRAPH_BASE}/sites/${encodeURIComponent(
    siteId,
  )}/lists/${encodeURIComponent(listId)}/items?$expand=fields&$top=200`

  while (next) {
    const data = await graphGetJson(next, token)
    if (Array.isArray(data.value)) out.push(...data.value)
    next = data['@odata.nextLink'] || null
  }

  return out.map((item) => ({
    id: item.id,
    eTag: item.eTag,
    createdDateTime: item.createdDateTime,
    lastModifiedDateTime: item.lastModifiedDateTime,
    fields: item.fields || {},
  }))
}

/**
 * Corpo JSON da app → campos da lista.
 * Se vier `fields`, repassa ao Graph (nomes internos da lista).
 * Caso contrário, mapeia chaves do front (ajuste os nomes às colunas reais).
 */
function buildListFields(body) {
  if (!body || typeof body !== 'object') return {}
  if (body.fields && typeof body.fields === 'object') return { ...body.fields }

  const fields = {
    Title: String(body.titulo ?? body.Title ?? 'Reserva').trim() || 'Reserva',
  }
  if (body.id != null) fields.ReservaID = String(body.id).trim()
  if (body.sala != null) fields.NomeSala = String(body.sala).trim()
  if (body.salaId != null) fields.SalaID = String(body.salaId).trim()
  if (body.date != null) fields.DataReserva = String(body.date).trim()
  // Apenas multi-dia (evita 400 "Field DataReservaFim is not recognized" em reserva de um dia).
  const dateStart = body.date != null ? String(body.date).trim() : ''
  const dateEnd = body.dateFim != null ? String(body.dateFim).trim() : ''
  if (dateEnd && dateEnd !== dateStart) {
    fields.DataReservaFim = dateEnd
  }
  if (body.horaInicio != null) fields.HoraInicio = String(body.horaInicio).trim()
  if (body.horaFim != null) fields['Hor_x00e1_riodeFim'] = String(body.horaFim).trim()
  if (body.horaInicioMin != null) fields.HoraInicioMinutos = String(body.horaInicioMin)
  if (body.horaFimMin != null) fields.HoraFimMinutos = String(body.horaFimMin)
  if (body.solicitante != null) fields.NomedoSolicitante = String(body.solicitante).trim()
  if (body.emailSolicitante != null) fields.EmailSolicitante = String(body.emailSolicitante).trim()
  if (body.participantes != null) fields.ParticipantesTexto = String(body.participantes).trim()
  if (body.observacoes != null) fields.Observacao = String(body.observacoes).trim()
  if (body.status != null) fields.Status = String(body.status).trim()
  if (!body._patch) fields.CriadoVia = 'App Web'

  // Colunas opcionais na lista SharePoint: TipoReuniao (Escolha: Interna | Externa), NomeCliente (Texto).
  // Defina SHAREPOINT_SKIP_TIPO_FIELDS=1 se a lista ainda não tiver estes campos.
  const skipTipo = process.env.SHAREPOINT_SKIP_TIPO_FIELDS === '1'
  if (!skipTipo && body.tipoReuniao != null && String(body.tipoReuniao).trim() !== '') {
    const tr = String(body.tipoReuniao).trim().toLowerCase() === 'externa' ? 'Externa' : 'Interna'
    fields.TipoReuniao = tr
  }
  if (
    !skipTipo &&
    String(body.tipoReuniao || '')
      .trim()
      .toLowerCase() === 'externa' &&
    body.nomeCliente != null &&
    String(body.nomeCliente).trim() !== ''
  ) {
    fields.NomeCliente = String(body.nomeCliente).trim()
  }

  return fields
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Cria evento no calendário do organizador e envia convites aos e-mails em `participantes`.
 * Requer permissão de aplicação Calendars.ReadWrite e variável GRAPH_CALENDAR_ORGANIZER_UPN (UPN ou ID do utilizador).
 */
async function tryCreateCalendarInvite(context, token, body) {
  const organizer = (process.env.GRAPH_CALENDAR_ORGANIZER_UPN || '').trim()
  if (!organizer) {
    context.log.info(
      '[calendar] GRAPH_CALENDAR_ORGANIZER_UPN não definido — evento Outlook/convites não criados.',
    )
    return
  }
  const tz = (process.env.RESERVA_CALENDAR_TIMEZONE || 'America/Sao_Paulo').trim()
  const raw = body.participantes != null ? String(body.participantes) : ''
  const parts = raw.split(/[\r\n,;]+/).map((x) => x.trim()).filter(Boolean)
  const emailRe = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/i
  const attendees = []
  const seen = new Set()
  for (const p of parts) {
    if (!emailRe.test(p)) continue
    const k = p.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    attendees.push({ emailAddress: { address: p }, type: 'required' })
  }
  if (attendees.length === 0) {
    context.log.info('[calendar] Sem e-mails em Participantes — evento não criado.')
    return
  }

  const dateStart = String(body.date || '').trim()
  const dateEnd = (body.dateFim && String(body.dateFim).trim()) || dateStart
  const startHm = String(body.horaInicio || '09:00').trim()
  const endHm = String(body.horaFim || '10:00').trim()
  const startDateTime = `${dateStart}T${startHm.length === 5 ? startHm : '09:00'}:00`
  const endDateTime = `${dateStart}T${endHm.length === 5 ? endHm : '10:00'}:00`

  const tipo =
    String(body.tipoReuniao || '')
      .trim()
      .toLowerCase() === 'externa'
      ? 'Externa'
      : 'Interna'
  const nomeCliente = body.nomeCliente != null ? String(body.nomeCliente).trim() : ''
  let html = `<p><b>Sala:</b> ${escapeHtml(String(body.sala || ''))}</p>`
  html += `<p><b>Tipo de reunião:</b> ${escapeHtml(tipo)}</p>`
  if (nomeCliente) html += `<p><b>Nome do cliente:</b> ${escapeHtml(nomeCliente)}</p>`
  if (body.observacoes) html += `<p><b>Observações:</b><br/>${escapeHtml(String(body.observacoes))}</p>`
  html += `<p><b>Solicitante:</b> ${escapeHtml(String(body.solicitante || ''))} (${escapeHtml(String(body.emailSolicitante || ''))})</p>`

  const subject = `${String(body.titulo || 'Reserva').slice(0, 200)} — ${String(body.sala || '')}`

  const eventPayload = {
    subject,
    body: { contentType: 'HTML', content: html },
    start: { dateTime: startDateTime, timeZone: tz },
    end: { dateTime: endDateTime, timeZone: tz },
    location: { displayName: String(body.sala || '') },
    attendees,
    isOnlineMeeting: false,
  }

  if (dateEnd > dateStart) {
    eventPayload.recurrence = {
      pattern: { type: 'daily', interval: 1 },
      range: { type: 'endDate', startDate: dateStart, endDate: dateEnd },
    }
  }

  const url = `${GRAPH_BASE}/users/${encodeURIComponent(organizer)}/calendar/events`
  await graphPostJson(url, token, eventPayload)
  context.log.info(`[calendar] Evento criado; convites para ${attendees.length} participante(s).`)
}

function parseRequestBody(req) {
  const raw = req.body
  if (raw == null) return {}
  if (typeof raw === 'object' && !Buffer.isBuffer(raw)) return raw
  const s = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw)
  try {
    return JSON.parse(s || '{}')
  } catch {
    return {}
  }
}

module.exports = async function (context, req) {
  const { tenantId, clientId, clientSecret, siteUrl, listName } = readEnv()

  if (!tenantId || !clientId || !clientSecret || !siteUrl) {
    jsonRes(context, 500, {
      error: 'Configuração incompleta',
      detail:
        'Defina SHAREPOINT_TENANT_ID, SHAREPOINT_CLIENT_ID, SHAREPOINT_CLIENT_SECRET e SHAREPOINT_SITE_URL nas Application Settings da Function.',
    })
    return
  }

  const method = (req.method || 'GET').toUpperCase()

  try {
    const token = await getAccessToken(tenantId, clientId, clientSecret)
    const siteId = await resolveSiteId(token, siteUrl)
    const listId = await resolveListId(token, siteId, listName)

    if (method === 'GET') {
      const items = await fetchListItems(token, siteId, listId)
      jsonRes(context, 200, { items })
      return
    }

    if (method === 'POST') {
      const body = parseRequestBody(req)
      const fields = buildListFields(body)
      const url = `${GRAPH_BASE}/sites/${encodeURIComponent(siteId)}/lists/${encodeURIComponent(
        listId,
      )}/items`
      const created = await graphPostJson(url, token, { fields })
      try {
        await tryCreateCalendarInvite(context, token, body)
      } catch (calErr) {
        context.log.warn(
          '[calendar] Reserva criada na lista, mas falha ao criar evento/convites: ' +
            (calErr.message || String(calErr)),
        )
      }
      jsonRes(context, 201, {
        id: created.id,
        eTag: created.eTag,
        createdDateTime: created.createdDateTime,
        lastModifiedDateTime: created.lastModifiedDateTime,
        fields: created.fields || {},
      })
      return
    }

    if (method === 'PATCH') {
      const body = parseRequestBody(req)
      const graphItemId = body.graphItemId != null ? String(body.graphItemId).trim() : ''
      if (!graphItemId) {
        jsonRes(context, 400, { error: 'graphItemId é obrigatório para atualizar a reserva.' })
        return
      }
      const patchBody = { ...body, _patch: true }
      const fields = buildListFields(patchBody)
      const url = `${GRAPH_BASE}/sites/${encodeURIComponent(siteId)}/lists/${encodeURIComponent(
        listId,
      )}/items/${encodeURIComponent(graphItemId)}`
      const updated = await graphPatchJson(url, token, { fields })
      jsonRes(context, 200, {
        id: updated.id,
        eTag: updated.eTag,
        createdDateTime: updated.createdDateTime,
        lastModifiedDateTime: updated.lastModifiedDateTime,
        fields: updated.fields || {},
      })
      return
    }

    jsonRes(context, 405, { error: 'Método não permitido' })
  } catch (err) {
    context.log.error(err)
    jsonRes(context, 500, {
      error: 'Falha ao comunicar com o Microsoft Graph',
      detail: err.message || String(err),
    })
  }
}
