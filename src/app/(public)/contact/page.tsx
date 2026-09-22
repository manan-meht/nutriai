import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHeader } from "@/components/home/MarketingHeader";
import { MarketingFooter } from "@/components/home/MarketingFooter";

export function generateMetadata(): Metadata {
  return {
    title: "Contact Us — Tistra Health",
    description: "How to reach Tistra Health about support, billing, privacy, or your account.",
    alternates: { canonical: "/contact" },
    icons: { icon: "/logos/logo-purple.png" },
  };
}

// Public contact page — no login required. Payment gateways require a
// reachable page carrying the registered entity name, address and a contact
// address before approving a merchant, and check it against the name on the
// account. A mailto link in the footer is not enough on its own.
//
// The entity and address here must stay identical to the ones in /terms and
// /refunds; a mismatch between them reads as a different business.
const SUPPORT_EMAIL = "tistrahealth@gmail.com";

const REASONS: Array<{ heading: string; body: React.ReactNode }> = [
  {
    heading: "Support and account help",
    body: (
      <>
        Something not working, a meal logged wrongly, or a question about how Tistra works. You can also send
        feedback from inside the app, under Account, or from our{" "}
        <Link href="/feedback" className="text-[#6750A4] hover:underline">
          feedback page
        </Link>
        .
      </>
    ),
  },
  {
    heading: "Billing, cancellations and refunds",
    body: (
      <>
        Questions about a charge, cancelling a plan, or requesting a refund. Our{" "}
        <Link href="/refunds" className="text-[#6750A4] hover:underline">
          refund and cancellation policy
        </Link>{" "}
        explains what we can do and how quickly.
      </>
    ),
  },
  {
    heading: "Privacy and your data",
    body: (
      <>
        Requests to access, correct, or delete your data. You can delete your account yourself from our{" "}
        <Link href="/delete-account" className="text-[#6750A4] hover:underline">
          account deletion page
        </Link>{" "}
        without contacting us, and our{" "}
        <Link href="/privacy" className="text-[#6750A4] hover:underline">
          privacy policy
        </Link>{" "}
        explains what we hold.
      </>
    ),
  },
];

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <MarketingHeader variant="home" />

      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">Contact us</h1>
        <p className="text-sm text-gray-500 mb-10">
          We are a small team and we read everything that comes in.
        </p>

        <section className="rounded-2xl border border-gray-200 p-6 md:p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Tistra Pte. Ltd.</h2>
          <div className="space-y-4 text-gray-700 leading-relaxed">
            <p>
              160 Robinson Road, #14-04 SBF Center
              <br />
              Singapore 068914
            </p>
            <p>
              Email:{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[#6750A4] hover:underline">
                {SUPPORT_EMAIL}
              </a>
            </p>
            <p className="text-sm text-gray-500">
              We reply within 3 business days, and usually sooner.
            </p>
          </div>
        </section>

        <div className="mt-12 space-y-8">
          <h2 className="text-xl md:text-2xl font-bold text-gray-900">What to write to us about</h2>
          {REASONS.map((reason) => (
            <section key={reason.heading}>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{reason.heading}</h3>
              <p className="text-gray-700 leading-relaxed">{reason.body}</p>
            </section>
          ))}
        </div>

        <div className="mt-12 rounded-2xl bg-gray-50 p-6 md:p-8">
          <h2 className="text-lg font-bold text-gray-900 mb-2">A note on health questions</h2>
          <p className="text-gray-700 leading-relaxed">
            Tistra gives general wellness information, not medical or dietary advice. We cannot answer
            questions about a medical condition, medication, or a prescribed diet — please speak to your doctor
            or a registered dietitian for those.
          </p>
        </div>
      </main>

      <MarketingFooter variant="home" />
    </div>
  );
}
