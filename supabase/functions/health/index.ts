// supabase/functions/health/index.ts
// LPU Events Edge Health Check Function for Uptime & Availability Monitoring (e.g., Better Stack)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Cache-Control": "no-cache, no-store, must-revalidate",
  "Content-Type": "application/json",
};

async function reportEdgeErrorToSentry(err: unknown, context: string): Promise<void> {
  try {
    const dsn = Deno.env.get("SENTRY_DSN");
    if (!dsn || !dsn.startsWith("http")) return;

    // Direct HTTP POST to Sentry envelope endpoint for serverless edge runtimes
    const parsedDsn = new URL(dsn);
    const projectId = parsedDsn.pathname.replace(/^\//, '');
    const sentryKey = parsedDsn.username;
    const sentryUrl = `${parsedDsn.origin}/api/${projectId}/store/?sentry_key=${sentryKey}&sentry_version=7`;

    const errorEvent = {
      event_id: crypto.randomUUID().replace(/-/g, ''),
      timestamp: new Date().toISOString(),
      platform: "javascript",
      level: "error",
      tags: { app: "edge-function", function: "health", context },
      message: err instanceof Error ? err.message : String(err),
    };

    await fetch(sentryUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(errorEvent),
    });
  } catch {
    // Non-blocking
  }
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

  try {
    let databaseStatus = "unknown";

    if (supabaseUrl && supabaseAnonKey) {
      const client = createClient(supabaseUrl, supabaseAnonKey);
      
      // Fast lightweight database probe via RPC
      const { data, error } = await client.rpc("health_check");

      if (error) {
        // Fallback probe to basic query if RPC not found during transitional rollout
        const { error: queryErr } = await client.from("resource_versions").select("resource").limit(1);
        if (queryErr) {
          databaseStatus = "degraded";
          await reportEdgeErrorToSentry(queryErr, "database_fallback_probe_failed");
        } else {
          databaseStatus = "healthy";
        }
      } else {
        databaseStatus = data?.status === "healthy" ? "healthy" : "degraded";
      }
    } else {
      databaseStatus = "unconfigured_local";
    }

    const isHealthy = databaseStatus === "healthy" || databaseStatus === "unconfigured_local";
    const latencyMs = Date.now() - startTime;

    const responsePayload = {
      status: isHealthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      latency_ms: latencyMs,
      services: {
        edge_runtime: "healthy",
        database: databaseStatus
      }
    };

    return new Response(JSON.stringify(responsePayload), {
      status: isHealthy ? 200 : 503,
      headers: corsHeaders,
    });
  } catch (err) {
    await reportEdgeErrorToSentry(err, "unhandled_edge_exception");

    // Safe error response - never leak internal stack traces, env variables, or credentials
    const errorPayload = {
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      services: {
        edge_runtime: "error",
        database: "unreachable"
      }
    };

    return new Response(JSON.stringify(errorPayload), {
      status: 503,
      headers: corsHeaders,
    });
  }
});
