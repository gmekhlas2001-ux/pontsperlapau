/**
 * Update / delete a user (and their staff or student profile).
 *
 * Authentication: requires a valid X-Session-Token (HMAC-signed) issued
 * by the /login function. The token's payload determines the caller's
 * role and branch — X-User-Id is no longer trusted.
 *
 * Authorization rules:
 *   - superadmin: may update anyone except themselves to a lower role
 *   - admin (branch-scoped): may update users only in their branch,
 *     cannot modify superadmins, cannot promote anyone to admin/superadmin,
 *     cannot reassign users to a different branch
 *   - delete uses the SECURITY DEFINER `delete_user_cascade` RPC for atomicity
 */

import "jsr:@supabase/functions-js@2.110.0/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.110.0";
import { authenticateRequest } from "../_shared/auth.ts";
import { corsHeadersFor, errorResponse, jsonResponse } from "../_shared/cors.ts";

const PROTECTED_ROLES = ["superadmin", "admin"];
const ALLOWED_ROLES   = ["superadmin", "admin", "teacher", "librarian", "student", "parent"];

function roleFamily(role: string): "staff" | "student" | "parent" {
  if (["superadmin", "admin", "teacher", "librarian"].includes(role)) return "staff";
  return role === "student" ? "student" : "parent";
}

interface UpdateUserRequest {
  targetUserId: string;
  operation?: "update" | "delete";
  email?: string;
  currentPassword?: string;
  newPassword?: string;
  firstName?: string;
  lastName?: string;
  fatherName?: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: string;
  passportNumber?: string;
  profilePictureUrl?: string | null;
  role?: string;
  status?: string;
  staffData?: {
    staffId?: string;
    position?: string;
    department?: string;
    dateJoined?: string;
    branchId?: string | null;
    bio?: string;
  };
  studentData?: {
    studentId?: string;
    gradeLevel?: string;
    enrollmentDate?: string;
    branchId?: string | null;
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

  // ── Authenticate caller via signed token ─────────────────────────
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

  // Re-load caller from DB so we always work with current branch_id/role.
  const { data: callerUser } = await supabase
    .from("users")
    .select("id, role, status, branch_id")
    .eq("id", claims.sub)
    .eq("status", "active")
    .maybeSingle();

  if (!callerUser) {
    return errorResponse(req, 401, "Authentication required");
  }

  let body: UpdateUserRequest;
  try { body = await req.json(); } catch {
    return errorResponse(req, 400, "Invalid request body");
  }

  const { targetUserId, operation = "update" } = body;
  if (!targetUserId) {
    return errorResponse(req, 400, "targetUserId is required");
  }

  // ── Load target ──────────────────────────────────────────────────
  const { data: targetUser } = await supabase
    .from("users")
    .select("id, email, role, status, branch_id")
    .eq("id", targetUserId)
    .maybeSingle();

  if (!targetUser) {
    return errorResponse(req, 404, "Target user not found");
  }

  const isSelf = targetUserId === callerUser.id;
  if (!isSelf && !PROTECTED_ROLES.includes(callerUser.role)) {
    return errorResponse(req, 403, "Insufficient permissions");
  }
  if (!isSelf && callerUser.role === "admin" && !callerUser.branch_id) {
    return errorResponse(req, 403, "Admin account is missing a branch");
  }
  if (isSelf && (body.role !== undefined || body.status !== undefined || body.staffData || body.studentData)) {
    return errorResponse(req, 403, "You cannot change your own role, status, or managed profile fields");
  }
  if (isSelf && body.email !== undefined) {
    return errorResponse(req, 403, "Email changes require an administrator");
  }

  // Branch admins cannot manage peer/elevated administrator accounts.
  if (!isSelf && callerUser.role === "admin" && PROTECTED_ROLES.includes(targetUser.role)) {
    return errorResponse(req, 403, "Only a superadmin can modify administrator accounts");
  }

  // Branch-scoped admins act only on users in their branch.
  if (
    !isSelf &&
    callerUser.role === "admin" &&
    callerUser.branch_id !== targetUser.branch_id
  ) {
    return errorResponse(req, 403, "You can only manage users in your branch");
  }

  // Admins cannot reassign users to a branch other than their own.
  const proposedStaffBranch  = body.staffData   && "branchId" in body.staffData   ? body.staffData.branchId   : undefined;
  const proposedStudentBranch = body.studentData && "branchId" in body.studentData ? body.studentData.branchId : undefined;
  if (!isSelf && callerUser.role === "admin" && callerUser.branch_id) {
    for (const b of [proposedStaffBranch, proposedStudentBranch]) {
      if (b !== undefined && b !== callerUser.branch_id) {
        return errorResponse(req, 403, "You can only assign users to your branch");
      }
    }
  }
  if (
    proposedStaffBranch !== undefined &&
    proposedStudentBranch !== undefined &&
    proposedStaffBranch !== proposedStudentBranch
  ) {
    return errorResponse(req, 400, "Managed profiles cannot use different branches");
  }

  // ── DELETE ───────────────────────────────────────────────────────
  if (operation === "delete") {
    if (targetUserId === callerUser.id) {
      return errorResponse(req, 400, "You cannot delete your own account");
    }

    const { data: staffProfile, error: staffError } = await supabase
      .from("staff")
      .select("id")
      .eq("user_id", targetUserId)
      .maybeSingle();
    if (staffError) {
      return errorResponse(req, 500, "Failed to check user responsibilities", staffError);
    }

    if (staffProfile) {
      const { count: classCount, error: classError } = await supabase
        .from("classes")
        .select("id", { count: "exact", head: true })
        .eq("teacher_id", staffProfile.id);
      if (classError) {
        return errorResponse(req, 500, "Failed to check class assignments", classError);
      }
      if ((classCount ?? 0) > 0) {
        const noun = classCount === 1 ? "class" : "classes";
        return jsonResponse(req, {
          error: `This staff member cannot be deleted because they are assigned as teacher to ${classCount} ${noun}. Reassign the ${noun} first.`,
          code: "user_has_assigned_classes",
          dependencyCount: classCount,
        }, 409);
      }
    }

    const { count: borrowingCount, error: borrowingError } = await supabase
      .from("book_borrowings")
      .select("id", { count: "exact", head: true })
      .eq("borrower_id", targetUserId);
    if (borrowingError) {
      return errorResponse(req, 500, "Failed to check library records", borrowingError);
    }
    if ((borrowingCount ?? 0) > 0) {
      const noun = borrowingCount === 1 ? "borrowing record" : "borrowing records";
      return jsonResponse(req, {
        error: `This user cannot be deleted because they have ${borrowingCount} library ${noun}. Resolve or archive the library history first.`,
        code: "user_has_library_history",
        dependencyCount: borrowingCount,
      }, 409);
    }

    // Storage blobs are not removed by a database FK cascade. Remove them
    // through the Storage API before deleting their metadata and owner row.
    const { data: documents, error: documentsError } = await supabase
      .from("user_documents")
      .select("storage_path")
      .eq("user_id", targetUserId);
    if (documentsError) {
      return errorResponse(req, 500, "Failed to prepare user deletion", documentsError);
    }

    const storagePaths = (documents ?? []).map((document) => document.storage_path);
    if (storagePaths.length > 0) {
      const { error: storageError } = await supabase.storage
        .from("user-documents")
        .remove(storagePaths);
      if (storageError) {
        return errorResponse(req, 500, "Failed to remove user documents", storageError);
      }
    }

    const { error } = await supabase.rpc("delete_user_cascade", {
      target_user_id: targetUserId,
    });
    if (error) return errorResponse(req, 500, "Failed to delete user", error);
    return jsonResponse(req, { success: true });
  }

  // ── UPDATE ───────────────────────────────────────────────────────

  // Validate role if changing.
  if (body.role !== undefined) {
    if (!ALLOWED_ROLES.includes(body.role)) {
      return errorResponse(req, 400, "Invalid role");
    }
    if (callerUser.role === "admin" && PROTECTED_ROLES.includes(body.role)) {
      return errorResponse(req, 403, "Admins cannot assign elevated roles");
    }
    if (roleFamily(body.role) !== roleFamily(targetUser.role)) {
      return errorResponse(req, 409, "Changing between staff, student, and parent account types requires a dedicated migration");
    }
  }

  if (body.status !== undefined && !["active", "inactive"].includes(body.status)) {
    return errorResponse(req, 400, "Invalid status");
  }

  const effectiveRole = body.role ?? targetUser.role;
  if (body.staffData && roleFamily(effectiveRole) !== "staff") {
    return errorResponse(req, 400, "Staff fields can only be applied to staff accounts");
  }
  if (body.studentData && roleFamily(effectiveRole) !== "student") {
    return errorResponse(req, 400, "Student fields can only be applied to student accounts");
  }
  for (const branch of [proposedStaffBranch, proposedStudentBranch]) {
    if (branch !== undefined && branch !== null && typeof branch !== "string") {
      return errorResponse(req, 400, "Invalid branch assignment");
    }
  }

  // Build user-level updates.
  const userUpdates: Record<string, any> = {};
  let passwordWasChanged = false;
  if (body.email)                userUpdates.email = body.email.toLowerCase();
  if (body.firstName !== undefined)      userUpdates.first_name = body.firstName;
  if (body.lastName !== undefined)       userUpdates.last_name = body.lastName;
  if (body.fatherName !== undefined)     userUpdates.father_name = body.fatherName;
  if (body.phone !== undefined)          userUpdates.phone_number = body.phone;
  if (body.dateOfBirth !== undefined)    userUpdates.date_of_birth = body.dateOfBirth || null;
  if (body.gender !== undefined)         userUpdates.gender = body.gender || null;
  if (body.passportNumber !== undefined) userUpdates.passport_number = body.passportNumber || null;
  if (body.profilePictureUrl !== undefined) userUpdates.profile_picture_url = body.profilePictureUrl;
  if (body.role !== undefined)           userUpdates.role = body.role;
  if (body.status !== undefined)         userUpdates.status = body.status;
  const proposedBranch = proposedStaffBranch !== undefined ? proposedStaffBranch : proposedStudentBranch;
  if (proposedBranch !== undefined)      userUpdates.branch_id = proposedBranch;

  if (body.newPassword) {
    if (body.newPassword.length < 8 || body.newPassword.length > 128) {
      return errorResponse(req, 400, "Password must be between 8 and 128 characters");
    }
    if (isSelf) {
      if (!body.currentPassword || body.currentPassword.length > 1024) {
        return errorResponse(req, 400, "Current password is required");
      }
      const { data: isValid, error: verifyError } = await supabase.rpc("verify_password", {
        user_email: targetUser.email,
        user_password: body.currentPassword,
      });
      if (verifyError) {
        return errorResponse(req, 500, "Failed to verify current password", verifyError);
      }
      if (!isValid) {
        return errorResponse(req, 400, "Current password is incorrect");
      }
    }
    const { data: hashData, error: hashError } = await supabase
      .rpc("hash_password", { password: body.newPassword });
    if (hashError || !hashData) {
      return errorResponse(req, 500, "Failed to set password", hashError);
    }
    userUpdates.password_hash = hashData as string;
    userUpdates.session_invalid_before = new Date().toISOString();
    passwordWasChanged = true;
  }

  if (Object.keys(userUpdates).length > 0) {
    const { error } = await supabase.from("users").update(userUpdates).eq("id", targetUserId);
    if (error) return errorResponse(req, 400, "Failed to update user", error);
  }

  if (passwordWasChanged) {
    const { error } = await supabase
      .from("password_reset_requests")
      .update({
        status: "resolved",
        resolved_by: callerUser.id,
        resolved_at: new Date().toISOString(),
        resolved_note: "Password changed by an administrator.",
      })
      .eq("user_id", targetUserId)
      .eq("status", "pending");
    if (error) {
      return errorResponse(req, 500, "Password updated, but failed to close reset request", error);
    }
  }

  // Staff updates.
  if (body.staffData) {
    const sf = body.staffData;
    const u: Record<string, any> = {};
    if (sf.position !== undefined)   u.position    = sf.position;
    if (sf.department !== undefined) u.department  = sf.department;
    if (sf.dateJoined !== undefined) u.date_joined = sf.dateJoined;
    if ("branchId" in sf)            u.branch_id   = sf.branchId ?? null;
    if (sf.bio !== undefined)        u.bio         = sf.bio || null;

    if (Object.keys(u).length > 0) {
      const { error } = await supabase.from("staff").update(u).eq("user_id", targetUserId);
      if (error) return errorResponse(req, 400, "Failed to update staff record", error);
    }
  }

  // Student updates.
  if (body.studentData) {
    const sf = body.studentData;
    const u: Record<string, any> = {};
    if (sf.gradeLevel !== undefined)                  u.grade_level          = sf.gradeLevel;
    if (sf.enrollmentDate !== undefined)              u.enrollment_date      = sf.enrollmentDate;
    if ("branchId" in sf)                             u.branch_id            = sf.branchId ?? null;
    if (sf.nationality !== undefined)                 u.nationality          = sf.nationality || null;
    if (sf.address !== undefined)                     u.address              = sf.address || null;
    if (sf.parentGuardianName !== undefined)          u.parent_guardian_name = sf.parentGuardianName || null;
    if (sf.parentGuardianEmail !== undefined)         u.parent_guardian_email = sf.parentGuardianEmail || null;
    if (sf.parentGuardianPhone !== undefined)         u.parent_guardian_phone = sf.parentGuardianPhone || null;
    if (sf.emergencyContactName !== undefined)        u.emergency_contact_name = sf.emergencyContactName || null;
    if (sf.emergencyContactPhone !== undefined)       u.emergency_contact_phone = sf.emergencyContactPhone || null;
    if (sf.emergencyContactRelationship !== undefined) u.emergency_contact_relationship = sf.emergencyContactRelationship || null;
    if (sf.medicalNotes !== undefined)                u.medical_notes        = sf.medicalNotes || null;
    if (sf.allergies !== undefined)                   u.allergies            = sf.allergies || null;

    if (Object.keys(u).length > 0) {
      const { error } = await supabase.from("students").update(u).eq("user_id", targetUserId);
      if (error) return errorResponse(req, 400, "Failed to update student record", error);
    }
  }

  return jsonResponse(req, { success: true });
});
