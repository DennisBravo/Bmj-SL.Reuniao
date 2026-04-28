import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

export default function FlatDetailsModal({ onClose }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    const root = dialogRef.current
    if (!root) return undefined

    const focusables = [...root.querySelectorAll(FOCUSABLE_SELECTOR)]
    ;(focusables[0] || root).focus()

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const items = [...root.querySelectorAll(FOCUSABLE_SELECTOR)]
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey) {
        if (active === first || !root.contains(active)) {
          e.preventDefault()
          last.focus()
        }
      } else if (active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="app__modal-backdrop no-print" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        className="app__modal flat-details-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="flat-details-title"
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        <h2 id="flat-details-title" className="app__modal-title">
          Flat - BMJ São Paulo
        </h2>

        <section className="flat-details-modal__section">
          <h3>Endereço</h3>
          <p>Rua Alvorada, 1009 – Vila Olímpia</p>
          <p>São Paulo – SP, CEP: 04550-004</p>
          <p>Unidade: Flat 1106A</p>
        </section>

        <section className="flat-details-modal__section">
          <h3>Descrição do imóvel</h3>
          <ul>
            <li>2 quartos (1 casal + 1 solteiro)</li>
            <li>
              Quarto Casal: cama de casal, guarda-roupa, criados-mudos, ar-condicionado, cortina
            </li>
            <li>
              Quarto Solteiro: cama de solteiro, guarda-roupa, mesa de apoio, ar-condicionado
            </li>
            <li>
              Cozinha equipada: geladeira, fogão/cooktop, micro-ondas, utensílios, filtro de água
            </li>
            <li>Lavanderia: máquina de lavar, varal</li>
            <li>Banheiro completo com box</li>
            <li>Sala: sofá, TV, rack, mesa de apoio</li>
          </ul>
        </section>

        <section className="flat-details-modal__section">
          <h3>Principais regras</h3>
          <ul>
            <li>Acesso somente a pessoas autorizadas pela BMJ</li>
            <li>Check-in obrigatório na portaria para retirar cartão de acesso</li>
            <li>Proibido fumar dentro do flat e áreas comuns</li>
            <li>Roupas de cama/toalhas: usar e colocar na lavanderia após uso</li>
            <li>Geladeira: itens consumidos devem ser repostos antes da saída</li>
            <li>Proibido colocar roupas/toalhas na sacada, varanda ou janela</li>
            <li>Lixo deve ser embalado e depositado na lixeira ao lado da escada</li>
            <li>Delivery: comunicar previamente à recepção do prédio</li>
            <li>
              Checkout: apagar luzes, desligar ar, fechar torneiras, devolver cartão na portaria
            </li>
          </ul>
        </section>

        <div className="app__modal-actions flat-details-modal__actions">
          <a
            className="btn-ghost"
            href="/docs/politica-flat.pdf"
            target="_blank"
            rel="noreferrer"
          >
            📄 Ver política completa (PDF)
          </a>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
