import { CMD, client, TABLE } from "./db.mjs";
import { HttpError } from "./http.mjs";
import { getSession, getUser } from "./auth.mjs";

const bearerToken = (event) => {
  const h = event.headers?.["Authorization"] || event.headers?.["authorization"] || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) throw new HttpError(401, "unauthorized", "Missing bearer token");
  return m[1];
};

export const requireAuth = async (event) => {
  const token = bearerToken(event);
  const session = await getSession(token);
  if (!session) throw new HttpError(401, "unauthorized", "Invalid or expired session");
  const userId = session.userId.S;
  const user = await getUser(userId);
  if (!user || user.status !== "active") throw new HttpError(401, "unauthorized", "User not active");
  return { userId, role: user.role, session };
};

export const requireRole = (...roles) => (ctx) => {
  if (!roles.includes(ctx.role)) throw new HttpError(403, "forbidden", `Role ${ctx.role} not allowed`);
};
