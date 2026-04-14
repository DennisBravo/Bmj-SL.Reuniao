/**
 * Logo BMJ — ficheiro em public/ (versão para fundo claro: texto/ícone escuros).
 *
 * Coloque a marca em: public/bmj-logo.png (recomendado)
 * Reserva: public/bmj-logo.svg
 */
const LOGO_PNG = '/bmj-logo.png'
const LOGO_SVG = '/bmj-logo.svg'

export default function BmjLogo() {
  return (
    <div className="bmj-logo">
      <img
        className="bmj-logo__img"
        src={LOGO_PNG}
        alt="BMJ Consultores Associados"
        decoding="async"
        loading="eager"
        fetchPriority="high"
        onError={(e) => {
          const el = e.currentTarget
          if (el.src.endsWith(LOGO_PNG)) {
            el.onerror = null
            el.src = LOGO_SVG
          }
        }}
      />
    </div>
  )
}
