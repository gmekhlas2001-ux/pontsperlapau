export type ReadPolicyCaller = { role: string };

const ADMIN_ROLES = new Set(["superadmin", "admin"]);
const SAFE_USER_FIELDS = new Set([
  "id", "first_name", "last_name", "role", "status", "branch_id",
  "profile_picture_url", "created_at", "updated_at",
]);

const ADMIN_USER_FIELDS = new Set([
  ...SAFE_USER_FIELDS,
  "email", "father_name", "phone_number", "date_of_birth", "gender",
  "passport_number", "last_login", "is_verified", "two_factor_enabled",
  "session_invalid_before",
]);

// Relations used by the SPA. An embedded relation is not separately scoped by
// PostgREST when the request is forwarded with service_role, so anything not
// listed here must fail closed.
const RELATIONS: Record<string, ReadonlySet<string>> = {
  activity_logs: new Set(["users"]),
  attendance: new Set(["students", "classes", "users"]),
  book_borrowings: new Set(["books", "users", "book_copies"]),
  class_enrollments: new Set(["students", "classes"]),
  classes: new Set(["staff", "branches"]),
  grade_entries: new Set(["students", "classes", "users"]),
  grant_transactions: new Set(["grants", "users"]),
  grants: new Set(["donors", "branches", "users", "grant_transactions"]),
  messages: new Set(["users"]),
  password_reset_requests: new Set(["users"]),
  staff: new Set(["users", "branches"]),
  student_fees: new Set(["students", "classes", "branches"]),
  students: new Set(["users", "branches"]),
  surveys: new Set(["branches"]),
  transactions: new Set(["branches", "staff", "users"]),
};

function splitTopLevel(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === "(") depth += 1;
    else if (value[i] === ")") depth -= 1;
    if (depth < 0) throw new Error("Unbalanced select expression");
    if (value[i] === "," && depth === 0) {
      parts.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  if (depth !== 0) throw new Error("Unbalanced select expression");
  parts.push(value.slice(start).trim());
  return parts.filter(Boolean);
}

function relationTarget(prefix: string): string {
  const withoutAlias = prefix.includes(":") ? prefix.slice(prefix.lastIndexOf(":") + 1) : prefix;
  return withoutAlias.split("!")[0].trim();
}

function validateUserProjection(select: string, allowPrivate: boolean): string | null {
  if (!select.trim()) return "Explicit safe user fields are required";
  // Top-level private fields are safe because applyScope forces non-admin
  // callers to their own user id. Embedded users do not receive independent
  // row scoping and therefore stay minimal for non-admin roles.
  const allowed = allowPrivate ? ADMIN_USER_FIELDS : SAFE_USER_FIELDS;
  for (const item of splitTopLevel(select)) {
    if (item === "*" || item.includes("(")) return "User records require explicit safe fields";
    const field = item.split(":").pop()?.trim() ?? "";
    if (!allowed.has(field)) return `User field is not readable: ${field || "unknown"}`;
  }
  return null;
}

function validateProjection(
  table: string,
  select: string,
  caller: ReadPolicyCaller,
  embedded = false,
  rootTable = table,
): string | null {
  if (table === "users" || table === "users_public") {
    const allowPrivate = !embedded || ADMIN_ROLES.has(caller.role) || rootTable === "students";
    return validateUserProjection(select, allowPrivate);
  }

  for (const item of splitTopLevel(select)) {
    const open = item.indexOf("(");
    if (open < 0) continue;
    if (!item.endsWith(")")) return "Invalid relation projection";
    const target = relationTarget(item.slice(0, open));
    const allowed = RELATIONS[table];
    if (!allowed?.has(target)) return `Relation is not readable from ${table}: ${target}`;
    const nested = item.slice(open + 1, -1);
    const nestedError = validateProjection(target, nested, caller, true, rootTable);
    if (nestedError) return nestedError;
  }
  return null;
}

export function validateDataReadSelect(
  table: string,
  select: string,
  caller: ReadPolicyCaller,
): string | null {
  try {
    const lowered = select.toLowerCase();
    if (/\b(password_hash|session_token|two_factor_secret)\b/.test(lowered)) {
      return "Sensitive fields are strictly prohibited from being read";
    }
    return validateProjection(table, select, caller);
  } catch {
    return "Invalid select expression";
  }
}
