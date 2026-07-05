import type { Metadata } from "next";
import { MarketingHeader } from "@/components/home/MarketingHeader";
import { MarketingFooter } from "@/components/home/MarketingFooter";
import { TERMS_SECTIONS } from "./content";

export function generateMetadata(): Metadata {
  return {
    title: "Terms and Conditions — Tistra Health",
    description: "Terms and Conditions for Tistra Health, operated by Tistra Pte. Ltd.",
    alternates: { canonical: "/terms" },
    icons: { icon: "/logos/logo-purple.png" },
  };
}

// Public legal page — no login required (this route sits under the
// unauthenticated (public) route group, same as /, /family, /coach,
// /me). Static, like the other 4 marketing pages.
export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <MarketingHeader variant="home" />

      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">Terms and Conditions</h1>
        <p className="text-sm text-gray-500 mb-1">Effective date: July 5, 2027</p>
        <p className="text-sm text-gray-500 mb-10">Last updated: July 5, 2027</p>

        <div className="space-y-6 text-gray-700 leading-relaxed">
          <p>
            Welcome to Tistra Health. These Terms and Conditions (&ldquo;Terms&rdquo;) govern your access to and use
            of the Tistra Health website, dashboard, WhatsApp-based meal logging tools, reports, summaries,
            subscriptions, and related services, collectively referred to as the &ldquo;Service&rdquo;.
          </p>
          <p>
            The Service is operated by Tistra Pte. Ltd., a company incorporated in Singapore (&ldquo;Tistra&rdquo;,
            &ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;).
          </p>
          <p>
            By accessing or using the Service, creating an account, connecting a WhatsApp number, submitting meal
            updates, inviting family members or clients, or purchasing a subscription, you agree to these Terms. If
            you do not agree, please do not use the Service.
          </p>
        </div>

        <div className="mt-12 space-y-12">
          {TERMS_SECTIONS.map((section) => (
            <section key={section.number} id={`section-${section.number}`} className="scroll-mt-20">
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-4">
                {section.number}. {section.heading}
              </h2>
              <div className="space-y-4 text-gray-700 leading-relaxed">
                {section.blocks.map((block, i) =>
                  block.type === "p" ? (
                    <p key={i}>{block.text}</p>
                  ) : (
                    <ul key={i} className="list-disc pl-6 space-y-2">
                      {block.items!.map((item, j) => (
                        <li key={j}>{item}</li>
                      ))}
                    </ul>
                  )
                )}
              </div>
            </section>
          ))}

          <section className="scroll-mt-20">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-4">30. Contact</h2>
            <div className="space-y-4 text-gray-700 leading-relaxed">
              <p>
                For questions about these Terms, payments, subscriptions, cancellations, or account issues, contact
                us at:
              </p>
              <p>
                Tistra Pte. Ltd.
                <br />
                160 Robinson Road, #14-04 SBF Center
                <br />
                Singapore 068914
                <br />
                Email:{" "}
                <a href="mailto:tistrahealth@gmail.com" className="text-[#6750A4] hover:underline">
                  tistrahealth@gmail.com
                </a>
              </p>
            </div>
          </section>
        </div>
      </main>

      <MarketingFooter variant="home" />
    </div>
  );
}
