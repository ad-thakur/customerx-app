import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { IntakeProvider } from './lib/IntakeContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <IntakeProvider>
        <App />
      </IntakeProvider>
    </BrowserRouter>
  </StrictMode>,
)
