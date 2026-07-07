import Link from "next/link";

export type AddUserVariant = "family" | "coach" | "self";

interface AddUserStep {
  title: string;
  body: string;
}

interface AddUserContent {
  eyebrow: string;
  headline: string;
  intro: string;
  steps: AddUserStep[];
  privacyNote: string;
  imagePlaceholder: { alt: string; caption: string };
}

const CONTENT: Record<AddUserVariant, AddUserContent> = {
  family: {
    eyebrow: "Getting set up",
    headline: "How adding a parent works",
    intro: "Adding your parent or family member takes less than a minute — and they stay in control the whole time.",
    steps: [
      { title: "Enter their name and WhatsApp number", body: "You add your parent or family member's name and WhatsApp number from your dashboard." },
      { title: "They receive a WhatsApp invite", body: "Tistra sends them a friendly WhatsApp message explaining what's being set up and why." },
      { title: "They confirm and choose what to share", body: "They accept the invite and decide what they're comfortable sharing — like meal photos, or just short descriptions." },
      { title: "They start sending meals", body: "Once accepted, they can send a photo or a quick description whenever they eat — right on WhatsApp." },
      { title: "You see what they've allowed", body: "You'll only see the summaries and insights they've agreed to share — never more than that." },
    ],
    privacyNote: "Your family member is always in control of what they share. Nothing is visible to you until they accept the invite and choose their own sharing preferences.",
    imagePlaceholder: {
      alt: "A parent receiving a Tistra Health invite on WhatsApp",
      caption: "Parent receiving a WhatsApp invite",
    },
  },
  coach: {
    eyebrow: "Getting set up",
    headline: "How to invite clients",
    intro: "Inviting a client is quick, and they stay in control of what they share with you.",
    steps: [
      { title: "Add their name and WhatsApp number", body: "Enter your client's details from your coach dashboard." },
      { title: "They receive a WhatsApp invite", body: "Tistra sends them a message explaining how to get started — no app for them to download." },
      { title: "They accept and start logging", body: "Once they accept, they can send a meal photo or a quick description anytime." },
      { title: "You see their progress", body: "Their meals and weekly trends show up automatically in your coach dashboard." },
      { title: "They control their own sharing", body: "Clients stay in control of their consent and what they choose to share with you." },
    ],
    privacyNote: "Clients must accept your invite before any of their data appears in your dashboard. Tistra never adds someone without their confirmation.",
    imagePlaceholder: {
      alt: "A coach dashboard showing invited clients",
      caption: "Coach dashboard with invited clients",
    },
  },
  self: {
    eyebrow: "Getting set up",
    headline: "How to set up your own tracking",
    intro: "Getting started only takes a minute, and it's just for you.",
    steps: [
      { title: "Confirm your WhatsApp number", body: "Add or confirm the number you'll use to send your meals." },
      { title: "Tistra connects your tracking", body: "We link your WhatsApp so you can start sending updates right away — no app to install." },
      { title: "Send your first meal", body: "Whenever you eat, send a quick photo or describe what you had." },
      { title: "See your own trends build up", body: "Your own weekly summaries and gentle suggestions build up over time, just for you." },
    ],
    privacyNote: "Your tracking is private by default. Nothing about what you eat is shared with anyone unless you explicitly choose to share it.",
    imagePlaceholder: {
      alt: "A person sending a meal photo through WhatsApp",
      caption: "Sending a meal photo on WhatsApp",
    },
  },
};

interface AddUserExplainerProps {
  variant: AddUserVariant;
  ctaHref: string;
  ctaLabel: string;
}

// Explains the setup/invite step (getting someone added) — kept visually
// distinct from the existing 3-step "how meal tracking works" section
// (numbered circles + full-bleed photo) via a bordered card list with a
// separate eyebrow label, so the two "three-ish step" sections are never
// confused for each other.
export function AddUserExplainer({ variant, ctaHref, ctaLabel }: AddUserExplainerProps) {
  const content = CONTENT[variant];

  return (
    <section className="py-20 px-6 bg-white border-t border-gray-100">
      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
        <div>
          <p className="text-xs font-semibold text-[#6750A4] uppercase tracking-widest mb-3">{content.eyebrow}</p>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">{content.headline}</h2>
          <p className="text-gray-600 mb-8 leading-relaxed">{content.intro}</p>

          <ol className="space-y-5 mb-8">
            {content.steps.map((step, i) => (
              <li key={step.title} className="flex gap-4 rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[#6750A4] text-white text-xs font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <div>
                  <p className="font-semibold text-gray-900 text-sm mb-0.5">{step.title}</p>
                  <p className="text-gray-600 text-sm leading-relaxed">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="rounded-2xl bg-[#F3EEFB] border border-[#E9DDFF] px-4 py-3 mb-8">
            <p className="text-sm text-gray-700 leading-relaxed">🔒 {content.privacyNote}</p>
          </div>

          <Link
            href={ctaHref}
            className="inline-block bg-[#6750A4] hover:bg-[#4F378A] text-white px-8 py-4 rounded-full font-semibold transition-colors"
          >
            {ctaLabel}
          </Link>
        </div>

        <div className="rounded-3xl border border-dashed border-gray-200 bg-gray-50 aspect-[4/3] flex flex-col items-center justify-center text-center p-8">
          <span className="text-3xl mb-3">🖼️</span>
          <p className="text-sm font-medium text-gray-500">{content.imagePlaceholder.caption}</p>
          <p className="text-xs text-gray-400 mt-1">Image placeholder — see setup notes</p>
        </div>
      </div>
    </section>
  );
}
