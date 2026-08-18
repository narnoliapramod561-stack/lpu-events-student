import { LpuEventsClient } from '@lpu-events/shared';

const DEFAULT_SUPABASE_URL = 'http://localhost:54321';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

export function resolveSupabaseUrl(rawUrl: string = DEFAULT_SUPABASE_URL): string {
  if (typeof window !== 'undefined' && window.location && window.location.hostname) {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        parsed.hostname = window.location.hostname;
        return parsed.origin;
      }
    } catch {
      // ignore URL parsing error and fallback to rawUrl
    }
  }
  return rawUrl;
}

const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const supabaseUrl = resolveSupabaseUrl(rawSupabaseUrl);
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

export const lpuClient = new LpuEventsClient(supabaseUrl, supabaseAnonKey);
export const supabase = lpuClient.supabase;

