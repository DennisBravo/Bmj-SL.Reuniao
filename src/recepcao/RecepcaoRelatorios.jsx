import Painel from '../Painel.jsx'
import { useReservas } from '../ReservasContext.jsx'

/** Mesmo painel da página inicial, agora em Recepção → Relatórios / Exportar PDF. */
export default function RecepcaoRelatorios() {
  const { reservations } = useReservas()
  return (
    <div className="recepcao-painel-wrap">
      <Painel reservations={reservations} />
    </div>
  )
}
