import { RegistryProvider } from '@effect/atom-react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import './style.css'

const root = document.getElementById('root')
if (root)
  createRoot(root).render(
    <RegistryProvider>
      <App />
    </RegistryProvider>,
  )
