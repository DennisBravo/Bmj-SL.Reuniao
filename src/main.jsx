import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import { ReservasProvider } from './ReservasContext.jsx'
import App from './App.jsx'
import MapaSemanal from './MapaSemanal.jsx'
import RecepcaoLayout from './recepcao/RecepcaoLayout.jsx'
import RecepcaoCancelar from './recepcao/RecepcaoCancelar.jsx'
import RecepcaoReservasCanceladas from './recepcao/RecepcaoReservasCanceladas.jsx'
import RecepcaoReservasDoDia from './recepcao/RecepcaoReservasDoDia.jsx'
import RecepcaoRelatorios from './recepcao/RecepcaoRelatorios.jsx'
import RecepcaoRelatorioMovimentoCarro from './recepcao/RecepcaoRelatorioMovimentoCarro.jsx'
import RecepcaoPlaceholder from './recepcao/RecepcaoPlaceholder.jsx'
import AppFooter from './components/AppFooter.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ReservasProvider>
        <div className="app-layout">
          <div className="app-layout__content">
            <Routes>
              <Route path="/recepcao" element={<RecepcaoLayout />}>
                <Route index element={<Navigate to="mapa-semanal" replace />} />
                <Route path="mapa-semanal" element={<MapaSemanal />} />
                <Route path="reservas-do-dia" element={<RecepcaoReservasDoDia />} />
                <Route path="cancelar" element={<RecepcaoCancelar />} />
                <Route path="reservas-canceladas" element={<RecepcaoReservasCanceladas />} />
                <Route path="relatorios" element={<RecepcaoRelatorios />} />
                <Route path="movimento-carro" element={<RecepcaoRelatorioMovimentoCarro />} />
                <Route
                  path="manuais"
                  element={
                    <RecepcaoPlaceholder title="Manuais das salas">
                      <p>
                        Biblioteca de manuais (TV, webcam, Wi-Fi, etc.): previsto na fase 2 —
                        integração SharePoint / PDF.
                      </p>
                    </RecepcaoPlaceholder>
                  }
                />
              </Route>
              <Route path="*" element={<App />} />
            </Routes>
          </div>
          <AppFooter />
        </div>
      </ReservasProvider>
    </BrowserRouter>
  </StrictMode>,
)
