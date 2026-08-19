// Placeholder coach imagery.
//
// The marketplace launched with no coach photos at all, which made every
// card render as initials and gave a misleading impression of a populated
// product. These stand-ins fill that gap until coaches upload their own.
//
// Three properties keep this honest and self-retiring:
//
//  1. It is a FALLBACK. A coach with photo_url set always wins, so the
//     placeholder disappears for each coach the moment they upload — no
//     migration, no cleanup pass, no risk of overwriting a real photo.
//  2. It is keyed on the coach's own skills, so a swimming coach gets
//     swimming, not a random image.
//  3. It shows the discipline, never a face. The images are Unsplash-
//     licensed with no model release (see public/club/coaches/CREDITS.md),
//     so an identifiable person must not appear to be a named coach
//     selling sessions.
//
// Set CLUB_PLACEHOLDER_COACH_PHOTOS=false to turn the whole thing off once
// enough coaches have real photos that stand-ins do more harm than good.

const BASE = "/club/coaches";

/** Skill slugs that have a matching image on disk. Keep in sync with
 * public/club/coaches/ — the guard test asserts every entry exists. */
export const PLACEHOLDER_SKILL_SLUGS = [
  "acrobatics",
  "boxing",
  "calisthenics",
  "handstands",
  "mobility",
  "muay-thai",
  "older-adult-strength",
  "personal-training",
  "pole",
  "running",
  "strength-training",
  "swimming",
  "tennis",
  "yoga",
] as const;

const AVAILABLE = new Set<string>(PLACEHOLDER_SKILL_SLUGS);

/** Used when a coach's skills have no matching image, so a coach teaching
 * something we have no art for still looks like a real listing. */
const GENERIC = `${BASE}/personal-training.webp`;

export const PLACEHOLDER_PHOTOS_ENABLED =
  (process.env.CLUB_PLACEHOLDER_COACH_PHOTOS ?? "true").toLowerCase() !== "false";

/**
 * Resolves the photo to show for a coach.
 *
 * `photoUrl` is the coach's own uploaded photo and always takes precedence;
 * the placeholder only ever fills a null.
 */
export function resolveCoachPhoto(
  photoUrl: string | null | undefined,
  skillSlugs: Array<string | null | undefined>
): string | null {
  if (photoUrl) return photoUrl;
  if (!PLACEHOLDER_PHOTOS_ENABLED) return null;

  for (const slug of skillSlugs) {
    if (slug && AVAILABLE.has(slug)) return `${BASE}/${slug}.webp`;
  }
  return GENERIC;
}

/**
 * Resolves a small gallery for a coach, for the swipeable discovery card.
 *
 * A coach's own uploaded media always comes first and is never mixed with
 * stand-ins — a card either shows real photos of a real coach, or it shows
 * clearly generic discipline imagery. Interleaving the two would imply the
 * stock shots were theirs.
 */
export function resolveCoachGallery(
  ownPhotos: string[],
  photoUrl: string | null | undefined,
  skillSlugs: Array<string | null | undefined>,
  count = 3
): string[] {
  const own = [photoUrl, ...ownPhotos].filter((u): u is string => !!u);
  if (own.length > 0) return own.slice(0, Math.max(count, own.length));
  if (!PLACEHOLDER_PHOTOS_ENABLED) return [];

  // One image per discipline the coach actually teaches, in their order.
  // Deliberately NOT padded out to `count` with unrelated disciplines: a
  // running coach with an acrobatics photo in their gallery reads as a
  // mistake, and padding would make every card end on the same image.
  const gallery: string[] = [];
  for (const slug of skillSlugs) {
    if (!slug || !AVAILABLE.has(slug)) continue;
    const url = `${BASE}/${slug}.webp`;
    if (!gallery.includes(url)) gallery.push(url);
    if (gallery.length === count) break;
  }
  return gallery.length > 0 ? gallery : [GENERIC];
}

/** True when the returned photo is a stand-in rather than the coach's own —
 * lets a surface label it, and keeps callers from having to string-match on
 * the path. */
export function isPlaceholderPhoto(url: string | null | undefined): boolean {
  return !!url && url.startsWith(`${BASE}/`);
}
