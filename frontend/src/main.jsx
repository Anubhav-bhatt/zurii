import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { captureAttribution } from './services/leadAttribution'

// Before the first render: a client-side redirect (legacy URLs) would
// otherwise replace the landing URL and its campaign tags (ZT-16).
captureAttribution()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
