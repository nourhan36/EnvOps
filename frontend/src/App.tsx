import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import DashboardPage from '@/pages/DashboardPage';
import SandboxTerminalPage from '@/pages/SandboxTerminalPage';
import LabGeneratorPage from '@/pages/LabGeneratorPage';
import SettingsPage from '@/pages/SettingsPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="sandbox" element={<SandboxTerminalPage />} />
          <Route path="lab-generator" element={<LabGeneratorPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
