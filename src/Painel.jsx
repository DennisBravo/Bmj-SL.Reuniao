import { useMemo, useState } from 'react'
import {
  SALAS,
  DAY_START_MIN,
  DAY_END_MIN,
  todayISO,
  getPeriodRange,
  daysInclusive,
  reservationMinutesInPeriod,
  reservationOverlapsRange,
  reservationCoversDate,
  nowMinutesLocal,
  timeToMinutes,
  reservationIsCancelled,
} from './reservasUtils'

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

export default function Painel({ reservations, salasCatalog }) {
  const salasList = useMemo(
    () => (Array.isArray(salasCatalog) && salasCatalog.length > 0 ? salasCatalog : SALAS),
    [salasCatalog],
  )

  const [period, setPeriod] = useState('week')
  const [filterSala, setFilterSala] = useState('')
  const [filterSolicitante, setFilterSolicitante] = useState('')
  const [filterDataDe, setFilterDataDe] = useState('')
  const [filterDataAte, setFilterDataAte] = useState('')

  const periodBounds = useMemo(() => getPeriodRange(period), [period])

  const inPeriod = useMemo(
    () =>
      reservations.filter((r) =>
        reservationOverlapsRange(r, periodBounds.start, periodBounds.end),
      ),
    [reservations, periodBounds],
  )

  const inPeriodActive = useMemo(
    () => inPeriod.filter((r) => !reservationIsCancelled(r)),
    [inPeriod],
  )

  const windowMinutes = DAY_END_MIN - DAY_START_MIN

  const totalHoje = useMemo(() => {
    const d = todayISO()
    return reservations.filter((r) => reservationCoversDate(r, d) && !reservationIsCancelled(r))
      .length
  }, [reservations])

  const salasOcupadasAgora = useMemo(() => {
    const d = todayISO()
    const nowM = nowMinutesLocal()
    const set = new Set()
    for (const r of reservations) {
      if (reservationIsCancelled(r) || !reservationCoversDate(r, d)) continue
      const a = timeToMinutes(r.horaInicio)
      const b = timeToMinutes(r.horaFim)
      if (Number.isNaN(a) || Number.isNaN(b)) continue
      if (nowM >= a && nowM < b) set.add(r.sala)
    }
    return set.size
  }, [reservations])

  const numDaysInPeriod = daysInclusive(periodBounds.start, periodBounds.end)

  const taxaOcupacao = useMemo(() => {
    const capTotal = salasList.length * numDaysInPeriod * windowMinutes
    let used = 0
    for (const r of inPeriodActive) {
      used += reservationMinutesInPeriod(r, periodBounds.start, periodBounds.end)
    }
    if (capTotal <= 0) return 0
    return Math.min(100, Math.round((used / capTotal) * 1000) / 10)
  }, [inPeriodActive, numDaysInPeriod, windowMinutes, periodBounds, salasList.length])

  const ocupacaoPorSala = useMemo(() => {
    const maxPerRoom = numDaysInPeriod * windowMinutes
    const used = Object.fromEntries(salasList.map((s) => [s, 0]))
    for (const r of inPeriodActive) {
      if (used[r.sala] !== undefined) {
        used[r.sala] += reservationMinutesInPeriod(r, periodBounds.start, periodBounds.end)
      }
    }
    return salasList.map((sala) => ({
      sala,
      minutes: used[sala],
      pct: maxPerRoom > 0 ? Math.min(100, (used[sala] / maxPerRoom) * 100) : 0,
    }))
  }, [inPeriodActive, numDaysInPeriod, windowMinutes, periodBounds, salasList])

  const tableRows = useMemo(() => {
    let list = inPeriod
    if (filterSala) list = list.filter((r) => r.sala === filterSala)
    const q = filterSolicitante.trim().toLowerCase()
    if (q) {
      list = list.filter((r) => {
        const sol = (r.solicitante || '').toLowerCase()
        const em = (r.emailSolicitante || '').toLowerCase()
        return sol.includes(q) || em.includes(q)
      })
    }
    if (filterDataDe || filterDataAte) {
      const de = filterDataDe || '1970-01-01'
      const ate = filterDataAte || '9999-12-31'
      list = list.filter((r) => reservationOverlapsRange(r, de, ate))
    }
    return [...list].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date)
      return timeToMinutes(a.horaInicio) - timeToMinutes(b.horaInicio)
    })
  }, [inPeriod, filterSala, filterSolicitante, filterDataDe, filterDataAte])

  /** PDF sem dependências: abre impressão; em “Impressora” escolha “Guardar como PDF”. */
  function exportPdf() {
    const periodStr =
      periodBounds.start === periodBounds.end
        ? periodBounds.start
        : `${periodBounds.start} a ${periodBounds.end}`

    const periodoCell = (r) =>
      r.dateFim && r.dateFim !== r.date ? `${r.date} → ${r.dateFim}` : r.date

    const tbody =
      tableRows.length === 0
        ? '<tr><td colspan="10" style="text-align:center;padding:16px;font-style:italic">Nenhuma reserva com os filtros atuais.</td></tr>'
        : tableRows
            .map(
              (r) => `<tr>
            <td>${escapeHtml(periodoCell(r))}</td>
            <td>${escapeHtml(r.sala)}</td>
            <td>${escapeHtml(r.horaInicio)}</td>
            <td>${escapeHtml(r.horaFim)}</td>
            <td>${escapeHtml(r.titulo)}</td>
            <td>${escapeHtml(r.solicitante)}</td>
            <td>${escapeHtml(r.emailSolicitante || '—')}</td>
            <td>${escapeHtml((r.participantes || '').replace(/\r?\n/g, ' · '))}</td>
            <td>${escapeHtml((r.observacoes || '').replace(/\r?\n/g, ' · ') || '—')}</td>
            <td>${reservationIsCancelled(r) ? 'Cancelada' : 'Ativa'}</td>
          </tr>`,
            )
            .join('')

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <title>BMJ — Reservas ${escapeHtml(periodBounds.start)}_${escapeHtml(periodBounds.end)}</title>
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
  <h1>BMJ — Relatório de reservas de salas</h1>
  <p class="meta">Período: ${escapeHtml(periodStr)} · ${tableRows.length} registro(s) · Gerado em ${escapeHtml(new Date().toLocaleString('pt-BR'))}</p>
  <table>
    <thead><tr>
      <th>Período (datas)</th><th>Sala</th><th>Início</th><th>Fim</th><th>Título</th><th>Solicitante</th><th>E-mail</th><th>Participantes</th><th>Observações</th><th>Status</th>
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

  return (
    <div className="painel">
      <div className="painel__toolbar">
        <span className="painel__toolbar-label">Período</span>
        <div className="painel__segmented" role="tablist" aria-label="Período do painel">
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

      <div className="painel__cards">
        <article className="stat-card">
          <h3 className="stat-card__label">Reservas hoje</h3>
          <p className="stat-card__value">{totalHoje}</p>
          <p className="stat-card__sub">Total no dia atual (calendário local)</p>
        </article>
        <article className="stat-card stat-card--accent">
          <h3 className="stat-card__label">Salas ocupadas agora</h3>
          <p className="stat-card__value">
            {salasOcupadasAgora}
            <span className="stat-card__suffix"> / {salasList.length}</span>
          </p>
          <p className="stat-card__sub">Com reunião em andamento neste instante</p>
        </article>
        <article className="stat-card stat-card--purple">
          <h3 className="stat-card__label">Taxa de ocupação</h3>
          <p className="stat-card__value">{taxaOcupacao}%</p>
          <p className="stat-card__sub">
            Minutos reservados ÷ capacidade ({salasList.length} salas × {numDaysInPeriod}{' '}
            {numDaysInPeriod === 1 ? 'dia' : 'dias'} × {Math.round(windowMinutes / 60)}h/dia)
          </p>
        </article>
      </div>

      <section className="panel painel__chart-panel">
        <h2 className="painel__section-title">Ocupação por sala no período</h2>
        <p className="painel__section-desc">
          Percentual da janela {Math.round(DAY_START_MIN / 60)}h–{Math.round(DAY_END_MIN / 60)}h em cada sala.
        </p>
        <ul className="bar-chart" aria-label="Gráfico de barras por sala">
          {ocupacaoPorSala.map(({ sala, pct }) => (
            <li key={sala} className="bar-chart__row">
              <span className="bar-chart__label" title={sala}>
                {sala.replace(/^Sala \d+ – /, '')}
              </span>
              <div className="bar-chart__track">
                <div
                  className={`bar-chart__fill${pct > 0 ? ' bar-chart__fill--visible' : ''}`}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
              <span className="bar-chart__pct">{pct < 10 ? pct.toFixed(1) : Math.round(pct)}%</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel painel__report">
        <div className="painel__report-head">
          <div>
            <h2 className="painel__section-title">Relatório de reservas</h2>
            <p className="painel__section-desc">
              Filtrado pelo período acima e pelos campos abaixo. {tableRows.length} registro(s).
            </p>
          </div>
          <button type="button" className="btn btn--secondary" onClick={exportPdf}>
            Exportar PDF
          </button>
        </div>

        <div className="painel__filters">
          <div className="painel__filter">
            <label htmlFor="pf-sala">Sala</label>
            <select
              id="pf-sala"
              value={filterSala}
              onChange={(e) => setFilterSala(e.target.value)}
            >
              <option value="">Todas</option>
              {salasList.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="painel__filter painel__filter--grow">
            <label htmlFor="pf-sol">Solicitante</label>
            <input
              id="pf-sol"
              type="search"
              placeholder="Nome ou e-mail do solicitante..."
              value={filterSolicitante}
              onChange={(e) => setFilterSolicitante(e.target.value)}
            />
          </div>
          <div className="painel__filter">
            <label htmlFor="pf-de">Data de</label>
            <input
              id="pf-de"
              type="date"
              value={filterDataDe}
              onChange={(e) => setFilterDataDe(e.target.value)}
            />
          </div>
          <div className="painel__filter">
            <label htmlFor="pf-ate">Data até</label>
            <input
              id="pf-ate"
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
                <th>Período</th>
                <th>Sala</th>
                <th>Início</th>
                <th>Fim</th>
                <th>Título</th>
                <th>Solicitante</th>
                <th>E-mail</th>
                <th>Observações</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="report-table__empty">
                    Nenhuma reserva com os filtros atuais.
                  </td>
                </tr>
              ) : (
                tableRows.map((r) => (
                  <tr
                    key={r.id}
                    className={reservationIsCancelled(r) ? 'report-table__row--cancelada' : undefined}
                  >
                    <td>
                      {r.dateFim && r.dateFim !== r.date
                        ? `${r.date} → ${r.dateFim}`
                        : r.date}
                    </td>
                    <td className="report-table__sala">{r.sala}</td>
                    <td>{r.horaInicio}</td>
                    <td>{r.horaFim}</td>
                    <td>{r.titulo}</td>
                    <td>{r.solicitante}</td>
                    <td className="report-table__email">{r.emailSolicitante || '—'}</td>
                    <td className="report-table__obs">
                      {r.observacoes ? r.observacoes.replace(/\r?\n/g, ' ') : '—'}
                    </td>
                    <td>{reservationIsCancelled(r) ? 'Cancelada' : 'Ativa'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
