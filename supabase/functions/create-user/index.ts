import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-User-Id",
};

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

    const { data: callerUser, error: callerUserError } = await supabaseClient
      .from("users")
      .select("id, role, status")
      .eq("id", callerId)
      .eq("status", "active")
      .maybeSingle();

    if (callerUserError || !callerUser) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - User not found or inactive" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["superadmin", "admin"].includes(callerUser.role)) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - Insufficient permissions" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const requestData: CreateUserRequest = await req.json();

    // Admins can create any role except superadmin
    if (
      callerUser.role === "admin" &&
      !["admin", "teacher", "librarian", "student"].includes(requestData.role)
    ) {
      return new Response(
        JSON.stringify({
          error: "Admins cannot create superadmin accounts.",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: hashData, error: hashError } = await supabaseClient
      .rpc("hash_password", { password: requestData.password });

    if (hashError || !hashData) {
      console.error("Password hashing error:", hashError);
      return new Response(
        JSON.stringify({ error: "Failed to hash password" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: userData, error: userError } = await supabaseClient
      .from("users")
      .insert({
        email: requestData.email,
        password_hash: hashData as string,
        first_name: requestData.firstName,
        last_name: requestData.lastName,
        phone_number: requestData.phoneNumber,
        date_of_birth: requestData.dateOfBirth,
        gender: requestData.gender,
        role: requestData.role,
        status: "active",
        father_name: requestData.fatherName,
        passport_number: requestData.passportNumber,
      })
      .select()
      .single();

    if (userError) {
      console.error("User creation error:", userError);
      return new Response(
        JSON.stringify({ error: userError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let roleData = null;
    let roleError = null;

    if (requestData.role === "student" && requestData.additionalData?.enrollmentDate) {
      const { data, error } = await supabaseClient
        .from("students")
        .insert({
          user_id: userData.id,
          grade_level: requestData.additionalData.gradeLevel,
          enrollment_date: requestData.additionalData.enrollmentDate,
          branch_id: requestData.additionalData.branchId || null,
          nationality: requestData.additionalData.nationality || null,
          address: requestData.additionalData.address || null,
          parent_guardian_name: requestData.additionalData.parentGuardianName || null,
          parent_guardian_email: requestData.additionalData.parentGuardianEmail || null,
          parent_guardian_phone: requestData.additionalData.parentGuardianPhone || null,
          emergency_contact_name: requestData.additionalData.emergencyContactName || null,
          emergency_contact_phone: requestData.additionalData.emergencyContactPhone || null,
          emergency_contact_relationship: requestData.additionalData.emergencyContactRelationship || null,
          medical_notes: requestData.additionalData.medicalNotes || null,
          allergies: requestData.additionalData.allergies || null,
        })
        .select()
        .single();
      roleData = data;
      roleError = error;
    } else if (
      ["admin", "superadmin", "teacher", "librarian"].includes(requestData.role) &&
      requestData.additionalData?.dateJoined &&
      requestData.additionalData?.position
    ) {
      const { data, error } = await supabaseClient
        .from("staff")
        .insert({
          user_id: userData.id,
          position: requestData.additionalData.position,
          department: requestData.additionalData.department,
          date_joined: requestData.additionalData.dateJoined,
          branch_id: requestData.additionalData.branchId || null,
          bio: requestData.additionalData.bio || null,
        })
        .select()
        .single();
      roleData = data;
      roleError = error;
    }

    if (roleError) {
      console.error("Role creation error:", roleError);
      await supabaseClient.from("users").delete().eq("id", userData.id);
      return new Response(
        JSON.stringify({ error: roleError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, user: userData, roleData }),
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
