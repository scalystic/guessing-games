import { deleteSession } from "@/lib/session";
import { jsonOk, internalErrorJson } from "@/lib/api/response";

export async function POST(): Promise<Response> {
  try {
    await deleteSession();
    return jsonOk({ success: true });
  } catch (error) {
    return internalErrorJson("auth.logout", error);
  }
}
