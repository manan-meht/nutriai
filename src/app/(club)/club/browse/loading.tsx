import { OBSIDIAN_TOKENS as O } from "@/components/coach/tokens";

// Skeleton for the deck homepage. The static copy is real — branding,
// hero and subheadline never depend on data, so showing them immediately
// costs nothing and means loading -> loaded only fills in chips, count and
// the peeking card, with no layout shift. No full-screen spinner.
export default function BrowseLoading() {
  return (
    <div
      className="flex h-[100dvh] w-full flex-col overflow-hidden px-5 sm:px-10"
      style={{ background: O.backdrop, color: O.onSurface }}
    >
      <div
        className="flex items-center justify-between"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 18px)" }}
      >
        <p className="text-[15px] font-bold uppercase tracking-[0.12em]">Tistra Club</p>
        <p className="text-[14px] font-medium">Singapore</p>
      </div>

      <div className="flex flex-1 flex-col justify-center">
        <h1
          className="mx-auto max-w-[22ch] text-center text-[34px] font-bold leading-[1.12] tracking-[-0.02em] text-white sm:text-[52px] lg:text-[60px]"
          style={{ textWrap: "balance" as any }}
        >
          What do you want to get better at?
        </h1>
        <p
          className="mx-auto mt-4 max-w-md text-center text-[16px] leading-relaxed sm:text-[18px]"
          style={{ color: O.onSurfaceVariant }}
        >
          Choose a skill, meet the right coach, and start moving forward.
        </p>

        <div className="mt-7 flex justify-center gap-2 overflow-hidden" aria-hidden="true">
          {[76, 104, 128, 96, 88].map((w, i) => (
            <div
              key={i}
              className="h-[41px] shrink-0 animate-pulse rounded-full"
              style={{ width: w, backgroundColor: "rgba(255,255,255,0.08)" }}
            />
          ))}
        </div>

        <div className="mx-auto mt-6 h-5 w-56 animate-pulse rounded" style={{ backgroundColor: "rgba(255,255,255,0.08)" }} aria-hidden="true" />
      </div>

      {/* Where the first coach will peek: a card skeleton at the same
          height, so the real card replaces it without a jump. */}
      <div
        className="mx-auto h-[28dvh] w-full animate-pulse rounded-t-[28px] sm:max-w-4xl"
        style={{ backgroundColor: O.surfaceContainerLow }}
        aria-hidden="true"
      />
      <p className="sr-only" role="status">Loading coaches</p>
    </div>
  );
}
