import { LayoutDashboard, Briefcase, Mail, Bot, Settings } from 'lucide-react'

export const NAV = [
  { to: '/',         label: 'Home',     icon: LayoutDashboard, accent: '#94a3b8' },
  { to: '/pipeline', label: 'Pipeline', icon: Briefcase,       accent: '#a78bfa' },
  { to: '/inbox',    label: 'Inbox',    icon: Mail,            accent: '#38bdf8' },
  { to: '/agent',    label: 'Agent',    icon: Bot,             accent: '#F59E0B' },
  { to: '/settings', label: 'Settings', icon: Settings,        accent: '#64748b' },
] as const
