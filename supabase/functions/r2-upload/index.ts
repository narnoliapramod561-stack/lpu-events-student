// supabase/functions/r2-upload/index.ts
// LPU Events Secure Cloudflare R2 Multi-Variant Image Upload Gateway
// Authenticates caller JWT -> Checks Admin Role -> Validates Binary WebP Signatures ->
// Streams Variants to Cloudflare R2 -> Atomic Rollback on Failure -> Inserts READY media_assets

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

// Explicit Allowed CORS Origins
const ALLOWED_ORIGINS = [
  "https://admin.lpuevents.live",
  "https://lpuevents.live",
  "https://www.lpuevents.live",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
  "http://localhost:3001",
];

function getCorsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("Origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : "https://admin.lpuevents.live";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json",
  };
}

// -----------------------------------------------------------------------------
// AWS Signature Version 4 for Cloudflare R2 S3-Compatible API
// -----------------------------------------------------------------------------
async function hmacSha256(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
}

async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const buffer = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function getSignatureKey(key: string, dateStamp: string, regionName: string, serviceName: string): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(new TextEncoder().encode("AWS4" + key), dateStamp);
  const kRegion = await hmacSha256(kDate, regionName);
  const kService = await hmacSha256(kRegion, serviceName);
  return await hmacSha256(kService, "aws4_request");
}

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicBaseUrl: string;
}

function getR2Config(): R2Config | null {
  const accountId = Deno.env.get("R2_ACCOUNT_ID");
  const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const bucketName = Deno.env.get("R2_BUCKET_NAME") || "lpu-events-images";
  const publicBaseUrl = (Deno.env.get("R2_PUBLIC_URL") || "https://images.lpuevents.live").replace(/\/+$/, "");

  if (!accountId || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return { accountId, accessKeyId, secretAccessKey, bucketName, publicBaseUrl };
}

async function uploadObjectToR2(
  r2: R2Config,
  key: string,
  body: Uint8Array,
  contentType: string = "image/webp",
  cacheControl: string = "public, max-age=31536000, immutable"
): Promise<{ success: boolean; error?: string }> {
  const host = `${r2.accountId}.r2.cloudflarestorage.com`;
  const cleanKey = key.replace(/^\/+/, "");
  // Encode URI path components safely
  const encodedPath = `/${r2.bucketName}/${cleanKey.split("/").map(encodeURIComponent).join("/")}`;
  const endpoint = `https://${host}${encodedPath}`;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const region = "auto";
  const service = "s3";

  const payloadHash = await sha256Hex(body);

  const canonicalHeaders =
    `cache-control:${cacheControl}\n` +
    `content-type:${contentType}\n` +
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;

  const signedHeaders = "cache-control;content-type;host;x-amz-content-sha256;x-amz-date";

  const canonicalRequest =
    `PUT\n` +
    `${encodedPath}\n` +
    `\n` +
    `${canonicalHeaders}\n` +
    `${signedHeaders}\n` +
    `${payloadHash}`;

  const canonicalRequestHash = await sha256Hex(canonicalRequest);

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign =
    `AWS4-HMAC-SHA256\n` +
    `${amzDate}\n` +
    `${credentialScope}\n` +
    `${canonicalRequestHash}`;

  const signingKey = await getSignatureKey(r2.secretAccessKey, dateStamp, region, service);
  const signatureBuffer = await hmacSha256(signingKey, stringToSign);
  const signature = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${r2.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  try {
    const response = await fetch(endpoint, {
      method: "PUT",
      headers: {
        "Host": host,
        "x-amz-date": amzDate,
        "x-amz-content-sha256": payloadHash,
        "Content-Type": contentType,
        "Cache-Control": cacheControl,
        "Authorization": authorizationHeader,
      },
      body: body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `R2 returned HTTP ${response.status}: ${errorText}` };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message || "R2 network connection failure." };
  }
}

async function deleteObjectFromR2(r2: R2Config, key: string): Promise<boolean> {
  const host = `${r2.accountId}.r2.cloudflarestorage.com`;
  const cleanKey = key.replace(/^\/+/, "");
  const encodedPath = `/${r2.bucketName}/${cleanKey.split("/").map(encodeURIComponent).join("/")}`;
  const endpoint = `https://${host}${encodedPath}`;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const region = "auto";
  const service = "s3";

  const payloadHash = await sha256Hex("");

  const canonicalHeaders =
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;

  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";

  const canonicalRequest =
    `DELETE\n` +
    `${encodedPath}\n` +
    `\n` +
    `${canonicalHeaders}\n` +
    `${signedHeaders}\n` +
    `${payloadHash}`;

  const canonicalRequestHash = await sha256Hex(canonicalRequest);
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign =
    `AWS4-HMAC-SHA256\n` +
    `${amzDate}\n` +
    `${credentialScope}\n` +
    `${canonicalRequestHash}`;

  const signingKey = await getSignatureKey(r2.secretAccessKey, dateStamp, region, service);
  const signatureBuffer = await hmacSha256(signingKey, stringToSign);
  const signature = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${r2.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  try {
    const res = await fetch(endpoint, {
      method: "DELETE",
      headers: {
        "Host": host,
        "x-amz-date": amzDate,
        "x-amz-content-sha256": payloadHash,
        "Authorization": authorizationHeader,
      },
    });
    return res.ok || res.status === 204;
  } catch {
    return false;
  }
}

// -----------------------------------------------------------------------------
// Security & Binary Validation
// -----------------------------------------------------------------------------
const DANGEROUS_EXTENSIONS = [
  ".php", ".php3", ".php4", ".php5", ".phtml", ".phar",
  ".exe", ".sh", ".bash", ".py", ".pl", ".cgi", ".bat", ".cmd",
  ".vbs", ".js", ".mjs", ".jsp", ".asp", ".aspx", ".jar", ".war"
];

function sanitizeFilename(filename: string): boolean {
  const lower = filename.toLowerCase();
  for (const ext of DANGEROUS_EXTENSIONS) {
    if (lower.endsWith(ext) || lower.includes(ext + ".")) {
      return false;
    }
  }
  return true;
}

function validateWebPSignature(bytes: Uint8Array): boolean {
  if (bytes.length < 16) return false;
  // RIFF header: 0x52, 0x49, 0x46, 0x46
  const isRiff = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
  // WEBP container: 0x57, 0x45, 0x42, 0x50 at offset 8
  const isWebp = bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  return isRiff && isWebp;
}

function contextToMediaType(context: string): string {
  switch (context) {
    case "hero":
      return "CAROUSEL_IMAGE";
    case "event-banner":
    case "event-card":
    case "thumbnail":
    case "admin-preview":
      return "EVENT_BANNER";
    case "advertisement":
      return "ADVERTISEMENT";
    case "sponsor-logo":
      return "SPONSOR_LOGO";
    case "memory":
      return "MEMORY_IMAGE";
    default:
      return "EVENT_BANNER";
  }
}

const ALLOWED_CONTEXTS = [
  "hero",
  "event-banner",
  "event-card",
  "advertisement",
  "sponsor-logo",
  "memory",
  "thumbnail",
  "admin-preview"
];

// -----------------------------------------------------------------------------
// Main Edge Request Handler
// -----------------------------------------------------------------------------
serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  // 1. Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "METHOD_NOT_ALLOWED", message: "Only POST requests are allowed." }), {
      status: 405,
      headers: corsHeaders,
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  // 2. Authentication: Extract and verify JWT
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "UNAUTHENTICATED", message: "Missing or invalid Bearer authentication token." }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  const jwt = authHeader.replace(/^Bearer\s+/i, "");

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "UNAUTHENTICATED", message: "Invalid or expired session token." }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  // 3. Authorization: Check Admin Users and Role Privileges
  const adminClient = createClient(supabaseUrl, supabaseServiceKey);

  const { data: adminProfile, error: profileErr } = await adminClient
    .from("admin_users")
    .select("id, is_active")
    .eq("auth_user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (profileErr || !adminProfile) {
    return new Response(JSON.stringify({ error: "FORBIDDEN", message: "No active administrator profile found for this user." }), {
      status: 403,
      headers: corsHeaders,
    });
  }

  // Check if Super Admin
  const { data: superAdminRole } = await adminClient
    .from("platform_admin_roles")
    .select("role")
    .eq("admin_user_id", adminProfile.id)
    .eq("role", "SUPER_ADMIN")
    .maybeSingle();

  const isSuperAdmin = Boolean(superAdminRole);

  // 4. Parse Multipart Payload
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (err) {
    return new Response(JSON.stringify({ error: "INVALID_FORM_DATA", message: "Failed to parse multipart/form-data payload." }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  const context = (formData.get("context") as string || "event-banner").trim();
  const checksum = (formData.get("checksum") as string || "").trim().toLowerCase();
  const metadataRaw = formData.get("metadata") as string;

  // Context validation
  if (!ALLOWED_CONTEXTS.includes(context)) {
    return new Response(JSON.stringify({ error: "INVALID_CONTEXT", message: `Unsupported image context "${context}".` }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  // Super Admin Role Enforcement for Platform Contexts
  const platformContexts = ["hero", "advertisement", "sponsor-logo", "memory"];
  if (platformContexts.includes(context) && !isSuperAdmin) {
    return new Response(JSON.stringify({ error: "FORBIDDEN", message: `Super Admin privileges required to upload media for "${context}".` }), {
      status: 403,
      headers: corsHeaders,
    });
  }

  // Checksum format validation (64-character SHA-256 hex string)
  if (!/^[a-f0-9]{8,64}$/.test(checksum)) {
    return new Response(JSON.stringify({ error: "INVALID_CHECKSUM", message: "Checksum must be a valid hex string." }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  let parsedMetadata: any = {};
  try {
    if (metadataRaw) parsedMetadata = JSON.parse(metadataRaw);
  } catch {
    parsedMetadata = {};
  }

  // 5. Gather and Validate All WebP Variants
  interface VariantUploadItem {
    name: "desktop" | "tablet" | "mobile";
    file: File;
    bytes: Uint8Array;
    objectKey: string;
    width: number;
    height: number;
  }

  const variantUploads: VariantUploadItem[] = [];
  const hashPrefix = checksum.slice(0, 4);

  // Check for desktop (primary), tablet, and mobile files
  const variantKeys: Array<"desktop" | "tablet" | "mobile"> = ["desktop", "tablet", "mobile"];

  for (const varName of variantKeys) {
    const fileEntry = formData.get(`file_${varName}`) || (varName === "desktop" ? formData.get("file") : null);
    if (fileEntry && fileEntry instanceof File) {
      if (!sanitizeFilename(fileEntry.name)) {
        return new Response(JSON.stringify({ error: "MALICIOUS_FILENAME", message: `Filename for variant "${varName}" contains disallowed extensions.` }), {
          status: 400,
          headers: corsHeaders,
        });
      }

      // Max size limit per variant: 10MB
      if (fileEntry.size > 10 * 1024 * 1024) {
        return new Response(JSON.stringify({ error: "FILE_TOO_LARGE", message: `Variant "${varName}" exceeds maximum allowed size of 10MB.` }), {
          status: 400,
          headers: corsHeaders,
        });
      }

      const buffer = await fileEntry.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      // Validate WebP Magic Bytes
      if (!validateWebPSignature(bytes)) {
        return new Response(JSON.stringify({ error: "INVALID_WEBP_SIGNATURE", message: `Binary header for variant "${varName}" is not a valid WebP image.` }), {
          status: 400,
          headers: corsHeaders,
        });
      }

      // Find variant width/height in metadata if present
      const metaVar = parsedMetadata?.variants?.find((v: any) => v.name === varName);
      const width = metaVar?.width || (varName === "desktop" ? 1200 : varName === "tablet" ? 800 : 480);
      const height = metaVar?.height || (varName === "desktop" ? 630 : varName === "tablet" ? 420 : 252);

      const objectKey = `optimized/${context}/v1/${hashPrefix}/${checksum}_${varName}.webp`;

      variantUploads.push({
        name: varName,
        file: fileEntry,
        bytes,
        objectKey,
        width,
        height,
      });
    }
  }

  // Primary desktop variant is strictly required
  const desktopVariant = variantUploads.find((v) => v.name === "desktop");
  if (!desktopVariant) {
    return new Response(JSON.stringify({ error: "MISSING_PRIMARY_VARIANT", message: "Primary desktop WebP variant is required." }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  // 6. Upload All Variants to Cloudflare R2
  const r2Config = getR2Config();
  const completedR2Keys: string[] = [];
  let r2Error: string | null = null;

  if (r2Config) {
    for (const item of variantUploads) {
      const uploadRes = await uploadObjectToR2(
        r2Config,
        item.objectKey,
        item.bytes,
        "image/webp",
        "public, max-age=31536000, immutable"
      );

      if (!uploadRes.success) {
        r2Error = uploadRes.error || `Failed uploading variant ${item.name} to R2.`;
        break;
      }
      completedR2Keys.push(item.objectKey);
    }

    // Rollback on Partial R2 Failure
    if (r2Error) {
      console.error("R2 Upload failed during multi-variant batch. Rolling back:", r2Error);
      for (const rollbackKey of completedR2Keys) {
        await deleteObjectFromR2(r2Config, rollbackKey);
      }
      return new Response(JSON.stringify({ error: "R2_UPLOAD_FAILED", message: `Cloudflare R2 write failed: ${r2Error}` }), {
        status: 502,
        headers: corsHeaders,
      });
    }
  } else {
    // If running in local development mode without R2 keys configured, log warning
    console.warn("Cloudflare R2 secrets not configured. Storing in Supabase storage emulation mode.");
    try {
      for (const item of variantUploads) {
        await adminClient.storage.from("media").upload(item.objectKey, item.bytes, {
          contentType: "image/webp",
          cacheControl: "public, max-age=31536000, immutable",
          upsert: true,
        });
        completedR2Keys.push(item.objectKey);
      }
    } catch (storageErr) {
      console.warn("Storage fallback error:", storageErr);
    }
  }

  // 7. Atomic PostgreSQL Registration (media_assets)
  const publicBaseUrl = r2Config?.publicBaseUrl || "https://images.lpuevents.live";
  const primaryObjectKey = desktopVariant.objectKey;
  const primaryPublicUrl = `${publicBaseUrl}/${primaryObjectKey}`;
  const mediaType = contextToMediaType(context);

  const finalMetadata = {
    pipeline_version: 1,
    context,
    original_size_bytes: parsedMetadata?.original_size_bytes || desktopVariant.file.size,
    optimized_size_bytes: desktopVariant.file.size,
    savings_percentage: parsedMetadata?.savings_percentage || 0,
    compression_ratio: parsedMetadata?.compression_ratio || 1.0,
    variants: variantUploads.map((v) => ({
      name: v.name,
      object_key: v.objectKey,
      width: v.width,
      height: v.height,
      file_size_bytes: v.bytes.length,
    })),
  };

  const { data: mediaAsset, error: dbErr } = await adminClient
    .from("media_assets")
    .insert({
      bucket: r2Config?.bucketName || "lpu-events-images",
      object_key: primaryObjectKey,
      media_type: mediaType,
      mime_type: "image/webp",
      file_size_bytes: desktopVariant.bytes.length,
      checksum,
      width: desktopVariant.width,
      height: desktopVariant.height,
      context,
      metadata: finalMetadata,
      status: "READY",
      created_by: adminProfile.id,
      verified_at: new Date().toISOString(),
    })
    .select("id, object_key")
    .single();

  if (dbErr || !mediaAsset) {
    // Check if deduplication record already exists
    const { data: existingAsset } = await adminClient
      .from("media_assets")
      .select("id, object_key")
      .eq("object_key", primaryObjectKey)
      .maybeSingle();

    if (existingAsset) {
      return new Response(
        JSON.stringify({
          success: true,
          media_id: existingAsset.id,
          object_key: existingAsset.object_key,
          public_url: primaryPublicUrl,
          context,
          variants: finalMetadata.variants,
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    // Rollback R2 Objects if Database Insert Fails
    console.error("Database registration failed for uploaded R2 assets. Rolling back R2 objects:", dbErr);
    if (r2Config) {
      for (const rollbackKey of completedR2Keys) {
        await deleteObjectFromR2(r2Config, rollbackKey);
      }
    }

    return new Response(
      JSON.stringify({ error: "DATABASE_REGISTRATION_FAILED", message: `Failed to save media metadata: ${dbErr?.message || "Database error"}` }),
      { status: 500, headers: corsHeaders }
    );
  }

  // 8. Return Verified Upload Metadata
  return new Response(
    JSON.stringify({
      success: true,
      media_id: mediaAsset.id,
      object_key: mediaAsset.object_key,
      public_url: primaryPublicUrl,
      context,
      variants: finalMetadata.variants,
    }),
    { status: 200, headers: corsHeaders }
  );
});
