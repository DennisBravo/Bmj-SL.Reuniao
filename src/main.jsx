import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import { ReservasProvider } from './ReservasContext.jsx'
import App from './App.jsx'
import MapaSemanal from './MapaSemanal.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ReservasProvider>
        <Routes>
          <Route path="/recepcao/mapa-semanal" element={<MapaSemanal />} />
          <Route path="*" element={<App />} />
        </Routes>
      </ReservasProvider>
    </BrowserRouter>
  </StrictMode>,
)
