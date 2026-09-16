import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { CursorProvider } from './context/CursorContext.jsx'
import { LoaderProvider } from './context/LoaderContext.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <LoaderProvider>
        <CursorProvider>
          <App />
        </CursorProvider>
      </LoaderProvider>
    </BrowserRouter>
  </StrictMode>,
)
