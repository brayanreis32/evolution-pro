// Admin cadastra um funcionário ou outro administrador: cria o login (email + senha) e o perfil.
import { handler, json, requireAdmin, serviceClient, HttpError } from "../_shared/common.ts";

Deno.serve(handler(async (req) => {
  await requireAdmin(req);
  const { email, password, full_name, phone, hourly_rate, language, role, zelle_contact, zelle_name } = await req.json();
  if (!email || !password || !full_name) throw new HttpError(400, "MISSING_FIELDS");
  if (String(password).length < 6) throw new HttpError(400, "WEAK_PASSWORD");

  const db = serviceClient();
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, hourly_rate: hourly_rate ?? 0, language: language ?? "pt" },
  });
  if (error) throw new HttpError(400, error.message);

  await db.from("profiles").update({
    full_name,
    phone: phone ?? null,
    zelle_contact: zelle_contact || null,
    zelle_name: zelle_name || null,
    hourly_rate: hourly_rate ?? 0,
    language: language ?? "pt",
    role: role === "admin" ? "admin" : "employee",
  }).eq("id", data.user.id);

  return json({ id: data.user.id });
}));
