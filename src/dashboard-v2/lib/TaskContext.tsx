import React, { createContext, useContext, useState, useEffect, useRef } from 'react'
import { api } from './api'

export interface TaskInfo {
  id: string
  status: 'queued' | 'running' | 'done' | 'error' | 'cancelled'
  lastMessage?: string
  progress?: number
  error?: string
}

interface TaskContextType {
  tasks: TaskInfo[]
  refreshTasks: () => Promise<void>
}

const TaskContext = createContext<TaskContextType | undefined>(undefined)

export function TaskProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<TaskInfo[]>([])
  const timerRef = useRef<number | null>(null)

  const refreshTasks = async () => {
    try {
      const data = await api.get<TaskInfo[]>('/api/tasks')
      setTasks(data || [])
    } catch {
      // fail silently
    }
  }

  useEffect(() => {
    refreshTasks()
    timerRef.current = window.setInterval(refreshTasks, 3000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  return (
    <TaskContext.Provider value={{ tasks, refreshTasks }}>
      {children}
    </TaskContext.Provider>
  )
}

export function useTasks() {
  const context = useContext(TaskContext)
  if (!context) throw new Error('useTasks must be used within a TaskProvider')
  return context
}
