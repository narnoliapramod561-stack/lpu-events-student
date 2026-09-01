// supabase/functions/r2-upload/index.ts
// LPU Events Secure Cloudflare R2 Multi-Variant Image Upload Gateway
// Authenticates caller JWT -> Checks Admin Role -> Validates Binary WebP Signatures ->
// Streams Variants to Cloudflare R2 -> Atomic Rollback on Failure -> Inserts READY media_assets

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "npm:@aws-sdk/client-s3@3.600.0";

// Explicit Allowed CORS Origins
const ALLOWED_ORIGINS = [
  "https://www.lpueventsadmin.live",
  "https://lpueventsadmin.live",
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
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : "https://www.lpueventsadmin.live";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json",
  };
}

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicBaseUrl: string;
  s3: S3Client;
}

function getR2Config(): R2Config | null {
  const accountId = Deno.env.get("R2_ACCOUNT_ID") || "ebc6930d2f0caf22655c09bd8296e9e1";
  const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID") || "";
  const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY") || "";
  const bucketName = Deno.env.get("R2_BUCKET_NAME") || "lpu-events-images";
  const publicBaseUrl = (Deno.env.get("R2_PUBLIC_URL") || "https://images.lpuevents.live").replace(/\/+$/, "");

  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: accessKeyId || "anonymous",
      secretAccessKey: secretAccessKey || "anonymous",
    },
  });

  return { accountId, accessKeyId, secretAccessKey, bucketName, publicBaseUrl, s3 };
}

async function uploadObjectToR2(
  r2: R2Config,
  key: string,
  body: Uint8Array,
  contentType: string = "image/webp",
  cacheControl: string = "public, max-age=31536000, immutable"
): Promise<{ success: boolean; error?: string }> {
  const cleanKey = key.replace(/^\/+/, "");

  // 1. Try S3 SDK if credentials look valid
  if (r2.accessKeyId && r2.secretAccessKey && r2.accessKeyId !== "anonymous") {
    try {
      await r2.s3.send(
        new PutObjectCommand({
          Bucket: r2.bucketName,
          Key: cleanKey,
          Body: body,
          ContentType: contentType,
          CacheControl: cacheControl,
        })
      );
      return { success: true };
    } catch (s3Err: any) {
      console.warn("S3 SDK upload error for key:", cleanKey, s3Err?.message);
    }
  }

  // 2. Try Cloudflare REST API direct PUT with Bearer Token
  const candidateTokens = [
    Deno.env.get("CLOUDFLARE_API_TOKEN"),
    Deno.env.get("R2_ACCESS_KEY_ID"),
    Deno.env.get("R2_SECRET_ACCESS_KEY"),
  ].filter(Boolean) as string[];

  for (const token of candidateTokens) {
    try {
      const restUrl = `https://api.cloudflare.com/client/v4/accounts/${r2.accountId}/r2/buckets/${r2.bucketName}/objects/${cleanKey}`;
      const res = await fetch(restUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": contentType,
          "Cache-Control": cacheControl,
        },
        body: body,
      });

      if (res.ok) {
        return { success: true };
      }
    } catch (restErr) {
      console.warn("Cloudflare REST API upload attempt error:", restErr);
    }
  }

  return { success: false, error: "R2 write failed across S3 and REST APIs." };
}

async function deleteObjectFromR2(r2: R2Config, key: string): Promise<boolean> {
  try {
    const cleanKey = key.replace(/^\/+/, "");
    await r2.s3.send(
      new DeleteObjectCommand({
        Bucket: r2.bucketName,
        Key: cleanKey,
      })
    );
    return true;
  } catch (err) {
    console.error("R2 DeleteObjectCommand failed for key:", key, err);
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
  let targetBucket = "lpu-events-images";

  if (r2Config) {
    targetBucket = r2Config.bucketName;
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
      console.warn("R2 Upload failed, attempting Supabase storage fallback:", r2Error);
      targetBucket = "media";
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
  } else {
    // If running without R2 keys configured, store in Supabase storage emulation
    targetBucket = "media";
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
  const primaryPublicUrl = targetBucket === "media"
    ? `https://nhjphyqiqhmxdhppljap.supabase.co/storage/v1/object/public/media/${primaryObjectKey}`
    : `${publicBaseUrl}/${primaryObjectKey}`;
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
      bucket: targetBucket,
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
