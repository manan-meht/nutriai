import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { ClubChrome } from "@/components/club/ClubChrome";
import { CoachCardList } from "@/components/club/CoachCardList";
import { discoverCoaches, listSkills } from "@/lib/club/discovery";
import { CLUB_TOKENS as T } from "@/components/coach/tokens";
import { CLUB_BRANDING } from "@/lib/club/config";

export const dynamic = "force-dynamic";

export default async function ClubDiscoverPage({
  searchParams,
}: {
  searchParams?: Promise<{ skill?: string; travels?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const admin = createServiceClient();

  const [skills, coaches] = await Promise.all([
    listSkills(admin),
    discoverCoaches(admin, {
      skillSlug: params.skill,
      travelsToClient: params.travels === "1",
    }),
  ]);

  const activeSkill = skills.find((s: any) => s.slug === params.skill);
  const qs = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { skill: params.skill, travels: params.travels, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/?${s}` : "/";
  };

  return (
    <ClubChrome active="discover">
      <h1 className="text-[2rem] font-semibold leading-9 tracking-[-0.02em] text-balance">
        {activeSkill ? `${activeSkill.name} in Singapore` : "Find a coach in Singapore"}
      </h1>
      <p className="mt-2 text-[15px]" style={{ color: T.onSurfaceVariant }}>
        {CLUB_BRANDING.tagline}
      </p>

      <Link
        href="/browse"
        className="mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium"
        style={{ backgroundColor: T.primary, color: T.onPrimary }}
      >
        <span aria-hidden="true">⇅</span> Swipe through coaches
      </Link>

      {/* Skill chips. Data-driven from club_skills — never a hardcoded list. */}
      <div className="-mx-5 mt-5 overflow-x-auto px-5">
        <div className="flex w-max gap-2 pb-1">
          <Chip href={qs({ skill: undefined })} active={!params.skill}>All</Chip>
          {skills.map((s: any) => (
            <Chip key={s.id} href={qs({ skill: s.slug })} active={params.skill === s.slug}>
              {s.name}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <Chip href={qs({ travels: params.travels === "1" ? undefined : "1" })} active={params.travels === "1"}>
          Travels to me
        </Chip>
      </div>

      <p className="mb-4 mt-6 text-sm" style={{ color: T.onSurfaceVariant }}>
        {coaches.length} {coaches.length === 1 ? "coach" : "coaches"} available
      </p>

      <CoachCardList coaches={coaches} />
    </ClubChrome>
  );
}

function Chip({ href, active, children }: { href: string; active?: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium"
      style={
        active
          ? { backgroundColor: T.primary, color: T.onPrimary, borderColor: T.primary }
          : { borderColor: T.outlineVariant, color: T.onSurfaceVariant }
      }
    >
      {children}
    </Link>
  );
}
