import { Bell, Key, Server, User } from 'lucide-react';

const settingsSections = [
  {
    title: 'Profile',
    icon: User,
    items: [
      { label: 'Display Name', value: 'DevOps Engineer' },
      { label: 'Email', value: 'engineer@envops.ai' },
    ],
  },
  {
    title: 'API & Connections',
    icon: Key,
    items: [
      { label: 'API URL', value: import.meta.env.VITE_API_URL || 'http://localhost:3001' },
      { label: 'Socket URL', value: import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001' },
    ],
  },
  {
    title: 'Warm-Pool',
    icon: Server,
    items: [
      { label: 'Pool Size', value: '5 containers' },
      { label: 'Default TTL', value: '2 hours' },
      { label: 'Region', value: 'us-east-1' },
    ],
  },
  {
    title: 'Notifications',
    icon: Bell,
    items: [
      { label: 'TTL Warnings', value: 'Enabled' },
      { label: 'Lab Ready Alerts', value: 'Enabled' },
    ],
  },
];

export default function SettingsPage() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="border-b border-border px-6 py-5">
        <h1 className="text-xl font-semibold text-white">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">Platform configuration and preferences</p>
      </header>

      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <div className="mx-auto max-w-2xl space-y-6">
          {settingsSections.map(({ title, icon: Icon, items }) => (
            <section
              key={title}
              className="rounded-xl border border-border bg-surface-raised p-5"
            >
              <div className="mb-4 flex items-center gap-2">
                <Icon className="h-4 w-4 text-accent-hover" />
                <h2 className="font-medium text-white">{title}</h2>
              </div>
              <dl className="space-y-3">
                {items.map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between text-sm">
                    <dt className="text-gray-500">{label}</dt>
                    <dd className="font-mono text-gray-300">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
