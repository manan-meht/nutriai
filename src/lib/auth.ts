export function scopedEmail(email: string, product: "gym" | "adults"): string {
  if (product === "gym") return email;
  const at = email.lastIndexOf("@");
  return `${email.slice(0, at)}+nutriai-adults${email.slice(at)}`;
}

// Strip the product scope tag for display purposes
export function displayEmail(email: string): string {
  return email.replace(/\+nutriai-[^@]+(?=@)/, "");
}
