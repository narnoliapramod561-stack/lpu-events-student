// supabase/functions/r2-upload/index.ts
// LPU Events Secure Cloudflare R2 Multi-Variant Image Upload Gateway
// Authenticates caller JWT -> Checks Admin Role -> Validates Binary WebP Signatures ->
// Streams Variants to Cloudflare R2 -> Atomic Rollback on Failure -> Inserts READY media_assets

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.18";

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
}

function getR2Config(): R2Config | null {
  const accountId = Deno.env.get("R2_ACCOUNT_ID") || "ebc6930d2f0caf22655c09bd8296e9e1";
  const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID") || "";
  const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY") || "";
  const bucketName = Deno.env.get("R2_BUCKET_NAME") || "lpu-events-images";
  const publicBaseUrl = (Deno.env.get("R2_PUBLIC_URL") || "https://images.lpuevents.live").replace(/\/+$/, "");

  return { accountId, accessKeyId, secretAccessKey, bucketName, publicBaseUrl };
}

async function uploadObjectToR2(
  r2: R2Config,
  key: string,
  body: Uint8Array,
  contentType: string = "image/webp",
  cacheControl: string = "public, max-age=31536000, immutable"
): Promise<{ success: boolean; error?: string }> {
  const cleanKey = key.replace(/^\/+/, "");
  let lastError = "";

  // 1. Native AWS SigV4 via aws4fetch (Fast, zero-hang, native to Deno Edge)
  if (r2.accessKeyId && r2.secretAccessKey && r2.accessKeyId !== "anonymous") {
    try {
      const aws = new AwsClient({
        accessKeyId: r2.accessKeyId,
        secretAccessKey: r2.secretAccessKey,
        service: "s3",
        region: "auto",
      });

      const targetUrl = `https://${r2.accountId}.r2.cloudflarestorage.com/${r2.bucketName}/${cleanKey}`;
      const fetchPromise = aws.fetch(targetUrl, {
        method: "PUT",
        headers: {
          "Content-Type": contentType,
          "Cache-Control": cacheControl,
        },
        body: body,
      });

      const timeoutPromise = new Promise<Response>((_, reject) =>
        setTimeout(() => reject(new Error("R2 upload timeout after 5s")), 5000)
      );

      const res = await Promise.race([fetchPromise, timeoutPromise]);
      if (res.ok) {
        return { success: true };
      } else {
        const txt = await res.text().catch(() => "");
        lastError = `R2 S3 HTTP ${res.status}: ${txt}`;
        console.warn("R2 S3 upload error:", lastError);
      }
    } catch (s3Err: any) {
      lastError = `R2 S3 Error: ${s3Err?.message || String(s3Err)}`;
      console.warn("R2 S3 upload exception:", cleanKey, lastError);
    }
  } else {
    lastError = "Missing R2_ACCESS_KEY_ID or R2_SECRET_ACCESS_KEY in Edge environment.";
  }

  return { success: false, error: lastError || "R2 write rejected." };
}

async function deleteObjectFromR2(r2: R2Config, key: string): Promise<boolean> {
  try {
    const cleanKey = key.replace(/^\/+/, "");
    if (!r2.accessKeyId || !r2.secretAccessKey || r2.accessKeyId === "anonymous") return false;
    const aws = new AwsClient({
      accessKeyId: r2.accessKeyId,
      secretAccessKey: r2.secretAccessKey,
      service: "s3",
      region: "auto",
    });
    const targetUrl = `https://${r2.accountId}.r2.cloudflarestorage.com/${r2.bucketName}/${cleanKey}`;
    const res = await aws.fetch(targetUrl, { method: "DELETE" });
    return res.ok;
  } catch (err) {
    console.warn("R2 delete error:", err);
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

function validateImageSignature(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;
  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return true;
  // WebP: RIFF ... WEBP
  if (validateWebPSignature(bytes)) return true;
  // AVIF: ftypavif / ftypavis
  if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return true;
  return false;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
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
    default:
      return "EVENT_BANNER";
  }
}

const ALLOWED_CONTEXTS = [
  "hero",
  "event-banner",
  "event-card",
  "advertisement",
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

  try {
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

  // 3. Authorization: require a provisioned, active admin identity.
  const adminClient = createClient(supabaseUrl, supabaseServiceKey);
  const { data: adminProfile, error: adminProfileError } = await adminClient
    .from("admin_users")
    .select("id, is_active")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (adminProfileError) {
    return new Response(JSON.stringify({ error: "AUTHORIZATION_LOOKUP_FAILED", message: "Could not verify the admin profile." }), {
      status: 500,
      headers: corsHeaders,
    });
  }
  if (!adminProfile || !adminProfile.is_active) {
    return new Response(JSON.stringify({ error: "FORBIDDEN", message: "An active admin profile is required." }), {
      status: 403,
      headers: corsHeaders,
    });
  }

  const effectiveAdminId = adminProfile.id;
  const [superAdminResult, membershipsResult] = await Promise.all([
    adminClient
      .from("platform_admin_roles")
      .select("role")
      .eq("admin_user_id", effectiveAdminId)
      .eq("role", "SUPER_ADMIN")
      .maybeSingle(),
    adminClient
      .from("organization_members")
      .select("organization_id")
      .eq("admin_user_id", effectiveAdminId)
      .eq("role", "ORGANIZER")
      .eq("is_active", true),
  ]);
  if (superAdminResult.error || membershipsResult.error) {
    return new Response(JSON.stringify({ error: "AUTHORIZATION_LOOKUP_FAILED", message: "Could not verify upload permissions." }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  const isSuperAdmin = Boolean(superAdminResult.data);
  const organizerOrganizationIds = new Set((membershipsResult.data || []).map((membership) => membership.organization_id));

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
  const platformContexts = new Set(["hero", "advertisement"]);
  const eventContexts = new Set(["event-banner", "event-card", "thumbnail", "admin-preview"]);
  if (platformContexts.has(context) && !isSuperAdmin) {
    return new Response(JSON.stringify({ error: "FORBIDDEN", message: `Super Admin privileges required to upload media for "${context}".` }), {
      status: 403,
      headers: corsHeaders,
    });
  }
  if (eventContexts.has(context) && !isSuperAdmin && organizerOrganizationIds.size === 0) {
    return new Response(JSON.stringify({ error: "FORBIDDEN", message: "An active organizer membership is required for event media uploads." }), {
      status: 403,
      headers: corsHeaders,
    });
  }

  const entityId = String(formData.get("entity_id") || "").trim();
  if (entityId && eventContexts.has(context) && !isSuperAdmin) {
    const { data: event, error: eventError } = await adminClient
      .from("events")
      .select("organization_id")
      .eq("id", entityId)
      .maybeSingle();
    if (eventError) {
      return new Response(JSON.stringify({ error: "AUTHORIZATION_LOOKUP_FAILED", message: "Could not verify event ownership." }), {
        status: 500,
        headers: corsHeaders,
      });
    }
    if (!event || !organizerOrganizationIds.has(event.organization_id)) {
      return new Response(JSON.stringify({ error: "FORBIDDEN", message: "You do not have access to this event." }), {
        status: 403,
        headers: corsHeaders,
      });
    }
  }

  // Verify the client checksum against the original bytes before accepting derived keys.
  if (!/^[a-f0-9]{64}$/.test(checksum)) {
    return new Response(JSON.stringify({ error: "INVALID_CHECKSUM", message: "Checksum must be a valid hex string." }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  const sourceFileEntry = formData.get("file_source") || formData.get("file_master");
  if (!(sourceFileEntry instanceof File) || sourceFileEntry.size <= 0 || sourceFileEntry.size > 15 * 1024 * 1024) {
    return new Response(JSON.stringify({ error: "INVALID_SOURCE_FILE", message: "A valid original image up to 15 MiB is required." }), {
      status: 400,
      headers: corsHeaders,
    });
  }
  if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(sourceFileEntry.type.toLowerCase())) {
    return new Response(JSON.stringify({ error: "INVALID_SOURCE_MIME", message: "Unsupported source image type." }), {
      status: 400,
      headers: corsHeaders,
    });
  }
  const sourceBytes = new Uint8Array(await sourceFileEntry.arrayBuffer());
  if (!validateImageSignature(sourceBytes) || await sha256Hex(sourceBytes) !== checksum) {
    return new Response(JSON.stringify({ error: "SOURCE_CHECKSUM_MISMATCH", message: "Original image validation failed." }), {
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
    name: string;
    file: File;
    bytes: Uint8Array;
    objectKey: string;
    width: number;
    height: number;
    isSlot?: boolean;
    isPresentation?: boolean;
    isMaster?: boolean;
    isPlacement?: boolean;
    contentType?: string;
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

      const objectKey = `optimized/${context}/v2/${hashPrefix}/${checksum}_${varName}.webp`;

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

  // Check for multi-slot synthesized derivatives (card, card_mobile, banner, banner_mobile, thumb)
  const slotKeys = ["card", "card_mobile", "banner", "banner_mobile", "thumb"] as const;
  for (const slotName of slotKeys) {
    const fileEntry = formData.get(`slot_${slotName}`) || formData.get(`file_slot_${slotName}`);
    if (fileEntry && fileEntry instanceof File) {
      if (!sanitizeFilename(fileEntry.name) || fileEntry.size > 10 * 1024 * 1024) continue;
      const buffer = await fileEntry.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      if (!validateWebPSignature(bytes)) continue;

      const width = slotName.startsWith("banner") ? 1920 : slotName === "thumb" ? 400 : 1200;
      const height = slotName.startsWith("banner") ? 800 : slotName === "thumb" ? 400 : 675;
      const slotContext = slotName.startsWith("card") ? "event-card" : slotName.startsWith("banner") ? "event-banner" : "thumbnail";
      const objectKey = `optimized/${slotContext}/v2/${hashPrefix}/${checksum}_${slotName}.webp`;

      variantUploads.push({
        name: slotName,
        file: fileEntry,
        bytes,
        objectKey,
        width,
        height,
        isSlot: true
      });
    }
  }

  // V2 Pipeline: Check for master/source file (untouched original)
  const masterFileEntry = sourceFileEntry;
  if (masterFileEntry && masterFileEntry instanceof File) {
    if (masterFileEntry.size <= 15 * 1024 * 1024) {
      const bytes = sourceBytes;
      if (validateImageSignature(bytes)) {
        const masterExt = masterFileEntry.type === "image/png" ? "png" : masterFileEntry.type === "image/webp" ? "webp" : "jpg";
        const isEventContext = ["event-banner", "event-card", "hero"].includes(context);
        const masterKey = isEventContext
          ? `events/v2/${hashPrefix}/${checksum}/source.${masterExt}`
          : `originals/v2/${context}/${hashPrefix}/${checksum}/source.${masterExt}`;
        const masterMime = masterFileEntry.type || "image/jpeg";

        variantUploads.push({
          name: "source",
          file: masterFileEntry,
          bytes,
          objectKey: masterKey,
          width: metaSource?.width || 0,
          height: metaSource?.height || 0,
          isMaster: true,
          contentType: masterMime
        });
      }
    }
  }

  // V2 Pipeline: Check for placement derivatives (hero, card, details) & responsive variants
  const placementKeys = [
    { formKey: "file_hero", name: "hero", width: 1920, height: 800, defKey: `events/v2/${hashPrefix}/${checksum}/hero.webp` },
    { formKey: "file_hero_1200w", name: "hero_1200w", width: 1200, height: 500, defKey: `events/v2/${hashPrefix}/${checksum}/hero_1200w.webp` },
    { formKey: "file_hero_800w", name: "hero_800w", width: 800, height: 333, defKey: `events/v2/${hashPrefix}/${checksum}/hero_800w.webp` },
    { formKey: "file_card", name: "card", width: 800, height: 480, defKey: `events/v2/${hashPrefix}/${checksum}/card.webp` },
    { formKey: "file_card_480w", name: "card_480w", width: 480, height: 288, defKey: `events/v2/${hashPrefix}/${checksum}/card_480w.webp` },
    { formKey: "file_details", name: "details", width: 1280, height: 720, defKey: `events/v2/${hashPrefix}/${checksum}/details.webp` },
    { formKey: "file_details_800w", name: "details_800w", width: 800, height: 450, defKey: `events/v2/${hashPrefix}/${checksum}/details_800w.webp` },
    { formKey: "file_details_640w", name: "details_640w", width: 640, height: 360, defKey: `events/v2/${hashPrefix}/${checksum}/details_640w.webp` }
  ];

  for (const p of placementKeys) {
    const fileEntry = formData.get(p.formKey);
    if (fileEntry && fileEntry instanceof File) {
      if (fileEntry.size > 10 * 1024 * 1024) continue;
      const buffer = await fileEntry.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      if (!validateWebPSignature(bytes)) continue;

      variantUploads.push({
        name: p.name,
        file: fileEntry,
        bytes,
        objectKey: p.defKey,
        width: p.width,
        height: p.height,
        isPlacement: true,
      });
    }
  }

  // V2 Pipeline: Check for presentation derivatives (file_pres_16_9, file_pres_7_5)
  const presKeys = ["16_9", "7_5"] as const;
  for (const presKey of presKeys) {
    const fileEntry = formData.get(`file_pres_${presKey}`);
    if (fileEntry && fileEntry instanceof File) {
      if (fileEntry.size > 10 * 1024 * 1024) continue;
      const buffer = await fileEntry.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      if (!validateWebPSignature(bytes)) continue;

      const ratioKey = presKey.replace("_", ":");
      const objectKey = `optimized/event-banner/v2/${hashPrefix}/${checksum}_${presKey}.webp`;
      const width = presKey === "16_9" ? 1600 : 1050;
      const height = presKey === "16_9" ? 900 : 750;

      variantUploads.push({
        name: `pres_${presKey}`,
        file: fileEntry,
        bytes,
        objectKey,
        width,
        height,
        isPresentation: true
      });
    }
  }

  // Primary variant is strictly required (details, hero, card, or desktop)
  const desktopVariant =
    variantUploads.find((v) => v.name === "desktop" || v.name === "details" || v.name === "hero" || v.name === "card") ||
    variantUploads[0];

  if (!desktopVariant) {
    return new Response(JSON.stringify({ error: "MISSING_PRIMARY_VARIANT", message: "Primary WebP derivative is required." }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  if (variantUploads.some((item) =>
    item.objectKey.startsWith("/") ||
    item.objectKey.includes("..") ||
    item.objectKey.includes("\\") ||
    !/^[A-Za-z0-9._/-]+$/.test(item.objectKey) ||
    !item.objectKey.includes(checksum)
  )) {
    return new Response(JSON.stringify({ error: "INVALID_OBJECT_KEY", message: "An upload object key failed server validation." }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  // 6. Upload All Variants to Cloudflare R2
  const r2Config = getR2Config();
  const completedR2Keys: string[] = [];
  let r2Error: string | null = null;

  if (!r2Config || !r2Config.accessKeyId || !r2Config.secretAccessKey || r2Config.accessKeyId === "anonymous") {
    return new Response(
      JSON.stringify({
        success: false,
        error: "R2_CONFIGURATION_MISSING",
        message: "Cloudflare R2 storage credentials are not configured on Supabase Edge Functions. Refusing to write to Supabase Storage fallback."
      }),
      { status: 502, headers: corsHeaders }
    );
  }

  const targetBucket = r2Config.bucketName;
  for (const item of variantUploads) {
    const uploadRes = await uploadObjectToR2(
      r2Config,
      item.objectKey,
      item.bytes,
      item.contentType || "image/webp",
      "public, max-age=31536000, immutable"
    );

    if (!uploadRes.success) {
      r2Error = uploadRes.error || `Failed uploading variant ${item.name} to R2.`;
      break;
    }
    completedR2Keys.push(item.objectKey);
  }

  // Fail-Closed: Rollback on Partial R2 Failure
  if (r2Error) {
    for (const k of completedR2Keys) {
      try {
        const aws = new AwsClient({
          accessKeyId: r2Config.accessKeyId,
          secretAccessKey: r2Config.secretAccessKey,
          service: "s3",
          region: "auto",
        });
        await aws.fetch(
          `https://${r2Config.accountId}.r2.cloudflarestorage.com/${r2Config.bucketName}/${k.replace(/^\/+/, '')}`,
          { method: "DELETE" }
        );
      } catch { /* non-fatal */ }
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: "R2_STORAGE_UNAVAILABLE",
        message: r2Error
      }),
      { status: 502, headers: corsHeaders }
    );
  }

  // 7. Atomic PostgreSQL Registration (media_assets)
  const publicBaseUrl = r2Config.publicBaseUrl || "https://images.lpuevents.live";
  const primaryObjectKey = desktopVariant.objectKey;
  const primaryPublicUrl = `${publicBaseUrl}/${primaryObjectKey}`;
  const mediaType = contextToMediaType(context);

  const slotsMetadata: Record<string, any> = {};
  const presentationsMetadata: Record<string, any> = {};
  const placementMetadata: Record<string, any> = {};
  let masterMetadata: any = null;

  for (const item of variantUploads) {
    if (item.isSlot) {
      slotsMetadata[item.name] = {
        name: item.name,
        object_key: item.objectKey,
        width: item.width,
        height: item.height,
        file_size_bytes: item.bytes.length
      };
    } else if (item.isPresentation) {
      const ratioKey = item.name.replace('pres_', '').replace('_', ':');
      presentationsMetadata[ratioKey] = {
        ratio: ratioKey,
        object_key: item.objectKey,
        width: item.width,
        height: item.height,
        file_size_bytes: item.bytes.length
      };
    } else if (item.isPlacement) {
      const placementName = (["hero", "card", "details"] as const).find((name) =>
        item.name === name || item.name.startsWith(`${name}_`)
      );
      if (!placementName) continue;
      const placement = placementMetadata[placementName] || {
        ...(parsedMetadata?.placement?.[placementName] || {}),
        variants: [],
      };
      if (item.name === placementName) {
        Object.assign(placement, {
          object_key: item.objectKey,
          width: item.width,
          height: item.height,
          file_size_bytes: item.bytes.length,
          public_url: `${publicBaseUrl}/${item.objectKey}`,
        });
      } else {
        placement.variants.push({
          name: item.name.slice(placementName.length + 1),
          object_key: item.objectKey,
          width: item.width,
          height: item.height,
          file_size_bytes: item.bytes.length,
          public_url: `${publicBaseUrl}/${item.objectKey}`,
        });
      }
      placementMetadata[placementName] = placement;
    } else if (item.isMaster) {
      masterMetadata = {
        object_key: item.objectKey,
        width: item.width,
        height: item.height,
        file_size_bytes: item.bytes.length,
        mime_type: item.contentType || 'image/jpeg'
      };
    }
  }

  const finalMetadata = {
    pipeline_version: 2,
    context,
    source: masterMetadata,
    placement: Object.keys(placementMetadata).length > 0 ? placementMetadata : undefined,
    original_size_bytes: sourceBytes.length,
    optimized_size_bytes: desktopVariant.file.size,
    savings_percentage: Math.max(0, Number(((1 - desktopVariant.file.size / sourceBytes.length) * 100).toFixed(1))),
    compression_ratio: Number((desktopVariant.file.size / sourceBytes.length).toFixed(3)),
    variants: variantUploads.filter(v => !v.isSlot && !v.isPresentation && !v.isMaster).map((v) => ({
      name: v.name,
      object_key: v.objectKey,
      width: v.width,
      height: v.height,
      file_size_bytes: v.bytes.length,
    })),
    slots: Object.keys(slotsMetadata).length > 0 ? slotsMetadata : undefined,
    presentations: Object.keys(presentationsMetadata).length > 0 ? presentationsMetadata : undefined,
    master: masterMetadata || undefined
  };

  let registeredMediaId: string | null = null;

  // Register ownership from the verified JWT. Only this Worker can finalize after R2 writes succeed.
  try {
    const { data: rpcData, error: rpcErr } = await userClient.rpc("register_uploaded_media_asset", {
      p_bucket: targetBucket,
      p_object_key: primaryObjectKey,
      p_media_type: mediaType,
      p_mime_type: "image/webp",
      p_file_size_bytes: desktopVariant.bytes.length,
      p_checksum: checksum,
      p_width: desktopVariant.width,
      p_height: desktopVariant.height,
      p_context: context,
      p_metadata: finalMetadata,
    });

    if (rpcErr || !rpcData?.media_id) {
      for (const key of completedR2Keys) await deleteObjectFromR2(r2Config, key);
      return new Response(JSON.stringify({ error: "DATABASE_REGISTRATION_FAILED", message: "Could not register the verified upload." }), {
        status: 500,
        headers: corsHeaders,
      });
    }
    registeredMediaId = rpcData.media_id;

    if (rpcData.status === "READY") {
      return new Response(
        JSON.stringify({
          success: true,
          media_id: registeredMediaId,
          object_key: primaryObjectKey,
          public_url: primaryPublicUrl,
          context,
          storage_target: targetBucket,
          pipeline_version: finalMetadata.pipeline_version,
          source: finalMetadata.source,
          placement: finalMetadata.placement,
          variants: finalMetadata.variants,
          slots: finalMetadata.slots,
          presentations: finalMetadata.presentations,
          master: finalMetadata.master,
          deduplicated: true,
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    const { data: readyAsset, error: readyError } = await adminClient
      .from("media_assets")
      .update({
        status: "READY",
        verified_at: new Date().toISOString(),
        deleted_at: null,
      })
      .eq("id", registeredMediaId)
      .eq("created_by", adminProfile.id)
      .eq("status", "UPLOADING")
      .select("id")
      .maybeSingle();

    if (readyError || !readyAsset) {
      await adminClient.from("media_assets").update({ status: "FAILED" }).eq("id", registeredMediaId).eq("status", "UPLOADING");
      for (const key of completedR2Keys) await deleteObjectFromR2(r2Config, key);
      return new Response(JSON.stringify({ error: "MEDIA_FINALIZATION_FAILED", message: "Could not finalize the R2-verified upload." }), {
        status: 500,
        headers: corsHeaders,
      });
    }
  } catch (registrationError) {
    for (const key of completedR2Keys) await deleteObjectFromR2(r2Config, key);
    console.error("Media registration/finalization failed:", registrationError);
    return new Response(JSON.stringify({ error: "DATABASE_REGISTRATION_FAILED", message: "Could not register the verified upload." }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  // 8. Return Verified Upload Metadata
  return new Response(
    JSON.stringify({
      success: true,
      media_id: registeredMediaId,
      object_key: primaryObjectKey,
      public_url: primaryPublicUrl,
      context,
      storage_target: targetBucket,
      r2_diagnostics: r2Error || null,
      pipeline_version: finalMetadata.pipeline_version,
      source: finalMetadata.source,
      placement: finalMetadata.placement,
      variants: finalMetadata.variants,
      slots: finalMetadata.slots,
      presentations: finalMetadata.presentations,
      master: finalMetadata.master,
    }),
    { status: 200, headers: corsHeaders }
  );
  } catch (fatalErr: any) {
    console.error("Fatal unhandled Edge Function error in r2-upload:", fatalErr);
    return new Response(
      JSON.stringify({
        error: "INTERNAL_SERVER_ERROR",
        message: fatalErr?.message || "An unexpected error occurred during image processing.",
      }),
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
});
