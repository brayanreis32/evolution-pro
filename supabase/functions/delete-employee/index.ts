// Admin exclui um funcionário (login + perfil).
// Bloqueia se ele já tem batidas de ponto: o histórico de pagamento não pode sumir.
import { handler, json, requireAdmin, serviceClient, HttpError } from "../_shared/common.ts";

Deno.serve(handler(async (req) => {
  const callerId = await requireAdmin(req);
  const { id } = await req.json();
  if (!id) throw new HttpError(400, "MISSING_FIELDS");
  if (id === callerId) throw new HttpError(400, "CANNOT_DELETE_SELF");

  const db = serviceClient();
  const { data: target } = await db.from("profiles").select("id, role").eq("id", id).maybeSingle();
  const { data: caller } = await db.from("profiles").select("role").eq("id", callerId).single();
  // desenvolvedor é invisível e intocável para administradores
  if (!target || (target.role === "developer" && caller?.role !== "developer")) throw new HttpError(404, "NOT_FOUND");

  const { count } = await db.from("time_punches").select("id", { count: "exact", head: true }).eq("employee_id", id);
  if ((count ?? 0) > 0) throw new HttpError(409, "HAS_HISTORY");

  await db.from("site_assignments").delete().eq("employee_id", id);
  const { error } = await db.auth.admin.deleteUser(id); // apaga o perfil junto (cascade)
  if (error) throw new HttpError(400, error.message);
  return json({ ok: true });
}));
