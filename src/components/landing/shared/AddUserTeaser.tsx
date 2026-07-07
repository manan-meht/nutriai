import Link from "next/link";
import type { AddUserVariant } from "./AddUserExplainer";

const TEASER_COPY: Record<AddUserVariant, { question: string; link: string }> = {
  family: {
    question: "Wondering how adding a parent or family member actually works?",
    link: "See how adding a parent works",
  },
  coach: {
    question: "Wondering how inviting a client actually works?",
    link: "See how inviting a client works",
  },
  self: {
    question: "Wondering how setting up your own tracking actually works?",
    link: "See how setup works",
  },
};

interface AddUserTeaserProps {
  variant: AddUserVariant;
  href: string;
}

// A short, low-key link — not the full explainer — placed right after the
// "how meal tracking works" section. The full walkthrough (steps,
// privacy note, image, CTA) lives on its own dedicated page; this just
// points there so the two "how it works" stories don't blur together.
export function AddUserTeaser({ variant, href }: AddUserTeaserProps) {
  const copy = TEASER_COPY[variant];

  return (
    <div className="py-8 px-6 bg-gray-50 text-center border-t border-gray-100">
      <p className="text-sm text-gray-500 mb-1">{copy.question}</p>
      <Link href={href} className="text-sm font-semibold text-[#6750A4] hover:text-[#4F378A] underline underline-offset-2">
        {copy.link} →
      </Link>
    </div>
  );
}
