const fetch = require('node-fetch')

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

function readEnv() {
  const tenantId = process.env.SHAREPOINT_TENANT_ID
  const clientId = process.env.SHAREPOINT_CLIENT_ID
  const clientSecret = process.env.SHAREPOINT_CLIENT_SECRET
  return { tenantId, clientId, clientSecret }
}

function jsonRes(context, status, body, extraHeaders = {}) {
  context.res = {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
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

function odataStringLiteral(s) {
  return `'${String(s).replace(/'/g, "''")}'`
}

/**
 * Filtro OData compatível com GET /users no Graph (app-only).
 * Evita `tolower()` / filtros complexos — devolvem 400 "Unsupported Query" em muitos tenants.
 * Requer permissão de aplicação User.Read.All (ou equivalente) + consentimento admin.
 */
function buildUsersFilter(qRaw) {
  const lit = odataStringLiteral(qRaw.trim())
  const typeClause = `(userType ne 'Guest')`
  const byName = `startswith(displayName,${lit})`
  const byUpn = `startswith(userPrincipalName,${lit})`
  const byMail = `(mail ne null and startswith(mail,${lit}))`
  return `${typeClause} and (${byName} or ${byUpn} or ${byMail})`
}

async function graphGetUsersSearch(token, q) {
  const qTrim = String(q).trim()
  if (qTrim.length < 2) return []

  const filter = buildUsersFilter(qTrim)
  const params = new URLSearchParams({
    $filter: filter,
    $select: 'displayName,mail,userPrincipalName',
    $top: '15',
  })
  const url = `${GRAPH_BASE}/users?${params.toString()}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data.error?.message || JSON.stringify(data.error || data)
    throw new Error(`${res.status} ${msg}`)
  }
  const rows = Array.isArray(data.value) ? data.value : []
  const seen = new Set()
  const users = []
  for (const u of rows) {
    const displayName = u.displayName != null ? String(u.displayName).trim() : ''
    const mail = u.mail != null ? String(u.mail).trim() : ''
    const upn = u.userPrincipalName != null ? String(u.userPrincipalName).trim() : ''
    const email = (mail || upn).toLowerCase()
    if (!email || seen.has(email)) continue
    seen.add(email)
    users.push({
      displayName: displayName || email,
      email: mail || upn,
    })
  }
  return users
}

module.exports = async function (context, req) {
  const method = (req.method || 'GET').toUpperCase()
  if (method === 'OPTIONS') {
    context.res = { status: 204, headers: {} }
    return
  }

  const { tenantId, clientId, clientSecret } = readEnv()
  if (!tenantId || !clientId || !clientSecret) {
    jsonRes(context, 500, {
      error: 'Configuração incompleta',
      detail:
        'Defina SHAREPOINT_TENANT_ID, SHAREPOINT_CLIENT_ID e SHAREPOINT_CLIENT_SECRET (mesma app do Graph) nas Application Settings.',
    })
    return
  }

  const q = String((req.query && req.query.q) || '').trim()
  const maxLen = 80
  if (q.length > maxLen) {
    jsonRes(context, 400, { error: 'Parâmetro q demasiado longo', users: [] })
    return
  }

  if (q.length < 2) {
    jsonRes(context, 200, { users: [] })
    return
  }

  try {
    const token = await getAccessToken(tenantId, clientId, clientSecret)
    const users = await graphGetUsersSearch(token, q)
    jsonRes(context, 200, { users })
  } catch (err) {
    context.log.error(err)
    jsonRes(context, 500, {
      error: 'Falha ao pesquisar utilizadores no Microsoft Graph',
      detail: err.message || String(err),
    })
  }
}
