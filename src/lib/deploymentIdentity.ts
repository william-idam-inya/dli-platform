import { determineDliEnvironment } from './environmentPolicy';

// The selected Supabase project is set at Cloudflare BUILD time.
// Browser hostnames are an additional guard, never a source of role rights.
export const deploymentIdentity = determineDliEnvironment(
  import.meta.env.VITE_SUPABASE_URL,
  typeof window === 'undefined' ? '' : window.location.hostname,
);
