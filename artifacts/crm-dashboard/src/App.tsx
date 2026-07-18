import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Dashboard from '@/pages/Dashboard';
import LeadsPage from '@/pages/LeadsPage';
import TelecallerPage from '@/pages/TelecallerPage';
import InvoicePage from '@/pages/InvoicePage';
import WhatsAppPage from '@/pages/WhatsAppPage';
import SocialMediaPage from '@/pages/SocialMediaPage';
import AnalyticsPage from '@/pages/AnalyticsPage';
import NotFound from '@/pages/not-found';
import { LeadsProvider } from '@/contexts/LeadsContext';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <LeadsProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Routes>
            <Route element={<DashboardLayout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/leads" element={<LeadsPage />} />
              <Route path="/telecaller" element={<TelecallerPage />} />
              <Route path="/whatsapp" element={<WhatsAppPage />} />
              <Route path="/social-media" element={<SocialMediaPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/invoices" element={<InvoicePage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        <Toaster />
        </LeadsProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
