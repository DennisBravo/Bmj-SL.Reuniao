/**
 * Logo BMJ — usa o ficheiro oficial em public/ (pixel-perfect).
 *
 * 1. Coloca a tua marca em: public/bmj-logo.png (recomendado, fundo transparente)
 * 2. Alternativa vetorial: public/bmj-logo.svg (export oficial)
 *
 * Se o PNG não existir, tenta carregar o SVG.
 */
export default function BmjLogo() {
  return (
    <div className="bmj-logo">
      <img
        className="bmj-logo__img"
        src="/bmj-logo.png"
        alt="BMJ Consultores Associados"
        decoding="async"
        onError={(e) => {
          const el = e.currentTarget
          if (el.src.endsWith('/bmj-logo.png')) {
            el.onerror = null
            el.src = '/bmj-logo.svg'
          }
        }}
      />
    </div>
  )
}
