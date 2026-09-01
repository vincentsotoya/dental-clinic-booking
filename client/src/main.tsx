import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'
import { createQueryClient } from './api/query-client'
import { router } from './router'
import './index.css'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('#root not found in index.html')

// Built once, outside render: a client created inside a component would be
// replaced on every render and throw the cache away with it.
const queryClient = createQueryClient()

createRoot(rootEl).render(
  <StrictMode>
    {/* Query outside Router: the session hook is read by the guard, which is
        itself a route, so the cache has to exist before routing begins. */}
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
