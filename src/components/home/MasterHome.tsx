import Image from "next/image";
import Link from "next/link";
import { MarketingHeader } from "./MarketingHeader";
import { MarketingFooter } from "./MarketingFooter";
import { Reveal } from "@/components/motion/Reveal";
import { UseCaseCards, type UseCaseCard } from "@/components/landing/shared/UseCaseCards";
import { WhatsAppDemoBlock } from "@/components/landing/shared/WhatsAppDemoBlock";
import { DashboardPreviewBlock } from "@/components/landing/shared/DashboardPreviewBlock";

const USE_CASES: UseCaseCard[] = [
  {
    href: "/me",
    icon: "🙋",
    title: "Me",
    description: "Understand your own meal balance, calories, protein, and consistency.",
    cta: "Explore Me",
  },
  {
    href: "/family",
    icon: "👨‍👩‍👧",
    title: "Family",
    description: "Support a loved one’s nutrition from anywhere.",
    cta: "Explore Family",
  },
  {
    href: "/coach",
    icon: "🏋️",
    title: "Coach",
    description: "Track client meals without chasing food logs.",
    cta: "Explore Coach",
  },
  {
    // Not a product to "explore" like the other three — this routes
    // straight to the OTP-verified end-user session (src/lib/end-user/otp.ts)
    // for someone who's already been added as a tracked contact.
    href: "/my-progress",
    icon: "🔒",
    title: "I was invited",
    description: "Sign in with a text message to view your private Tistra Health dashboard.",
    cta: "View my dashboard",
  },
];

const HOW_IT_WORKS = [
  "Send a meal photo on WhatsApp",
  "Tistra estimates food, portions, calories, protein, and overall meal patterns",
  "Confirm or correct the estimate, and see insights over time",
];

export function MasterHome({ homeHref }: { homeHref: string }) {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <MarketingHeader variant="home" homeHref={homeHref} />

      <main>
        {/* 1. Hero */}
        <section className="max-w-6xl mx-auto px-6 pt-14 pb-20 grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <Reveal direction="right">
            <div className="flex flex-col gap-4">
              <h1 className="text-3xl md:text-5xl font-bold leading-tight text-gray-900">
                Understand nutrition from a simple WhatsApp photo.
              </h1>
              <p className="text-lg text-gray-600">
                Tistra Health turns meal photos into simple nutrition insights for families, coaches, and
                individuals.
              </p>
              <p className="text-sm text-gray-500">
                Built for real home-cooked meals, mixed plates, snacks, drinks, and everyday portions.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 mt-2">
                <Link
                  href="/me"
                  className="bg-[#6750A4] hover:bg-[#4F378A] text-white px-8 py-3.5 rounded-full font-semibold transition-colors text-center"
                >
                  Get started
                </Link>
                <a
                  href="#how-it-works"
                  className="border-2 border-[#6750A4] text-[#4F378A] hover:bg-[#F3EEFB] px-8 py-3.5 rounded-full font-semibold transition-colors text-center"
                >
                  See how it works
                </a>
              </div>
            </div>
          </Reveal>
          <Reveal direction="left" delay={100}>
            <div className="relative flex justify-center">
              <div className="bg-white/70 backdrop-blur border border-white/50 shadow-2xl rounded-[2rem] p-6 w-full max-w-md">
                <div className="bg-gray-50 rounded-xl p-4 flex flex-col gap-3 border border-gray-100">
                  <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
                    <Image
                      src="/marketing/tistra-assistant-avatar.png"
                      alt=""
                      width={24}
                      height={24}
                      className="rounded-full"
                    />
                    <span className="text-sm font-medium text-[#4F378A]">Tistra Assistant</span>
                  </div>
                  <div className="self-end max-w-[85%]">
                    <div className="rounded-2xl rounded-tr-none overflow-hidden mb-1 shadow-sm">
                      <Image
                        src="/landing/gym/immersive/meals/whey-smoothie.jpeg"
                        alt="A smoothie and light breakfast plate"
                        width={320}
                        height={200}
                        className="w-full h-32 object-cover"
                      />
                    </div>
                    <div className="bg-green-100 rounded-2xl rounded-tr-none p-3">
                      <p className="text-sm">Smoothie and toast for breakfast!</p>
                    </div>
                  </div>
                  <div className="self-start bg-white shadow-sm rounded-2xl rounded-tl-none p-3 max-w-[85%]">
                    <p className="text-sm">
                      Looks great! That&apos;s a well-balanced meal. Logging this to your weekly trend. 📈
                    </p>
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-8 -right-4 md:-right-8 bg-white/95 backdrop-blur p-5 rounded-2xl shadow-xl w-64 border-t-4 border-[#6750A4]">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-xs font-semibold text-gray-500">Habit Momentum</h4>
                  <span className="text-green-600 text-sm">📈</span>
                </div>
                <div className="flex justify-between text-xs mb-1">
                  <span>This week</span>
                  <span className="text-[#4F378A] font-bold">Improving</span>
                </div>
                <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden mb-2">
                  <div className="bg-[#6750A4] h-full rounded-full" style={{ width: "70%" }} />
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Meals were more consistent this week. Next focus: make breakfast more complete.
                </p>
              </div>
            </div>
          </Reveal>
        </section>

        {/* 2. Compact use-case cards */}
        <section className="max-w-4xl mx-auto px-6 pb-14">
          <UseCaseCards cards={USE_CASES} />
        </section>

        {/* 3. How it works — 3 steps + compact cuisine note */}
        <section id="how-it-works" className="bg-gray-50 py-14 scroll-mt-20">
          <div className="max-w-3xl mx-auto px-6">
            <Reveal>
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-8 text-center">How it works</h2>
            </Reveal>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10">
              {HOW_IT_WORKS.map((step, i) => (
                <Reveal key={step} delay={i * 80}>
                  <div className="flex flex-col items-center text-center gap-2">
                    <div className="w-9 h-9 rounded-full bg-[#6750A4] text-white text-sm font-bold flex items-center justify-center">
                      {i + 1}
                    </div>
                    <p className="text-sm font-medium text-gray-800">{step}</p>
                  </div>
                </Reveal>
              ))}
            </div>

            {/* Compact cuisine-support note — a small callout, not a cuisine
                marketing section. No flags, no national imagery, no single
                cuisine emphasized over another. */}
            <Reveal delay={150}>
              <div className="max-w-xl mx-auto text-center">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">
                  Built to understand real-world meals across cuisines
                </h3>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Tistra is designed to recognize everyday meals across cuisines — from Indian dal, rice, roti
                  and sabzi, to Singaporean hawker meals, Thai curries, Western breakfasts, snacks, drinks, and
                  home-cooked mixed plates. Because real meals are messy, users can quickly confirm or correct
                  the estimate before anything is saved.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Dashboard visual — a look at the actual product below the
            how-it-works steps, per request to show what the dashboard
            looks like once meals are logged. */}
        <section className="max-w-3xl mx-auto px-6 py-14">
          <Reveal>
            <div className="bg-[#6750A4] rounded-[2rem] p-6 md:p-10 text-white">
              <div className="bg-white text-gray-900 rounded-2xl p-6 shadow-2xl max-w-md mx-auto">
                <div className="flex justify-between items-center mb-5 border-b border-gray-100 pb-3">
                  <div>
                    <h3 className="font-bold text-[#4F378A] text-sm">Weekly Summary</h3>
                    <p className="text-xs text-gray-500">This week</p>
                  </div>
                  <div className="bg-[#F3EEFB] text-[#4F378A] px-3 py-1 rounded-full text-xs font-bold">14 DAY STREAK</div>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-5">
                  <div className="bg-gray-50 p-3 rounded-xl">
                    <span className="text-xs text-gray-500 block mb-1">Meal sharing</span>
                    <span className="text-lg font-bold text-[#4F378A]">5 of 7 days</span>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-xl">
                    <span className="text-xs text-gray-500 block mb-1">Meal balance</span>
                    <span className="text-lg font-bold text-gray-900">Improving</span>
                  </div>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl border-l-4 border-[#6750A4]">
                  <p className="italic text-gray-600 text-xs leading-relaxed">
                    Meals were more consistent this week, and your overall pattern is moving in a healthier
                    direction. Breakfast was lower in protein and variety, so the next focus is to make it
                    more complete.
                  </p>
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        {/* 4. One product demo block */}
        <section className="max-w-4xl mx-auto px-6 py-14">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
            <WhatsAppDemoBlock
              senderLine="Smoothie and toast for breakfast!"
              reply="Estimated: 22g protein · 430 kcal."
              confirmLine="Yes"
              confirmReply="Saved as breakfast."
            />
            <DashboardPreviewBlock
              heading="Today"
              lines={[
                "3 meals logged",
                "Meal balance improving",
                "Protein was low at breakfast",
                "Suggested next step: add more protein to breakfast tomorrow",
              ]}
            />
          </div>
        </section>

        {/* 5. Compact philosophy/privacy strip */}
        <section className="max-w-3xl mx-auto px-6 py-14 border-t border-gray-100 text-center">
          <Reveal>
            <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-2">
              No guilt. No complicated tracking.
            </h2>
          </Reveal>
          <Reveal delay={80}>
            <p className="text-gray-600 text-sm mb-6 max-w-xl mx-auto">
              Tistra looks at the overall pattern — regular meals, balanced plates, protein, and variety — not
              perfect meals. Your food data stays private and is only shared with people you allow.
            </p>
          </Reveal>
          <Reveal delay={120}>
            <div className="flex flex-wrap justify-center gap-6 text-xs font-medium text-gray-700">
              <span className="flex items-center gap-1.5"><span>📊</span> Pattern-based insights</span>
              <span className="flex items-center gap-1.5"><span>🔗</span> Permissioned sharing</span>
              <span className="flex items-center gap-1.5"><span>💬</span> No complicated app</span>
            </div>
          </Reveal>
        </section>

        {/* 6. Final CTA */}
        <section className="bg-gray-50 py-14">
          <Reveal>
            <div className="text-center max-w-2xl mx-auto px-6">
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-6">
                Start with the flow that fits you.
              </h2>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  href="/me"
                  className="bg-[#6750A4] hover:bg-[#4F378A] text-white px-6 py-3 rounded-full font-semibold transition-colors"
                >
                  Me →
                </Link>
                <Link
                  href="/family"
                  className="border-2 border-[#6750A4] text-[#4F378A] hover:bg-[#F3EEFB] px-6 py-3 rounded-full font-semibold transition-colors"
                >
                  Family →
                </Link>
                <Link
                  href="/coach"
                  className="border-2 border-[#6750A4] text-[#4F378A] hover:bg-[#F3EEFB] px-6 py-3 rounded-full font-semibold transition-colors"
                >
                  Coach →
                </Link>
                <Link
                  href="/my-progress"
                  className="border-2 border-[#6750A4] text-[#4F378A] hover:bg-[#F3EEFB] px-6 py-3 rounded-full font-semibold transition-colors"
                >
                  I was invited →
                </Link>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <MarketingFooter variant="home" />
    </div>
  );
}
