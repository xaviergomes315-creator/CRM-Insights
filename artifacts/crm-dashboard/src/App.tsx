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
import PipelineView from '@/pages/PipelineView';
import ProposalPage from '@/pages/ProposalPage';
import TasksPage from '@/pages/TasksPage';
import NotFound from '@/pages/not-found';
import { LeadsProvider } from '@/contexts/LeadsContext';
import { TasksProvider } from '@/contexts/TasksContext';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <LeadsProvider>
          <TasksProvider>
            <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
              <Routes>
                <Route element={<DashboardLayout />}>
                  <Route path="/"          element={<Dashboard />} />
                  <Route path="/leads"     element={<LeadsPage />} />
                  <Route path="/pipeline"  element={<PipelineView />} />
                  <Route path="/telecaller"element={<TelecallerPage />} />
                  <Route path="/whatsapp"  element={<WhatsAppPage />} />
                  <Route path="/social-media" element={<SocialMediaPage />} />
                  <Route path="/analytics" element={<AnalyticsPage />} />
                  <Route path="/invoices"  element={<InvoicePage />} />
                  <Route path="/proposals" element={<ProposalPage />} />
                  <Route path="/tasks"     element={<TasksPage />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
            <Toaster />
          </TasksProvider>
        </LeadsProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
