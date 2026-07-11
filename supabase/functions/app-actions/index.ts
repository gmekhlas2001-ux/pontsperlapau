/**
 * Authenticated write gateway for browser-initiated app actions.
 *
 * The SPA uses a custom HMAC session token, so PostgREST cannot safely infer
 * caller identity from auth.uid(). Mutations that previously relied on broad
 * anon policies now pass through this function, which reloads the active caller
 * and enforces role/branch rules before writing with the service role.
 */

import "jsr:@supabase/functions-js@2.110.0/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.110.0";
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
const FEE_CURRENCIES = ["EUR", "USD", "GBP", "CAD", "AUD", "AFN", "TRY"];
const GRANT_STATUSES = ["pending", "active", "closed", "cancelled"];
const DONOR_TYPES = ["individual", "organisation", "organization", "government", "foundation"];
const TX_TYPES = ["income", "expense"];
const TX_STATUSES = ["completed", "cancelled", "failed"];
const TRANSACTION_CURRENCIES = ["USD", "EUR", "AFN", "PKR", "GBP"];
const TRANSFER_METHODS = ["cash", "bank_transfer", "hawala", "check", "mobile_money", "other"];
const ASSESSMENT_TYPES = ["midterm", "final", "assignment", "quiz", "project", "other"];
const CLASS_STATUSES = ["active", "inactive", "archived"];
const SEMESTERS = ["fall", "spring", "summer"];
const ATTENDANCE_STATUSES = ["present", "absent", "late", "excused"];
const SURVEY_STATUSES = ["draft", "active", "closed"];
const SURVEY_LANGUAGES = ["en", "es", "ca", "fa"];
const SENTIMENTS = ["positive", "negative", "neutral"];
const SURVEY_RESPONDENT_TYPES = ["students", "staff", "students_staff"];
const SURVEY_RESPONDENT_KINDS = ["student", "staff"];
// "manual" respondents are people entered by hand for a single survey; they are
// not validated against the students/staff tables.
const SURVEY_RESPONDENT_KINDS_WITH_MANUAL = ["student", "staff", "manual"];
const ORG_SETTING_KEYS = new Set([
  "org_name", "org_email", "org_phone", "timezone", "date_format", "academic_year",
  "attendance_low_threshold", "library_lending_period_days", "max_book_renewal_count",
  "max_books_per_user", "overdue_fine_per_day", "enable_email_notifications",
  "notifications_push", "notifications_enrollment", "notifications_book_due",
  "notifications_overdue", "notifications_low_attendance", "session_timeout_minutes",
]);
const SURVEY_QUESTION_TYPES = [
  "short_answer",
  "paragraph",
  "multiple_choice",
  "checkboxes",
  "dropdown",
  "linear_scale",
  "rating",
  "multiple_choice_grid",
  "checkbox_grid",
  "date",
  "time",
];

type Caller = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  profile_picture_url: string | null;
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

function cleanSurveyUpdateFields(fields: any): { updates: Record<string, unknown>; error?: string } {
  const updates: Record<string, unknown> = {};
  const source = fields && typeof fields === "object" ? fields : {};

  if ("title" in source) {
    const title = cleanString(source.title);
    if (!title) return { updates, error: "Survey title is required" };
    updates.title = title;
  }
  if ("description" in source) updates.description = cleanString(source.description);
  if ("period" in source) updates.period = cleanString(source.period);
  if ("survey_date" in source) updates.survey_date = cleanString(source.survey_date);
  if ("status" in source) {
    if (!isOneOf(source.status, SURVEY_STATUSES)) return { updates, error: "Invalid survey status" };
    updates.status = source.status;
  }
  if ("language" in source) {
    if (!isOneOf(source.language, SURVEY_LANGUAGES)) return { updates, error: "Invalid survey language" };
    updates.language = source.language;
  }

  return { updates };
}

function surveyQuestionUsesOptions(type: string): boolean {
  return !["short_answer", "paragraph", "date", "time"].includes(type);
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

function imageExtension(contentType: string, bytes: Uint8Array): string | null {
  if (contentType === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (contentType === "image/png" && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (contentType === "image/gif" && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return "gif";
  if (
    contentType === "image/webp" &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return "webp";
  return null;
}

async function today(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase
    .from("organization_settings")
    .select("setting_value")
    .eq("setting_key", "timezone")
    .maybeSingle();
  const timeZone = cleanString(data?.setting_value) ?? "UTC";
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date());
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  } catch {
    return new Date().toISOString().split("T")[0];
  }
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

async function assertClassScope(
  req: Request,
  supabase: SupabaseClient,
  caller: Caller,
  classId: string,
): Promise<{ branchId: string | null; error: Response | null }> {
  const { data: row } = await supabase
    .from("classes")
    .select("branch_id, deleted_at, teacher:staff!teacher_id(user_id)")
    .eq("id", classId)
    .maybeSingle();
  if (!row || row.deleted_at) {
    return { branchId: null, error: errorResponse(req, 404, "Class not found") };
  }

  const branchError = assertBranch(req, caller, row.branch_id);
  if (branchError) return { branchId: row.branch_id, error: branchError };

  const teacher = Array.isArray(row.teacher) ? row.teacher[0] : row.teacher;
  if (caller.role === "teacher" && teacher?.user_id !== caller.id) {
    return { branchId: row.branch_id, error: errorResponse(req, 403, "You can only manage your assigned classes") };
  }

  return { branchId: row.branch_id, error: null };
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

async function donorScope(
  supabase: SupabaseClient,
  caller: Caller,
  donorId: string,
): Promise<{ exists: boolean; readable: boolean; manageable: boolean; grantCount: number }> {
  const { data: donor, error: donorError } = await supabase
    .from("donors")
    .select("id, branch_id")
    .eq("id", donorId)
    .maybeSingle();
  if (donorError || !donor) return { exists: false, readable: false, manageable: false, grantCount: 0 };

  const { data: grants, error: grantError } = await supabase
    .from("grants")
    .select("branch_id")
    .eq("donor_id", donorId);
  if (grantError) throw grantError;
  const branches = (grants ?? []).map((grant: { branch_id: string | null }) => grant.branch_id);
  if (caller.role === "superadmin") {
    return { exists: true, readable: true, manageable: true, grantCount: branches.length };
  }

  const ownBranch = caller.branch_id;
  const hasOwnGrant = !!ownBranch && branches.includes(ownBranch);
  const hasForeignGrant = branches.some((branchId: string | null) => branchId !== ownBranch);
  const ownsDonor = !!ownBranch && donor.branch_id === ownBranch;
  return {
    exists: true,
    readable: ownsDonor || hasOwnGrant,
    manageable: (ownsDonor || (donor.branch_id === null && hasOwnGrant)) && !hasForeignGrant,
    grantCount: branches.length,
  };
}

async function staffBelongsToBranch(
  supabase: SupabaseClient,
  staffId: string | null | undefined,
  branchId: string,
): Promise<boolean> {
  if (!staffId) return true;
  const { data } = await supabase
    .from("staff")
    .select("id")
    .eq("id", staffId)
    .eq("branch_id", branchId)
    .is("deleted_at", null)
    .maybeSingle();
  return !!data;
}

async function syncFinalGrade(supabase: SupabaseClient, classId: string, studentId: string) {
  const { data: entries } = await supabase
    .from("grade_entries")
    .select("score, max_score")
    .eq("class_id", classId)
    .eq("student_id", studentId);

  const scored = (entries ?? []).filter((entry: any) => entry.score !== null);
  if (scored.length === 0) {
    await supabase
      .from("class_enrollments")
      .update({ grade: null })
      .eq("class_id", classId)
      .eq("student_id", studentId);
    return;
  }

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
      .select("id, email, first_name, last_name, profile_picture_url, role, status, branch_id")
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

    if (op === "logout") {
      const { error } = await supabase
        .from("app_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", claims.sid)
        .eq("user_id", caller.id);
      if (error) return errorResponse(req, 500, "Failed to end session", error);
      return jsonResponse(req, { success: true });
    }

    if (op === "get-session") {
      return jsonResponse(req, {
        success: true,
        user: {
          id: caller.id,
          email: caller.email,
          firstName: caller.first_name,
          lastName: caller.last_name,
          avatar: caller.profile_picture_url,
          role: caller.role,
          branchId: caller.branch_id,
        },
      });
    }

    if (op === "log-activity") {
      const actionType = cleanString(body.actionType)?.toUpperCase();
      const tableName = cleanString(body.tableName);
      const description = cleanString(body.description);
      if (
        !actionType || !["INSERT", "UPDATE", "DELETE"].includes(actionType) ||
        !tableName || !/^[a-z_]{1,63}$/.test(tableName) ||
        !description || description.length > 500
      ) {
        return errorResponse(req, 400, "Missing activity fields");
      }
      const { error } = await supabase.from("activity_logs").insert({
        user_id: caller.id,
        action_type: actionType,
        table_name: tableName,
        record_id: cleanString(body.recordId),
        description,
      });
      if (error) return errorResponse(req, 500, "Failed to log activity", error);
      return jsonResponse(req, { success: true });
    }

    if (op === "upload-public-image") {
      const folder = cleanString(body.folder);
      const contentType = cleanString(body.contentType);
      const base64 = cleanString(body.base64);

      if (!folder || !["users", "books"].includes(folder)) {
        return errorResponse(req, 400, "Invalid upload folder");
      }
      if (folder === "books") {
        const roleError = assertRoles(req, caller, LIBRARY_WRITE_ROLES);
        if (roleError) return roleError;
      }
      if (!contentType || !base64 || base64.length > 2_800_000) {
        return errorResponse(req, 400, "Only image uploads are allowed");
      }

      let bytes: Uint8Array;
      try {
        bytes = decodeBase64(base64);
      } catch {
        return errorResponse(req, 400, "Invalid image encoding");
      }
      if (bytes.byteLength > 2 * 1024 * 1024) {
        return errorResponse(req, 400, "Image is too large");
      }
      const ext = imageExtension(contentType, bytes);
      if (!ext) return errorResponse(req, 400, "Unsupported or invalid image file");

      const ownerPath = folder === "users" ? `${folder}/${caller.id}` : folder;
      const objectPath = `${ownerPath}/${crypto.randomUUID()}.${ext}`;
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
      const amount = Number(body.amount);
      const currency = cleanString(body.currency) ?? "EUR";
      if (
        !branchId ||
        !cleanString(body.description) ||
        !Number.isFinite(amount) ||
        amount <= 0 ||
        !isOneOf(currency, FEE_CURRENCIES) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(String(body.dueDate ?? ""))
      ) {
        return errorResponse(req, 400, "Invalid fee payload");
      }

      const rawStudentIds = op === "bulk-create-fees" ? body.studentIds : [body.studentId];
      const studentIds = Array.isArray(rawStudentIds)
        ? [...new Set(rawStudentIds.map((id: unknown) => cleanString(id)).filter((id): id is string => !!id))]
        : [];
      if (studentIds.length === 0 || studentIds.length > 1000) {
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
        const { data: enrollments, error: enrollmentError } = await supabase
          .from("class_enrollments")
          .select("student_id")
          .eq("class_id", body.classId)
          .eq("status", "active")
          .in("student_id", studentIds);
        if (enrollmentError || (enrollments ?? []).length !== studentIds.length) {
          return errorResponse(req, 400, "A selected student is not enrolled in the class", enrollmentError);
        }
      }

      const rows = studentIds.map((studentId: string) => ({
        student_id: studentId,
        branch_id: branchId,
        class_id: cleanString(body.classId),
        description: cleanString(body.description),
        amount,
        currency,
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

      if (op === "mark-fee-paid" && !isOneOf(body.paymentMethod, PAYMENT_METHODS)) {
        return errorResponse(req, 400, "A valid payment method is required");
      }

      const updates = op === "mark-fee-paid"
        ? {
            status: "paid",
            paid_date: await today(supabase),
            payment_method: body.paymentMethod,
            notes: cleanString(body.notes),
          }
        : {
            status: isOneOf(body.status, FEE_STATUSES.filter((status) => status !== "paid")) ? body.status : undefined,
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
        const name = cleanString(body.name);
        if (!name || name.length > 200 || !isOneOf(body.type, DONOR_TYPES)) {
          return errorResponse(req, 400, "Invalid donor payload");
        }
        const { data, error } = await supabase.from("donors").insert({
          name,
          type: body.type,
          email: cleanString(body.email),
          phone: cleanString(body.phone),
          country: cleanString(body.country),
          notes: cleanString(body.notes),
          branch_id: caller.role === "superadmin" ? cleanString(body.branchId) : caller.branch_id,
        }).select("id").single();
        if (error) return errorResponse(req, 400, "Failed to create donor", error);
        return jsonResponse(req, { success: true, id: data.id });
      }

      const id = cleanString(body.id);
      if (!id) return errorResponse(req, 400, "Missing donor id");
      const access = await donorScope(supabase, caller, id);
      if (!access.exists) return errorResponse(req, 404, "Donor not found");
      if (!access.manageable) return errorResponse(req, 403, "Donor is shared with another branch");
      if (op === "delete-donor") {
        if (access.grantCount > 0) {
          return errorResponse(req, 409, "Delete the donor's grants before deleting the donor");
        }
        const { error } = await supabase.from("donors").delete().eq("id", id);
        if (error) return errorResponse(req, 500, "Failed to delete donor", error);
        return jsonResponse(req, { success: true });
      }
      const donorUpdates: Record<string, unknown> = {};
      if ("name" in body) {
        const name = cleanString(body.name);
        if (!name || name.length > 200) return errorResponse(req, 400, "Invalid donor name");
        donorUpdates.name = name;
      }
      if ("type" in body) {
        if (!isOneOf(body.type, DONOR_TYPES)) return errorResponse(req, 400, "Invalid donor type");
        donorUpdates.type = body.type;
      }
      for (const key of ["email", "phone", "country", "notes"] as const) {
        if (key in body) donorUpdates[key] = cleanString(body[key]);
      }
      if (Object.keys(donorUpdates).length === 0) return errorResponse(req, 400, "No donor changes supplied");
      const { error } = await supabase.from("donors").update(donorUpdates).eq("id", id);
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
        const donorId = cleanString(body.donorId);
        const amount = Number(body.amount);
        const donorAccess = donorId ? await donorScope(supabase, caller, donorId) : null;
        if (
          !donorId || !donorAccess?.exists || !donorAccess.readable || !branchId ||
          !cleanString(body.title) || !Number.isFinite(amount) || amount < 0
        ) {
          return errorResponse(req, 400, "Invalid grant payload");
        }
        const { error } = await supabase.from("grants").insert({
          donor_id: donorId,
          branch_id: branchId,
          title: String(body.title),
          description: cleanString(body.description),
          amount,
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
        const amount = Number(body.amount);
        if (!grantId || !cleanString(body.description) || !Number.isFinite(amount) || amount <= 0 || !isOneOf(body.type, TX_TYPES)) {
          return errorResponse(req, 400, "Invalid transaction payload");
        }
        const { error } = await supabase.from("grant_transactions").insert({
          grant_id: grantId,
          description: String(body.description),
          amount,
          type: body.type,
          tx_date: cleanString(body.txDate) ?? await today(supabase),
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
        if (caller.role !== "superadmin" && body.sender_branch_id !== caller.branch_id) {
          return errorResponse(req, 403, "Only the sending branch can create this transaction");
        }
        if (
          !body.sender_branch_id ||
          !body.receiver_branch_id ||
          body.sender_branch_id === body.receiver_branch_id ||
          !Number.isFinite(Number(body.amount)) ||
          Number(body.amount) <= 0 ||
          !isOneOf(body.currency, TRANSACTION_CURRENCIES) ||
          !isOneOf(body.transfer_method, TRANSFER_METHODS)
        ) {
          return errorResponse(req, 400, "Invalid transaction payload");
        }
        if (
          !(await staffBelongsToBranch(supabase, cleanString(body.sender_staff_id), body.sender_branch_id)) ||
          !(await staffBelongsToBranch(supabase, cleanString(body.receiver_staff_id), body.receiver_branch_id))
        ) return errorResponse(req, 400, "Transaction staff must belong to their selected branch");
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
        .select("sender_branch_id, receiver_branch_id, sender_staff_id, receiver_staff_id, created_by, status")
        .eq("id", id)
        .maybeSingle();
      if (!existing || !touchedCallerBranch(caller, existing.sender_branch_id, existing.receiver_branch_id)) {
        return errorResponse(req, 403, "Transaction is outside your branch");
      }

      if (op === "delete-transaction") {
        if (caller.role !== "superadmin" && (existing.created_by !== caller.id || existing.status !== "pending")) {
          return errorResponse(req, 403, "Only the creator can delete a pending transaction");
        }
        const { data: deleted, error } = await supabase.from("transactions").delete().eq("id", id).eq("status", "pending").select("id").maybeSingle();
        if (error) return errorResponse(req, 500, "Failed to delete transaction", error);
        if (!deleted) return errorResponse(req, 409, "Transaction is no longer pending");
        return jsonResponse(req, { success: true });
      }

      const updates: Record<string, unknown> = {};
      if (op === "update-transaction-status") {
        updates.status = isOneOf(body.status, TX_STATUSES) ? body.status : undefined;
        if (caller.role !== "superadmin" && body.status === "completed" && existing.receiver_branch_id !== caller.branch_id) {
          return errorResponse(req, 403, "Only the receiving branch can complete this transaction");
        }
        if (
          caller.role !== "superadmin" && body.status !== "completed" &&
          existing.sender_branch_id !== caller.branch_id && existing.created_by !== caller.id
        ) {
          return errorResponse(req, 403, "Only the sending branch can cancel or fail this transaction");
        }
      } else {
        if (caller.role !== "superadmin" && (existing.created_by !== caller.id || existing.status !== "pending")) {
          return errorResponse(req, 403, "Only the creator can edit a pending transaction");
        }
        const raw = body.updates && typeof body.updates === "object" ? body.updates : {};
        if ("sender_branch_id" in raw) updates.sender_branch_id = cleanString(raw.sender_branch_id);
        if ("receiver_branch_id" in raw) updates.receiver_branch_id = cleanString(raw.receiver_branch_id);
        if ("sender_staff_id" in raw) updates.sender_staff_id = cleanString(raw.sender_staff_id);
        if ("receiver_staff_id" in raw) updates.receiver_staff_id = cleanString(raw.receiver_staff_id);
        if ("amount" in raw) {
          const amount = Number(raw.amount);
          if (!Number.isFinite(amount) || amount <= 0) return errorResponse(req, 400, "Invalid transaction amount");
          updates.amount = amount;
        }
        if ("currency" in raw) {
          if (!isOneOf(raw.currency, TRANSACTION_CURRENCIES)) return errorResponse(req, 400, "Invalid currency");
          updates.currency = raw.currency;
        }
        if ("transfer_method" in raw) {
          if (!isOneOf(raw.transfer_method, TRANSFER_METHODS)) return errorResponse(req, 400, "Invalid transfer method");
          updates.transfer_method = raw.transfer_method;
        }
        if ("external_reference" in raw) updates.external_reference = cleanString(raw.external_reference);
        if ("notes" in raw) updates.notes = cleanString(raw.notes);
        updates.updated_at = new Date().toISOString();
      }
      if (!updates.status && op === "update-transaction-status") return errorResponse(req, 400, "Invalid status");
      const nextSender = typeof updates.sender_branch_id === "string" ? updates.sender_branch_id : existing.sender_branch_id;
      const nextReceiver = typeof updates.receiver_branch_id === "string" ? updates.receiver_branch_id : existing.receiver_branch_id;
      if (!nextSender || !nextReceiver || nextSender === nextReceiver) {
        return errorResponse(req, 400, "Sender and receiver branches must be different");
      }
      if (!touchedCallerBranch(caller, nextSender, nextReceiver)) {
        return errorResponse(req, 403, "Transaction update is outside your branch");
      }
      const nextSenderStaff = "sender_staff_id" in updates ? updates.sender_staff_id as string | null : existing.sender_staff_id;
      const nextReceiverStaff = "receiver_staff_id" in updates ? updates.receiver_staff_id as string | null : existing.receiver_staff_id;
      if (
        !(await staffBelongsToBranch(supabase, nextSenderStaff, nextSender)) ||
        !(await staffBelongsToBranch(supabase, nextReceiverStaff, nextReceiver))
      ) return errorResponse(req, 400, "Transaction staff must belong to their selected branch");
      const { data, error } = await supabase
        .from("transactions")
        .update(updates)
        .eq("id", id)
        .eq("status", "pending")
        .select(TRANSACTION_SELECT)
        .maybeSingle();
      if (error) return errorResponse(req, 500, "Failed to update transaction", error);
      if (!data) return errorResponse(req, 409, "Transaction is no longer pending");
      return jsonResponse(req, { success: true, data });
    }

    // ── Messages ───────────────────────────────────────────────────
    if (op === "send-message" || op === "mark-message-read" || op === "delete-message") {
      const roleError = assertRoles(req, caller, STAFF_ROLES);
      if (roleError) return roleError;

      if (op === "send-message") {
        let branchId = caller.branch_id;
        const recipientId = cleanString(body.recipientId);
        if (!cleanString(body.subject) || !cleanString(body.body)) {
          return errorResponse(req, 400, "Message subject and body are required");
        }
        if (recipientId) {
          const { data: rec } = await supabase
            .from("users")
            .select("id, role, status, branch_id")
            .eq("id", recipientId)
            .eq("status", "active")
            .maybeSingle();
          if (!rec || !STAFF_ROLES.includes(rec.role)) return errorResponse(req, 400, "Recipient is not available");
          if (caller.role !== "superadmin" && rec.branch_id !== caller.branch_id) {
            return errorResponse(req, 403, "Recipient is outside your branch");
          }
          if (caller.role === "superadmin") branchId = rec.branch_id ?? null;
        }
        const parentId = cleanString(body.parentId);
        if (parentId) {
          const { data: parent } = await supabase
            .from("messages")
            .select("sender_id, recipient_id, branch_id")
            .eq("id", parentId)
            .maybeSingle();
          const participates = parent && (
            parent.sender_id === caller.id ||
            parent.recipient_id === caller.id ||
            (parent.recipient_id === null && (caller.role === "superadmin" || parent.branch_id === caller.branch_id))
          );
          if (!participates) return errorResponse(req, 403, "Message thread is outside your scope");
        }
        if (caller.role !== "superadmin" && !branchId) return errorResponse(req, 403, "Account is missing a branch");
        const { data, error } = await supabase.from("messages").insert({
          sender_id: caller.id,
          recipient_id: recipientId,
          branch_id: branchId,
          subject: cleanString(body.subject),
          body: cleanString(body.body),
          parent_id: parentId,
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
      const isBroadcastRecipient = message.recipient_id === null && (
        caller.role === "superadmin" || message.branch_id === null || message.branch_id === caller.branch_id
      );
      const isBranchAdmin = ADMIN_ROLES.includes(caller.role) && !assertBranch(req, caller, message.branch_id);
      if (!isParticipant && !isBroadcastRecipient && !isBranchAdmin) return errorResponse(req, 403, "Message is outside your scope");

      if (op === "delete-message") {
        if (message.sender_id !== caller.id && !isBranchAdmin) {
          return errorResponse(req, 403, "Only the sender or a branch administrator can delete this message");
        }
        const { error } = await supabase.from("messages").delete().eq("id", messageId);
        if (error) return errorResponse(req, 500, "Failed to delete message", error);
        return jsonResponse(req, { success: true });
      }
      if (message.recipient_id === null) {
        const { error } = await supabase.from("message_read_receipts").upsert(
          { message_id: messageId, user_id: caller.id, read_at: new Date().toISOString() },
          { onConflict: "message_id,user_id" },
        );
        if (error) return errorResponse(req, 500, "Failed to mark broadcast as read", error);
        return jsonResponse(req, { success: true });
      }
      if (message.recipient_id !== caller.id) {
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
        const classScope = await assertClassScope(req, supabase, caller, classId);
        if (classScope.error) return classScope.error;
        const classBranch = classScope.branchId;
        const studentBranch = await getStudentBranch(supabase, studentId);
        if (!classBranch || !studentBranch) return errorResponse(req, 404, "Class or student not found");
        if (classBranch !== studentBranch) return errorResponse(req, 400, "Student is in a different branch");
        const { data: activeEnrollment, error: enrollmentError } = await supabase
          .from("class_enrollments")
          .select("id")
          .eq("class_id", classId)
          .eq("student_id", studentId)
          .eq("status", "active")
          .maybeSingle();
        if (enrollmentError) return errorResponse(req, 500, "Failed to verify enrollment", enrollmentError);
        if (!activeEnrollment) return errorResponse(req, 400, "Student is not actively enrolled in this class");

        if (op === "set-final-grade") {
          const { error } = await supabase
            .from("class_enrollments")
            .update({ grade: String(body.grade ?? "") })
            .eq("class_id", classId)
            .eq("student_id", studentId);
          if (error) return errorResponse(req, 500, "Failed to set grade", error);
          return jsonResponse(req, { success: true });
        }

        const maxScore = Number(body.maxScore ?? 100);
        const score = body.score === null || body.score === undefined ? null : Number(body.score);
        if (
          !cleanString(body.assessmentName) ||
          !isOneOf(body.assessmentType, ASSESSMENT_TYPES) ||
          !Number.isFinite(maxScore) ||
          maxScore <= 0 ||
          (score !== null && (!Number.isFinite(score) || score < 0 || score > maxScore))
        ) {
          return errorResponse(req, 400, "Invalid grade payload");
        }
        const { data, error } = await supabase.from("grade_entries").insert({
          class_id: classId,
          student_id: studentId,
          assessment_name: cleanString(body.assessmentName),
          assessment_type: body.assessmentType,
          score,
          max_score: maxScore,
          grade_letter: cleanString(body.gradeLetter),
          notes: cleanString(body.notes),
          assessment_date: cleanString(body.assessmentDate) ?? await today(supabase),
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
        .select("class_id, student_id, score, max_score")
        .eq("id", entryId)
        .maybeSingle();
      if (!entry) return errorResponse(req, 404, "Grade not found");
      const classScope = await assertClassScope(req, supabase, caller, entry.class_id);
      if (classScope.error) return classScope.error;

      if (op === "delete-grade-entry") {
        const { error } = await supabase.from("grade_entries").delete().eq("id", entryId);
        if (error) return errorResponse(req, 500, "Failed to delete grade", error);
        await syncFinalGrade(supabase, entry.class_id, entry.student_id);
        return jsonResponse(req, { success: true });
      }

      const rawGradeUpdates = body.updates && typeof body.updates === "object" ? body.updates : {};
      const gradeUpdates: Record<string, unknown> = {};
      if ("assessment_name" in rawGradeUpdates) {
        const name = cleanString(rawGradeUpdates.assessment_name);
        if (!name) return errorResponse(req, 400, "Assessment name is required");
        gradeUpdates.assessment_name = name;
      }
      if ("assessment_type" in rawGradeUpdates) {
        if (!isOneOf(rawGradeUpdates.assessment_type, ASSESSMENT_TYPES)) return errorResponse(req, 400, "Invalid assessment type");
        gradeUpdates.assessment_type = rawGradeUpdates.assessment_type;
      }
      const nextMaxScore = "max_score" in rawGradeUpdates ? Number(rawGradeUpdates.max_score) : undefined;
      if (nextMaxScore !== undefined && (!Number.isFinite(nextMaxScore) || nextMaxScore <= 0)) {
        return errorResponse(req, 400, "Maximum score must be positive");
      }
      if (nextMaxScore !== undefined) gradeUpdates.max_score = nextMaxScore;
      if ("score" in rawGradeUpdates) {
        const nextScore = rawGradeUpdates.score === null ? null : Number(rawGradeUpdates.score);
        if (nextScore !== null && (!Number.isFinite(nextScore) || nextScore < 0)) {
          return errorResponse(req, 400, "Invalid score");
        }
        gradeUpdates.score = nextScore;
      }
      if ("grade_letter" in rawGradeUpdates) gradeUpdates.grade_letter = cleanString(rawGradeUpdates.grade_letter);
      if ("notes" in rawGradeUpdates) gradeUpdates.notes = cleanString(rawGradeUpdates.notes);
      if ("assessment_date" in rawGradeUpdates) gradeUpdates.assessment_date = cleanString(rawGradeUpdates.assessment_date);
      if (Object.keys(gradeUpdates).length === 0) return jsonResponse(req, { success: true });
      const effectiveMaxScore = nextMaxScore ?? Number(entry.max_score);
      const effectiveScore = "score" in gradeUpdates ? gradeUpdates.score : entry.score;
      if (effectiveScore !== null && Number(effectiveScore) > effectiveMaxScore) {
        return errorResponse(req, 400, "Score cannot exceed the maximum score");
      }

      const { error } = await supabase
        .from("grade_entries")
        .update(gradeUpdates)
        .eq("id", entryId);
      if (error) return errorResponse(req, 500, "Failed to update grade", error);
      await syncFinalGrade(supabase, entry.class_id, entry.student_id);
      return jsonResponse(req, { success: true });
    }

    // ── Surveys ────────────────────────────────────────────────────
    if (
      op === "create-survey" ||
      op === "update-survey-meta" ||
      op === "update-survey-structure" ||
      op === "delete-survey" ||
      op === "save-branch-survey-data" ||
      op === "save-individual-survey-responses" ||
      op === "add-survey-respondent" ||
      op === "delete-survey-respondent"
    ) {
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
          language: isOneOf(body.language, SURVEY_LANGUAGES) ? body.language : "fa",
          status: body.status,
          created_by: caller.id,
        };
        const surveyDate = cleanString(body.surveyDate);
        if (surveyDate) surveyInsert.survey_date = surveyDate;
        const { data: survey, error: sErr } = await supabase.from("surveys").insert(surveyInsert).select().single();
        if (sErr || !survey) return errorResponse(req, 400, "Failed to create survey", sErr);

        const sections = Array.isArray(body.sections) ? body.sections : [];
        const questions = Array.isArray(body.questions) ? body.questions : [];
        if (
          sections.length > 100 ||
          questions.length === 0 ||
          questions.length > 500 ||
          questions.some((question: any) => !cleanString(question.text))
        ) {
          await supabase.from("surveys").delete().eq("id", survey.id);
          return errorResponse(req, 400, "Survey questions are invalid");
        }
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

        const questionIdMap: Record<number, string> = {};
        if (questions.length > 0) {
          const { data, error } = await supabase.from("survey_questions").insert(
            questions.map((question: any, index: number) => ({
              survey_id: survey.id,
              section_id: question.sectionIndex !== null && question.sectionIndex !== undefined
                ? sectionIdMap[question.sectionIndex] ?? null
                : null,
              question_text: String(question.text ?? ""),
              question_type: isOneOf(question.questionType, SURVEY_QUESTION_TYPES) ? question.questionType : "multiple_choice",
              sentiment_enabled: Boolean(question.sentimentEnabled),
              order_index: index,
            })),
          ).select("id");
          if (error) {
            await supabase.from("surveys").delete().eq("id", survey.id);
            return errorResponse(req, 400, "Failed to create survey questions", error);
          }
          (data ?? []).forEach((question: any, index: number) => { questionIdMap[index] = question.id; });
        }

        const options = Array.isArray(body.options) ? body.options : [];
        const perQuestionOptions = questions.flatMap((question: any, questionIndex: number) =>
          Array.isArray(question.options)
            ? question.options.map((option: any, optionIndex: number) => ({
              survey_id: survey.id,
              question_id: questionIdMap[questionIndex] ?? null,
              label: String(option.label ?? ""),
              sentiment: isOneOf(option.sentiment, SENTIMENTS) ? option.sentiment : "neutral",
              order_index: optionIndex,
            }))
            : []
        );
        const optionRows = perQuestionOptions.length > 0
          ? perQuestionOptions
          : options.map((option: any, index: number) => ({
            survey_id: survey.id,
            question_id: null,
            label: String(option.label ?? ""),
            sentiment: isOneOf(option.sentiment, SENTIMENTS) ? option.sentiment : "neutral",
            order_index: index,
          }));
        if (optionRows.length > 0) {
          const { error } = await supabase.from("survey_response_options").insert(
            optionRows,
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
        const { data: survey, error: surveyErr } = await supabase
          .from("surveys")
          .select("id, branch_id")
          .eq("id", surveyId)
          .maybeSingle();
        if (surveyErr || !survey) return errorResponse(req, 404, "Survey not found", surveyErr);
        const branchError = assertBranch(req, caller, survey.branch_id);
        if (branchError) return branchError;

        const { updates, error: fieldsError } = cleanSurveyUpdateFields(body.fields ?? {});
        if (fieldsError) return errorResponse(req, 400, fieldsError);
        if (Object.keys(updates).length === 0) return jsonResponse(req, { success: true });

        const { error } = await supabase.from("surveys").update(updates).eq("id", surveyId);
        if (error) return errorResponse(req, 500, "Failed to update survey", error);
        return jsonResponse(req, { success: true });
      }

      if (op === "update-survey-structure") {
        const surveyId = cleanString(body.surveyId);
        if (!surveyId) return errorResponse(req, 400, "Missing survey id");

        const { data: survey, error: surveyErr } = await supabase
          .from("surveys")
          .select("id, branch_id")
          .eq("id", surveyId)
          .maybeSingle();
        if (surveyErr || !survey) return errorResponse(req, 404, "Survey not found", surveyErr);
        const branchError = assertBranch(req, caller, survey.branch_id);
        if (branchError) return branchError;

        const { updates, error: fieldsError } = cleanSurveyUpdateFields(body.fields ?? {});
        if (fieldsError) return errorResponse(req, 400, fieldsError);

        const sections = Array.isArray(body.sections) ? body.sections : [];
        const questions = Array.isArray(body.questions) ? body.questions : [];
        const options = Array.isArray(body.options) ? body.options : [];
        if (questions.length === 0) return errorResponse(req, 400, "Add at least one question");

        const sectionIdMap: Record<number, string> = {};
        const sectionRows: any[] = [];
        sections.forEach((section: any, sourceIndex: number) => {
          const title = cleanString(section.title);
          if (!title) return;
          const id = crypto.randomUUID();
          sectionIdMap[sourceIndex] = id;
          sectionRows.push({
            id,
            survey_id: surveyId,
            title,
            description: cleanString(section.description),
            order_index: sectionRows.length,
          });
        });

        const questionIdMap: Record<number, string> = {};
        const questionRows: any[] = [];
        let questionPayloadError: string | null = null;
        questions.forEach((question: any, sourceIndex: number) => {
          if (questionPayloadError) return;
          const text = cleanString(question.text);
          if (!text) return;
          const questionType = isOneOf(question.questionType, SURVEY_QUESTION_TYPES) ? question.questionType : "multiple_choice";
          const choiceOptions = Array.isArray(question.options)
            ? question.options.filter((option: any) => cleanString(option.label))
            : [];
          if (surveyQuestionUsesOptions(questionType) && choiceOptions.length === 0) {
            questionPayloadError = "Choice questions need at least one answer option";
            return;
          }
          const id = crypto.randomUUID();
          questionIdMap[sourceIndex] = id;
          questionRows.push({
            id,
            survey_id: surveyId,
            section_id: question.sectionIndex !== null && question.sectionIndex !== undefined
              ? sectionIdMap[question.sectionIndex] ?? null
              : null,
            question_text: text,
            question_type: questionType,
            sentiment_enabled: Boolean(question.sentimentEnabled),
            order_index: questionRows.length,
          });
        });
        if (questionPayloadError) return errorResponse(req, 400, questionPayloadError);
        if (questionRows.length === 0) return errorResponse(req, 400, "Add at least one question");

        const perQuestionOptions: any[] = [];
        questions.forEach((question: any, questionIndex: number) => {
          const questionId = questionIdMap[questionIndex];
          if (!questionId) return;
          const questionType = isOneOf(question.questionType, SURVEY_QUESTION_TYPES) ? question.questionType : "multiple_choice";
          if (!surveyQuestionUsesOptions(questionType)) return;
          (Array.isArray(question.options) ? question.options : []).forEach((option: any, optionIndex: number) => {
            const label = cleanString(option.label);
            if (!label) return;
            perQuestionOptions.push({
              survey_id: surveyId,
              question_id: questionId,
              label,
              sentiment: isOneOf(option.sentiment, SENTIMENTS) ? option.sentiment : "neutral",
              order_index: optionIndex,
            });
          });
        });
        const optionRows = perQuestionOptions.length > 0
          ? perQuestionOptions
          : options
            .map((option: any, index: number) => {
              const label = cleanString(option.label);
              if (!label) return null;
              return {
                survey_id: surveyId,
                question_id: null,
                label,
                sentiment: isOneOf(option.sentiment, SENTIMENTS) ? option.sentiment : "neutral",
                order_index: index,
              };
            })
            .filter(Boolean);

        const { error: structureError } = await supabase.rpc("replace_survey_structure_atomic", {
          p_survey_id: surveyId,
          p_fields: updates,
          p_sections: sectionRows,
          p_questions: questionRows,
          p_options: optionRows,
        });
        if (structureError) {
          const status = String(structureError.message ?? "").includes("after responses") ? 409 : 400;
          return errorResponse(req, status, "Failed to update survey structure", structureError);
        }

        return jsonResponse(req, { success: true });
      }

      if (op === "delete-survey") {
        const surveyId = cleanString(body.surveyId);
        if (!surveyId) return errorResponse(req, 400, "Missing survey id");
        const { data: survey, error: surveyErr } = await supabase
          .from("surveys")
          .select("id, branch_id")
          .eq("id", surveyId)
          .maybeSingle();
        if (surveyErr || !survey) return errorResponse(req, 404, "Survey not found", surveyErr);
        const branchError = assertBranch(req, caller, survey.branch_id);
        if (branchError) return branchError;
        const { error } = await supabase.from("surveys").delete().eq("id", surveyId);
        if (error) return errorResponse(req, 500, "Failed to delete survey", error);
        return jsonResponse(req, { success: true });
      }

      const surveyId = cleanString(body.surveyId);
      const branchId = cleanString(body.branchId);
      const branchError = assertBranch(req, caller, branchId);
      if (branchError) return branchError;
      if (!surveyId || !branchId) return errorResponse(req, 400, "Missing survey or branch");
      const { data: scopedSurvey, error: scopedSurveyError } = await supabase
        .from("surveys")
        .select("id, branch_id")
        .eq("id", surveyId)
        .maybeSingle();
      if (scopedSurveyError || !scopedSurvey) return errorResponse(req, 404, "Survey not found", scopedSurveyError);
      if (scopedSurvey.branch_id !== branchId) return errorResponse(req, 403, "Survey is outside this branch");

      if (op === "add-survey-respondent") {
        const name = cleanString(body.name);
        const detail = cleanString(body.detail);
        if (!surveyId || !branchId || !name) {
          return errorResponse(req, 400, "A respondent name is required");
        }

        const { data: survey, error: surveyErr } = await supabase
          .from("surveys")
          .select("id, branch_id")
          .eq("id", surveyId)
          .maybeSingle();
        if (surveyErr || !survey) return errorResponse(req, 404, "Survey not found", surveyErr);
        if (survey.branch_id && survey.branch_id !== branchId) {
          return errorResponse(req, 403, "Survey is outside this branch");
        }

        const { data: inserted, error } = await supabase
          .from("survey_respondents")
          .insert({
            survey_id: surveyId,
            branch_id: branchId,
            respondent_type: "manual",
            respondent_id: crypto.randomUUID(),
            respondent_name: name,
            respondent_detail: detail,
          })
          .select()
          .single();
        if (error || !inserted) return errorResponse(req, 400, "Failed to add respondent", error);

        return jsonResponse(req, { success: true, respondent: inserted });
      }

      if (op === "delete-survey-respondent") {
        const respondentRowId = cleanString(body.respondentRowId);
        if (!surveyId || !branchId || !respondentRowId) {
          return errorResponse(req, 400, "Invalid respondent deletion request");
        }

        const { data: respondent, error: respondentError } = await supabase
          .from("survey_respondents")
          .select("id, respondent_type")
          .eq("id", respondentRowId)
          .eq("survey_id", surveyId)
          .eq("branch_id", branchId)
          .maybeSingle();
        if (respondentError) return errorResponse(req, 500, "Failed to verify respondent", respondentError);
        if (!respondent) return errorResponse(req, 404, "Respondent not found");
        if (respondent.respondent_type !== "manual") {
          return errorResponse(req, 403, "Only manually added respondents can be deleted here");
        }

        const { error } = await supabase
          .from("survey_respondents")
          .delete()
          .eq("id", respondent.id);
        if (error) return errorResponse(req, 500, "Failed to delete respondent", error);

        return jsonResponse(req, { success: true });
      }

      if (op === "save-individual-survey-responses") {
        const respondent = body.respondent ?? {};
        const respondentType = isOneOf(respondent.type, SURVEY_RESPONDENT_KINDS_WITH_MANUAL) ? respondent.type : null;
        const respondentId = cleanString(respondent.id);
        const respondentName = cleanString(respondent.name);
        if (!surveyId || !branchId || !respondentType || !respondentId || !respondentName) {
          return errorResponse(req, 400, "Invalid individual survey payload");
        }

        const { data: survey, error: surveyErr } = await supabase
          .from("surveys")
          .select("id, branch_id")
          .eq("id", surveyId)
          .maybeSingle();
        if (surveyErr || !survey) return errorResponse(req, 404, "Survey not found", surveyErr);
        if (survey.branch_id && survey.branch_id !== branchId) {
          return errorResponse(req, 403, "Survey is outside this branch");
        }

        const { data: selectedRespondent, error: selectedErr } = await supabase
          .from("survey_respondents")
          .select("id")
          .eq("survey_id", surveyId)
          .eq("branch_id", branchId)
          .eq("respondent_type", respondentType)
          .eq("respondent_id", respondentId)
          .maybeSingle();
        if (selectedErr) return errorResponse(req, 500, "Failed to verify respondent", selectedErr);
        if (!selectedRespondent) return errorResponse(req, 403, "Respondent is not assigned to this survey");

        const answers = Array.isArray(body.answers) ? body.answers : [];
        const cleanedAnswers = answers
          .map((answer: any) => {
            const singleOption = cleanString(answer.optionId);
            const multiOptions = Array.isArray(answer.optionIds)
              ? answer.optionIds.map((optionId: unknown) => cleanString(optionId)).filter(Boolean)
              : [];
            return {
              questionId: cleanString(answer.questionId),
              optionIds: multiOptions.length > 0 ? Array.from(new Set(multiOptions)) : singleOption ? [singleOption] : [],
              textAnswer: cleanString(answer.textAnswer),
            };
          })
          .filter((answer: any) => answer.questionId);
        const questionIds = Array.from(new Set(cleanedAnswers.map((answer: any) => answer.questionId)));
        if (questionIds.length > 0) {
          const { data: validQuestions, error } = await supabase
            .from("survey_questions")
            .select("id")
            .eq("survey_id", surveyId)
            .in("id", questionIds);
          if (error) return errorResponse(req, 500, "Failed to verify survey questions", error);
          if ((validQuestions ?? []).length !== questionIds.length) {
            return errorResponse(req, 400, "One or more answers do not belong to this survey");
          }
        }

        const optionIds = Array.from(new Set(cleanedAnswers.flatMap((answer: any) => answer.optionIds).filter(Boolean)));
        if (optionIds.length > 0) {
          const { data: validOptions, error } = await supabase
            .from("survey_response_options")
            .select("id, question_id")
            .eq("survey_id", surveyId)
            .in("id", optionIds);
          if (error) return errorResponse(req, 500, "Failed to verify survey options", error);
          const optionMap = new Map((validOptions ?? []).map((option: any) => [option.id, option.question_id]));
          const hasMismatchedOption = cleanedAnswers.some((answer: any) =>
            answer.optionIds.some((optionId: string) => {
              const questionId = optionMap.get(optionId);
              return questionId === undefined || (questionId !== null && questionId !== answer.questionId);
            })
          );
          if ((validOptions ?? []).length !== optionIds.length || hasMismatchedOption) {
            return errorResponse(req, 400, "One or more answers have invalid options");
          }
        }

        const rows = cleanedAnswers.flatMap((answer: any) => {
          const common = {
            survey_id: surveyId,
            branch_id: branchId,
            respondent_type: respondentType,
            respondent_id: respondentId,
            respondent_name: respondentName,
            question_id: answer.questionId,
            answered_by: caller.id,
            updated_at: new Date().toISOString(),
          };
          if (answer.optionIds.length > 0) {
            return answer.optionIds.map((optionId: string) => ({
              ...common,
              option_id: optionId,
              text_answer: null,
            }));
          }
          if (answer.textAnswer) {
            return [{ ...common, option_id: null, text_answer: answer.textAnswer }];
          }
          return [];
        });

        const { error: saveError } = await supabase.rpc("save_survey_individual_atomic", {
          p_survey_id: surveyId,
          p_branch_id: branchId,
          p_respondent_type: respondentType,
          p_respondent_id: respondentId,
          p_respondent_name: respondentName,
          p_answered_by: caller.id,
          p_question_ids: questionIds,
          p_answers: rows.map((row: any) => ({
            question_id: row.question_id,
            option_id: row.option_id,
            text_answer: row.text_answer,
          })),
        });
        if (saveError) return errorResponse(req, 500, "Failed to save individual survey responses", saveError);

        return jsonResponse(req, { success: true });
      }

      const totalRespondents = Number(body.totalRespondents);
      if (!Number.isInteger(totalRespondents) || totalRespondents < 0) {
        return errorResponse(req, 400, "Invalid branch survey payload");
      }

      const counts = Array.isArray(body.counts) ? body.counts : [];
      let cleanedCounts: Array<{ questionId: string | null; optionId: string | null; count: number }> = [];
      if (counts.length > 0) {
        if (counts.length > 5000) return errorResponse(req, 400, "Too many survey counts");
        cleanedCounts = counts.map((count: any) => ({
          questionId: cleanString(count.questionId),
          optionId: cleanString(count.optionId),
          count: Number(count.count),
        }));
        if (cleanedCounts.some((count) => !count.questionId || !count.optionId || !Number.isInteger(count.count) || count.count < 0)) {
          return errorResponse(req, 400, "Invalid survey counts");
        }
        const questionIds = [...new Set(cleanedCounts.map((count) => count.questionId as string))];
        const { data: validQuestions, error: questionsError } = await supabase
          .from("survey_questions")
          .select("id")
          .eq("survey_id", surveyId)
          .in("id", questionIds);
        if (questionsError) return errorResponse(req, 500, "Failed to verify survey questions", questionsError);
        if ((validQuestions ?? []).length !== questionIds.length) {
          return errorResponse(req, 400, "Survey counts contain invalid questions");
        }
        const optionIds = [...new Set(cleanedCounts.map((count) => count.optionId as string))];
        const { data: validOptions, error: optionsError } = await supabase
          .from("survey_response_options")
          .select("id, question_id")
          .eq("survey_id", surveyId)
          .in("id", optionIds);
        if (optionsError) return errorResponse(req, 500, "Failed to verify survey options", optionsError);
        const optionMap = new Map((validOptions ?? []).map((option: any) => [option.id, option.question_id]));
        if (cleanedCounts.some((count) => {
          const questionId = optionMap.get(count.optionId as string);
          return questionId === undefined || (questionId !== null && questionId !== count.questionId);
        })) return errorResponse(req, 400, "Survey count options do not match their questions");

      }

      const { error: aggregateError } = await supabase.rpc("save_survey_aggregate_atomic", {
        p_survey_id: surveyId,
        p_branch_id: branchId,
        p_total_respondents: totalRespondents,
        p_entered_by: caller.id,
        p_counts: cleanedCounts.map((count) => ({
          question_id: count.questionId,
          option_id: count.optionId,
          count: count.count,
        })),
      });
      if (aggregateError) return errorResponse(req, 500, "Failed to save survey responses", aggregateError);

      return jsonResponse(req, { success: true });
    }

    // ── Organization / account settings ────────────────────────────
    if (op === "save-org-settings") {
      const roleError = assertRoles(req, caller, ["superadmin"]);
      if (roleError) return roleError;

      const updates = body.updates && typeof body.updates === "object" ? body.updates : {};
      const entries = Object.entries(updates);
      if (entries.length === 0 || entries.length > ORG_SETTING_KEYS.size) {
        return errorResponse(req, 400, "Invalid settings payload");
      }
      for (const [key, value] of entries) {
        if (!ORG_SETTING_KEYS.has(key) || typeof value !== "string" || value.length > 1000) {
          return errorResponse(req, 400, "Invalid setting");
        }
        if (key === "session_timeout_minutes") {
          const minutes = Number(value);
          if (!Number.isInteger(minutes) || minutes < 5 || minutes > 1440) {
            return errorResponse(req, 400, "Session timeout must be between 5 and 1440 minutes");
          }
        }
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
      return errorResponse(req, 501, "Two-factor authentication is not available yet");
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
        const dependencies: Array<[string, string]> = [
          ["users", "branch_id"], ["staff", "branch_id"], ["students", "branch_id"],
          ["classes", "branch_id"], ["books", "branch_id"], ["student_fees", "branch_id"],
          ["grants", "branch_id"], ["donors", "branch_id"], ["surveys", "branch_id"], ["messages", "branch_id"],
          ["transactions", "sender_branch_id"], ["transactions", "receiver_branch_id"],
        ];
        const checks = await Promise.all(dependencies.map(([table, column]) =>
          supabase.from(table).select("id", { count: "exact", head: true }).eq(column, branchId)
        ));
        const dependencyError = checks.find((check) => check.error)?.error;
        if (dependencyError) return errorResponse(req, 500, "Failed to check branch dependencies", dependencyError);
        const dependencyCount = checks.reduce((sum, check) => sum + (check.count ?? 0), 0);
        if (dependencyCount > 0) {
          return errorResponse(req, 409, "Branch contains records; set it to inactive instead of deleting it");
        }
        const { error } = await supabase.from("branches").delete().eq("id", branchId);
        if (error) return errorResponse(req, 500, "Failed to delete branch", error);
        return jsonResponse(req, { success: true });
      }
      const rawUpdates = body.updates && typeof body.updates === "object" ? body.updates : {};
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if ("name" in rawUpdates) {
        const name = cleanString(rawUpdates.name);
        if (!name) return errorResponse(req, 400, "Branch name is required");
        updates.name = name;
      }
      if ("province" in rawUpdates) {
        const province = cleanString(rawUpdates.province);
        if (!province) return errorResponse(req, 400, "Branch province is required");
        updates.province = province;
      }
      if ("city" in rawUpdates) updates.city = cleanString(rawUpdates.city);
      if ("address" in rawUpdates) updates.address = cleanString(rawUpdates.address);
      if ("phone" in rawUpdates) updates.phone = cleanString(rawUpdates.phone);
      if ("email" in rawUpdates) updates.email = cleanString(rawUpdates.email);
      if ("established_date" in rawUpdates) updates.established_date = cleanString(rawUpdates.established_date);
      if ("status" in rawUpdates) updates.status = rawUpdates.status === "inactive" ? "inactive" : "active";
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
        const maxCapacity = Number(body.maxCapacity);
        if (
          !branchId ||
          !cleanString(body.name) ||
          !cleanString(body.teacherId) ||
          !Number.isInteger(maxCapacity) ||
          maxCapacity < 1 ||
          (body.semester && !isOneOf(body.semester, SEMESTERS))
        ) return errorResponse(req, 400, "Invalid class payload");
        const { data: teacher } = await supabase
          .from("staff")
          .select("branch_id, deleted_at, user:users!user_id(id, role, status)")
          .eq("id", body.teacherId)
          .maybeSingle();
        const teacherUser = Array.isArray(teacher?.user) ? teacher?.user[0] : teacher?.user;
        if (!teacher || teacher.deleted_at || teacher.branch_id !== branchId || teacherUser?.role !== "teacher" || teacherUser?.status !== "active") {
          return errorResponse(req, 400, "Teacher is not in the class branch");
        }
        if (caller.role === "teacher" && teacherUser?.id !== caller.id) {
          return errorResponse(req, 403, "Teachers can only create their own classes");
        }
        const { error } = await supabase.from("classes").insert({
          name: String(body.name),
          description: cleanString(body.description),
          teacher_id: body.teacherId,
          schedule_day: Array.isArray(body.scheduleDays) ? body.scheduleDays : [],
          schedule_time: cleanString(body.scheduleTime),
          schedule_end_time: cleanString(body.scheduleEndTime),
          location: cleanString(body.location),
          max_capacity: maxCapacity,
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
        const classScope = await assertClassScope(req, supabase, caller, classId);
        if (classScope.error) return classScope.error;
        const existingBranch = classScope.branchId;
        if (op === "delete-class") {
          const { error } = await supabase
            .from("classes")
            .update({ deleted_at: new Date().toISOString() })
            .eq("id", classId);
          if (error) return errorResponse(req, 500, "Failed to delete class", error);
          return jsonResponse(req, { success: true });
        }
        const rawUpdates = body.updates && typeof body.updates === "object" ? body.updates : {};
        const updates: Record<string, unknown> = {};
        if ("name" in rawUpdates) {
          const name = cleanString(rawUpdates.name);
          if (!name) return errorResponse(req, 400, "Class name is required");
          updates.name = name;
        }
        if ("description" in rawUpdates) updates.description = cleanString(rawUpdates.description);
        if ("teacher_id" in rawUpdates) updates.teacher_id = cleanString(rawUpdates.teacher_id);
        if ("schedule_day" in rawUpdates) updates.schedule_day = Array.isArray(rawUpdates.schedule_day) ? rawUpdates.schedule_day : [];
        if ("schedule_time" in rawUpdates) updates.schedule_time = cleanString(rawUpdates.schedule_time);
        if ("schedule_end_time" in rawUpdates) updates.schedule_end_time = cleanString(rawUpdates.schedule_end_time);
        if ("location" in rawUpdates) updates.location = cleanString(rawUpdates.location);
        if ("academic_year" in rawUpdates) updates.academic_year = cleanString(rawUpdates.academic_year);
        if ("max_capacity" in rawUpdates) {
          const capacity = Number(rawUpdates.max_capacity);
          if (!Number.isInteger(capacity) || capacity < 1) return errorResponse(req, 400, "Class capacity must be at least 1");
          updates.max_capacity = capacity;
        }
        if ("semester" in rawUpdates) {
          if (rawUpdates.semester !== null && !isOneOf(rawUpdates.semester, SEMESTERS)) return errorResponse(req, 400, "Invalid semester");
          updates.semester = rawUpdates.semester;
        }
        if ("status" in rawUpdates) {
          if (!isOneOf(rawUpdates.status, CLASS_STATUSES)) return errorResponse(req, 400, "Invalid class status");
          updates.status = rawUpdates.status;
        }
        if ("branch_id" in rawUpdates) updates.branch_id = cleanString(rawUpdates.branch_id);
        if (updates.branch_id && updates.branch_id !== existingBranch) {
          const newBranchError = assertBranch(req, caller, updates.branch_id as string);
          if (newBranchError) return newBranchError;
        }
        if (updates.teacher_id) {
          const { data: teacher } = await supabase
            .from("staff")
            .select("branch_id, deleted_at, user:users!user_id(id, role, status)")
            .eq("id", updates.teacher_id as string)
            .maybeSingle();
          const targetBranch = updates.branch_id ?? existingBranch;
          const teacherUser = Array.isArray(teacher?.user) ? teacher?.user[0] : teacher?.user;
          if (!teacher || teacher.deleted_at || teacher.branch_id !== targetBranch || teacherUser?.role !== "teacher" || teacherUser?.status !== "active") {
            return errorResponse(req, 400, "Teacher is not in the class branch");
          }
          if (caller.role === "teacher" && teacherUser?.id !== caller.id) {
            return errorResponse(req, 403, "Teachers cannot reassign their classes");
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
        const classScope = await assertClassScope(req, supabase, caller, classId);
        if (classScope.error) return classScope.error;
        const classBranch = classScope.branchId;
        const studentBranch = await getStudentBranch(supabase, studentId);
        if (!classBranch || classBranch !== studentBranch) return errorResponse(req, 400, "Student is in a different branch");
        const { error } = await supabase.rpc("enroll_student_safely", {
          p_class_id: classId,
          p_student_id: studentId,
          p_enrollment_date: await today(supabase),
        });
        if (error) return errorResponse(req, 400, "Failed to enroll student", error);
        return jsonResponse(req, { success: true });
      }

      if (op === "unenroll-student") {
        const enrollmentId = cleanString(body.enrollmentId);
        if (!enrollmentId) return errorResponse(req, 400, "Missing enrollmentId");
        const { data: enrollment } = await supabase
          .from("class_enrollments")
          .select("id, class_id")
          .eq("id", enrollmentId)
          .maybeSingle();
        if (!enrollment) return errorResponse(req, 404, "Enrollment not found");
        const classScope = await assertClassScope(req, supabase, caller, enrollment.class_id);
        if (classScope.error) return classScope.error;
        const { error } = await supabase.from("class_enrollments").update({ status: "dropped" }).eq("id", enrollmentId);
        if (error) return errorResponse(req, 500, "Failed to remove student", error);
        return jsonResponse(req, { success: true });
      }

      const classId = cleanString(body.classId);
      const attendanceDate = cleanString(body.date);
      const entries = Array.isArray(body.entries) ? body.entries : [];
      if (!classId || !attendanceDate || !/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate)) {
        return errorResponse(req, 400, "Invalid attendance payload");
      }
      const classScope = await assertClassScope(req, supabase, caller, classId);
      if (classScope.error) return classScope.error;
      if (entries.length > 1000 || entries.some((entry: any) => !cleanString(entry.studentId) || !isOneOf(entry.status, ATTENDANCE_STATUSES))) {
        return errorResponse(req, 400, "Invalid attendance entries");
      }
      const studentIds = [...new Set(entries.map((entry: any) => String(entry.studentId)))];
      if (studentIds.length > 0) {
        const { data: enrollments, error: enrollmentError } = await supabase
          .from("class_enrollments")
          .select("student_id")
          .eq("class_id", classId)
          .eq("status", "active")
          .in("student_id", studentIds);
        if (enrollmentError || (enrollments ?? []).length !== studentIds.length) {
          return errorResponse(req, 400, "Attendance includes a student who is not actively enrolled", enrollmentError);
        }
      }
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
        const newBranchError = assertBranch(req, caller, updates.branch_id as string);
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
