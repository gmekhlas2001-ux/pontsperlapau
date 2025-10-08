import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CreateUserRequest {
  email: string;
  password: string;
  full_name: string;
  role_id: string;
  user_data: any;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const { email, password, full_name, role_id, user_data }: CreateUserRequest = await req.json();

    if (!email || !password || !full_name || !role_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create the auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (authError) {
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({ error: authError.message }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create the profile
    const { data: profileData, error: profileError } = await supabaseAdmin
      .from("profiles")
      .insert({
        auth_user_id: authData.user.id,
        email,
        full_name,
        role_id,
        status: "approved",
      })
      .select()
      .single();

    if (profileError) {
      console.error("Profile error:", profileError);
      // Try to clean up the auth user
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return new Response(
        JSON.stringify({ error: profileError.message }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create staff or student record
    let extendedData = null;
    let extendedError = null;

    if (role_id === "teacher" || role_id === "librarian" || role_id === "admin") {
      const staffRecord = {
        profile_id: profileData.id,
        ...user_data,
      };

      const result = await supabaseAdmin
        .from("staff")
        .insert(staffRecord)
        .select()
        .single();

      extendedData = result.data;
      extendedError = result.error;
    } else if (role_id === "student") {
      const studentRecord = {
        profile_id: profileData.id,
        ...user_data,
      };

      const result = await supabaseAdmin
        .from("students")
        .insert(studentRecord)
        .select()
        .single();

      extendedData = result.data;
      extendedError = result.error;
    }

    if (extendedError) {
      console.error("Extended data error:", extendedError);
      // Clean up profile and auth user
      await supabaseAdmin.from("profiles").delete().eq("id", profileData.id);
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return new Response(
        JSON.stringify({ error: extendedError.message }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        profile: profileData,
        extended_data: extendedData,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "An unexpected error occurred" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
