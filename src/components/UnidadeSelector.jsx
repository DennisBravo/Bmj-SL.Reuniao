import { UNIDADES_APP } from '../reservasUtils'

/**
 * Seletor destacado: Brasília | São Paulo | Carro.
 */
export default function UnidadeSelector({ value, onChange, disabled }) {
  return (
    <div className="unidade-selector" role="group" aria-label="Unidade ou serviço">
      <span className="unidade-selector__label">Unidade</span>
      <div className="unidade-selector__options">
        {UNIDADES_APP.map((u) => (
          <button
            key={u.id}
            type="button"
            className={`unidade-selector__btn${value === u.id ? ' unidade-selector__btn--active' : ''}`}
            onClick={() => onChange(u.id)}
            disabled={disabled}
            aria-pressed={value === u.id}
          >
            {u.label}
          </button>
        ))}
      </div>
    </div>
  )
}
