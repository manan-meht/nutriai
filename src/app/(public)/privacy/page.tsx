import type { Metadata } from "next";
import { MarketingHeader } from "@/components/home/MarketingHeader";
import { MarketingFooter } from "@/components/home/MarketingFooter";
import { PRIVACY_SECTIONS } from "./content";

export function generateMetadata(): Metadata {
  return {
    title: "Privacy Policy — Tistra Health",
    description: "How Tistra Health collects, uses, and protects your data.",
    alternates: { canonical: "/privacy" },
    icons: { icon: "/logos/logo-purple.png" },
  };
}

// Public legal page — no login required, same route group as /terms.
// Written to be clear and responsible, not a final lawyer-approved policy —
// intended to be legally reviewed before launch.
export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <MarketingHeader variant="home" />

      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-10">
          This policy explains, in plain language, what data Tistra Health collects and how it&apos;s used.
        </p>

        <div className="space-y-6 text-gray-700 leading-relaxed">
          <p>
            Tistra Health (&ldquo;Tistra&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) is
            operated by Tistra Pte. Ltd., a company incorporated in Singapore. This Privacy Policy describes how we
            collect, use, and protect data when you use our website, dashboard, and WhatsApp-based meal logging
            tools (the &ldquo;Service&rdquo;).
          </p>
          <p>
            We built Tistra around a simple principle: meals are personal, sharing should be a choice, and the
            people we track — especially parents and older family members — deserve dignity, not surveillance.
          </p>
        </div>

        <div className="mt-12 space-y-12">
          {PRIVACY_SECTIONS.map((section) => (
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
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-4">12. Contact</h2>
            <div className="space-y-4 text-gray-700 leading-relaxed">
              <p>For questions about this Privacy Policy, or to request data deletion or export, contact us at:</p>
              <p>
                Tistra Pte. Ltd.
                <br />
                160 Robinson Road, #14-04 SBF Center
                <br />
                Singapore 068914
                <br />
                Email:{" "}
                {/* TODO: privacy@tistrahealth.com is not yet a configured mailbox — swap for
                    the real privacy contact address once one exists, or keep routing to
                    the existing support inbox below if that's the intended long-term setup. */}
                <a href="mailto:privacy@tistrahealth.com" className="text-[#6750A4] hover:underline">
                  privacy@tistrahealth.com
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
