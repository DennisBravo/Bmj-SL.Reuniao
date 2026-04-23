import { useMemo, useState } from 'react'
import '../App.css'
import Painel from '../Painel.jsx'
import RecepcaoRelatorioMovimentoCarro from './RecepcaoRelatorioMovimentoCarro.jsx'
import UnidadeSelector from '../components/UnidadeSelector.jsx'
import { useReservas } from '../ReservasContext.jsx'
import {
  APP_UNIDADE,
  sharePointUnidadeFromAppId,
  filterReservasSalasPorUnidadeRecepcao,
  SALAS_RECEPCAO_SAO_PAULO,
  SALAS_RECEPCAO_BRASILIA,
} from '../reservasUtils'

/** Relatórios de salas (Painel) ou movimento do carro, conforme a unidade escolhida. */
export default function RecepcaoRelatorios() {
  const { reservations } = useReservas()
  const [recepcaoUnidade, setRecepcaoUnidade] = useState(APP_UNIDADE.BRASILIA)

  const reservasFiltradas = useMemo(() => {
    if (recepcaoUnidade === APP_UNIDADE.CARRO) return []
    const label = sharePointUnidadeFromAppId(recepcaoUnidade)
    return filterReservasSalasPorUnidadeRecepcao(reservations, label)
  }, [recepcaoUnidade, reservations])

  const salasCatalog =
    recepcaoUnidade === APP_UNIDADE.SAO_PAULO
      ? SALAS_RECEPCAO_SAO_PAULO
      : recepcaoUnidade === APP_UNIDADE.BRASILIA
        ? SALAS_RECEPCAO_BRASILIA
        : undefined

  return (
    <div className="recepcao-painel-wrap">
      <div className="recepcao-relatorios__unit no-print">
        <UnidadeSelector value={recepcaoUnidade} onChange={setRecepcaoUnidade} />
      </div>
      {recepcaoUnidade === APP_UNIDADE.CARRO ? (
        <RecepcaoRelatorioMovimentoCarro embedded />
      ) : (
        <Painel reservations={reservasFiltradas} salasCatalog={salasCatalog} />
      )}
    </div>
  )
}
