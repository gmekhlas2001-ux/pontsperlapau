const NO_MATCH = "00000000-0000-0000-0000-000000000000";
const STAFF_ROLES = ["superadmin", "admin", "teacher", "librarian"];
const ACADEMIC_ROLES = ["superadmin", "admin", "teacher"];
export const ADMIN_ROLES = ["superadmin", "admin"];

export const ALLOWED_TABLES = new Set([
  "activity_logs",
  "attendance",
  "book_borrowings",
  "books",
  "branches",
  "class_enrollments",
  "classes",
  "donors",
  "grade_entries",
  "grant_transactions",
  "grants",
  "messages",
  "message_read_receipts",
  "organization_settings",
  "password_reset_requests",
  "roles",
  "staff",
  "student_fees",
  "students",
  "survey_branch_responses",
  "survey_branch_submissions",
  "survey_individual_responses",
  "survey_list_stats",
  "survey_questions",
  "survey_respondents",
  "survey_response_options",
  "survey_sections",
  "surveys",
  "transactions",
  "user_documents",
  "users",
  "users_public",
]);

export type Caller = {
  id: string;
  role: string;
  branch_id: string | null;
};

type Client = any;

function hasRole(caller: Caller, roles: string[]): boolean {
  return roles.includes(caller.role);
}

function appendEq(params: URLSearchParams, column: string, value: string | null): void {
  params.delete(column);
  params.append(column, `eq.${value ?? NO_MATCH}`);
}

function appendIn(params: URLSearchParams, column: string, ids: string[]): void {
  const value = params.get(column);
  params.delete(column);

  if (value) {
    let requested: string[] = [];
    if (value.startsWith("eq.")) {
      requested = [value.slice(3)];
    } else if (value.startsWith("in.(") && value.endsWith(")")) {
      requested = value.slice(4, -1).split(",").map((id) => id.trim());
    } else {
      params.append(column, `eq.${NO_MATCH}`);
      return;
    }

    const allowedSet = new Set(ids);
    const intersected = requested.filter((id) => allowedSet.has(id));

    if (intersected.length === 0) {
      params.append(column, `eq.${NO_MATCH}`);
    } else if (intersected.length === 1) {
      params.append(column, `eq.${intersected[0]}`);
    } else {
      params.append(column, `in.(${intersected.join(",")})`);
    }
  } else {
    params.append(column, `in.(${(ids.length ? ids : [NO_MATCH]).join(",")})`);
  }
}

async function fetchIds(
  client: Client,
  table: string,
  column: string,
  configure: (query: any) => any,
): Promise<string[]> {
  const ids: string[] = [];
  const pageSize = 1000;

  for (let from = 0; from <= 10_000; from += pageSize) {
    let query = client.from(table).select(column).order(column).range(from, from + pageSize - 1);
    query = configure(query);
    const { data, error } = await query;
    if (error) throw error;
    const page = (data ?? [])
      .map((row: Record<string, unknown>) => row[column])
      .filter((value: unknown): value is string => typeof value === "string");
    if (from === 10_000 && page.length > 0) throw new Error("Authorization scope exceeds the supported size");
    ids.push(...page);
    if (page.length < pageSize) break;
  }

  return [...new Set(ids)];
}

async function studentIdsForCaller(client: Client, caller: Caller): Promise<string[]> {
  if (caller.role === "parent") {
    return fetchIds(client, "parent_student_links", "student_id", (query) =>
      query.eq("parent_user_id", caller.id)
    );
  }
  if (caller.role === "student") {
    return fetchIds(client, "students", "id", (query) =>
      query.eq("user_id", caller.id).is("deleted_at", null)
    );
  }
  return [];
}

async function branchClassIds(client: Client, branchId: string | null): Promise<string[]> {
  return fetchIds(client, "classes", "id", (query) =>
    query.eq("branch_id", branchId ?? NO_MATCH).is("deleted_at", null)
  );
}

async function assignedClassIds(client: Client, callerId: string): Promise<string[]> {
  const staffIds = await fetchIds(client, "staff", "id", (query) =>
    query.eq("user_id", callerId).is("deleted_at", null)
  );
  return fetchIds(client, "classes", "id", (query) =>
    query.in("teacher_id", staffIds.length ? staffIds : [NO_MATCH]).is("deleted_at", null)
  );
}

async function branchBookIds(client: Client, branchId: string | null): Promise<string[]> {
  return fetchIds(client, "books", "id", (query) =>
    query.eq("branch_id", branchId ?? NO_MATCH).is("deleted_at", null)
  );
}

async function branchGrantIds(client: Client, branchId: string | null): Promise<string[]> {
  return fetchIds(client, "grants", "id", (query) =>
    query.eq("branch_id", branchId ?? NO_MATCH)
  );
}

async function branchSurveyIds(client: Client, branchId: string | null): Promise<string[]> {
  return fetchIds(client, "surveys", "id", (query) =>
    query.eq("branch_id", branchId ?? NO_MATCH)
  );
}

async function branchDocumentUserIds(client: Client, branchId: string | null): Promise<string[]> {
  return fetchIds(client, "users", "id", (query) =>
    query
      .eq("branch_id", branchId ?? NO_MATCH)
      .not("role", "in", "(superadmin,admin)")
  );
}

export async function applyScope(
  client: Client,
  caller: Caller,
  table: string,
  params: URLSearchParams,
): Promise<boolean> {
  const isGlobal = caller.role === "superadmin";

  if (table === "users" || table === "users_public") {
    if (isGlobal) return true;
    const select = params.get("select") ?? "";
    const requestsPrivateProfile = /\b(email|father_name|phone_number|date_of_birth|gender|passport_number|last_login|is_verified|two_factor_enabled)\b/i.test(select);
    if (caller.role === "admin" || (["teacher", "librarian"].includes(caller.role) && !requestsPrivateProfile)) {
      appendEq(params, "branch_id", caller.branch_id);
    } else {
      appendEq(params, "id", caller.id);
    }
    return true;
  }

  if (table === "branches") {
    if (!isGlobal) appendEq(params, "id", caller.branch_id);
    return true;
  }

  if (table === "staff") {
    if (hasRole(caller, STAFF_ROLES)) {
      if (!isGlobal) appendEq(params, "branch_id", caller.branch_id);
      return true;
    }
    appendEq(params, "user_id", caller.id);
    return true;
  }

  if (table === "students") {
    if (hasRole(caller, ACADEMIC_ROLES)) {
      if (!isGlobal) appendEq(params, "branch_id", caller.branch_id);
      return true;
    }
    if (caller.role === "student" || caller.role === "parent") {
      appendIn(params, "id", await studentIdsForCaller(client, caller));
      return true;
    }
    return false;
  }

  if (table === "classes") {
    if (caller.role === "teacher") {
      appendIn(params, "id", await assignedClassIds(client, caller.id));
      return true;
    }
    if (hasRole(caller, ["superadmin", "admin"])) {
      if (!isGlobal) appendEq(params, "branch_id", caller.branch_id);
      return true;
    }
    if (caller.role === "student") {
      const studentIds = await studentIdsForCaller(client, caller);
      const classIds = await fetchIds(client, "class_enrollments", "class_id", (query) =>
        query.in("student_id", studentIds.length ? studentIds : [NO_MATCH]).eq("status", "active")
      );
      appendIn(params, "id", classIds);
      return true;
    }
    return false;
  }

  if (["class_enrollments", "attendance", "grade_entries"].includes(table)) {
    if (caller.role === "teacher") {
      appendIn(params, "class_id", await assignedClassIds(client, caller.id));
      return true;
    }
    if (hasRole(caller, ["superadmin", "admin"])) {
      if (!isGlobal) appendIn(params, "class_id", await branchClassIds(client, caller.branch_id));
      return true;
    }
    if (caller.role === "student" || caller.role === "parent") {
      appendIn(params, "student_id", await studentIdsForCaller(client, caller));
      return true;
    }
    return false;
  }

  if (table === "books") {
    if (![...STAFF_ROLES, "student"].includes(caller.role)) return false;
    if (!isGlobal) appendEq(params, "branch_id", caller.branch_id);
    return true;
  }

  if (table === "book_borrowings") {
    if (hasRole(caller, STAFF_ROLES)) {
      if (!isGlobal) appendIn(params, "book_id", await branchBookIds(client, caller.branch_id));
      return true;
    }
    if (caller.role === "student") {
      appendEq(params, "borrower_id", caller.id);
      return true;
    }
    return false;
  }

  if (table === "student_fees") {
    if (hasRole(caller, ACADEMIC_ROLES)) {
      if (!isGlobal) appendEq(params, "branch_id", caller.branch_id);
      return true;
    }
    if (caller.role === "student" || caller.role === "parent") {
      appendIn(params, "student_id", await studentIdsForCaller(client, caller));
      return true;
    }
    return false;
  }

  if (table === "messages") {
    if (!hasRole(caller, STAFF_ROLES)) return false;
    if (!isGlobal) params.append("or", `(branch_id.eq.${caller.branch_id ?? NO_MATCH},branch_id.is.null)`);
    params.append("or", `(sender_id.eq.${caller.id},recipient_id.eq.${caller.id},recipient_id.is.null)`);
    return true;
  }

  if (table === "message_read_receipts") {
    if (!hasRole(caller, STAFF_ROLES)) return false;
    appendEq(params, "user_id", caller.id);
    return true;
  }

  if (table === "transactions") {
    if (!hasRole(caller, ADMIN_ROLES)) return false;
    if (!isGlobal) {
      const branchId = caller.branch_id ?? NO_MATCH;
      params.append("or", `(sender_branch_id.eq.${branchId},receiver_branch_id.eq.${branchId})`);
    }
    return true;
  }

  if (table === "grants") {
    if (!hasRole(caller, ADMIN_ROLES)) return false;
    if (!isGlobal) appendEq(params, "branch_id", caller.branch_id);
    return true;
  }

  if (table === "grant_transactions") {
    if (!hasRole(caller, ADMIN_ROLES)) return false;
    if (!isGlobal) appendIn(params, "grant_id", await branchGrantIds(client, caller.branch_id));
    return true;
  }

  if (table === "donors") {
    if (!hasRole(caller, ADMIN_ROLES)) return false;
    if (!isGlobal) {
      const grantIds = await branchGrantIds(client, caller.branch_id);
      const donorIds = await fetchIds(client, "grants", "donor_id", (query) =>
        query.in("id", grantIds.length ? grantIds : [NO_MATCH])
      );
      params.append("or", `(branch_id.eq.${caller.branch_id ?? NO_MATCH},id.in.(${(donorIds.length ? donorIds : [NO_MATCH]).join(",")}))`);
    }
    return true;
  }

  if (table === "surveys") {
    if (!hasRole(caller, ADMIN_ROLES)) return false;
    if (!isGlobal) appendEq(params, "branch_id", caller.branch_id);
    return true;
  }

  if (["survey_sections", "survey_questions", "survey_response_options"].includes(table)) {
    if (!hasRole(caller, ADMIN_ROLES)) return false;
    if (!isGlobal) appendIn(params, "survey_id", await branchSurveyIds(client, caller.branch_id));
    return true;
  }

  if ([
    "survey_branch_responses",
    "survey_branch_submissions",
    "survey_individual_responses",
    "survey_list_stats",
    "survey_respondents",
  ].includes(table)) {
    if (!hasRole(caller, ADMIN_ROLES)) return false;
    if (!isGlobal) appendEq(params, "branch_id", caller.branch_id);
    return true;
  }

  if (table === "activity_logs") {
    if (!hasRole(caller, ADMIN_ROLES)) return false;
    if (!isGlobal) {
      const userIds = await fetchIds(client, "users", "id", (query) =>
        query.eq("branch_id", caller.branch_id ?? NO_MATCH)
      );
      params.append("or", `(branch_id.eq.${caller.branch_id ?? NO_MATCH},and(event_source.eq.legacy_client,user_id.in.(${(userIds.length ? userIds : [NO_MATCH]).join(",")})))`);
    }
    return true;
  }

  if (table === "password_reset_requests") {
    if (!hasRole(caller, ADMIN_ROLES)) return false;
    if (!isGlobal) {
      const userIds = await fetchIds(client, "users", "id", (query) =>
        query.eq("branch_id", caller.branch_id ?? NO_MATCH)
      );
      appendIn(params, "user_id", userIds);
    }
    return true;
  }

  if (table === "user_documents") {
    if (isGlobal) return true;
    if (caller.role !== "admin") return false;
    appendIn(params, "user_id", await branchDocumentUserIds(client, caller.branch_id));
    return true;
  }

  if (["organization_settings", "roles"].includes(table)) {
    return isGlobal;
  }

  return false;
}
