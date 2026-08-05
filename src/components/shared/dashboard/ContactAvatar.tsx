import Image from "next/image";

const SIZE_CLASSES = {
  sm: "w-11 h-11 text-sm",
  md: "w-14 h-14 text-base",
  lg: "w-20 h-20 text-2xl",
} as const;

/** A contact's real photo when one's been uploaded, falling back to a
 * colored-initials circle otherwise — the same industry-standard pattern
 * Slack/Gmail/etc. use for a person with no avatar, rather than a generic
 * silhouette icon or an external service (Gravatar etc.) that would need
 * the person to have registered somewhere else first. */
export function ContactAvatar({
  photoUrl,
  fullName,
  size = "sm",
  ringed = false,
}: {
  photoUrl?: string;
  fullName: string;
  size?: "sm" | "md" | "lg";
  ringed?: boolean;
}) {
  const initials = fullName.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  const sizeClass = SIZE_CLASSES[size];
  const ringClass = ringed ? "ring-2 ring-[var(--color-dashboard-primary)] ring-offset-2" : "";

  if (photoUrl) {
    return (
      <div className={`relative rounded-full overflow-hidden flex-shrink-0 ${sizeClass} ${ringClass}`}>
        <Image src={photoUrl} alt="" fill sizes="80px" className="object-cover" />
      </div>
    );
  }

  return (
    <div
      className={`rounded-full bg-[var(--color-dashboard-primary-light)] flex items-center justify-center flex-shrink-0 ${sizeClass} ${ringClass}`}
    >
      <span className="font-bold text-[var(--color-dashboard-primary)]">{initials}</span>
    </div>
  );
}
