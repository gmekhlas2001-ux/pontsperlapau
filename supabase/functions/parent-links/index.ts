/**
 * Parent link operations.
 *
 * The browser should not write parent_student_links directly. This endpoint
 * verifies the signed session token, reloads the caller, and enforces role and
 * branch rules before listing, creating, deleting, or exposing parent portal
 * data.
 */

import "jsr:@supabase/functions-js@2.110.0/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.110.0";
import { authenticateRequest } from "../_shared/auth.ts";
import { corsHeadersFor, errorResponse, jsonResponse } from "../_shared/cors.ts";

const ADMIN_ROLES = ["superadmin", "admin"];
const RELATIONSHIPS = ["mother", "father", "guardian", "other"];

type Body =
  | { operation: "list" }
  | {
      operation: "create";
      parentUserId: string;
      studentId: string;
      relationship: string;
      isPrimary: boolean;
    }
  | { operation: "delete"; linkId: string }
  | { operation: "my-children" }
  | { operation: "my-child-fees"; studentId: string };

type Caller = {
  id: string;
  role: string;
  status: string;
  branch_id: string | null;
};

type StudentRow = {
  id: string;
  student_id: string | null;
  branch_id: string | null;
  user?: {
    first_name?: string | null;
    last_name?: string | null;
    status?: string | null;
  } | null;
  branch?: {
    name?: string | null;
  } | null;
};

function assertAdmin(req: Request, caller: Caller): Response | null {
  if (!ADMIN_ROLES.includes(caller.role)) {
    return errorResponse(req, 403, "Insufficient permissions");
  }
  if (caller.role === "admin" && !caller.branch_id) {
    return errorResponse(req, 403, "Admin account is missing a branch");
  }
  return null;
}

function assertStudentInScope(req: Request, caller: Caller, student: { branch_id: string | null }): Response | null {
  if (caller.role === "admin" && student.branch_id !== caller.branch_id) {
    return errorResponse(req, 403, "Student is in a different branch");
  }
  return null;
}

function mapParentLink(row: any) {
  const student = row.student as StudentRow | null;
  return {
    id: row.id,
    parentUserId: row.parent_user_id,
    studentId: row.student_id,
    relationship: row.relationship,
    isPrimary: row.is_primary,
    createdAt: row.created_at,
    studentFirstName: student?.user?.first_name ?? "",
    studentLastName: student?.user?.last_name ?? "",
    studentCode: student?.student_id ?? "",
    studentStatus: student?.user?.status ?? "",
    branchName: student?.branch?.name ?? null,
    branchId: student?.branch_id ?? null,
  };
}

function mapFee(row: any) {
  return {
    id: row.id,
    studentId: row.student_id,
    studentFirstName: row.student?.user?.first_name ?? "",
    studentLastName: row.student?.user?.last_name ?? "",
    studentCode: row.student?.student_id ?? "",
    branchId: row.branch_id,
    classId: row.class_id ?? null,
    className: row.class?.name ?? null,
    description: row.description,
    amount: Number(row.amount ?? 0),
    currency: row.currency,
    dueDate: row.due_date,
    paidDate: row.paid_date ?? null,
    status: row.status,
    paymentMethod: row.payment_method ?? null,
    notes: row.notes ?? null,
    createdAt: row.created_at,
  };
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 200, headers: corsHeadersFor(req) });
    }
    if (req.method !== "POST") return errorResponse(req, 405, "Method not allowed");

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

    const { data: caller } = await supabase
      .from("users")
      .select("id, role, status, branch_id")
      .eq("id", claims.sub)
      .eq("status", "active")
      .maybeSingle();

    if (!caller) return errorResponse(req, 401, "Authentication required");

    let body: Body;
    try {
      body = await req.json();
    } catch {
      return errorResponse(req, 400, "Invalid request body");
    }

    if (body.operation === "list") {
      const adminError = assertAdmin(req, caller);
      if (adminError) return adminError;

      const { data, error } = await supabase
        .from("parent_student_links")
        .select(`
          id, parent_user_id, student_id, relationship, is_primary, created_at,
          student:students!student_id(
            id, student_id, branch_id,
            user:users!user_id(first_name, last_name, status),
            branch:branches!branch_id(name)
          )
        `)
        .order("created_at", { ascending: false });

      if (error) return errorResponse(req, 500, "Failed to load parent links", error);

      const rows = (data ?? [])
        .filter((row: any) => caller.role !== "admin" || row.student?.branch_id === caller.branch_id)
        .map(mapParentLink);

      return jsonResponse(req, { success: true, data: rows });
    }

    if (body.operation === "create") {
      const adminError = assertAdmin(req, caller);
      if (adminError) return adminError;

      if (!body.parentUserId || !body.studentId) {
        return errorResponse(req, 400, "Missing parentUserId or studentId");
      }
      if (!RELATIONSHIPS.includes(body.relationship)) {
        return errorResponse(req, 400, "Invalid relationship");
      }

      const [{ data: parent }, { data: student }] = await Promise.all([
        supabase
          .from("users")
          .select("id, role, status, branch_id")
          .eq("id", body.parentUserId)
          .eq("status", "active")
          .maybeSingle(),
        supabase
          .from("students")
          .select("id, branch_id, deleted_at")
          .eq("id", body.studentId)
          .maybeSingle(),
      ]);

      if (!parent || parent.role !== "parent") {
        return errorResponse(req, 400, "Selected user is not an active parent account");
      }
      if (!student || student.deleted_at) {
        return errorResponse(req, 404, "Student not found");
      }

      const scopeError = assertStudentInScope(req, caller, student);
      if (scopeError) return scopeError;
      if (caller.role !== "superadmin" && parent.branch_id !== student.branch_id) {
        return errorResponse(req, 403, "Parent and student must belong to the same branch");
      }

      const { error } = await supabase.from("parent_student_links").insert({
        parent_user_id: body.parentUserId,
        student_id: body.studentId,
        relationship: body.relationship,
        is_primary: !!body.isPrimary,
      });

      if (error) return errorResponse(req, 400, "Failed to create link", error);
      return jsonResponse(req, { success: true });
    }

    if (body.operation === "delete") {
      const adminError = assertAdmin(req, caller);
      if (adminError) return adminError;

      if (!body.linkId) return errorResponse(req, 400, "Missing linkId");

      const { data: link, error: linkErr } = await supabase
        .from("parent_student_links")
        .select("id, student:students!student_id(id, branch_id)")
        .eq("id", body.linkId)
        .maybeSingle();

      if (linkErr || !link) return errorResponse(req, 404, "Link not found", linkErr);

      const student = Array.isArray(link.student) ? link.student[0] : link.student;
      if (!student) return errorResponse(req, 404, "Linked student not found");
      const scopeError = assertStudentInScope(req, caller, student);
      if (scopeError) return scopeError;

      const { error } = await supabase
        .from("parent_student_links")
        .delete()
        .eq("id", body.linkId);

      if (error) return errorResponse(req, 500, "Failed to delete link", error);
      return jsonResponse(req, { success: true });
    }

    if (body.operation === "my-children") {
      if (caller.role !== "parent") {
        return errorResponse(req, 403, "Only parent accounts can use this view");
      }

      const { data: links, error: linksErr } = await supabase
        .from("parent_student_links")
        .select(`
          student_id, relationship, is_primary,
          student:students!student_id(
            id, student_id,
            user:users!user_id(first_name, last_name, status),
            branch:branches!branch_id(name)
          )
        `)
        .eq("parent_user_id", caller.id);

      if (linksErr) return errorResponse(req, 500, "Failed to load children", linksErr);
      if (!links || links.length === 0) return jsonResponse(req, { success: true, data: [] });

      const studentIds = links.map((link: any) => link.student_id);
      const [enrollRes, feeRes] = await Promise.all([
        supabase
          .from("class_enrollments")
          .select("student_id, grade, attendance_percentage")
          .in("student_id", studentIds)
          .eq("status", "active"),
        supabase
          .from("student_fees")
          .select("student_id, amount, status")
          .in("student_id", studentIds)
          .in("status", ["pending", "overdue", "partial"]),
      ]);

      if (enrollRes.error) return errorResponse(req, 500, "Failed to load enrollments", enrollRes.error);
      if (feeRes.error) return errorResponse(req, 500, "Failed to load fees", feeRes.error);

      const enrollments = enrollRes.data ?? [];
      const pendingFees = feeRes.data ?? [];

      const children = (links as any[]).map((link) => {
        const sid = link.student_id;
        const student = link.student as StudentRow | null;
        const myEnrollments = enrollments.filter((e: any) => e.student_id === sid);
        const myFees = pendingFees.filter((f: any) => f.student_id === sid);
        const gradePoints: Record<string, number> = { A: 95, B: 85, C: 75, D: 65, F: 50 };
        const grades = myEnrollments
          .map((e: any) => gradePoints[String(e.grade ?? '').trim().toUpperCase()] ?? Number.parseFloat(e.grade))
          .filter((g: number) => !Number.isNaN(g));
        const attendance = myEnrollments
          .map((e: any) => Number.parseFloat(e.attendance_percentage))
          .filter((p: number) => !Number.isNaN(p));

        const averageScore = grades.length
          ? Math.round((grades.reduce((a: number, b: number) => a + b, 0) / grades.length) * 10) / 10
          : null;
        const attendancePct = attendance.length
          ? Math.round((attendance.reduce((a: number, b: number) => a + b, 0) / attendance.length) * 10) / 10
          : null;

        return {
          studentId: sid,
          studentFirstName: student?.user?.first_name ?? "",
          studentLastName: student?.user?.last_name ?? "",
          studentCode: student?.student_id ?? "",
          studentStatus: student?.user?.status ?? "",
          branchName: student?.branch?.name ?? null,
          relationship: link.relationship,
          isPrimary: link.is_primary,
          enrolledClasses: myEnrollments.length,
          averageScore,
          attendancePct,
          pendingFeesCount: myFees.length,
          pendingFeesAmount: myFees.reduce((sum: number, f: any) => sum + Number.parseFloat(f.amount), 0),
        };
      });

      return jsonResponse(req, { success: true, data: children });
    }

    if (body.operation === "my-child-fees") {
      if (caller.role !== "parent") {
        return errorResponse(req, 403, "Only parent accounts can use this view");
      }
      if (!body.studentId) return errorResponse(req, 400, "Missing studentId");

      const { data: link } = await supabase
        .from("parent_student_links")
        .select("id")
        .eq("parent_user_id", caller.id)
        .eq("student_id", body.studentId)
        .maybeSingle();

      if (!link) return errorResponse(req, 403, "Student is not linked to this parent");

      const { data, error } = await supabase
        .from("student_fees")
        .select(`
          id, student_id, branch_id, class_id, description, amount, currency,
          due_date, paid_date, status, payment_method, notes, created_at,
          student:students!student_id(
            student_id,
            user:users!user_id(first_name, last_name)
          ),
          class:classes!class_id(name)
        `)
        .eq("student_id", body.studentId)
        .in("status", ["pending", "overdue", "partial"])
        .order("due_date", { ascending: false });

      if (error) return errorResponse(req, 500, "Failed to load fees", error);
      return jsonResponse(req, { success: true, data: (data ?? []).map(mapFee) });
    }

    return errorResponse(req, 400, "Unknown operation");
  } catch (err) {
    console.error("[parent-links] uncaught:", err);
    return errorResponse(req, 500, "Service error", err);
  }
});
