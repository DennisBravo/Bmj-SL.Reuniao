const fetch = require('node-fetch')

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

function readEnv() {
  const tenantId = process.env.SHAREPOINT_TENANT_ID
  const clientId = process.env.SHAREPOINT_CLIENT_ID
  const clientSecret = process.env.SHAREPOINT_CLIENT_SECRET
  const siteUrl = process.env.SHAREPOINT_SITE_URL
  const listName = process.env.SHAREPOINT_SALAS_CATALOGO_LIST_NAME || 'Salas_Catalogo_BMJ'
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

function mapItemToSala(item) {
  const f = item.fields || {}
  const nome = (f.Title || f.NomeSala || f.Nome || '').trim()
  const unidade = (f.Unidade != null ? String(f.Unidade) : '').trim()
  const salaId = f.SalaID != null ? String(f.SalaID).trim() : ''
  const ordem = f.Ordem != null && f.Ordem !== '' ? Number(f.Ordem) : NaN
  return {
    nome,
    unidade,
    salaId,
    ordem: Number.isFinite(ordem) ? ordem : 9999,
    graphItemId: String(item.id),
  }
}

async function fetchAllItems(token, siteId, listId) {
  const out = []
  let next = `${GRAPH_BASE}/sites/${encodeURIComponent(
    siteId,
  )}/lists/${encodeURIComponent(listId)}/items?$expand=fields&$top=200`
  while (next) {
    const data = await graphGetJson(next, token)
    if (Array.isArray(data.value)) out.push(...data.value)
    next = data['@odata.nextLink'] || null
  }
  return out
}

module.exports = async function (context, req) {
  const { tenantId, clientId, clientSecret, siteUrl, listName } = readEnv()
  const raw = (req.query && (req.query.unidade || req.query.Unidade)) || ''
  const unidadeParam = String(raw).trim()

  if (!tenantId || !clientId || !clientSecret || !siteUrl) {
    jsonRes(context, 500, {
      error: 'Configuração incompleta',
      detail:
        'Defina SHAREPOINT_TENANT_ID, SHAREPOINT_CLIENT_ID, SHAREPOINT_CLIENT_SECRET e SHAREPOINT_SITE_URL.',
    })
    return
  }

  if (!unidadeParam) {
    jsonRes(context, 400, { error: 'Parâmetro obrigatório: unidade (ex.: Brasília ou São Paulo).' })
    return
  }

  try {
    const token = await getAccessToken(tenantId, clientId, clientSecret)
    const siteId = await resolveSiteId(token, siteUrl)
    const listId = await resolveListId(token, siteId, listName)

    const esc = unidadeParam.replace(/'/g, "''")
    const odataFilter = encodeURIComponent(`fields/Unidade eq '${esc}'`)
    let url = `${GRAPH_BASE}/sites/${encodeURIComponent(
      siteId,
    )}/lists/${encodeURIComponent(listId)}/items?$expand=fields&$top=200&$filter=${odataFilter}`

    let data
    try {
      data = await graphGetJson(url, token)
    } catch (e) {
      context.log.warn('[salas-catalogo] Filtro OData falhou, a filtrar no servidor: ' + (e.message || e))
      const all = await fetchAllItems(token, siteId, listId)
      const filtered = all
        .map((item) => ({ item, m: mapItemToSala(item) }))
        .filter(({ m }) => m.unidade === unidadeParam && m.nome)
        .sort((a, b) => a.m.ordem - b.m.ordem || a.m.nome.localeCompare(b.m.nome, 'pt-BR'))
      jsonRes(context, 200, { salas: filtered.map(({ m }) => m), unidade: unidadeParam })
      return
    }

    const items = Array.isArray(data.value) ? data.value : []
    const salas = items
      .map(mapItemToSala)
      .filter((m) => m.nome)
      .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'))

    jsonRes(context, 200, { salas, unidade: unidadeParam })
  } catch (err) {
    context.log.error(err)
    jsonRes(context, 500, {
      error: 'Falha ao ler o catálogo de salas',
      detail: err.message || String(err),
    })
  }
}
