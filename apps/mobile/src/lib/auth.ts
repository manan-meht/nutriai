// Mirrors src/lib/auth.ts in the main web app exactly — accounts are keyed
// on the scoped email, not the raw one the user types in, so this must
// stay identical to the web version or login looks up the wrong account.
export function scopedEmail(email: string, product: "gym" | "adults"): string {
  if (product === "gym") return email;
  const at = email.lastIndexOf("@");
  return `${email.slice(0, at)}+nutriai-adults${email.slice(at)}`;
}
