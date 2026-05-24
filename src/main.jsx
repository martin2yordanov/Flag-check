import { ClerkProvider } from '@clerk/react'
import { bgBG } from '@clerk/localizations'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ClerkProvider localization={bgBG} afterSignOutUrl="/">
      <App />
    </ClerkProvider>
  </React.StrictMode>,
)