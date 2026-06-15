/**
 * Authenticated write gateway for browser-initiated app actions.
 *
 * The SPA uses a custom HMAC session token, so PostgREST cannot safely infer
 * caller identity from auth.uid(). Mutations that previously relied on broad
 * anon policies now pass through this function, which reloads the active caller
 * and enforces role/branch rules before writing with the service role.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";
import { corsHeadersFor, errorResponse, jsonResponse } from "../_shared/cors.ts";

const STAFF_ROLES = ["superadmin", "admin", "teacher", "librarian"];
const FINANCE_ROLES = ["superadmin", "admin", "teacher"];
const ADMIN_ROLES = ["superadmin", "admin"];
const GRADE_ROLES = ["superadmin", "admin", "teacher"];
const LIBRARY_WRITE_ROLES = ["superadmin", "admin", "librarian"];
const CLASS_WRITE_ROLES = ["superadmin", "admin", "teacher"];
const FEE_STATUSES = ["pending", "paid", "overdue", "waived", "partial"];
const PAYMENT_METHODS = ["cash", "bank_transfer", "card", "other"];
const GRANT_STATUSES = ["pending", "active", "closed", "cancelled"];
const TX_TYPES = ["income", "expense"];
const TX_STATUSES = ["completed", "cancelled", "failed"];
const ASSESSMENT_TYPES = ["midterm", "final", "assignment", "quiz", "project", "other"];
const SURVEY_STATUSES = ["draft", "active", "closed"];
const SENTIMENTS = ["positive", "negative", "neutral"];
const SURVEY_RESPONDENT_TYPES = ["students", "staff", "students_staff"];
const SURVEY_RESPONDENT_KINDS = ["student", "staff"];

type Caller = {
  id: string;
  role: string;
  status: string;
  branch_id: string | null;
};

type Body = {
  operation: string;
  [key: string]: any;
};

type SupabaseClient = any;

function isOneOf(value: unknown, allowed: string[]): value is string {
  return typeof value === "string" && allowed.includes(value);
}

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cleanPositiveInt(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return null;
  return parsed;
}

function cleanPublicationYear(value: unknown): number | null | "invalid" {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (parsed <= 0) return null;
  const currentYear = new Date().getFullYear();
  if (!Number.isInteger(parsed) || parsed < 1000 || parsed > currentYear) return "invalid";
  return parsed;
}

function bookWriteMessage(error: any, fallback: string): string {
  const message = String(error?.message ?? "");
  const details = String(error?.details ?? "");
  const combined = `${message} ${details}`;

  if (error?.code === "23505" && combined.includes("books_isbn")) {
    return "A book with this ISBN already exists";
  }
  if (error?.code === "23514" && combined.includes("valid_publication_year")) {
    return "Publication year must be between 1000 and the current year";
  }
  if (error?.code === "23514" && combined.includes("valid_copies")) {
    return "Total copies must be at least 1";
  }
  if (error?.code === "23514" && combined.includes("valid_available_copies")) {
    return "Available copies cannot be greater than total copies";
  }
  return fallback;
}

function decodeBase64(value: string): Uint8Array {
  const raw = atob(value);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function assertRoles(req: Request, caller: Caller, roles: string[]): Response | null {
  if (!roles.includes(caller.role)) {
    return errorResponse(req, 403, "Insufficient permissions");
  }
  if (caller.role !== "superadmin" && !caller.branch_id) {
    return errorResponse(req, 403, "Account is missing a branch");
  }
  return null;
}

function assertBranch(req: Request, caller: Caller, branchId: string | null | undefined): Response | null {
  if (caller.role === "superadmin") return null;
  if (!branchId || branchId !== caller.branch_id) {
    return errorResponse(req, 403, "Record is outside your branch");
  }
  return null;
}

function touchedCallerBranch(caller: Caller, senderBranchId?: string | null, receiverBranchId?: string | null): boolean {
  if (caller.role === "superadmin") return true;
  return !!caller.branch_id && (senderBranchId === caller.branch_id || receiverBranchId === caller.branch_id);
}

async function getStudentBranch(supabase: SupabaseClient, studentId: string): Promise<string | null> {
  const { data } = await supabase
    .from("students")
    .select("branch_id, deleted_at")
    .eq("id", studentId)
    .maybeSingle();
  if (!data || data.deleted_at) return null;
  return data.branch_id ?? null;
}

async function getClassBranch(supabase: SupabaseClient, classId: string): Promise<string | null> {
  const { data } = await supabase
    .from("classes")
    .select("branch_id, deleted_at")
    .eq("id", classId)
    .maybeSingle();
  if (!data || data.deleted_at) return null;
  return data.branch_id ?? null;
}

async function getFeeBranch(supabase: SupabaseClient, feeId: string): Promise<string | null> {
  const { data } = await supabase
    .from("student_fees")
    .select("branch_id")
    .eq("id", feeId)
    .maybeSingle();
  return data?.branch_id ?? null;
}

async function getGrantBranch(supabase: SupabaseClient, grantId: string): Promise<string | null> {
  const { data } = await supabase
    .from("grants")
    .select("branch_id")
    .eq("id", grantId)
    .maybeSingle();
  return data?.branch_id ?? null;
}

async function syncFinalGrade(supabase: SupabaseClient, classId: string, studentId: string) {
  const { data: entries } = await supabase
    .from("grade_entries")
    .select("score, max_score")
    .eq("class_id", classId)
    .eq("student_id", studentId);

  const scored = (entries ?? []).filter((entry: any) => entry.score !== null);
  if (scored.length === 0) return;

  const avg = scored.reduce(
    (sum: number, entry: any) => sum + (Number(entry.score) / Number(entry.max_score)) * 100,
    0,
  ) / scored.length;

  let letter = "F";
  if (avg >= 90) letter = "A";
  else if (avg >= 80) letter = "B";
  else if (avg >= 70) letter = "C";
  else if (avg >= 60) letter = "D";

  await supabase
    .from("class_enrollments")
    .update({ grade: letter })
    .eq("class_id", classId)
    .eq("student_id", studentId);
}

const TRANSACTION_SELECT = `
  *,
  sender_branch:branches!sender_branch_id(id, name),
  receiver_branch:branches!receiver_branch_id(id, name),
  sender_staff:staff!sender_staff_id(id, user:users!user_id(first_name, last_name)),
  receiver_staff:staff!receiver_staff_id(id, user:users!user_id(first_name, last_name)),
  creator:users!created_by(first_name, last_name)
`;

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 200, headers: corsHeadersFor(req) });
    }
    if (req.method !== "POST") return errorResponse(req, 405, "Method not allowed");

    let claims;
    try {
      claims = await authenticateRequest(req);
    } catch (err) {
      return errorResponse(req, 401, "Authentication required", err);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: caller } = await supabase
      .from("users")
      .select("id, role, status, branch_id")
      .eq("id", claims.sub)
      .eq("status", "active")
      .maybeSingle();

    if (!caller) return errorResponse(req, 401, "Authentication required");

    let body: Body;
    try {
      body = await req.json();
    } catch {
      return errorResponse(req, 400, "Invalid request body");
    }

    const op = body.operation;

    if (op === "log-activity") {
      if (!body.actionType || !body.tableName || !body.description) {
        return errorResponse(req, 400, "Missing activity fields");
      }
      const { error } = await supabase.from("activity_logs").insert({
        user_id: caller.id,
        action_type: String(body.actionType),
        table_name: String(body.tableName),
        record_id: cleanString(body.recordId),
        description: String(body.description),
      });
      if (error) return errorResponse(req, 500, "Failed to log activity", error);
      return jsonResponse(req, { success: true });
    }

    if (op === "upload-public-image") {
      const folder = cleanString(body.folder) ?? "misc";
      const contentType = cleanString(body.contentType);
      const base64 = cleanString(body.base64);
      const ext = (cleanString(body.extension) ?? "jpg").replace(/[^a-z0-9]/gi, "").toLowerCase();

      if (!/^[a-z0-9/_-]+$/i.test(folder) || folder.includes("..")) {
        return errorResponse(req, 400, "Invalid upload folder");
      }
      if (!contentType?.startsWith("image/") || !base64) {
        return errorResponse(req, 400, "Only image uploads are allowed");
      }

      const bytes = decodeBase64(base64);
      if (bytes.byteLength > 2 * 1024 * 1024) {
        return errorResponse(req, 400, "Image is too large");
      }

      const objectPath = `${folder}/${crypto.randomUUID()}.${ext || "jpg"}`;
      const { error } = await supabase.storage
        .from("public-images")
        .upload(objectPath, bytes, {
          cacheControl: "3600",
          contentType,
          upsert: false,
        });
      if (error) return errorResponse(req, 500, "Image upload failed", error);

      const { data } = supabase.storage.from("public-images").getPublicUrl(objectPath);
      return jsonResponse(req, { success: true, publicUrl: data.publicUrl });
    }

    // ── Fees ─────────────────────────────────────────────────────────
    if (op === "create-fee" || op === "bulk-create-fees") {
      const roleError = assertRoles(req, caller, FINANCE_ROLES);
      if (roleError) return roleError;

      const branchId = cleanString(body.branchId);
      const branchError = assertBranch(req, caller, branchId);
      if (branchError) return branchError;
      if (!branchId || !body.description || Number(body.amount) < 0 || !body.dueDate) {
        return errorResponse(req, 400, "Invalid fee payload");
      }

      const studentIds = op === "bulk-create-fees" ? body.studentIds : [body.studentId];
      if (!Array.isArray(studentIds) || studentIds.length === 0) {
        return errorResponse(req, 400, "No students selected");
      }

      for (const studentId of studentIds) {
        const studentBranch = await getStudentBranch(supabase, String(studentId));
        if (!studentBranch) return errorResponse(req, 404, "Student not found");
        const studentBranchError = assertBranch(req, { ...caller, branch_id: branchId }, studentBranch);
        if (studentBranchError) return studentBranchError;
        if (studentBranch !== branchId) return errorResponse(req, 400, "Student is in a different branch");
      }

      if (body.classId) {
        const classBranch = await getClassBranch(supabase, String(body.classId));
        if (!classBranch) return errorResponse(req, 404, "Class not found");
        if (classBranch !== branchId) return errorResponse(req, 400, "Class is in a different branch");
      }

      const rows = studentIds.map((studentId: string) => ({
        student_id: studentId,
        branch_id: branchId,
        class_id: cleanString(body.classId),
        description: String(body.description),
        amount: Number(body.amount),
        currency: cleanString(body.currency) ?? "EUR",
        due_date: String(body.dueDate),
        notes: cleanString(body.notes),
        recorded_by: caller.id,
        status: "pending",
      }));

      const { error } = await supabase.from("student_fees").insert(rows);
      if (error) return errorResponse(req, 400, "Failed to create fee", error);
      return jsonResponse(req, { success: true, created: rows.length });
    }

    if (op === "mark-fee-paid" || op === "update-fee-status" || op === "delete-fee") {
      const roleError = assertRoles(req, caller, FINANCE_ROLES);
      if (roleError) return roleError;
      const feeId = cleanString(body.feeId);
      if (!feeId) return errorResponse(req, 400, "Missing feeId");
      const branchError = assertBranch(req, caller, await getFeeBranch(supabase, feeId));
      if (branchError) return branchError;

      if (op === "delete-fee") {
        const { error } = await supabase.from("student_fees").delete().eq("id", feeId);
        if (error) return errorResponse(req, 500, "Failed to delete fee", error);
        return jsonResponse(req, { success: true });
      }

      const updates = op === "mark-fee-paid"
        ? {
            status: "paid",
            paid_date: today(),
            payment_method: isOneOf(body.paymentMethod, PAYMENT_METHODS) ? body.paymentMethod : null,
            notes: cleanString(body.notes),
          }
        : {
            status: isOneOf(body.status, FEE_STATUSES) ? body.status : undefined,
            notes: body.notes === undefined ? undefined : cleanString(body.notes),
          };

      if (!updates.status) return errorResponse(req, 400, "Invalid fee status");
      const { error } = await supabase.from("student_fees").update(updates).eq("id", feeId);
      if (error) return errorResponse(req, 500, "Failed to update fee", error);
      return jsonResponse(req, { success: true });
    }

    // ── Donors / Grants ─────────────────────────────────────────────
    if (op === "create-donor" || op === "update-donor" || op === "delete-donor") {
      const roleError = assertRoles(req, caller, ADMIN_ROLES);
      if (roleError) return roleError;

      if (op === "create-donor") {
        if (!body.name || !body.type) return errorResponse(req, 400, "Invalid donor payload");
        const { data, error } = await supabase.from("donors").insert({
          name: String(body.name),
          type: String(body.type),
          email: cleanString(body.email),
          phone: cleanString(body.phone),
          country: cleanString(body.country),
          notes: cleanString(body.notes),
        }).select("id").single();
        if (error) return errorResponse(req, 400, "Failed to create donor", error);
        return jsonResponse(req, { success: true, id: data.id });
      }

      const id = cleanString(body.id);
      if (!id) return errorResponse(req, 400, "Missing donor id");
      if (op === "delete-donor") {
        const { error } = await supabase.from("donors").delete().eq("id", id);
        if (error) return errorResponse(req, 500, "Failed to delete donor", error);
        return jsonResponse(req, { success: true });
      }
      const { error } = await supabase.from("donors").update({
        name: body.name,
        type: body.type,
        email: body.email ?? null,
        phone: body.phone ?? null,
        country: body.country ?? null,
        notes: body.notes ?? null,
      }).eq("id", id);
      if (error) return errorResponse(req, 500, "Failed to update donor", error);
      return jsonResponse(req, { success: true });
    }

    if (op === "create-grant" || op === "update-grant-status" || op === "delete-grant") {
      const roleError = assertRoles(req, caller, ADMIN_ROLES);
      if (roleError) return roleError;

      if (op === "create-grant") {
        const branchId = cleanString(body.branchId);
        const branchError = assertBranch(req, caller, branchId);
        if (branchError) return branchError;
        if (!body.donorId || !branchId || !body.title || Number(body.amount) < 0) {
          return errorResponse(req, 400, "Invalid grant payload");
        }
        const { error } = await supabase.from("grants").insert({
          donor_id: body.donorId,
          branch_id: branchId,
          title: String(body.title),
          description: cleanString(body.description),
          amount: Number(body.amount),
          currency: cleanString(body.currency) ?? "EUR",
          start_date: cleanString(body.startDate),
          end_date: cleanString(body.endDate),
        });
        if (error) return errorResponse(req, 400, "Failed to create grant", error);
        return jsonResponse(req, { success: true });
      }

      const id = cleanString(body.id);
      if (!id) return errorResponse(req, 400, "Missing grant id");
      const branchError = assertBranch(req, caller, await getGrantBranch(supabase, id));
      if (branchError) return branchError;

      if (op === "delete-grant") {
        const { error } = await supabase.from("grants").delete().eq("id", id);
        if (error) return errorResponse(req, 500, "Failed to delete grant", error);
        return jsonResponse(req, { success: true });
      }
      if (!isOneOf(body.status, GRANT_STATUSES)) return errorResponse(req, 400, "Invalid grant status");
      const { error } = await supabase.from("grants").update({ status: body.status }).eq("id", id);
      if (error) return errorResponse(req, 500, "Failed to update grant", error);
      return jsonResponse(req, { success: true });
    }

    if (op === "create-grant-transaction" || op === "delete-grant-transaction") {
      const roleError = assertRoles(req, caller, ADMIN_ROLES);
      if (roleError) return roleError;

      if (op === "create-grant-transaction") {
        const grantId = cleanString(body.grantId);
        const branchError = assertBranch(req, caller, grantId ? await getGrantBranch(supabase, grantId) : null);
        if (branchError) return branchError;
        if (!grantId || !body.description || Number(body.amount) < 0 || !isOneOf(body.type, TX_TYPES)) {
          return errorResponse(req, 400, "Invalid transaction payload");
        }
        const { error } = await supabase.from("grant_transactions").insert({
          grant_id: grantId,
          description: String(body.description),
          amount: Number(body.amount),
          type: body.type,
          tx_date: cleanString(body.txDate) ?? today(),
          notes: cleanString(body.notes),
          recorded_by: caller.id,
        });
        if (error) return errorResponse(req, 400, "Failed to record transaction", error);
        return jsonResponse(req, { success: true });
      }

      const id = cleanString(body.id);
      if (!id) return errorResponse(req, 400, "Missing transaction id");
      const { data: tx } = await supabase
        .from("grant_transactions")
        .select("id, grant:grants!grant_id(branch_id)")
        .eq("id", id)
        .maybeSingle();
      const grant = Array.isArray(tx?.grant) ? tx?.grant[0] : tx?.grant;
      const branchError = assertBranch(req, caller, grant?.branch_id ?? null);
      if (branchError) return branchError;
      const { error } = await supabase.from("grant_transactions").delete().eq("id", id);
      if (error) return errorResponse(req, 500, "Failed to delete transaction", error);
      return jsonResponse(req, { success: true });
    }

    // ── Inter-branch Transactions ──────────────────────────────────
    if (op === "create-transaction" || op === "update-transaction" || op === "update-transaction-status" || op === "delete-transaction") {
      const roleError = assertRoles(req, caller, ADMIN_ROLES);
      if (roleError) return roleError;

      if (op === "create-transaction") {
        if (!touchedCallerBranch(caller, body.sender_branch_id, body.receiver_branch_id)) {
          return errorResponse(req, 403, "Transaction is outside your branch");
        }
        const { data, error } = await supabase.from("transactions").insert({
          sender_branch_id: body.sender_branch_id,
          receiver_branch_id: body.receiver_branch_id,
          sender_staff_id: body.sender_staff_id || null,
          receiver_staff_id: body.receiver_staff_id || null,
          amount: Number(body.amount),
          currency: body.currency,
          transfer_method: body.transfer_method,
          external_reference: body.external_reference || null,
          notes: body.notes || null,
          created_by: caller.id,
          status: "pending",
        }).select(TRANSACTION_SELECT).single();
        if (error) return errorResponse(req, 400, "Failed to create transaction", error);
        return jsonResponse(req, { success: true, data });
      }

      const id = cleanString(body.id);
      if (!id) return errorResponse(req, 400, "Missing transaction id");
      const { data: existing } = await supabase
        .from("transactions")
        .select("sender_branch_id, receiver_branch_id")
        .eq("id", id)
        .maybeSingle();
      if (!existing || !touchedCallerBranch(caller, existing.sender_branch_id, existing.receiver_branch_id)) {
        return errorResponse(req, 403, "Transaction is outside your branch");
      }

      if (op === "delete-transaction") {
        const { error } = await supabase.from("transactions").delete().eq("id", id);
        if (error) return errorResponse(req, 500, "Failed to delete transaction", error);
        return jsonResponse(req, { success: true });
      }

      const updates = op === "update-transaction-status"
        ? { status: isOneOf(body.status, TX_STATUSES) ? body.status : undefined }
        : { ...body.updates, updated_at: new Date().toISOString() };
      if (!updates.status && op === "update-transaction-status") return errorResponse(req, 400, "Invalid status");
      if (!touchedCallerBranch(caller, updates.sender_branch_id ?? existing.sender_branch_id, updates.receiver_branch_id ?? existing.receiver_branch_id)) {
        return errorResponse(req, 403, "Transaction update is outside your branch");
      }
      const { data, error } = await supabase
        .from("transactions")
        .update(updates)
        .eq("id", id)
        .select(TRANSACTION_SELECT)
        .single();
      if (error) return errorResponse(req, 500, "Failed to update transaction", error);
      return jsonResponse(req, { success: true, data });
    }

    // ── Messages ───────────────────────────────────────────────────
    if (op === "send-message" || op === "mark-message-read" || op === "delete-message") {
      const roleError = assertRoles(req, caller, STAFF_ROLES);
      if (roleError) return roleError;

      if (op === "send-message") {
        let branchId = caller.branch_id;
        const recipientId = cleanString(body.recipientId);
        if (caller.role === "superadmin" && recipientId) {
          const { data: rec } = await supabase.from("users").select("branch_id").eq("id", recipientId).maybeSingle();
          branchId = rec?.branch_id ?? null;
        }
        if (caller.role !== "superadmin" && !branchId) return errorResponse(req, 403, "Account is missing a branch");
        const { data, error } = await supabase.from("messages").insert({
          sender_id: caller.id,
          recipient_id: recipientId,
          branch_id: branchId,
          subject: String(body.subject ?? ""),
          body: String(body.body ?? ""),
          parent_id: cleanString(body.parentId),
        }).select("id").single();
        if (error) return errorResponse(req, 400, "Failed to send message", error);
        return jsonResponse(req, { success: true, id: data.id });
      }

      const messageId = cleanString(body.messageId);
      if (!messageId) return errorResponse(req, 400, "Missing messageId");
      const { data: message } = await supabase
        .from("messages")
        .select("id, sender_id, recipient_id, branch_id")
        .eq("id", messageId)
        .maybeSingle();
      if (!message) return errorResponse(req, 404, "Message not found");
      const isParticipant = message.sender_id === caller.id || message.recipient_id === caller.id;
      const isBranchAdmin = ADMIN_ROLES.includes(caller.role) && !assertBranch(req, caller, message.branch_id);
      if (!isParticipant && !isBranchAdmin) return errorResponse(req, 403, "Message is outside your scope");

      if (op === "delete-message") {
        const { error } = await supabase.from("messages").delete().eq("id", messageId);
        if (error) return errorResponse(req, 500, "Failed to delete message", error);
        return jsonResponse(req, { success: true });
      }
      if (message.recipient_id !== null && message.recipient_id !== caller.id) {
        return jsonResponse(req, { success: true });
      }
      const { error } = await supabase
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .eq("id", messageId)
        .is("read_at", null);
      if (error) return errorResponse(req, 500, "Failed to mark as read", error);
      return jsonResponse(req, { success: true });
    }

    // ── Grades ─────────────────────────────────────────────────────
    if (op === "add-grade-entry" || op === "update-grade-entry" || op === "delete-grade-entry" || op === "set-final-grade") {
      const roleError = assertRoles(req, caller, GRADE_ROLES);
      if (roleError) return roleError;

      if (op === "add-grade-entry" || op === "set-final-grade") {
        const classId = cleanString(body.classId);
        const studentId = cleanString(body.studentId);
        if (!classId || !studentId) return errorResponse(req, 400, "Missing class or student");
        const classBranch = await getClassBranch(supabase, classId);
        const studentBranch = await getStudentBranch(supabase, studentId);
        if (!classBranch || !studentBranch) return errorResponse(req, 404, "Class or student not found");
        const branchError = assertBranch(req, caller, classBranch);
        if (branchError) return branchError;
        if (classBranch !== studentBranch) return errorResponse(req, 400, "Student is in a different branch");

        if (op === "set-final-grade") {
          const { error } = await supabase
            .from("class_enrollments")
            .update({ grade: String(body.grade ?? "") })
            .eq("class_id", classId)
            .eq("student_id", studentId);
          if (error) return errorResponse(req, 500, "Failed to set grade", error);
          return jsonResponse(req, { success: true });
        }

        if (!body.assessmentName || !isOneOf(body.assessmentType, ASSESSMENT_TYPES)) {
          return errorResponse(req, 400, "Invalid grade payload");
        }
        const { data, error } = await supabase.from("grade_entries").insert({
          class_id: classId,
          student_id: studentId,
          assessment_name: String(body.assessmentName),
          assessment_type: body.assessmentType,
          score: body.score ?? null,
          max_score: body.maxScore ?? 100,
          grade_letter: cleanString(body.gradeLetter),
          notes: cleanString(body.notes),
          assessment_date: cleanString(body.assessmentDate) ?? today(),
          recorded_by: caller.id,
        }).select().single();
        if (error) return errorResponse(req, 400, "Failed to add grade", error);
        await syncFinalGrade(supabase, classId, studentId);
        return jsonResponse(req, { success: true, data });
      }

      const entryId = cleanString(body.entryId);
      if (!entryId) return errorResponse(req, 400, "Missing entryId");
      const { data: entry } = await supabase
        .from("grade_entries")
        .select("class_id, student_id, class:classes!class_id(branch_id)")
        .eq("id", entryId)
        .maybeSingle();
      if (!entry) return errorResponse(req, 404, "Grade not found");
      const cls = Array.isArray(entry.class) ? entry.class[0] : entry.class;
      const branchError = assertBranch(req, caller, cls?.branch_id ?? null);
      if (branchError) return branchError;

      if (op === "delete-grade-entry") {
        const { error } = await supabase.from("grade_entries").delete().eq("id", entryId);
        if (error) return errorResponse(req, 500, "Failed to delete grade", error);
        await syncFinalGrade(supabase, entry.class_id, entry.student_id);
        return jsonResponse(req, { success: true });
      }

      const { error } = await supabase
        .from("grade_entries")
        .update(body.updates ?? {})
        .eq("id", entryId);
      if (error) return errorResponse(req, 500, "Failed to update grade", error);
      await syncFinalGrade(supabase, entry.class_id, entry.student_id);
      return jsonResponse(req, { success: true });
    }

    // ── Surveys ────────────────────────────────────────────────────
    if (op === "create-survey" || op === "update-survey-meta" || op === "delete-survey" || op === "save-branch-survey-data") {
      const roleError = assertRoles(req, caller, ADMIN_ROLES);
      if (roleError) return roleError;

      if (op === "create-survey") {
        if (!body.title || !isOneOf(body.status, SURVEY_STATUSES)) {
          return errorResponse(req, 400, "Invalid survey payload");
        }
        const surveyBranchId = caller.role === "superadmin"
          ? cleanString(body.branchId)
          : caller.branch_id;
        if (!surveyBranchId) return errorResponse(req, 400, "Survey branch is required");
        const branchError = assertBranch(req, caller, surveyBranchId);
        if (branchError) return branchError;
        const respondentType = isOneOf(body.respondentType, SURVEY_RESPONDENT_TYPES)
          ? body.respondentType
          : "students";
        const surveyInsert: Record<string, unknown> = {
          title: String(body.title),
          description: cleanString(body.description),
          period: cleanString(body.period),
          branch_id: surveyBranchId,
          respondent_type: respondentType,
          status: body.status,
          created_by: caller.id,
        };
        const surveyDate = cleanString(body.surveyDate);
        if (surveyDate) surveyInsert.survey_date = surveyDate;
        const { data: survey, error: sErr } = await supabase.from("surveys").insert(surveyInsert).select().single();
        if (sErr || !survey) return errorResponse(req, 400, "Failed to create survey", sErr);

        const sections = Array.isArray(body.sections) ? body.sections : [];
        const sectionIdMap: Record<number, string> = {};
        if (sections.length > 0) {
          const { data, error } = await supabase.from("survey_sections").insert(
            sections.map((section: any, index: number) => ({
              survey_id: survey.id,
              title: String(section.title ?? ""),
              description: cleanString(section.description),
              order_index: index,
            })),
          ).select();
          if (error) {
            await supabase.from("surveys").delete().eq("id", survey.id);
            return errorResponse(req, 400, "Failed to create survey sections", error);
          }
          (data ?? []).forEach((section: any, index: number) => { sectionIdMap[index] = section.id; });
        }

        const questions = Array.isArray(body.questions) ? body.questions : [];
        if (questions.length > 0) {
          const { error } = await supabase.from("survey_questions").insert(
            questions.map((question: any, index: number) => ({
              survey_id: survey.id,
              section_id: question.sectionIndex !== null && question.sectionIndex !== undefined
                ? sectionIdMap[question.sectionIndex] ?? null
                : null,
              question_text: String(question.text ?? ""),
              order_index: index,
            })),
          );
          if (error) {
            await supabase.from("surveys").delete().eq("id", survey.id);
            return errorResponse(req, 400, "Failed to create survey questions", error);
          }
        }

        const options = Array.isArray(body.options) ? body.options : [];
        if (options.length > 0) {
          const { error } = await supabase.from("survey_response_options").insert(
            options.map((option: any, index: number) => ({
              survey_id: survey.id,
              label: String(option.label ?? ""),
              sentiment: isOneOf(option.sentiment, SENTIMENTS) ? option.sentiment : "neutral",
              order_index: index,
            })),
          );
          if (error) {
            await supabase.from("surveys").delete().eq("id", survey.id);
            return errorResponse(req, 400, "Failed to create survey options", error);
          }
        }

        const respondentIds = Array.isArray(body.respondentIds) ? body.respondentIds : [];
        if (respondentIds.length > 0) {
          const allowedKinds = respondentType === "students"
            ? ["student"]
            : respondentType === "staff"
              ? ["staff"]
              : SURVEY_RESPONDENT_KINDS;
          const rows = respondentIds
            .filter((respondent: any) => isOneOf(respondent.type, allowedKinds) && cleanString(respondent.id) && cleanString(respondent.name))
            .map((respondent: any) => ({
              survey_id: survey.id,
              branch_id: surveyBranchId,
              respondent_type: respondent.type,
              respondent_id: cleanString(respondent.id),
              respondent_name: cleanString(respondent.name),
            }));
          if (rows.length > 0) {
            const studentIds = rows.filter((row) => row.respondent_type === "student").map((row) => row.respondent_id);
            const staffIds = rows.filter((row) => row.respondent_type === "staff").map((row) => row.respondent_id);
            if (studentIds.length > 0) {
              const { data, error } = await supabase.from("students").select("id, branch_id").in("id", studentIds);
              if (error || (data ?? []).some((student: any) => student.branch_id !== surveyBranchId) || (data ?? []).length !== studentIds.length) {
                await supabase.from("surveys").delete().eq("id", survey.id);
                return errorResponse(req, 403, "One or more selected students are outside the survey branch", error);
              }
            }
            if (staffIds.length > 0) {
              const { data, error } = await supabase.from("staff").select("id, branch_id").in("id", staffIds);
              if (error || (data ?? []).some((member: any) => member.branch_id !== surveyBranchId) || (data ?? []).length !== staffIds.length) {
                await supabase.from("surveys").delete().eq("id", survey.id);
                return errorResponse(req, 403, "One or more selected staff are outside the survey branch", error);
              }
            }
            const { error } = await supabase.from("survey_respondents").insert(rows);
            if (error) {
              await supabase.from("surveys").delete().eq("id", survey.id);
              return errorResponse(req, 400, "Failed to save survey respondents", error);
            }
          }
        }

        return jsonResponse(req, { success: true, id: survey.id });
      }

      if (op === "update-survey-meta") {
        const surveyId = cleanString(body.surveyId);
        if (!surveyId) return errorResponse(req, 400, "Missing survey id");
        const fields = body.fields ?? {};
        if (fields.status && !isOneOf(fields.status, SURVEY_STATUSES)) {
          return errorResponse(req, 400, "Invalid survey status");
        }
        if ("survey_date" in fields) {
          fields.survey_date = cleanString(fields.survey_date);
        }
        const { error } = await supabase.from("surveys").update(fields).eq("id", surveyId);
        if (error) return errorResponse(req, 500, "Failed to update survey", error);
        return jsonResponse(req, { success: true });
      }

      if (op === "delete-survey") {
        const surveyId = cleanString(body.surveyId);
        if (!surveyId) return errorResponse(req, 400, "Missing survey id");
        const { error } = await supabase.from("surveys").delete().eq("id", surveyId);
        if (error) return errorResponse(req, 500, "Failed to delete survey", error);
        return jsonResponse(req, { success: true });
      }

      const surveyId = cleanString(body.surveyId);
      const branchId = cleanString(body.branchId);
      const branchError = assertBranch(req, caller, branchId);
      if (branchError) return branchError;
      if (!surveyId || !branchId || Number(body.totalRespondents) < 0) {
        return errorResponse(req, 400, "Invalid branch survey payload");
      }

      const { error: subErr } = await supabase.from("survey_branch_submissions").upsert(
        {
          survey_id: surveyId,
          branch_id: branchId,
          total_respondents: Number(body.totalRespondents),
          submitted_by: caller.id,
        },
        { onConflict: "survey_id,branch_id" },
      );
      if (subErr) return errorResponse(req, 500, "Failed to save survey submission", subErr);

      const counts = Array.isArray(body.counts) ? body.counts : [];
      if (counts.length > 0) {
        const { error } = await supabase.from("survey_branch_responses").upsert(
          counts.map((count: any) => ({
            survey_id: surveyId,
            branch_id: branchId,
            question_id: count.questionId,
            option_id: count.optionId,
            count: Number(count.count),
            entered_by: caller.id,
          })),
          { onConflict: "survey_id,branch_id,question_id,option_id" },
        );
        if (error) return errorResponse(req, 500, "Failed to save survey responses", error);
      }

      return jsonResponse(req, { success: true });
    }

    // ── Organization / account settings ────────────────────────────
    if (op === "save-org-settings") {
      const roleError = assertRoles(req, caller, ["superadmin"]);
      if (roleError) return roleError;

      const updates = body.updates && typeof body.updates === "object" ? body.updates : {};
      for (const [key, value] of Object.entries(updates)) {
        const { error } = await supabase
          .from("organization_settings")
          .upsert(
            { setting_key: key, setting_value: value },
            { onConflict: "setting_key" },
          );
        if (error) return errorResponse(req, 500, "Failed to save settings", error);
      }
      return jsonResponse(req, { success: true });
    }

    if (op === "toggle-2fa") {
      const userId = cleanString(body.userId);
      if (!userId || userId !== caller.id) return errorResponse(req, 403, "Cannot change another user's 2FA setting");
      const { error } = await supabase
        .from("users")
        .update({ two_factor_enabled: !!body.enabled })
        .eq("id", userId);
      if (error) return errorResponse(req, 500, "Failed to update 2FA setting", error);
      return jsonResponse(req, { success: true });
    }

    // ── Branches ───────────────────────────────────────────────────
    if (op === "create-branch" || op === "update-branch" || op === "delete-branch") {
      const roleError = assertRoles(req, caller, ["superadmin"]);
      if (roleError) return roleError;

      if (op === "create-branch") {
        if (!body.name || !body.province) return errorResponse(req, 400, "Invalid branch payload");
        const { data, error } = await supabase.from("branches").insert({
          name: String(body.name),
          province: String(body.province),
          city: cleanString(body.city),
          address: cleanString(body.address),
          phone: cleanString(body.phone),
          email: cleanString(body.email),
          established_date: cleanString(body.established_date),
          status: body.status === "inactive" ? "inactive" : "active",
        }).select().single();
        if (error) return errorResponse(req, 400, "Failed to create branch", error);
        return jsonResponse(req, { success: true, data });
      }

      const branchId = cleanString(body.branchId);
      if (!branchId) return errorResponse(req, 400, "Missing branchId");
      if (op === "delete-branch") {
        const { error } = await supabase.from("branches").delete().eq("id", branchId);
        if (error) return errorResponse(req, 500, "Failed to delete branch", error);
        return jsonResponse(req, { success: true });
      }
      const updates = { ...(body.updates ?? {}), updated_at: new Date().toISOString() };
      const { data, error } = await supabase.from("branches").update(updates).eq("id", branchId).select().single();
      if (error) return errorResponse(req, 500, "Failed to update branch", error);
      return jsonResponse(req, { success: true, data });
    }

    // ── Classes / enrollments / attendance ─────────────────────────
    if (op === "create-class" || op === "update-class" || op === "delete-class" || op === "enroll-student" || op === "unenroll-student" || op === "save-attendance") {
      const roleError = assertRoles(req, caller, CLASS_WRITE_ROLES);
      if (roleError) return roleError;

      if (op === "create-class") {
        const branchId = cleanString(body.branchId);
        const branchError = assertBranch(req, caller, branchId);
        if (branchError) return branchError;
        if (!branchId || !body.name || !body.teacherId) return errorResponse(req, 400, "Invalid class payload");
        const { data: teacher } = await supabase
          .from("staff")
          .select("branch_id, deleted_at")
          .eq("id", body.teacherId)
          .maybeSingle();
        if (!teacher || teacher.deleted_at || teacher.branch_id !== branchId) {
          return errorResponse(req, 400, "Teacher is not in the class branch");
        }
        const { error } = await supabase.from("classes").insert({
          name: String(body.name),
          description: cleanString(body.description),
          teacher_id: body.teacherId,
          schedule_day: Array.isArray(body.scheduleDays) ? body.scheduleDays : [],
          schedule_time: cleanString(body.scheduleTime),
          schedule_end_time: cleanString(body.scheduleEndTime),
          location: cleanString(body.location),
          max_capacity: Number(body.maxCapacity ?? 0),
          academic_year: cleanString(body.academicYear),
          semester: cleanString(body.semester),
          branch_id: branchId,
          created_by: caller.id,
          status: "active",
        });
        if (error) return errorResponse(req, 400, "Failed to create class", error);
        return jsonResponse(req, { success: true });
      }

      if (op === "update-class" || op === "delete-class") {
        const classId = cleanString(body.classId);
        if (!classId) return errorResponse(req, 400, "Missing classId");
        const existingBranch = await getClassBranch(supabase, classId);
        const branchError = assertBranch(req, caller, existingBranch);
        if (branchError) return branchError;
        if (op === "delete-class") {
          const { error } = await supabase
            .from("classes")
            .update({ deleted_at: new Date().toISOString() })
            .eq("id", classId);
          if (error) return errorResponse(req, 500, "Failed to delete class", error);
          return jsonResponse(req, { success: true });
        }
        const updates = body.updates ?? {};
        if (updates.branch_id && updates.branch_id !== existingBranch) {
          const newBranchError = assertBranch(req, caller, updates.branch_id);
          if (newBranchError) return newBranchError;
        }
        if (updates.teacher_id) {
          const { data: teacher } = await supabase
            .from("staff")
            .select("branch_id, deleted_at")
            .eq("id", updates.teacher_id)
            .maybeSingle();
          const targetBranch = updates.branch_id ?? existingBranch;
          if (!teacher || teacher.deleted_at || teacher.branch_id !== targetBranch) {
            return errorResponse(req, 400, "Teacher is not in the class branch");
          }
        }
        const { error } = await supabase.from("classes").update(updates).eq("id", classId);
        if (error) return errorResponse(req, 500, "Failed to update class", error);
        return jsonResponse(req, { success: true });
      }

      if (op === "enroll-student") {
        const classId = cleanString(body.classId);
        const studentId = cleanString(body.studentId);
        if (!classId || !studentId) return errorResponse(req, 400, "Missing class or student");
        const classBranch = await getClassBranch(supabase, classId);
        const studentBranch = await getStudentBranch(supabase, studentId);
        const branchError = assertBranch(req, caller, classBranch);
        if (branchError) return branchError;
        if (!classBranch || classBranch !== studentBranch) return errorResponse(req, 400, "Student is in a different branch");
        const { error } = await supabase.from("class_enrollments").insert({
          class_id: classId,
          student_id: studentId,
          enrollment_date: today(),
          status: "active",
        });
        if (error) return errorResponse(req, 400, "Failed to enroll student", error);
        return jsonResponse(req, { success: true });
      }

      if (op === "unenroll-student") {
        const enrollmentId = cleanString(body.enrollmentId);
        if (!enrollmentId) return errorResponse(req, 400, "Missing enrollmentId");
        const { data: enrollment } = await supabase
          .from("class_enrollments")
          .select("id, class:classes!class_id(branch_id)")
          .eq("id", enrollmentId)
          .maybeSingle();
        const cls = Array.isArray(enrollment?.class) ? enrollment?.class[0] : enrollment?.class;
        const branchError = assertBranch(req, caller, cls?.branch_id ?? null);
        if (branchError) return branchError;
        const { error } = await supabase.from("class_enrollments").delete().eq("id", enrollmentId);
        if (error) return errorResponse(req, 500, "Failed to remove student", error);
        return jsonResponse(req, { success: true });
      }

      const classId = cleanString(body.classId);
      const attendanceDate = cleanString(body.date);
      const entries = Array.isArray(body.entries) ? body.entries : [];
      if (!classId || !attendanceDate) return errorResponse(req, 400, "Invalid attendance payload");
      const classBranch = await getClassBranch(supabase, classId);
      const branchError = assertBranch(req, caller, classBranch);
      if (branchError) return branchError;
      const rows = entries.map((entry: any) => ({
        class_id: classId,
        student_id: entry.studentId,
        attendance_date: attendanceDate,
        status: entry.status,
        notes: cleanString(entry.notes),
        recorded_by: caller.id,
      }));
      const { error } = await supabase
        .from("attendance")
        .upsert(rows, { onConflict: "class_id,student_id,attendance_date" });
      if (error) return errorResponse(req, 500, "Failed to save attendance", error);

      for (const entry of entries) {
        const { data: all } = await supabase
          .from("attendance")
          .select("status")
          .eq("class_id", classId)
          .eq("student_id", entry.studentId);
        if (!all || all.length === 0) continue;
        const present = all.filter((row: any) => row.status === "present" || row.status === "late").length;
        const pct = Math.round((present / all.length) * 100);
        await supabase
          .from("class_enrollments")
          .update({ attendance_percentage: pct, attendance_count: present })
          .eq("class_id", classId)
          .eq("student_id", entry.studentId);
      }
      return jsonResponse(req, { success: true });
    }

    // ── Library ────────────────────────────────────────────────────
    if (op === "create-book" || op === "update-book" || op === "delete-book") {
      const roleError = assertRoles(req, caller, LIBRARY_WRITE_ROLES);
      if (roleError) return roleError;

      if (op === "create-book") {
        const branchId = cleanString(body.branch_id);
        const branchError = assertBranch(req, caller, branchId);
        if (branchError) return branchError;
        const totalCopies = cleanPositiveInt(body.total_copies);
        const publicationYear = cleanPublicationYear(body.publication_year);
        if (!branchId || !cleanString(body.title) || !cleanString(body.author) || !totalCopies) {
          return errorResponse(req, 400, "Invalid book payload");
        }
        if (publicationYear === "invalid") {
          return errorResponse(req, 400, "Publication year must be between 1000 and the current year");
        }
        const { data, error } = await supabase.from("books").insert({
          title: cleanString(body.title),
          author: cleanString(body.author),
          isbn: cleanString(body.isbn),
          publisher: cleanString(body.publisher),
          publication_year: publicationYear,
          category: cleanString(body.category),
          description: cleanString(body.description),
          language: cleanString(body.language) ?? "English",
          total_copies: totalCopies,
          available_copies: totalCopies,
          location_shelf: cleanString(body.location_shelf),
          cover_image_url: cleanString(body.cover_image_url),
          branch_id: branchId,
          added_by: caller.id,
        }).select().single();
        if (error) return errorResponse(req, 400, bookWriteMessage(error, "Failed to create book"), error);
        return jsonResponse(req, { success: true, data });
      }

      const bookId = cleanString(body.bookId);
      if (!bookId) return errorResponse(req, 400, "Missing bookId");
      const { data: existingBook } = await supabase
        .from("books")
        .select("branch_id")
        .eq("id", bookId)
        .maybeSingle();
      const branchError = assertBranch(req, caller, existingBook?.branch_id ?? null);
      if (branchError) return branchError;

      if (op === "delete-book") {
        const { error } = await supabase
          .from("books")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", bookId);
        if (error) return errorResponse(req, 500, "Failed to delete book", error);
        return jsonResponse(req, { success: true });
      }

      const rawUpdates = body.updates ?? {};
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const key of ["title", "author", "isbn", "publisher", "category", "description", "language", "location_shelf", "cover_image_url"] as const) {
        if (key in rawUpdates) updates[key] = cleanString(rawUpdates[key]);
      }
      if ("publication_year" in rawUpdates) {
        const publicationYear = cleanPublicationYear(rawUpdates.publication_year);
        if (publicationYear === "invalid") {
          return errorResponse(req, 400, "Publication year must be between 1000 and the current year");
        }
        updates.publication_year = publicationYear;
      }
      if ("total_copies" in rawUpdates) {
        const totalCopies = cleanPositiveInt(rawUpdates.total_copies);
        if (!totalCopies) return errorResponse(req, 400, "Total copies must be at least 1");
        updates.total_copies = totalCopies;
      }
      if ("available_copies" in rawUpdates) {
        const availableCopies = Number(rawUpdates.available_copies);
        if (!Number.isInteger(availableCopies) || availableCopies < 0) {
          return errorResponse(req, 400, "Available copies cannot be negative");
        }
        updates.available_copies = availableCopies;
      }
      if ("physical_condition" in rawUpdates && isOneOf(rawUpdates.physical_condition, ["excellent", "good", "fair", "poor"])) {
        updates.physical_condition = rawUpdates.physical_condition;
      }
      if ("branch_id" in rawUpdates) updates.branch_id = cleanString(rawUpdates.branch_id);
      if (updates.branch_id) {
        const newBranchError = assertBranch(req, caller, updates.branch_id);
        if (newBranchError) return newBranchError;
      }
      const { data, error } = await supabase.from("books").update(updates).eq("id", bookId).select().single();
      if (error) return errorResponse(req, 500, bookWriteMessage(error, "Failed to update book"), error);
      return jsonResponse(req, { success: true, data });
    }

    return errorResponse(req, 400, "Unknown operation");
  } catch (err) {
    console.error("[app-actions] uncaught:", err);
    return errorResponse(req, 500, "Service error", err);
  }
});
