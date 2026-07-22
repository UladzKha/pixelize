import { DashboardPage } from './pages/DashboardPage';
import { UploadPage } from './pages/UploadPage';

function App() {
  const isDashboard = window.location.pathname.startsWith('/dashboard');
  return isDashboard ? <DashboardPage /> : <UploadPage />;
}

export default App;
