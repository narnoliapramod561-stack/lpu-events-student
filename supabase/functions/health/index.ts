// supabase/functions/health/index.ts
// LPU Events Edge Health Check Function for Uptime & Availability Monitoring (UptimeRobot)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Cache-Control": "no-cache, no-store, must-revalidate",
  "Content-Type": "application/json",
};

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
          console.error("[HealthProbe] Database probe failed:", queryErr);
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
    console.error("[HealthProbe] Unhandled edge exception:", err);

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
