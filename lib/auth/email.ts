// ILIKE is case-insensitive, but member emails must be literal values, not patterns.
export function memberEmailPattern(email: string): string {
  return email.trim().toLowerCase().replace(/[\\%_]/g, "\\$&");
}

export function safeNextPath(value: string | null): string {
  if (!value?.startsWith("/") || value.startsWith("//") || /[\\\s\u0000-\u001f\u007f]/.test(value)) return "/";
  const base = "https://member.invalid";
  const target = new URL(value, base);
  return target.origin === base ? `${target.pathname}${target.search}${target.hash}` : "/";
}

export function validEmailToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{20,512}$/.test(value);
}
