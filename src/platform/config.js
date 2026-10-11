export function loadConfig(env = process.env) {
  const config = {
    nodeEnv: env.NODE_ENV ?? "development",
    host: env.HOST ?? "0.0.0.0",
    port: Number(env.PORT ?? 3000),
    logLevel: env.LOG_LEVEL ?? "info",
    jwtSecret: env.JWT_SECRET,
    authSessionDays: Number(env.AUTH_SESSION_DAYS ?? 7),
    bootstrapAdminEmail: env.BOOTSTRAP_SUPER_ADMIN_EMAIL ?? env.BOOTSTRAP_ADMIN_EMAIL,
    bootstrapAdminPassword: env.BOOTSTRAP_SUPER_ADMIN_PASSWORD ?? env.BOOTSTRAP_ADMIN_PASSWORD,
    bootstrapAdminName: env.BOOTSTRAP_ADMIN_NAME ?? "System Administrator",
    corsOrigin: env.CORS_ORIGIN ?? "",
    databaseUrl: env.DATABASE_URL
  };
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error("PORT must be a valid TCP port.");
  if (config.nodeEnv === "production" && (!config.jwtSecret || config.jwtSecret.length < 32)) throw new Error("JWT_SECRET must be at least 32 characters in production.");
  return Object.freeze(config);
}

export function parseAllowedOrigins(value = "") {
  return [...new Set(String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.replace(/\/+$/, ""))
  )];
}

export function resolveAllowedOrigin(origin, configured = "") {
  const allowed = parseAllowedOrigins(configured);
  if (!allowed.length) return null;
  if (allowed.includes("*")) return "*";
  const normalizedOrigin = String(origin || "").trim().replace(/\/+$/, "");
  if (!normalizedOrigin) return null;
  const target = normalizedOrigin.toLowerCase();
  return allowed.some((entry) => entry.toLowerCase() === target) ? normalizedOrigin : null;
}
