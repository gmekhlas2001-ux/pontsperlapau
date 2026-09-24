export const MODULE_ACTIONS = ["view", "create", "edit", "delete", "export", "manage"] as const;
export type ModuleAction = (typeof MODULE_ACTIONS)[number];

export type ModuleRecord = {
  id: string;
  label: string;
  enabled: boolean;
  default_view_roles: string[];
  default_write_roles: string[];
  default_export_roles: string[];
};
export type ModuleRule = {
  module_id: string;
  action: ModuleAction;
  user_id: string | null;
  role: string | null;
  branch_id: string | null;
  allowed: boolean;
};
export type ModuleActor = { id: string; role: string; branch_id: string | null };
type Client = any;

export function resolveModuleAccess(
  module: ModuleRecord,
  rules: ModuleRule[],
  actor: ModuleActor,
  action: ModuleAction,
): boolean {
  if (actor.role === "superadmin") return true; // Recovery path.
  if (!module.enabled) return false;
  const ceiling = action === "view" ? module.default_view_roles
    : action === "export" ? module.default_export_roles : module.default_write_roles;
  if (!ceiling.includes(actor.role)) return false;
  const matches = rules.filter((rule) =>
    rule.module_id === module.id && rule.action === action &&
    (rule.user_id === actor.id || rule.role === actor.role) &&
    (rule.branch_id === null || rule.branch_id === actor.branch_id)
  );
  matches.sort((a, b) =>
    Number(b.user_id === actor.id) - Number(a.user_id === actor.id) ||
    Number(b.branch_id !== null) - Number(a.branch_id !== null)
  );
  return matches[0]?.allowed ?? true;
}

export async function loadModuleAccess(client: Client, actor: ModuleActor): Promise<{
  modules: ModuleRecord[]; rules: ModuleRule[];
}> {
  const [catalog, grants] = await Promise.all([
    client.from("app_modules").select("id,label,enabled,default_view_roles,default_write_roles,default_export_roles").order("label"),
    client.from("module_access_rules").select("module_id,action,user_id,role,branch_id,allowed")
      .or(`user_id.eq.${actor.id},role.eq.${actor.role}`),
  ]);
  if (catalog.error || grants.error) throw catalog.error ?? grants.error;
  return { modules: catalog.data ?? [], rules: grants.data ?? [] };
}

export async function canUseModule(client: Client, actor: ModuleActor, moduleId: string, action: ModuleAction): Promise<boolean> {
  const { modules, rules } = await loadModuleAccess(client, actor);
  const module = modules.find((entry) => entry.id === moduleId);
  if (!module) return false;
  return resolveModuleAccess(module, rules, actor, "view") &&
    (action === "view" || resolveModuleAccess(module, rules, actor, action));
}

export const TABLE_MODULE: Record<string, string> = {
  activity_logs: "auditLog", attendance: "attendance", book_borrowings: "library",
  books: "library", class_enrollments: "classes",
  classes: "classes", donors: "donors", grade_entries: "grades",
  grant_transactions: "donors", grants: "donors", messages: "messages",
  message_read_receipts: "messages", organization_settings: "settings",
  password_reset_requests: "passwordResets", roles: "settings", staff: "staff",
  student_fees: "fees", students: "students", survey_branch_responses: "surveys",
  survey_branch_submissions: "surveys", survey_individual_responses: "surveys",
  survey_list_stats: "surveys", survey_questions: "surveys", survey_respondents: "surveys",
  survey_response_options: "surveys", survey_sections: "surveys", surveys: "surveys",
  transactions: "donors", user_documents: "students",
};

type OperationAccess = { module: string; action: ModuleAction };

// Every app-actions operation must be listed here. Unknown operations fail closed
// at the gateway instead of inheriting a permission from their spelling.
export const OPERATION_ACCESS: Record<string, OperationAccess> = {
  "create-fee": { module: "fees", action: "create" },
  "bulk-create-fees": { module: "fees", action: "create" },
  "mark-fee-paid": { module: "fees", action: "edit" },
  "update-fee-status": { module: "fees", action: "edit" },
  "delete-fee": { module: "fees", action: "delete" },
  "create-donor": { module: "donors", action: "create" },
  "update-donor": { module: "donors", action: "edit" },
  "delete-donor": { module: "donors", action: "delete" },
  "create-grant": { module: "donors", action: "create" },
  "update-grant-status": { module: "donors", action: "edit" },
  "delete-grant": { module: "donors", action: "delete" },
  "create-grant-transaction": { module: "donors", action: "create" },
  "delete-grant-transaction": { module: "donors", action: "delete" },
  "create-transaction": { module: "donors", action: "create" },
  "update-transaction": { module: "donors", action: "edit" },
  "update-transaction-status": { module: "donors", action: "edit" },
  "delete-transaction": { module: "donors", action: "delete" },
  "send-message": { module: "messages", action: "create" },
  "mark-message-read": { module: "messages", action: "view" },
  "delete-message": { module: "messages", action: "delete" },
  "add-grade-entry": { module: "grades", action: "create" },
  "update-grade-entry": { module: "grades", action: "edit" },
  "delete-grade-entry": { module: "grades", action: "delete" },
  "set-final-grade": { module: "grades", action: "edit" },
  "create-survey": { module: "surveys", action: "create" },
  "update-survey-meta": { module: "surveys", action: "edit" },
  "update-survey-structure": { module: "surveys", action: "edit" },
  "delete-survey": { module: "surveys", action: "delete" },
  "save-branch-survey-data": { module: "surveys", action: "edit" },
  "save-individual-survey-responses": { module: "surveys", action: "edit" },
  "add-survey-respondent": { module: "surveys", action: "create" },
  "update-survey-respondent": { module: "surveys", action: "edit" },
  "delete-survey-respondent": { module: "surveys", action: "delete" },
  "save-org-settings": { module: "settings", action: "edit" },
  "toggle-2fa": { module: "profile", action: "edit" },
  "create-branch": { module: "branches", action: "create" },
  "update-branch": { module: "branches", action: "edit" },
  "delete-branch": { module: "branches", action: "delete" },
  "create-class": { module: "classes", action: "create" },
  "update-class": { module: "classes", action: "edit" },
  "delete-class": { module: "classes", action: "delete" },
  "enroll-student": { module: "classes", action: "edit" },
  "unenroll-student": { module: "classes", action: "delete" },
  "save-attendance": { module: "attendance", action: "edit" },
  "create-book": { module: "library", action: "create" },
  "update-book": { module: "library", action: "edit" },
  "delete-book": { module: "library", action: "delete" },
  "get-survey-management-overview": { module: "surveys", action: "view" },
  "get-branch-survey-dashboard": { module: "surveys", action: "view" },
  "get_branch_submission_fast": { module: "surveys", action: "view" },
  "get_survey_results_fast": { module: "surveys", action: "view" },
};

export function operationModule(operation: string, body: Record<string, unknown>): OperationAccess | undefined {
  if (operation === "upload-public-image") return {
    module: body.folder === "books" ? "library" : "profile", action: "edit",
  };
  return OPERATION_ACCESS[operation];
}
