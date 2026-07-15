// Mirrors src/lib/auth.ts in the main web app exactly — a "gym" (coach) and
// an "adults" (family/self) account for the same person are separate
// Supabase auth users, distinguished by this email tag, not by one account
// with two products. Sign-in must scope the email the same way the account
// was created, or it looks up the wrong (nonexistent) user.
export function scopedEmail(email: string, product: "gym" | "adults"): string {
  if (product === "gym") return email;
  const at = email.lastIndexOf("@");
  return `${email.slice(0, at)}+nutriai-adults${email.slice(at)}`;
}
