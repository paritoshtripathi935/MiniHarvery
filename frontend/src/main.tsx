import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import './index.css'
import App from './App.tsx'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!PUBLISHABLE_KEY) {
  console.warn('VITE_CLERK_PUBLISHABLE_KEY is not set. Clerk auth will not work.')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY ?? ''}
      appearance={{
        variables: {
          colorPrimary: '#d4a017',
          colorBackground: '#0a1628',
          colorInputBackground: '#112040',
          colorInputText: '#f3f4f6',
          colorText: '#f3f4f6',
          colorTextSecondary: '#9ca3af',
          colorNeutral: '#ffffff',
          colorDanger: '#ef4444',
          colorSuccess: '#10b981',
          borderRadius: '0.5rem',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        },
      }}
    >
      <App />
    </ClerkProvider>
  </StrictMode>,
)
