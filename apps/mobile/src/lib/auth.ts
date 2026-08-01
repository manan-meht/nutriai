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

// Strip the product scope tag for display purposes — mirrors
// displayEmail in the main web app's src/lib/auth.ts exactly. Without
// this, an email/password "adults" account's raw session email (e.g.
// "person+nutriai-adults@gmail.com") leaked the scope tag into any
// greeting/name derived from it (see (app)/adults/index.tsx and
// (app)/gym/index.tsx's firstNameFromSession, which had no equivalent
// stripping at all — this file only ever had the scoping half of the
// pair, not the display half).
export function displayEmail(email: string): string {
  return email.replace(/\+nutriai-[^@]+(?=@)/, "");
}
