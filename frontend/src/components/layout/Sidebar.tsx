import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Terminal,
  FlaskConical,
  Settings,
  Boxes,
} from 'lucide-react';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/sandbox', label: 'Sandbox Terminal', icon: Terminal },
  { to: '/lab-generator', label: 'Lab Generator', icon: FlaskConical },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-surface-raised">
      <div className="flex items-center gap-3 border-b border-border px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-muted text-accent-hover">
          <Boxes className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">EnvOps AI</p>
          <p className="text-xs text-gray-500">DevOps Sandbox</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-3">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-accent-muted text-accent-hover'
                  : 'text-gray-400 hover:bg-surface-overlay hover:text-gray-200',
              ].join(' ')
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-border p-4">
        <p className="text-xs text-gray-500">Warm-Pool Orchestrator</p>
        <p className="mt-1 text-xs font-mono text-status-active">● Connected</p>
      </div>
    </aside>
  );
}
