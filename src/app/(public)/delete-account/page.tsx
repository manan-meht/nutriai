import type { Metadata } from "next";
import { MarketingHeader } from "@/components/home/MarketingHeader";
import { MarketingFooter } from "@/components/home/MarketingFooter";

export function generateMetadata(): Metadata {
  return {
    title: "Delete Your Account — Tistra Health",
    description: "How to request deletion of your Tistra Health account and data.",
    alternates: { canonical: "/delete-account" },
    icons: { icon: "/logos/logo-purple.png" },
  };
}

// Public, no-login-required page satisfying Google Play's account-deletion
// requirement (Play Console → App content → Data deletion) — this needs
// its own dedicated URL distinct from the privacy policy, reachable
// without signing in, per Play's policy. Mirrors /privacy and /terms:
// same route group, same static marketing-page treatment.
export default function DeleteAccountPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <MarketingHeader variant="home" />

      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">Delete Your Tistra Health Account</h1>
        <p className="text-sm text-gray-500 mb-10">
          How to request deletion of your Tistra Health account and the data associated with it.
        </p>

        <div className="space-y-6 text-gray-700 leading-relaxed">
          <p>
            You can request deletion of your Tistra Health account and associated data at any time, whether or not
            you still have the app installed.
          </p>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">How to request deletion of your Tistra Health account</h2>
            <ol className="list-decimal pl-6 space-y-3">
              <li>
                Email{" "}
                <a href="mailto:tistrahealth@gmail.com?subject=Account%20deletion%20request" className="text-[#6750A4] hover:underline">
                  tistrahealth@gmail.com
                </a>{" "}
                with the subject line &ldquo;Account deletion request&rdquo;.
              </li>
              <li>Include the phone number or email address you signed up with, so we can locate your account.</li>
              <li>We will reply to confirm your identity and the account to be deleted.</li>
              <li>
                Once confirmed, we process the deletion and send a final confirmation email — see{" "}
                <a href="#timeframe" className="text-[#6750A4] hover:underline">
                  Timeframe
                </a>{" "}
                below.
              </li>
            </ol>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">What gets deleted</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Your account and login credentials</li>
              <li>Profile information (name, contact details, health/nutrition profile fields)</li>
              <li>Meal photos, messages, and AI-generated meal classifications</li>
              <li>Dashboard history, Food Balance Score data, and recommendations</li>
              <li>Family/coach sharing relationships tied to your account</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">What we may retain, and why</h2>
            <p>We retain a limited amount of data even after a deletion request, only where required:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>
                <strong>Billing and transaction records</strong> — retained for up to 7 years, to meet accounting
                and tax record-keeping obligations in the jurisdictions we operate in.
              </li>
              <li>
                <strong>Records tied to an active dispute or investigation</strong> — retained only until that
                matter is resolved.
              </li>
            </ul>
            <p className="mt-2">
              This retained data is used only for the legal/accounting purpose it&apos;s kept for — never for
              marketing, product improvement, or any other purpose — and is deleted once the retention period ends.
              See our{" "}
              <a href="/terms" className="text-[#6750A4] hover:underline">
                Terms and Conditions
              </a>{" "}
              for more.
            </p>
          </section>

          <section id="timeframe">
            <h2 className="text-xl font-bold text-gray-900 mb-3">Timeframe</h2>
            <p>
              We confirm deletion requests within 5 business days and complete deletion within 30 days of
              confirming your identity. See our{" "}
              <a href="/privacy" className="text-[#6750A4] hover:underline">
                Privacy Policy
              </a>{" "}
              for more on how we handle your data.
            </p>
          </section>
        </div>
      </main>

      <MarketingFooter variant="home" />
    </div>
  );
}
