import { NavLink, Outlet, Link } from 'react-router-dom'

const NAV_ITEMS = [
  { to: 'mapa-semanal', label: 'Mapa semanal de reservas' },
  { to: 'cancelar', label: 'Cancelar reserva' },
  { to: 'relatorios', label: 'Relatórios' },
  { to: 'manuais', label: 'Manuais das salas' },
  { to: 'suporte', label: 'Informações e suporte da sala' },
  { to: 'acesso', label: 'Controle de acesso (login)' },
]

export default function RecepcaoLayout() {
  return (
    <div className="recepcao-layout">
      <aside className="recepcao-layout__sidebar no-print" aria-label="Área Recepção">
        <Link to="/" className="recepcao-layout__back">
          ← Voltar às reservas
        </Link>
        <h1 className="recepcao-layout__title">Recepção</h1>
        <p className="recepcao-layout__subtitle">Operação de salas e relatórios</p>
        <nav className="recepcao-layout__nav" aria-label="Submenu Recepção">
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
