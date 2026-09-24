import "jsr:@supabase/functions-js@2.110.0/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.110.0";
import { authenticateRequest, authenticationErrorResponse } from "../_shared/auth.ts";
import { corsHeadersFor, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { loadModuleAccess, MODULE_ACTIONS, resolveModuleAccess, type ModuleAction } from "../_shared/module-access.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES = ["superadmin", "admin", "teacher", "librarian", "student", "parent"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeadersFor(req) });
  if (req.method !== "POST") return errorResponse(req, 405, "Method not allowed");
  let claims;
  try { claims = await authenticateRequest(req); }
  catch (error) { return authenticationErrorResponse(req, error); }

  const client = createClient(
    Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { "X-App-Actor": claims.sub } } },
  );
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return errorResponse(req, 400, "Invalid request body"); }
  const actor = { id: claims.sub, role: claims.role, branch_id: claims.branchId };

  try {
    if (body.operation === "mine") {
      const { modules, rules } = await loadModuleAccess(client, actor);
      const access = Object.fromEntries(modules.map((module) => [module.id,
        Object.fromEntries(MODULE_ACTIONS.map((action) => [action,
          resolveModuleAccess(module, rules, actor, "view") &&
          (action === "view" || resolveModuleAccess(module, rules, actor, action)),
        ])),
      ]));
      return jsonResponse(req, { success: true, access });
    }
    if (actor.role !== "superadmin") return errorResponse(req, 403, "Superadmin access required");

    if (body.operation === "catalog") {
      const page = Number(body.page ?? 0);
      if (!Number.isInteger(page) || page < 0 || page > 10000) return errorResponse(req, 400, "Invalid page");
      const search = typeof body.search === "string" ? body.search.trim() : "";
      if (search.length > 80 || /[,()%\\]/.test(search)) return errorResponse(req, 400, "Invalid search");
      let usersQuery = client.from("users").select("id,email,first_name,last_name,role,branch_id", { count: "exact" })
        .eq("status", "active");
      if (search) usersQuery = usersQuery.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`);
      const [modules, users, branches] = await Promise.all([
        client.from("app_modules").select("id,label,description,enabled,default_view_roles,default_write_roles,default_export_roles").order("label"),
        usersQuery.order("last_name").order("id").range(page * 100, page * 100 + 99),
        client.from("branches").select("id,name").eq("status", "active").order("name"),
      ]);
      if (modules.error || users.error || branches.error) throw modules.error ?? users.error ?? branches.error;
      return jsonResponse(req, { success: true, modules: modules.data, users: users.data, userCount: users.count, branches: branches.data });
    }
    if (body.operation === "rules") {
      const userId = body.userId;
      const role = body.role;
      if (typeof userId !== "string" && typeof role !== "string") return errorResponse(req, 400, "Select a user or role");
      let query = client.from("module_access_rules")
        .select("id,module_id,action,user_id,role,branch_id,allowed,updated_at,changed_by")
        .order("updated_at", { ascending: false });
      if (typeof userId === "string" && UUID.test(userId)) query = query.eq("user_id", userId);
      else if (typeof role === "string" && ROLES.includes(role)) query = query.eq("role", role);
      else return errorResponse(req, 400, "Invalid subject");
      const { data, error } = await query;
      if (error) throw error;
      return jsonResponse(req, { success: true, rules: data });
    }
    if (body.operation === "history") {
      const { data, error } = await client.from("module_access_events")
        .select("id,module_id,action,user_id,role,branch_id,previous_allowed,new_allowed,actor_id,changed_at")
        .order("changed_at", { ascending: false }).limit(100);
      if (error) throw error;
      return jsonResponse(req, { success: true, history: data });
    }
    if (body.operation === "set") {
      const moduleId = body.moduleId;
      const action = body.action;
      const userId = body.userId;
      const role = body.role;
      const branchId = body.branchId ?? null;
      const decision = body.decision;
      if (typeof moduleId !== "string" || !MODULE_ACTIONS.includes(action as ModuleAction) ||
        (typeof userId === "string") === (typeof role === "string") ||
        (branchId !== null && (typeof branchId !== "string" || !UUID.test(branchId))) ||
        !["allow", "deny", "inherit"].includes(String(decision))) {
        return errorResponse(req, 400, "Invalid access rule");
      }
      const { data: module, error: moduleError } = await client.from("app_modules")
        .select("id,default_view_roles,default_write_roles,default_export_roles").eq("id", moduleId).maybeSingle();
      if (moduleError) throw moduleError;
      if (!module) return errorResponse(req, 400, "Unknown module");
      let targetRole: string;
      if (typeof userId === "string") {
        if (!UUID.test(userId)) return errorResponse(req, 400, "Invalid user");
        const { data: target, error } = await client.from("users")
          .select("id,role,branch_id,status").eq("id", userId).maybeSingle();
        if (error) throw error;
        if (!target || target.status !== "active" || target.role === "superadmin") return errorResponse(req, 400, "Invalid target user");
        if (branchId !== null && target.branch_id !== branchId) return errorResponse(req, 400, "Branch does not match target user");
        targetRole = target.role;
      } else {
        if (typeof role !== "string" || !ROLES.includes(role) || role === "superadmin") return errorResponse(req, 400, "Invalid role");
        targetRole = role;
      }
      const roleCeiling = action === "view" ? module.default_view_roles
        : action === "export" ? module.default_export_roles : module.default_write_roles;
      if (decision === "allow" && !roleCeiling.includes(targetRole)) {
        return errorResponse(req, 400, "This role cannot use that module action");
      }
      let query = client.from("module_access_rules").select("id,allowed")
        .eq("module_id", moduleId).eq("action", action);
      query = typeof userId === "string" ? query.eq("user_id", userId) : query.eq("role", role);
      query = branchId === null ? query.is("branch_id", null) : query.eq("branch_id", branchId);
      const { data: previous, error: previousError } = await query.maybeSingle();
      if (previousError) throw previousError;
      if (decision === "inherit") {
        if (previous) {
          const { error } = await client.from("module_access_rules").delete().eq("id", previous.id);
          if (error) throw error;
        }
      } else if (previous) {
        if (previous.allowed !== (decision === "allow")) {
          const { error } = await client.from("module_access_rules").update({ allowed: decision === "allow", changed_by: actor.id, updated_at: new Date().toISOString() }).eq("id", previous.id);
          if (error) throw error;
        }
      } else {
        const { error } = await client.from("module_access_rules").insert({
          module_id: moduleId, action, user_id: typeof userId === "string" ? userId : null,
          role: typeof role === "string" ? role : null, branch_id: branchId,
          allowed: decision === "allow", changed_by: actor.id,
        });
        if (error) throw error;
      }
      return jsonResponse(req, { success: true });
    }
    return errorResponse(req, 400, "Unknown operation");
  } catch (error) {
    return errorResponse(req, 503, "Module access is temporarily unavailable", error);
  }
});
