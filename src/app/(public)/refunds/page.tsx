import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHeader } from "@/components/home/MarketingHeader";
import { MarketingFooter } from "@/components/home/MarketingFooter";

export function generateMetadata(): Metadata {
  return {
    title: "Refund and Cancellation Policy — Tistra Health",
    description:
      "How to cancel a Tistra Health subscription, when cancellation takes effect, and when refunds are given.",
    alternates: { canonical: "/refunds" },
    icons: { icon: "/logos/logo-purple.png" },
  };
}

// Public policy page — no login required, same route group as /terms and
// /privacy. Payment gateways (Razorpay in particular) require a refund and
// cancellation policy reachable from the site before they will approve a
// subscription merchant, and check it against what the checkout actually
// does.
//
// Everything here restates sections 13-16 of the Terms rather than adding
// new commitments — a policy page that contradicts the Terms is worse than
// none. Keep the two in step if either changes.
const LAST_UPDATED = "September 22, 2026";

const SUPPORT_EMAIL = "tistrahealth@gmail.com";

export default function RefundsPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <MarketingHeader variant="home" />

      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
          Refund and Cancellation Policy
        </h1>
        <p className="text-sm text-gray-500 mb-10">Last updated: {LAST_UPDATED}</p>

        <div className="space-y-6 text-gray-700 leading-relaxed">
          <p>
            This policy explains how to cancel a Tistra Health subscription, when cancellation takes
            effect, and when we give refunds. It forms part of our{" "}
            <Link href="/terms" className="text-[#6750A4] hover:underline">
              Terms and Conditions
            </Link>
            .
          </p>
        </div>

        <div className="mt-12 space-y-12">
          <section className="scroll-mt-20">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-4">1. What you are buying</h2>
            <div className="space-y-4 text-gray-700 leading-relaxed">
              <p>
                Tistra Health is a subscription software service. You are buying access to our app, web
                dashboard, and WhatsApp-based meal logging for the period you pay for.
              </p>
              <p>
                There are no physical goods. Nothing is shipped or delivered by post, so no shipping or
                delivery policy applies. Access is granted immediately after a successful payment.
              </p>
            </div>
          </section>

          <section className="scroll-mt-20">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-4">2. Cancelling your subscription</h2>
            <div className="space-y-4 text-gray-700 leading-relaxed">
              <p>You can cancel at any time. There is no cancellation fee and no minimum term.</p>
              <p>How you cancel depends on where you subscribed:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <strong>Subscribed on our website:</strong> cancel from your account settings or the billing
                  portal, or email us at{" "}
                  <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[#6750A4] hover:underline">
                    {SUPPORT_EMAIL}
                  </a>{" "}
                  and we will cancel it for you.
                </li>
                <li>
                  <strong>Subscribed in our iPhone app:</strong> cancel in the App Store — Settings, your Apple
                  Account, then Subscriptions. Apple handles that billing, so we cannot cancel it for you.
                </li>
                <li>
                  <strong>Subscribed in our Android app:</strong> cancel in Google Play — Menu, then Payments and
                  subscriptions. Google handles that billing, so we cannot cancel it for you.
                </li>
              </ul>
              <p>
                Cancellation takes effect at the end of the billing period you have already paid for. You keep
                full access until then, and you are not charged again.
              </p>
            </div>
          </section>

          <section className="scroll-mt-20">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-4">3. Refunds</h2>
            <div className="space-y-4 text-gray-700 leading-relaxed">
              <p>
                Because cancelling stops all future charges and you keep access for the period you have paid
                for, subscription fees are generally non-refundable, unless applicable law requires otherwise.
              </p>
              <p>We do give refunds in these cases:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>You were charged more than once for the same period.</li>
                <li>You were charged after cancelling.</li>
                <li>A technical fault on our side prevented you from using the service for a prolonged period.</li>
                <li>A payment was made in error and you contact us within 7 days of the charge, before
                  meaningful use of the service.</li>
              </ul>
              <p>
                We may also give a refund, credit, or extension at our discretion in other circumstances. If you
                think you have been charged incorrectly, please contact us — we would rather fix it.
              </p>
            </div>
          </section>

          <section className="scroll-mt-20">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-4">4. How to request a refund</h2>
            <div className="space-y-4 text-gray-700 leading-relaxed">
              <p>
                Email{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[#6750A4] hover:underline">
                  {SUPPORT_EMAIL}
                </a>{" "}
                from the address on your account, telling us what was charged and why you are asking. You do not
                need a form or a reference number.
              </p>
              <p>
                We reply within 3 business days. Where a refund is approved, we process it within 5 to 7
                business days to the original payment method. How long it then takes to appear on your statement
                depends on your bank or card issuer.
              </p>
              <p>
                Purchases made inside our iPhone or Android apps are billed by Apple and Google, not by us, so
                refunds for those must be requested from Apple or Google directly. We will help you with that if
                you are unsure where to start.
              </p>
            </div>
          </section>

          <section className="scroll-mt-20">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-4">5. Free trials</h2>
            <div className="space-y-4 text-gray-700 leading-relaxed">
              <p>
                Where a free trial is offered, we say clearly at checkout whether it converts into a paid
                subscription. If it does, cancel before the trial ends and you will not be charged.
              </p>
            </div>
          </section>

          <section className="scroll-mt-20">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-4">6. Contact</h2>
            <div className="space-y-4 text-gray-700 leading-relaxed">
              <p>For anything about billing, cancellations, or refunds:</p>
              <p>
                Tistra Pte. Ltd.
                <br />
                160 Robinson Road, #14-04 SBF Center
                <br />
                Singapore 068914
                <br />
                Email:{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[#6750A4] hover:underline">
                  {SUPPORT_EMAIL}
                </a>
              </p>
              <p>
                Full contact details are on our{" "}
                <Link href="/contact" className="text-[#6750A4] hover:underline">
                  contact page
                </Link>
                .
              </p>
            </div>
          </section>
        </div>
      </main>

      <MarketingFooter variant="home" />
    </div>
  );
}
