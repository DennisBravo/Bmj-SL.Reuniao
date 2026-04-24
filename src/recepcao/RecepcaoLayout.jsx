import { NavLink, Outlet, Link } from 'react-router-dom'

const NAV_ITEMS = [
  { to: 'cancelar', label: 'Cancelar reserva' },
  { to: 'manuais', label: 'Manuais das salas' },
  { to: 'mapa-semanal', label: 'Mapa semanal de reservas' },
  { to: 'movimento-carro', label: 'Movimento do carro' },
  { to: 'relatorios', label: 'Relatórios' },
  { to: 'reservas-canceladas', label: 'Reservas canceladas' },
  { to: 'reservas-do-dia', label: 'Reserva do dia' },
].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))

export default function RecepcaoLayout() {
  return (
    <div className="recepcao-layout">
      <aside className="recepcao-layout__sidebar no-print" aria-label="Admin Center">
        <Link to="/" className="recepcao-layout__back">
          ← Voltar às reservas
        </Link>
        <h1 className="recepcao-layout__title">Admin Center</h1>
        <p className="recepcao-layout__subtitle">Operação de salas e relatórios</p>
        <nav className="recepcao-layout__nav" aria-label="Submenu Admin Center">
          {NAV_ITEMS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `recepcao-layout__link${isActive ? ' recepcao-layout__link--active' : ''}`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="recepcao-layout__main">
        <Outlet context={{ embedded: true }} />
      </main>
    </div>
  )
}
