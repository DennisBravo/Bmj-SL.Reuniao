import { Link } from 'react-router-dom'

export default function RecepcaoRelatorios() {
  return (
    <div className="recepcao-page">
      <header className="recepcao-page__header">
        <h2 className="recepcao-page__heading">Relatórios / Exportar PDF</h2>
        <p className="recepcao-page__intro">
          Gere PDF através da impressão do browser (Guardar como PDF). Relatórios mais
          detalhados (por dia, mês, cancelamentos, Excel) ficam para integrações futuras.
        </p>
      </header>

      <ul className="recepcao-page__cards">
        <li className="recepcao-page__card">
          <h3>Mapa semanal</h3>
          <p>Grade salas × dias da semana, pronta para impressão.</p>
          <div className="recepcao-page__card-actions">
            <Link className="btn btn--secondary" to="/recepcao/mapa-semanal">
              Abrir mapa semanal
            </Link>
            <Link className="btn-ghost" to="/recepcao/mapa-semanal?print=1">
              Abrir e imprimir PDF
            </Link>
          </div>
        </li>
        <li className="recepcao-page__card">
          <h3>Painel (período filtrado)</h3>
          <p>Na página principal, separador <strong>Painel</strong>: relatório tabular e botão
            &quot;Exportar PDF&quot; com os filtros aplicados.</p>
          <Link className="btn btn--secondary" to="/">
            Ir às reservas / Painel
          </Link>
        </li>
      </ul>
    </div>
  )
}
