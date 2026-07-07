import Image from "next/image";
import Link from "next/link";
import { MarketingHeader } from "./MarketingHeader";
import { MarketingFooter } from "./MarketingFooter";
import { Reveal } from "@/components/motion/Reveal";

interface UseCaseCard {
  href: string;
  icon: string;
  title: string;
  description: string;
  cta: string;
}

const USE_CASES: UseCaseCard[] = [
  {
    href: "/me",
    icon: "🙋",
    title: "For Me",
    description:
      "Build awareness without calorie counting. Share meals on WhatsApp and see simple patterns around protein, fiber, meal consistency, and healthier habits.",
    cta: "Get Started →",
  },
  {
    href: "/family",
    icon: "👨‍👩‍👧",
    title: "For Family",
    description:
      "Support aging parents through simple WhatsApp meal updates. Stay connected to food and habit patterns without making your parent feel watched or judged.",
    cta: "Support a family member →",
  },
  {
    href: "/coach",
    icon: "🏋️",
    title: "For Coaches",
    description:
      "See which clients need a nutrition check-in this week. Turn low-effort meal updates into client flags, weekly patterns, and simple coaching prompts.",
    cta: "Grow your roster →",
  },
];

const HOW_IT_WORKS = [
  {
    step: 1,
    title: "Connect WhatsApp",
    description: "Add a number. Simply send 1 message to link your profile. No app download required.",
  },
  {
    step: 2,
    title: "Send meal updates",
    description:
      'Whenever you, your family, or client eat, simply snap a quick photo. Or, type a short text line. Ex. Dal and roti for lunch.',
  },
  {
    step: 3,
    title: "See weekly trends",
    description: "Get a comprehensive summary tracking nutritional balance, variety, and lifestyle insights.",
  },
];

const WHY_WHATSAPP = [
  "Zero calorie scoreboards or rigid metrics",
  "No complicated apps to learn or sign into",
  "Effortless for parents and older adults to use",
  "Simple for busy individuals to stay consistent",
  "High adherence rates for coaching clients",
];

export function MasterHome({ homeHref }: { homeHref: string }) {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <MarketingHeader variant="home" homeHref={homeHref} />

      <main>
        {/* Hero */}
        <section className="max-w-6xl mx-auto px-6 py-16 md:py-24 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <Reveal direction="right">
            <div className="flex flex-col gap-6">
              <h1 className="text-3xl md:text-5xl font-bold leading-tight text-gray-900">
                Nutrition accountability, simplified on WhatsApp
              </h1>
              <p className="text-lg text-gray-600 max-w-xl">
                Whether for yourself, your global family, or coaching fitness clients, Tistra turns simple meal
                updates into clear weekly trends and nutrition suggestions.
              </p>
              <p className="text-sm text-gray-500 max-w-xl">
                Zero stress, zero calorie scoreboards, and no new app to learn.
              </p>
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
                        src="/landing/gym/immersive/meals/dal-rice-sabzi.jpeg"
                        alt="A plate of dal and roti for lunch"
                        width={320}
                        height={200}
                        className="w-full h-32 object-cover"
                      />
                    </div>
                    <div className="bg-green-100 rounded-2xl rounded-tr-none p-3">
                      <p className="text-sm">Dal and roti for lunch!</p>
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
                  Protein appeared more often this week. Next focus: add protein to breakfast.
                </p>
              </div>
            </div>
          </Reveal>
        </section>

        {/* Use case cards */}
        <section id="pick-product" className="max-w-6xl mx-auto px-6 py-16 scroll-mt-20">
          <Reveal>
            <div className="text-center mb-12">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
                Choose how you want to use Tistra Health.
              </h2>
              <p className="text-gray-600 max-w-2xl mx-auto">
                Tailored for independent tracking, global family care, or professional fitness coaching.
              </p>
            </div>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {USE_CASES.map((useCase, i) => (
              <Reveal key={useCase.href} delay={i * 100}>
                <div className="group bg-white border border-gray-200 hover:border-[#6750A4] hover:shadow-xl transition-all rounded-3xl p-8 flex flex-col h-full">
                  <div className="w-14 h-14 rounded-2xl bg-[#F3EEFB] flex items-center justify-center text-2xl mb-6">
                    {useCase.icon}
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">{useCase.title}</h3>
                  <p className="text-gray-600 mb-8 flex-grow">{useCase.description}</p>
                  <Link
                    href={useCase.href}
                    className="w-full text-center py-3.5 px-6 border-2 border-[#6750A4] text-[#4F378A] font-semibold rounded-full hover:bg-[#6750A4] hover:text-white transition-all"
                  >
                    {useCase.cta}
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Food philosophy */}
        <section className="max-w-4xl mx-auto px-6 py-16 text-center">
          <Reveal>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-5">
              No good food. No bad food. Just patterns.
            </h2>
          </Reveal>
          <Reveal delay={100}>
            <p className="text-gray-600 text-lg leading-relaxed max-w-2xl mx-auto">
              Tistra does not label meals as good or bad. A sweet, samosa, biryani, or paratha can all fit into
              real life. We look at the overall pattern: protein, fiber, regular meals, and whether your week is
              moving in a healthier direction.
            </p>
          </Reveal>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="bg-gray-50 py-20 scroll-mt-20">
          <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <Reveal direction="right">
              <div>
                <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-10">Three steps to better nutrition.</h2>
                <div className="space-y-8">
                  {HOW_IT_WORKS.map((item) => (
                    <div key={item.step} className="flex gap-5">
                      <div className="flex-shrink-0 w-11 h-11 bg-[#6750A4] text-white rounded-full flex items-center justify-center font-bold">
                        {item.step}
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900 mb-1">{item.title}</h4>
                        <p className="text-gray-600">{item.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
            <Reveal direction="left" delay={100}>
              <div className="flex flex-col gap-6">
                <div className="rounded-3xl overflow-hidden shadow-lg">
                  <Image
                    src="/marketing/hero-people.png"
                    alt="A woman, an older man, and a fitness client each using Tistra Health on WhatsApp"
                    width={800}
                    height={600}
                    className="w-full h-64 object-cover"
                  />
                </div>
                <div className="bg-white border border-gray-200 rounded-3xl p-8">
                  <h4 className="font-bold text-gray-900 mb-4">Why WhatsApp-first?</h4>
                  <ul className="space-y-3">
                    {WHY_WHATSAPP.map((reason) => (
                      <li key={reason} className="flex items-center gap-3 text-gray-700">
                        <span className="text-[#6750A4]">✓</span>
                        {reason}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Dashboard preview */}
        <section className="max-w-6xl mx-auto px-6 py-20">
          <Reveal>
            <div className="bg-[#6750A4] rounded-[2.5rem] p-10 md:p-16 text-white grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
              <div className="flex flex-col gap-5">
                <h2 className="text-2xl md:text-3xl font-bold">A simple dashboard that actually makes sense.</h2>
                <ul className="space-y-3">
                  <li className="flex items-center gap-3">
                    <span>✓</span> No complicated graphs or calorie maps
                  </li>
                  <li className="flex items-center gap-3">
                    <span>✓</span> Clear logging streaks to keep you motivated
                  </li>
                  <li className="flex items-center gap-3">
                    <span>✓</span> Automated nutrition consistency tracking
                  </li>
                </ul>
              </div>
              <div className="bg-white text-gray-900 rounded-3xl p-7 shadow-2xl">
                <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
                  <div>
                    <h3 className="font-bold text-[#4F378A]">Weekly Summary</h3>
                    <p className="text-xs text-gray-500">This week</p>
                  </div>
                  <div className="bg-[#F3EEFB] text-[#4F378A] px-3 py-1 rounded-full text-xs font-bold">14 DAY STREAK</div>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-gray-50 p-4 rounded-2xl">
                    <span className="text-xs text-gray-500 block mb-1">Meal sharing</span>
                    <span className="text-xl font-bold text-[#4F378A]">5 of 7 days</span>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-2xl">
                    <span className="text-xs text-gray-500 block mb-1">Protein anchors</span>
                    <span className="text-xl font-bold text-gray-900">Improving</span>
                  </div>
                </div>
                <div className="p-5 bg-gray-50 rounded-2xl border-l-4 border-[#6750A4]">
                  <p className="italic text-gray-600 text-sm leading-relaxed">
                    Protein appeared more often this week, and meals are moving in a healthier direction. Next
                    focus: add protein to breakfast.
                  </p>
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        {/* Sample weekly report */}
        <section className="max-w-5xl mx-auto px-6 py-20">
          <Reveal>
            <div className="text-center mb-12">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
                Simple weekly patterns, not calorie reports
              </h2>
              <p className="text-gray-600 max-w-xl mx-auto">
                Tistra turns meal updates into small, practical next steps. No calorie counting. No food guilt.
              </p>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <div className="bg-white border border-gray-200 rounded-3xl p-8 md:p-10 shadow-sm max-w-2xl mx-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                {[
                  { label: "Protein anchors", value: "9 of 14 meals", mood: "good" },
                  { label: "Balanced plates", value: "6 of 14 meals", mood: "steady" },
                  { label: "Meal sharing", value: "5 of 7 days", mood: "good" },
                  { label: "Moving in a healthier direction", value: "Yes", mood: "good" },
                ].map((item) => (
                  <div
                    key={item.label}
                    className={`rounded-2xl p-4 ${item.mood === "good" ? "bg-green-50" : "bg-amber-50"}`}
                  >
                    <span className="text-xs text-gray-500 block mb-1">{item.label}</span>
                    <span className={`text-lg font-bold ${item.mood === "good" ? "text-green-700" : "text-amber-700"}`}>
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
              <div className="p-5 bg-[#F3EEFB] rounded-2xl border-l-4 border-[#6750A4]">
                <p className="text-xs font-semibold text-[#4F378A] uppercase tracking-widest mb-1">Next step</p>
                <p className="text-gray-700 text-sm leading-relaxed">Add protein to breakfast twice this week.</p>
              </div>
            </div>
          </Reveal>
        </section>

        {/* Privacy & trust */}
        <section className="max-w-6xl mx-auto px-6 py-20 border-t border-gray-100">
          <Reveal>
            <div className="flex flex-col md:flex-row justify-between items-center gap-10">
              <div className="max-w-xl">
                <h2 className="text-xl font-bold text-gray-900 mb-3">Your nutrition data stays private.</h2>
                <p className="text-gray-600">
                  We believe what you eat is personal. You explicitly control who sees your trends. Your data is
                  never sold, shared, or used for ads.
                </p>
              </div>
              <div className="flex gap-8">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center text-xl">🔒</div>
                  <span className="text-xs font-medium text-gray-700">Private by default</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center text-xl">🔗</div>
                  <span className="text-xs font-medium text-gray-700">Permissioned sharing</span>
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        {/* Final CTA */}
        <section className="bg-gray-50 py-20">
          <Reveal>
            <div className="text-center max-w-3xl mx-auto px-6">
              <h2 className="text-2xl md:text-4xl font-bold text-gray-900 mb-4">
                Ready to start tracking without the friction?
              </h2>
              <p className="text-gray-600 mb-10">Join people using WhatsApp to improve their relationship with food.</p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  href="/me"
                  className="bg-[#6750A4] hover:bg-[#4F378A] text-white px-8 py-4 rounded-full font-semibold transition-colors"
                >
                  Get Started →
                </Link>
                <Link
                  href="/family"
                  className="border-2 border-[#6750A4] text-[#4F378A] hover:bg-[#F3EEFB] px-8 py-4 rounded-full font-semibold transition-colors"
                >
                  Support a family member →
                </Link>
                <Link
                  href="/coach"
                  className="border-2 border-[#6750A4] text-[#4F378A] hover:bg-[#F3EEFB] px-8 py-4 rounded-full font-semibold transition-colors"
                >
                  Grow your roster →
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
