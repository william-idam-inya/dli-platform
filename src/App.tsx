import { Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import { navigationItems } from './data/navigation';
import DashboardPage from './pages/DashboardPage';
import ModulePage from './pages/ModulePage';
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        {navigationItems.filter((item) => item.path !== '/').map((item) => (
          <Route key={item.path} path={item.path} element={<ModulePage item={item} />} />
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
  );
}