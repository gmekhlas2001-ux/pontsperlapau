import { errorResponse } from "./cors.ts";
import { canUseModule, type ModuleAction, type ModuleActor } from "./module-access.ts";

export async function modulePermissionError(
  req: Request, client: any, actor: ModuleActor, moduleId: string, action: ModuleAction,
): Promise<Response | null> {
  try {
    return await canUseModule(client, actor, moduleId, action)
      ? null : errorResponse(req, 403, "Module access is disabled");
  } catch (error) {
    return errorResponse(req, 503, "Module access is temporarily unavailable", error);
  }
}
