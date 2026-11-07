import { handleApi } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
type RouteContext = { params: Promise<{ path: string[] }> };
async function route(request: Request, ctx: RouteContext) {
  return handleApi(request, (await ctx.params).path);
}
export { route as GET, route as POST, route as DELETE };
