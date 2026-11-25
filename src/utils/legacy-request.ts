import type { APIContext } from "astro";

export function isLegacyExportRequest(context: Pick<APIContext, "request" | "clientAddress">) {
  if (context.request.headers.get("X-Dmesg-Legacy") !== "1") return false;
  try {
    return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(context.clientAddress);
  } catch {
    return false;
  }
}
