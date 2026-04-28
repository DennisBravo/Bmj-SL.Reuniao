const fetch = require('node-fetch')

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'
/** Admin_App_Salas (Entra ID) — membros com acesso ao Admin Center. */
const ADMIN_GROUP_ID = 'd71f78e7-2ddb-4bd8-ad9a-5ccdf111ef8c'

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

function normEmail(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
}

/** Validação pragmática (não expor regex complexa ao cliente). */
function isPlausibleEmail(raw) {
  const t = String(raw ?? '').trim()
  if (!t || t.length > 254) return false
  const at = t.indexOf('@')
  if (at < 1 || at === t.length - 1) return false
  return !/\s/.test(t)
}

/**
 * Lista todos os membros do grupo (paginação @odata.nextLink).
 * Compara `targetLower` com mail e userPrincipalName (objetos sem estes campos são ignorados).
 */
async function isUserMemberOfAdminGroup(token, targetLower) {
  const params = new URLSearchParams({
    $select: 'mail,userPrincipalName',
    $top: '100',
  })
  let url = `${GRAPH_BASE}/groups/${ADMIN_GROUP_ID}/members?${params.toString()}`

  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = data.error?.message || JSON.stringify(data.error || data)
      throw new Error(`Graph members: ${res.status} ${msg}`)
    }
    const rows = Array.isArray(data.value) ? data.value : []
    for (const m of rows) {
      if (!m || typeof m !== 'object') continue
      const mail = normEmail(m.mail)
      const upn = normEmail(m.userPrincipalName)
      if (mail && mail === targetLower) return true
      if (upn && upn === targetLower) return true
    }
    url = typeof data['@odata.nextLink'] === 'string' ? data['@odata.nextLink'] : null
  }
  return false
}

module.exports = async function (context, req) {
  const method = (req.method || 'GET').toUpperCase()
  if (method === 'OPTIONS') {
    context.res = { status: 204, headers: {} }
    return
  }

  const checkedAt = new Date().toISOString()

  const { tenantId, clientId, clientSecret } = readEnv()
  if (!tenantId || !clientId || !clientSecret) {
    jsonRes(context, 500, {
      error: 'Configuração incompleta',
      isAdmin: false,
      email: '',
      checkedAt,
    })
    return
  }

  const emailRaw = String((req.query && req.query.email) || '').trim()
  if (!isPlausibleEmail(emailRaw)) {
    jsonRes(context, 400, {
      error: 'Parâmetro email inválido ou ausente',
      isAdmin: false,
      email: '',
      checkedAt,
    })
    return
  }

  const emailNorm = normEmail(emailRaw)

  try {
    const token = await getAccessToken(tenantId, clientId, clientSecret)
    const isAdmin = await isUserMemberOfAdminGroup(token, emailNorm)
    jsonRes(context, 200, {
      isAdmin,
      email: emailRaw,
      checkedAt,
    })
  } catch (err) {
    context.log.error('[check-admin-access]', err)
    jsonRes(context, 500, {
      error: 'Não foi possível verificar o acesso',
      isAdmin: false,
      email: emailRaw,
      checkedAt,
    })
  }
}
