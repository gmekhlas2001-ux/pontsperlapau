import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-User-Id",
};

const PROTECTED_ROLES = ["superadmin", "admin"];

interface UpdateUserRequest {
  targetUserId: string;
  operation?: "update" | "delete";
  email?: string;
  newPassword?: string;
  firstName?: string;
  lastName?: string;
  fatherName?: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: string;
  passportNumber?: string;
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
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const callerId = req.headers.get("X-User-Id");
    if (!callerId) {
      return new Response(
        JSON.stringify({ error: "Missing X-User-Id header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: callerUser, error: callerError } = await supabaseClient
      .from("users")
      .select("id, role, status")
      .eq("id", callerId)
      .eq("status", "active")
      .maybeSingle();

    if (callerError || !callerUser) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - User not found or inactive" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!PROTECTED_ROLES.includes(callerUser.role)) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - Insufficient permissions" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: UpdateUserRequest = await req.json();
    const { targetUserId, operation = "update" } = body;

    if (!targetUserId) {
      return new Response(
        JSON.stringify({ error: "targetUserId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the target user to check their current role
    const { data: targetUser, error: targetError } = await supabaseClient
      .from("users")
      .select("id, role, status")
      .eq("id", targetUserId)
      .maybeSingle();

    if (targetError || !targetUser) {
      return new Response(
        JSON.stringify({ error: "Target user not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Admins cannot modify other admins or superadmins
    if (callerUser.role === "admin" && PROTECTED_ROLES.includes(targetUser.role)) {
      return new Response(
        JSON.stringify({
          error: "Admins cannot modify admin or superadmin accounts. Contact a superadmin.",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── DELETE OPERATION ─────────────────────────────────────────
    if (operation === "delete") {
      const { error: staffDeleteError } = await supabaseClient
        .from("staff")
        .delete()
        .eq("user_id", targetUserId);

      if (staffDeleteError) {
        console.error("Staff delete error:", staffDeleteError);
      }

      const { error: studentDeleteError } = await supabaseClient
        .from("students")
        .delete()
        .eq("user_id", targetUserId);

      if (studentDeleteError) {
        console.error("Student delete error:", studentDeleteError);
      }

      const { error: userDeleteError } = await supabaseClient
        .from("users")
        .delete()
        .eq("id", targetUserId);

      if (userDeleteError) {
        return new Response(
          JSON.stringify({ error: userDeleteError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── UPDATE OPERATION ──────────────────────────────────────────

    // Admins cannot promote anyone to admin or superadmin
    if (
      callerUser.role === "admin" &&
      body.role &&
      PROTECTED_ROLES.includes(body.role)
    ) {
      return new Response(
        JSON.stringify({
          error: "Admins cannot assign the admin or superadmin role. Contact a superadmin.",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build user-level updates
    const userUpdates: Record<string, any> = {};
    if (body.email) userUpdates.email = body.email.toLowerCase();
    if (body.firstName !== undefined) userUpdates.first_name = body.firstName;
    if (body.lastName !== undefined) userUpdates.last_name = body.lastName;
    if (body.fatherName !== undefined) userUpdates.father_name = body.fatherName;
    if (body.phone !== undefined) userUpdates.phone_number = body.phone;
    if (body.dateOfBirth !== undefined) userUpdates.date_of_birth = body.dateOfBirth || null;
    if (body.gender !== undefined) userUpdates.gender = body.gender || null;
    if (body.passportNumber !== undefined) userUpdates.passport_number = body.passportNumber || null;
    if (body.role !== undefined) userUpdates.role = body.role;
    if (body.status !== undefined) userUpdates.status = body.status;

    if (body.newPassword) {
      const { data: hashData, error: hashError } = await supabaseClient
        .rpc("hash_password", { password: body.newPassword });
      if (hashError || !hashData) {
        return new Response(
          JSON.stringify({ error: "Failed to hash password" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      userUpdates.password_hash = hashData as string;
    }

    if (Object.keys(userUpdates).length > 0) {
      const { error: userUpdateError } = await supabaseClient
        .from("users")
        .update(userUpdates)
        .eq("id", targetUserId);

      if (userUpdateError) {
        return new Response(
          JSON.stringify({ error: userUpdateError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Build staff profile updates
    if (body.staffData) {
      const { staffId, ...staffFields } = body.staffData;
      const staffUpdates: Record<string, any> = {};
      if (staffFields.position !== undefined) staffUpdates.position = staffFields.position;
      if (staffFields.department !== undefined) staffUpdates.department = staffFields.department;
      if (staffFields.dateJoined !== undefined) staffUpdates.date_joined = staffFields.dateJoined;
      if ("branchId" in staffFields) staffUpdates.branch_id = staffFields.branchId ?? null;
      if (staffFields.bio !== undefined) staffUpdates.bio = staffFields.bio || null;

      if (Object.keys(staffUpdates).length > 0) {
        const query = staffId
          ? supabaseClient.from("staff").update(staffUpdates).eq("id", staffId)
          : supabaseClient.from("staff").update(staffUpdates).eq("user_id", targetUserId);

        const { error: staffUpdateError } = await query;
        if (staffUpdateError) {
          return new Response(
            JSON.stringify({ error: staffUpdateError.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // Build student profile updates
    if (body.studentData) {
      const { studentId, ...studentFields } = body.studentData;
      const studentUpdates: Record<string, any> = {};
      if (studentFields.gradeLevel !== undefined) studentUpdates.grade_level = studentFields.gradeLevel;
      if (studentFields.enrollmentDate !== undefined) studentUpdates.enrollment_date = studentFields.enrollmentDate;
      if ("branchId" in studentFields) studentUpdates.branch_id = studentFields.branchId ?? null;
      if (studentFields.nationality !== undefined) studentUpdates.nationality = studentFields.nationality || null;
      if (studentFields.address !== undefined) studentUpdates.address = studentFields.address || null;
      if (studentFields.parentGuardianName !== undefined) studentUpdates.parent_guardian_name = studentFields.parentGuardianName || null;
      if (studentFields.parentGuardianEmail !== undefined) studentUpdates.parent_guardian_email = studentFields.parentGuardianEmail || null;
      if (studentFields.parentGuardianPhone !== undefined) studentUpdates.parent_guardian_phone = studentFields.parentGuardianPhone || null;
      if (studentFields.emergencyContactName !== undefined) studentUpdates.emergency_contact_name = studentFields.emergencyContactName || null;
      if (studentFields.emergencyContactPhone !== undefined) studentUpdates.emergency_contact_phone = studentFields.emergencyContactPhone || null;
      if (studentFields.emergencyContactRelationship !== undefined) studentUpdates.emergency_contact_relationship = studentFields.emergencyContactRelationship || null;
      if (studentFields.medicalNotes !== undefined) studentUpdates.medical_notes = studentFields.medicalNotes || null;
      if (studentFields.allergies !== undefined) studentUpdates.allergies = studentFields.allergies || null;

      if (Object.keys(studentUpdates).length > 0) {
        const query = studentId
          ? supabaseClient.from("students").update(studentUpdates).eq("id", studentId)
          : supabaseClient.from("students").update(studentUpdates).eq("user_id", targetUserId);

        const { error: studentUpdateError } = await query;
        if (studentUpdateError) {
          return new Response(
            JSON.stringify({ error: studentUpdateError.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
