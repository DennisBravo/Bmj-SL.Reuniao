import { useMemo, useState } from 'react'
import {
  getPeriodRange,
  reservationOverlapsRange,
  timeToMinutes,
} from '../reservasUtils'
import { useReservas } from '../ReservasContext.jsx'

const PERIOD_LABELS = {
  today: 'Hoje',
  week: 'Semana',
  month: 'Mês',
  year: 'Ano',
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function rowStatusLabel(r) {
  if (r.deletedAt) return 'Cancelada'
  const st = String(r.status || 'ativo').trim().toLowerCase()
  if (st === 'cancelado' || st === 'inativo') return 'Cancelada'
  return 'Ativa'
}

export default function RecepcaoRelatorioMovimentoCarro({ embedded = false }) {
  const {
    allCarReservations,
    carLoading,
    carError,
    clearCarError,
    reloadCarReservations,
  } = useReservas()

  const [period, setPeriod] = useState('week')
  const [filterSolicitante, setFilterSolicitante] = useState('')
  const [filterDestino, setFilterDestino] = useState('')
  const [filterDataDe, setFilterDataDe] = useState('')
  const [filterDataAte, setFilterDataAte] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const periodBounds = useMemo(() => getPeriodRange(period), [period])

  const inPeriod = useMemo(
    () =>
      allCarReservations.filter((r) =>
        reservationOverlapsRange(r, periodBounds.start, periodBounds.end),
      ),
    [allCarReservations, periodBounds],
  )

  const tableRows = useMemo(() => {
    let list = inPeriod
    const qs = filterSolicitante.trim().toLowerCase()
    if (qs) {
      list = list.filter((r) => {
        const sol = (r.solicitante || '').toLowerCase()
        const em = (r.emailSolicitante || '').toLowerCase()
        return sol.includes(qs) || em.includes(qs)
      })
    }
    const qd = filterDestino.trim().toLowerCase()
    if (qd) {
      list = list.filter((r) => {
        const d = (r.destino || '').toLowerCase()
        const t = (r.titulo || '').toLowerCase()
        return d.includes(qd) || t.includes(qd)
      })
    }
    if (filterDataDe || filterDataAte) {
      const de = filterDataDe || '1970-01-01'
      const ate = filterDataAte || '9999-12-31'
      list = list.filter((r) => reservationOverlapsRange(r, de, ate))
    }
    if (filterStatus === 'ativa') {
      list = list.filter((r) => rowStatusLabel(r) === 'Ativa')
    } else if (filterStatus === 'cancelada') {
      list = list.filter((r) => rowStatusLabel(r) === 'Cancelada')
    }
    return [...list].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date)
      return timeToMinutes(a.horaInicio) - timeToMinutes(b.horaInicio)
    })
  }, [inPeriod, filterSolicitante, filterDestino, filterDataDe, filterDataAte, filterStatus])

  function exportPdf() {
    const periodStr =
      periodBounds.start === periodBounds.end
        ? periodBounds.start
        : `${periodBounds.start} a ${periodBounds.end}`

    const tbody =
      tableRows.length === 0
        ? '<tr><td colspan="12" style="text-align:center;padding:16px;font-style:italic">Nenhum registro com os filtros atuais.</td></tr>'
        : tableRows
            .map(
              (r) => `<tr>
            <td>${escapeHtml(r.date)}</td>
            <td>${escapeHtml(r.horaInicio)}</td>
            <td>${escapeHtml(r.horaFim)}</td>
            <td>${escapeHtml(r.destino || '—')}</td>
            <td>${escapeHtml(r.motivo || '—')}</td>
            <td>${escapeHtml(r.veiculo || '—')}</td>
            <td>${escapeHtml(r.motorista || '—')}</td>
            <td>${escapeHtml(r.solicitante)}</td>
            <td>${escapeHtml(r.emailSolicitante || '—')}</td>
            <td>${escapeHtml((r.observacoes || '').replace(/\r?\n/g, ' · ') || '—')}</td>
            <td>${escapeHtml(r.unidade || '—')}</td>
            <td>${escapeHtml(rowStatusLabel(r))}</td>
          </tr>`,
            )
            .join('')

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <title>BMJ — Movimento do carro ${escapeHtml(periodBounds.start)}_${escapeHtml(periodBounds.end)}</title>
  <style>
    @page { size: landscape; margin: 12mm; }
    body { font-family: Inter, Segoe UI, system-ui, sans-serif; color: #1c2434; padding: 8px; font-size: 10px; }
    h1 { font-size: 16px; color: #1c2434; margin: 0 0 6px; font-weight: 600; }
    .meta { color: #5c6578; margin-bottom: 14px; font-size: 11px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #e8eaef; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #1c2434; color: #fff; font-weight: 600; }
    tr:nth-child(even) td { background: #f5f6f8; }
  </style>
</head>
<body>
  <h1>BMJ — Relatório de movimento do carro</h1>
  <p class="meta">Período: ${escapeHtml(periodStr)} · ${tableRows.length} registro(s) · Gerado em ${escapeHtml(new Date().toLocaleString('pt-BR'))}</p>
  <table>
    <thead><tr>
      <th>Data</th><th>Início</th><th>Fim</th><th>Destino</th><th>Motivo</th><th>Veículo</th><th>Motorista</th><th>Solicitante</th><th>E-mail</th><th>Observações</th><th>Unidade</th><th>Status</th>
    </tr></thead>
    <tbody>${tbody}</tbody>
  </table>
  <script>
    window.onload = function () {
      window.focus();
      window.print();
    };
  </script>
</body>
</html>`

    const w = window.open('', '_blank', 'noopener,noreferrer')
    if (!w) {
      window.alert('Permita janelas pop-up para exportar o PDF.')
      return
    }
    w.document.open()
    w.document.write(html)
    w.document.close()
  }

  const painel = (
    <div className="painel">
        <div className="painel__toolbar">
          <span className="painel__toolbar-label">Período</span>
          <div className="painel__segmented" role="tablist" aria-label="Período do relatório">
            {(['today', 'week', 'month', 'year']).map((p) => (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={period === p}
                className={`painel__segment ${period === p ? 'painel__segment--active' : ''}`}
                onClick={() => setPeriod(p)}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
          <span className="painel__period-hint">
            {periodBounds.start === periodBounds.end
              ? periodBounds.start
              : `${periodBounds.start} → ${periodBounds.end}`}
          </span>
        </div>

        {carError ? (
          <div className="form__error recepcao-carro-report__alert" role="alert">
            {carError}{' '}
            <button type="button" className="btn-ghost" onClick={clearCarError}>
              Fechar
            </button>
            <button type="button" className="btn-ghost" onClick={() => reloadCarReservations()}>
              Tentar de novo
            </button>
          </div>
        ) : null}

        <section className="panel painel__report recepcao-carro-report">
          <div className="painel__report-head">
            <div>
              <h2 className="painel__section-title">Relatório de movimento do carro</h2>
              <p className="painel__section-desc">
                Reservas do veículo institucional (inclui canceladas). Filtrado pelo período e pelos
                campos abaixo. {carLoading ? 'A carregar…' : `${tableRows.length} registro(s).`}
              </p>
            </div>
            <button type="button" className="btn btn--secondary" onClick={exportPdf} disabled={carLoading}>
              Exportar PDF
            </button>
          </div>

          <div className="painel__filters">
            <div className="painel__filter painel__filter--grow">
              <label htmlFor="car-mov-sol">Solicitante</label>
              <input
                id="car-mov-sol"
                type="search"
                placeholder="Nome ou e-mail…"
                value={filterSolicitante}
                onChange={(e) => setFilterSolicitante(e.target.value)}
              />
            </div>
            <div className="painel__filter painel__filter--grow">
              <label htmlFor="car-mov-dest">Destino / título</label>
              <input
                id="car-mov-dest"
                type="search"
                placeholder="Filtrar por destino…"
                value={filterDestino}
                onChange={(e) => setFilterDestino(e.target.value)}
              />
            </div>
            <div className="painel__filter">
              <label htmlFor="car-mov-status">Status</label>
              <select
                id="car-mov-status"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="">Todos</option>
                <option value="ativa">Ativa</option>
                <option value="cancelada">Cancelada</option>
              </select>
            </div>
            <div className="painel__filter">
              <label htmlFor="car-mov-de">Data de</label>
              <input
                id="car-mov-de"
                type="date"
                value={filterDataDe}
                onChange={(e) => setFilterDataDe(e.target.value)}
              />
            </div>
            <div className="painel__filter">
              <label htmlFor="car-mov-ate">Data até</label>
              <input
                id="car-mov-ate"
                type="date"
                value={filterDataAte}
                onChange={(e) => setFilterDataAte(e.target.value)}
              />
            </div>
          </div>

          <div className="table-wrap">
            <table className="report-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Início</th>
                  <th>Fim</th>
                  <th>Destino</th>
                  <th>Motivo</th>
                  <th>Veículo</th>
                  <th>Motorista</th>
                  <th>Solicitante</th>
                  <th>E-mail</th>
                  <th>Obs.</th>
                  <th>Unidade</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {carLoading ? (
                  <tr>
                    <td colSpan={12} className="report-table__empty">
                      A carregar reservas de carro…
                    </td>
                  </tr>
                ) : tableRows.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="report-table__empty">
                      Nenhum registro com os filtros atuais.
                    </td>
                  </tr>
                ) : (
                  tableRows.map((r) => (
                    (() => {
                      const destino = r.destino || '—'
                      const email = r.emailSolicitante || '—'
                      const observacoes = r.observacoes
                        ? r.observacoes.replace(/\r?\n/g, ' ').trim()
                        : '—'
                      return (
                        <tr key={r.id}>
                          <td>{r.date}</td>
                          <td>{r.horaInicio}</td>
                          <td>{r.horaFim}</td>
                          <td className="report-table__destino" title={destino}>
                            {destino}
                          </td>
                          <td>{r.motivo || '—'}</td>
                          <td>{r.veiculo || '—'}</td>
                          <td>{r.motorista || '—'}</td>
                          <td>{r.solicitante}</td>
                          <td className="report-table__email" title={email}>
                            {email}
                          </td>
                          <td className="report-table__obs" title={observacoes}>
                            {observacoes}
                          </td>
                          <td>{r.unidade || '—'}</td>
                          <td>{rowStatusLabel(r)}</td>
                        </tr>
                      )
                    })()
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
    </div>
  )

  if (embedded) return painel
  return <div className="recepcao-painel-wrap">{painel}</div>
}
