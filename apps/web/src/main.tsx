import { RegistryProvider } from '@effect/atom-react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import '@fontsource/bebas-neue/400.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/600.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/700.css'
import './style.css'

const root = document.getElementById('root')
if (root)
  createRoot(root).render(
    <RegistryProvider>
      <App />
    </RegistryProvider>,
  )
