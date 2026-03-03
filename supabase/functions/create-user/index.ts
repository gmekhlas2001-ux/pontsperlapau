import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { hash } from "npm:bcryptjs@2.4.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-API-Key",
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
    gradeLevel?: string;
    enrollmentDate?: string;
  };
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 200,
        headers: corsHeaders,
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const apiKey = req.headers.get("X-API-Key");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Missing API key" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: callerUser, error: callerUserError } = await supabaseClient
      .from("users")
      .select("id, role, status")
      .eq("id", apiKey)
      .eq("status", "active")
      .maybeSingle();

    if (callerUserError || !callerUser) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - Invalid API key" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!["superadmin", "admin"].includes(callerUser.role)) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - Insufficient permissions" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const requestData: CreateUserRequest = await req.json();

    const passwordHash = await hash(requestData.password, 10);

    const { data: userData, error: userError } = await supabaseClient
      .from("users")
      .insert({
        email: requestData.email,
        password_hash: passwordHash,
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
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
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
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ success: true, user: userData, roleData }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
