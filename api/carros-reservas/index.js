const fetch = require('node-fetch')

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'
const DEFAULT_LIST = 'CarrosReserva_BMJ'

function readEnv() {
  const tenantId = process.env.SHAREPOINT_TENANT_ID
  const clientId = process.env.SHAREPOINT_CLIENT_ID
  const clientSecret = process.env.SHAREPOINT_CLIENT_SECRET
  const siteUrl = process.env.SHAREPOINT_SITE_URL
  const listName = process.env.SHAREPOINT_CARROS_LIST_NAME || DEFAULT_LIST
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
  if (!data.access_token) throw new Error('Token: resposta sem access_token')
  return data.access_token
}

function siteResourceFromUrl(siteUrl) {
  const u = new URL(siteUrl)
  const hostname = u.hostname
  let path = u.pathname.replace(/\/+$/, '') || '/'
  if (!path.startsWith('/')) path = `/${path}`
  return `${hostname}:${path}`
}

async function graphGetJson(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
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
  if (!list) throw new Error(`Lista não encontrada: ${listDisplayName}`)
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

function emailFromFields(f) {
  const v =
    f.EmailSolicitante ||
    f.Email_x0020_Solicitante ||
    f.EmaildoSolicitante ||
    ''
  return typeof v === 'string' ? v : String(v ?? '')
}

/** Remove nome interno legado da lista Salas; CarrosReserva_BMJ usa a coluna `HoraFim`. */
function normalizeCarFieldsForGraph(fields) {
  if (!fields || typeof fields !== 'object') return fields
  const o = { ...fields }
  if (Object.prototype.hasOwnProperty.call(o, 'Hor_x00e1_riodeFim')) {
    if (o.HoraFim == null || o.HoraFim === '') {
      o.HoraFim = o['Hor_x00e1_riodeFim']
    }
    delete o['Hor_x00e1_riodeFim']
  }
  return o
}

/**
 * Ajuste os nomes internos às colunas reais da lista CarrosReserva_BMJ no SharePoint.
 * Campos esperados: Title, DataReserva, HoraInicio, HoraFim, Destino, Motivo,
 * NomedoSolicitante, EmailSolicitante, Observacao, Veiculo, Motorista, ReservaID, Status, Unidade.
 */
function buildCarFields(body) {
  if (!body || typeof body !== 'object') return {}
  if (body.fields && typeof body.fields === 'object') return normalizeCarFieldsForGraph(body.fields)

  const fields = {
    Title:
      String(body.titulo ?? body.destino ?? 'Reserva de carro')
        .trim()
        .slice(0, 255) || 'Reserva de carro',
    DataReserva: String(body.date ?? '').trim(),
    HoraInicio: String(body.horaInicio ?? '').trim(),
    HoraFim: String(body.horaFim ?? '').trim(),
    Destino: String(body.destino ?? '').trim(),
    Motivo: String(body.motivo ?? '').trim(),
    NomedoSolicitante: String(body.solicitante ?? '').trim(),
    EmailSolicitante: String(body.emailSolicitante ?? '').trim(),
    Observacao: String(body.observacoes ?? '').trim(),
    Veiculo: String(body.veiculo ?? 'Toyota Corolla').trim(),
    Motorista: String(body.motorista ?? 'Charles Bueno').trim(),
    Status: 'ativo',
  }
  if (body.id != null) fields.ReservaID = String(body.id).trim()
  if (!body._patch) fields.CriadoVia = 'App Web'
  const unidade = String(body.unidade ?? '')
    .trim()
  if (unidade) fields.Unidade = unidade
  return fields
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
        'Defina SHAREPOINT_TENANT_ID, SHAREPOINT_CLIENT_ID, SHAREPOINT_CLIENT_SECRET e SHAREPOINT_SITE_URL.',
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
      const fields = buildCarFields(body)
      const url = `${GRAPH_BASE}/sites/${encodeURIComponent(siteId)}/lists/${encodeURIComponent(
        listId,
      )}/items`
      const created = await graphPostJson(url, token, { fields })
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
        jsonRes(context, 400, { error: 'graphItemId é obrigatório para atualizar.' })
        return
      }
      const patchBody = { ...body, _patch: true }
      const fields = buildCarFields(patchBody)
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
