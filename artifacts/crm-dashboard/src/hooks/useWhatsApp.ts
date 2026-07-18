/**
 * useWhatsApp — unified WhatsApp send hook
 *
 * Behaviour:
 *  • If `wa_api_token` is present in localStorage → simulate Meta Cloud API
 *    send and fire a green toast.
 *  • Otherwise → open the standard wa.me drip URL in a new tab (existing
 *    behaviour, zero regression).
 */
import { useToast } from '@/hooks/use-toast';
import { getDripWhatsAppUrl, type Lead } from '@/contexts/LeadsContext';

// ─── localStorage key constants ───────────────────────────────────────────────
// Keep in sync with Integrations.tsx settings form.
export const WA_LS_TOKEN    = 'wa_api_token';
export const WA_LS_PHONE_ID = 'wa_phone_number_id';

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWhatsApp() {
  const { toast } = useToast();

  /**
   * sendDrip — call this instead of the raw <a href={getDripWhatsAppUrl()}>.
   * Reads the token from localStorage at call-time (not at render-time) so the
   * setting change is picked up without a page reload.
   */
  function sendDrip(lead: Lead) {
    const token = localStorage.getItem(WA_LS_TOKEN);

    if (token) {
      // ── API path: simulate Meta Cloud API message send ──────────────────────
      // In a real integration you would POST to:
      //   https://graph.facebook.com/v19.0/{phoneId}/messages
      // with Authorization: Bearer <token> and a template/text body.
      toast({
        title: '✅ Message sent via API',
        description: `Drip message queued for ${lead.name} via WhatsApp Cloud API.`,
        // shadcn/ui toast accepts className for light styling overrides
        className: 'border-emerald-200 bg-emerald-50 text-emerald-900',
      });
    } else {
      // ── Fallback: open wa.me URL in a new tab (original behaviour) ──────────
      window.open(getDripWhatsAppUrl(lead), '_blank', 'noopener,noreferrer');
    }
  }

  return { sendDrip };
}
