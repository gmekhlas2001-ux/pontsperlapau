/**
 * Create a new user (and their staff or student profile) in one go.
 *
 * Authentication: requires X-Session-Token (HMAC-signed) issued by /login.
 * Authorization:
 *   - superadmin: any role
 *   - admin: any role except superadmin; new users are auto-bound to the
 *     admin's branch (admins cannot create users in other branches)
 */

import "jsr:@supabase/functions-js@2.110.0/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.110.0";
import { authenticateRequest } from "../_shared/auth.ts";
import { corsHeadersFor, errorResponse, jsonResponse } from "../_shared/cors.ts";

const PROTECTED_ROLES = ["superadmin", "admin"];
const ALLOWED_ROLES   = ["superadmin", "admin", "teacher", "librarian", "student", "parent"];
const STAFF_PROFILE_ROLES = ["admin", "teacher", "librarian"];
const GENDERS = ["male", "female", "other", "prefer_not_to_say"];

interface CreateUserRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  dateOfBirth: string;
  gender: string;
  role: string;
  fatherName?: string;
  passportNumber?: string;
  additionalData?: {
    position?: string;
    department?: string;
    dateJoined?: string;
    bio?: string;
    gradeLevel?: string;
    enrollmentDate?: string;
    branchId?: string;
    nationality?: string;
    address?: string;
    parentGuardianName?: string;
    parentGuardianEmail?: string;
    parentGuardianPhone?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    emergencyContactRelationship?: string;
    medicalNotes?: string;
    allergies?: string;
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeadersFor(req) });
  }

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

  const { data: callerUser } = await supabase
    .from("users")
    .select("id, role, status, branch_id")
    .eq("id", claims.sub)
    .eq("status", "active")
    .maybeSingle();

  if (!callerUser) return errorResponse(req, 401, "Authentication required");
  if (!PROTECTED_ROLES.includes(callerUser.role)) {
    return errorResponse(req, 403, "Insufficient permissions");
  }
  if (callerUser.role === "admin" && !callerUser.branch_id) {
    return errorResponse(req, 403, "Admin account is missing a branch");
  }

  let body: CreateUserRequest;
  try { body = await req.json(); } catch {
    return errorResponse(req, 400, "Invalid request body");
  }

  // ── Validation ────────────────────────────────────────────────────
  if (!body.email || !body.password || !body.firstName || !body.lastName || !body.role) {
    return errorResponse(req, 400, "Missing required fields");
  }
  if (!ALLOWED_ROLES.includes(body.role)) {
    return errorResponse(req, 400, "Invalid role");
  }
  if (body.password.length < 8 || body.password.length > 128) {
    return errorResponse(req, 400, "Password must be between 8 and 128 characters");
  }
  if (body.email.length > 320 || !/^\S+@\S+\.\S+$/.test(body.email)) {
    return errorResponse(req, 400, "Invalid email format");
  }
  if (body.firstName.trim().length > 100 || body.lastName.trim().length > 100) {
    return errorResponse(req, 400, "User name is too long");
  }
  if (body.gender && !GENDERS.includes(body.gender)) {
    return errorResponse(req, 400, "Invalid gender");
  }

  // Only a superadmin may create another elevated administrator account.
  if (callerUser.role === "admin" && PROTECTED_ROLES.includes(body.role)) {
    return errorResponse(req, 403, "Admins cannot create elevated administrator accounts");
  }

  // Branch-scoped admins must create users in their own branch.
  if (callerUser.role === "admin" && callerUser.branch_id) {
    const requested = body.additionalData?.branchId;
    if (requested && requested !== callerUser.branch_id) {
      return errorResponse(req, 403, "You can only create users in your branch");
    }
    if (!body.additionalData) body.additionalData = {};
    if (!body.additionalData.branchId) {
      body.additionalData.branchId = callerUser.branch_id;
    }
  }

  if (body.role === "student" && (!body.additionalData?.enrollmentDate || !body.additionalData?.branchId)) {
    return errorResponse(req, 400, "Student enrollment date and branch are required");
  }
  if (
    STAFF_PROFILE_ROLES.includes(body.role) &&
    (!body.additionalData?.dateJoined || !body.additionalData?.position || !body.additionalData?.branchId)
  ) {
    return errorResponse(req, 400, "Staff position, start date, and branch are required");
  }

  // ── Hash password ─────────────────────────────────────────────────
  const { data: hashData, error: hashError } = await supabase
    .rpc("hash_password", { password: body.password });

  if (hashError || !hashData) {
    return errorResponse(req, 500, "Failed to create user", hashError);
  }

  // ── Insert user ───────────────────────────────────────────────────
  const { data: userData, error: userError } = await supabase
    .from("users")
    .insert({
      email: body.email.toLowerCase(),
      password_hash: hashData as string,
      first_name: body.firstName,
      last_name: body.lastName,
      phone_number: body.phoneNumber,
      date_of_birth: body.dateOfBirth,
      gender: body.gender,
      role: body.role,
      status: "active",
      father_name: body.fatherName,
      passport_number: body.passportNumber,
      branch_id: body.additionalData?.branchId ?? null,
    })
    .select("id, email, first_name, last_name, role, status, branch_id, created_at")
    .single();

  if (userError) {
    const isDup = (userError.message ?? "").toLowerCase().includes("unique");
    return errorResponse(
      req,
      isDup ? 409 : 400,
      isDup ? "A user with that email already exists" : "Failed to create user",
      userError,
    );
  }

  // ── Profile insert (staff or student) ─────────────────────────────
  let roleData: unknown = null;
  let roleError: any = null;

  if (body.role === "student" && body.additionalData?.enrollmentDate) {
    const r = await supabase.from("students").insert({
      user_id: userData.id,
      grade_level: body.additionalData.gradeLevel,
      enrollment_date: body.additionalData.enrollmentDate,
      branch_id: body.additionalData.branchId || null,
      nationality: body.additionalData.nationality || null,
      address: body.additionalData.address || null,
      parent_guardian_name: body.additionalData.parentGuardianName || null,
      parent_guardian_email: body.additionalData.parentGuardianEmail || null,
      parent_guardian_phone: body.additionalData.parentGuardianPhone || null,
      emergency_contact_name: body.additionalData.emergencyContactName || null,
      emergency_contact_phone: body.additionalData.emergencyContactPhone || null,
      emergency_contact_relationship: body.additionalData.emergencyContactRelationship || null,
      medical_notes: body.additionalData.medicalNotes || null,
      allergies: body.additionalData.allergies || null,
    }).select().single();
    roleData = r.data;
    roleError = r.error;
  } else if (
    ["admin", "superadmin", "teacher", "librarian"].includes(body.role) &&
    body.additionalData?.dateJoined &&
    body.additionalData?.position
  ) {
    const r = await supabase.from("staff").insert({
      user_id: userData.id,
      position: body.additionalData.position,
      department: body.additionalData.department,
      date_joined: body.additionalData.dateJoined,
      branch_id: body.additionalData.branchId || null,
      bio: body.additionalData.bio || null,
    }).select().single();
    roleData = r.data;
    roleError = r.error;
  }

  if (roleError) {
    // Roll back the user row so we don't leave an orphan.
    await supabase.from("users").delete().eq("id", userData.id);
    return errorResponse(req, 400, "Failed to create profile", roleError);
  }

  return jsonResponse(req, { success: true, user: userData, roleData });
});
