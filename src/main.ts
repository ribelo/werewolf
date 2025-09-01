import './app.css'
import App from './App.svelte'
import { mount } from 'svelte'
import { initLogging } from './lib/logging'
import { i18nReady } from './lib/i18n'
import { invoke } from '@tauri-apps/api/core'

async function initializeApp() {
  // Initialize unified logging system first
  initLogging()

  console.log('🐺 Werewolf Frontend Starting')
  console.log('Environment:', (import.meta as any).env?.MODE || 'unknown')
  console.log('Timestamp:', new Date().toISOString())

  // Test unified logging immediately after initialization
  console.info('FRONTEND: Unified logging test - this should appear in log file')
  console.warn('FRONTEND: Warning message test')
  console.error('FRONTEND: Error message test')

  // Wait for i18n to be ready
  console.log('Waiting for i18n to initialize...')
  await i18nReady
  console.log('✅ i18n ready')

  // Test invoking backend command with logging
  invoke('test_frontend_logging')
    .then(result => {
      console.info('FRONTEND: Backend command result:', result)
    })
    .catch(err => {
      console.error('FRONTEND: Backend command failed:', err)
    })

  const target = document.getElementById('app')
  if (!target) {
    console.error('Failed to find app element in DOM')
    throw new Error('Could not find app element')
  }

  console.log('Initializing Svelte app...')
  const app = mount(App, {
    target
  })

  console.log('✅ Werewolf Frontend initialized successfully')
  
  return app
}

// Initialize the app
const appPromise = initializeApp().catch(console.error)

export default appPromise