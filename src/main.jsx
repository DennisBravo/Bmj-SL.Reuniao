import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import { ReservasProvider } from './ReservasContext.jsx'
import App from './App.jsx'
import MapaSemanal from './MapaSemanal.jsx'
import RecepcaoLayout from './recepcao/RecepcaoLayout.jsx'
import RecepcaoCancelar from './recepcao/RecepcaoCancelar.jsx'
import RecepcaoReservasDoDia from './recepcao/RecepcaoReservasDoDia.jsx'
import RecepcaoRelatorios from './recepcao/RecepcaoRelatorios.jsx'
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
                <Route path="relatorios" element={<RecepcaoRelatorios />} />
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
                <Route
                  path="suporte"
                  element={
                    <RecepcaoPlaceholder title="Informações e suporte da sala">
                      <p>
                        Ficha técnica por sala (capacidade, equipamentos, contactos): previsto na fase
                        2.
                      </p>
                    </RecepcaoPlaceholder>
                  }
                />
                <Route
                  path="acesso"
                  element={
                    <RecepcaoPlaceholder title="Controle de acesso (login)">
                      <p>
                        Controle de acesso (Microsoft Entra ID / perfis Recepção e Admin): previsto na
                        fase 2.
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
