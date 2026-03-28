import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { bootstrapAuth } from './lib/api'
import { Layout } from './components/Layout'
import HomePage from './pages/Home/index'
import PipelinePage from './pages/Pipeline/index'
import AppsPage from './pages/Apps/index'
import InboxPage from './pages/Inbox/index'
import AgentPage from './pages/Agent/index'
import SettingsPage from './pages/Settings/index'
import './styles.css'

import { TaskProvider } from './lib/TaskContext'

bootstrapAuth()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
})

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element #root not found in DOM')
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <TaskProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="chat" element={<Navigate to="/agent?tab=chat" replace />} />
              <Route path="pipeline/*" element={<PipelinePage />} />
              <Route path="apps" element={<Navigate to="/pipeline?tab=applications" replace />} />
              <Route path="inbox/*" element={<InboxPage />} />
              <Route path="agent/*" element={<AgentPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </TaskProvider>
    </QueryClientProvider>
  </React.StrictMode>
)
