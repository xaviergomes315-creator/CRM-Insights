import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as SonnerToaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { LeadsProvider } from '@/contexts/LeadsContext';
import { TasksProvider } from '@/contexts/TasksContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import DashboardLayout from '@/components/layout/DashboardLayout';
import LoginPage from '@/pages/LoginPage';
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
import AdminPage from '@/pages/AdminPage';
import ClientPortal from '@/pages/ClientPortal';
import Integrations from '@/pages/Integrations';
import PublicLeadForm from '@/pages/PublicLeadForm';
import HRPage from '@/pages/HRPage';
import SettingsPage from '@/pages/SettingsPage';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {/* AuthProvider must wrap everything so useAuth() works in ProtectedRoute */}
        <AuthProvider>
          <LeadsProvider>
            <TasksProvider>
              <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
                <Routes>

                  {/* ── Public (no auth required) ────────────────────────── */}
                  <Route path="/login"            element={<LoginPage />}      />
                  {/* Embeddable lead form — must stay OUTSIDE ProtectedRoute */}
                  <Route path="/embed/lead-form"  element={<PublicLeadForm />} />

                  {/* ── Protected: any authenticated user ────────────────── */}
                  <Route element={<ProtectedRoute />}>
                    <Route element={<DashboardLayout />}>
                      <Route path="/"            element={<Dashboard />}     />
                      <Route path="/leads"        element={<LeadsPage />}     />
                      <Route path="/pipeline"     element={<PipelineView />}  />
                      <Route path="/telecaller"   element={<TelecallerPage />}/>
                      <Route path="/tasks"        element={<TasksPage />}     />
                      <Route path="/proposals"    element={<ProposalPage />}  />
                      <Route path="/whatsapp"     element={<WhatsAppPage />}  />
                      <Route path="/social-media" element={<SocialMediaPage />}/>
                      <Route path="/hr"           element={<HRPage />}        />

                      {/* ── Admin only ─────────────────────────────────── */}
                      <Route element={<ProtectedRoute adminOnly />}>
                        <Route path="/analytics"    element={<AnalyticsPage />} />
                        <Route path="/invoices"     element={<InvoicePage />}   />
                        <Route path="/admin"        element={<AdminPage />}     />
                        <Route path="/integrations" element={<Integrations />}  />
                        <Route path="/settings"     element={<SettingsPage />}  />
                      </Route>

                      {/* ── Accessible to all authenticated users ──────── */}
                      <Route path="/client-portal" element={<ClientPortal />} />
                    </Route>
                  </Route>

                  {/* ── 404 ──────────────────────────────────────────────── */}
                  <Route path="*" element={<NotFound />} />

                </Routes>
              </BrowserRouter>
              <Toaster />
              <SonnerToaster position="top-right" richColors closeButton />
            </TasksProvider>
          </LeadsProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
