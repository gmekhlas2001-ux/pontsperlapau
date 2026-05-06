/**
 * User-documents handler.
 *
 * One endpoint, three operations selected via the body's `operation`:
 *   - upload:   admin/superadmin uploads a file for a user (base64).
 *               Branch admins can only upload for users in their branch.
 *   - download: superadmin only — returns a signed URL valid 60s.
 *   - delete:   superadmin only — removes the row + storage object.
 *
 * Uploads accept files up to ~10 MB sent as base64 in the JSON body.
 * That keeps the edge function simple — no multipart parsing — at the
 * cost of ~33% transfer overhead. For occasional document attachments
 * (passport scans, contracts) that's fine.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";
import { corsHeadersFor, errorResponse, jsonResponse } from "../_shared/cors.ts";

const BUCKET = "user-documents";
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const SIGNED_URL_TTL = 60;          // seconds

interface UploadBody {
  operation: "upload";
  targetUserId: string;
  fileName: string;
  mimeType?: string;
  description?: string;
  /** base64-encoded file body (no data: prefix) */
  fileB64: string;
}

interface DownloadBody {
  operation: "download";
  documentId: string;
}

interface DeleteBody {
  operation: "delete";
  documentId: string;
}

type Body = UploadBody | DownloadBody | DeleteBody;

function b64ToBytes(b64: string): Uint8Array {
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 200) || "file";
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 200, headers: corsHeadersFor(req) });
    }
    if (req.method !== "POST") return errorResponse(req, 405, "Method not allowed");

    let claims;
    try { claims = await authenticateRequest(req); }
    catch (err) { return errorResponse(req, 401, "Authentication required", err); }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Re-load caller fresh.
    const { data: caller } = await supabase
      .from("users")
      .select("id, role, status, branch_id")
      .eq("id", claims.sub)
      .eq("status", "active")
      .maybeSingle();
    if (!caller) return errorResponse(req, 401, "Authentication required");

    let body: Body;
    try { body = await req.json(); } catch {
      return errorResponse(req, 400, "Invalid request body");
    }

    // ── UPLOAD ───────────────────────────────────────────────────────
    if (body.operation === "upload") {
      if (!["superadmin", "admin"].includes(caller.role)) {
        return errorResponse(req, 403, "Only admins may upload documents");
      }
      if (!body.targetUserId || !body.fileName || !body.fileB64) {
        return errorResponse(req, 400, "Missing fields");
      }

      // Confirm target user exists + branch-scope check for admins.
      const { data: target } = await supabase
        .from("users")
        .select("id, role, branch_id")
        .eq("id", body.targetUserId)
        .maybeSingle();
      if (!target) return errorResponse(req, 404, "Target user not found");

      if (caller.role === "admin") {
        if (target.role === "superadmin") {
          return errorResponse(req, 403, "Cannot attach to superadmin");
        }
        if (caller.branch_id && target.branch_id && caller.branch_id !== target.branch_id) {
          return errorResponse(req, 403, "User is in a different branch");
        }
      }

      const bytes = b64ToBytes(body.fileB64);
      if (bytes.byteLength > MAX_BYTES) {
        return errorResponse(req, 413, "File exceeds 10 MB");
      }

      const safe = safeFileName(body.fileName);
      const storagePath = `${target.id}/${crypto.randomUUID()}-${safe}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, bytes, {
          contentType: body.mimeType || "application/octet-stream",
          upsert: false,
        });
      if (upErr) return errorResponse(req, 500, "Upload failed", upErr);

      const { data: row, error: rowErr } = await supabase
        .from("user_documents")
        .insert({
          user_id: target.id,
          file_name: body.fileName.slice(0, 255),
          mime_type: body.mimeType ?? null,
          size_bytes: bytes.byteLength,
          storage_path: storagePath,
          description: (body.description ?? "").slice(0, 1000) || null,
          uploaded_by: caller.id,
        })
        .select()
        .single();

      if (rowErr) {
        // Best-effort cleanup of the uploaded blob.
        await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
        return errorResponse(req, 500, "Failed to record document", rowErr);
      }

      return jsonResponse(req, { success: true, document: row });
    }

    // ── DOWNLOAD ─────────────────────────────────────────────────────
    if (body.operation === "download") {
      if (caller.role !== "superadmin") {
        return errorResponse(req, 403, "Only superadmins can read documents");
      }
      if (!body.documentId) return errorResponse(req, 400, "Missing documentId");

      const { data: doc } = await supabase
        .from("user_documents")
        .select("id, storage_path, file_name")
        .eq("id", body.documentId)
        .maybeSingle();
      if (!doc) return errorResponse(req, 404, "Document not found");

      const { data: signed, error: sErr } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(doc.storage_path, SIGNED_URL_TTL, {
          download: doc.file_name,
        });
      if (sErr || !signed) return errorResponse(req, 500, "Failed to sign URL", sErr);

      return jsonResponse(req, { success: true, url: signed.signedUrl, fileName: doc.file_name });
    }

    // ── DELETE ───────────────────────────────────────────────────────
    if (body.operation === "delete") {
      if (caller.role !== "superadmin") {
        return errorResponse(req, 403, "Only superadmins can delete documents");
      }
      if (!body.documentId) return errorResponse(req, 400, "Missing documentId");

      const { data: doc } = await supabase
        .from("user_documents")
        .select("id, storage_path")
        .eq("id", body.documentId)
        .maybeSingle();
      if (!doc) return errorResponse(req, 404, "Document not found");

      const { error: rmErr } = await supabase.storage
        .from(BUCKET)
        .remove([doc.storage_path]);
      if (rmErr) console.error("[user-documents] storage remove failed:", rmErr);

      const { error: dbErr } = await supabase
        .from("user_documents")
        .delete()
        .eq("id", doc.id);
      if (dbErr) return errorResponse(req, 500, "Failed to delete document", dbErr);

      return jsonResponse(req, { success: true });
    }

    return errorResponse(req, 400, "Unknown operation");
  } catch (err) {
    console.error("[user-documents] uncaught:", err);
    return errorResponse(req, 500, "Service error", err);
  }
});
