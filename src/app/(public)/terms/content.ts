export interface TermsBlock {
  type: "p" | "ul";
  text?: string;
  items?: string[];
}

export interface TermsSection {
  number: number;
  heading: string;
  blocks: TermsBlock[];
}

const p = (text: string): TermsBlock => ({ type: "p", text });
const ul = (items: string[]): TermsBlock => ({ type: "ul", items });

export const TERMS_SECTIONS: TermsSection[] = [
  {
    number: 1,
    heading: "What Tistra Health Does",
    blocks: [
      p("Tistra Health helps individuals, families, and coaches track meal updates through WhatsApp and view general nutrition patterns, summaries, and trends."),
      p("The Service may allow users to:"),
      ul([
        "Send meal photos or text updates through WhatsApp.",
        "View weekly summaries and nutrition-related trends.",
        "Track meal consistency, variety, balance, and general lifestyle patterns.",
        "Share access with family members, coaches, clients, or invited users.",
        "Receive general suggestions designed to support awareness and accountability.",
      ]),
      p("Tistra Health is designed to support nutrition awareness and habit tracking. It is not designed to replace professional judgment, medical care, dietetic advice, clinical nutrition advice, or medical treatment."),
    ],
  },
  {
    number: 2,
    heading: "Not Medical, Nutrition, or Healthcare Advice",
    blocks: [
      p("Tistra Health does not provide medical advice, nutrition therapy, diagnosis, treatment, or clinical recommendations."),
      p("The Service, including any AI-generated summaries, suggestions, trends, labels, messages, reports, or insights, is provided for general informational, tracking, and awareness purposes only."),
      p("You should not use Tistra Health to:"),
      ul([
        "Diagnose, treat, prevent, or manage any disease or medical condition.",
        "Make decisions about medication, supplements, fasting, diets, allergies, diabetes, hypertension, kidney disease, eating disorders, pregnancy, child nutrition, elder care, or any other health condition.",
        "Replace advice from a doctor, registered dietitian, qualified nutrition professional, therapist, trainer, or other qualified professional.",
        "Delay seeking professional medical care.",
      ]),
      p("For any questions about your health, diet, nutrition, medical condition, medication, symptoms, or treatment plan, you should speak to a qualified healthcare professional, doctor, registered dietitian, or appropriately licensed professional."),
      p("If you believe you may be experiencing a medical emergency, contact emergency services immediately."),
    ],
  },
  {
    number: 3,
    heading: "AI and Accuracy Limitations",
    blocks: [
      p("Tistra Health may use artificial intelligence and automated systems to interpret meal photos, text descriptions, and patterns."),
      p("You understand and agree that:"),
      ul([
        "AI-generated outputs may be incomplete, inaccurate, delayed, or misunderstood.",
        "Meal recognition from photos is approximate.",
        "Nutrition summaries are not laboratory measurements or clinical assessments.",
        "Tistra may not identify all ingredients, allergens, portion sizes, cooking methods, nutrients, or health risks.",
        "Suggestions may not be appropriate for every user, especially users with medical conditions or special dietary needs.",
      ]),
      p("You are responsible for reviewing all outputs carefully and using your own judgment. You should consult a qualified professional before acting on any health, nutrition, fitness, or lifestyle suggestion."),
    ],
  },
  {
    number: 4,
    heading: "Eligibility",
    blocks: [
      p("You must be at least 18 years old to create an account or purchase a subscription."),
      p("If you use the Service on behalf of another person, such as a parent, family member, client, or dependent, you confirm that:"),
      ul([
        "You have their consent or legal authority to do so.",
        "They understand what information will be shared.",
        "They agree to participate voluntarily.",
        "You will not use the Service to monitor, pressure, shame, or control another person.",
      ]),
      p("We may suspend or terminate accounts that we believe are being used without proper consent."),
    ],
  },
  {
    number: 5,
    heading: "Family and Caregiver Use",
    blocks: [
      p("The Family version of Tistra Health is intended to help families stay aware of general nutrition patterns for people they care about."),
      p("It is not a medical monitoring service, elder-care service, emergency response system, or substitute for regular check-ups."),
      p("If you are using the Service for a parent or family member, you are responsible for:"),
      ul([
        "Getting their consent.",
        "Ensuring they understand what data is being shared.",
        "Encouraging them to speak with a qualified professional for health or nutrition concerns.",
        "Not relying on Tistra Health as the only source of information about their wellbeing.",
      ]),
    ],
  },
  {
    number: 6,
    heading: "Coach and Professional Use",
    blocks: [
      p("If you are a coach, trainer, gym, wellness provider, or other professional using Tistra Health with clients, you are responsible for your own professional services."),
      p("You agree that:"),
      ul([
        "Tistra Health is a tracking and accountability tool only.",
        "Tistra does not supervise or verify your advice to clients.",
        "You must only provide advice within your qualifications, certifications, and legal permissions.",
        "You are responsible for getting your clients' informed consent before adding them to the Service.",
        "You must not present Tistra Health outputs as medical advice, diagnosis, or personalized clinical nutrition treatment.",
        "You must encourage clients to consult qualified professionals where appropriate.",
      ]),
      p("Tistra is not liable for advice, coaching, plans, recommendations, or services provided by coaches, gyms, trainers, or other third parties."),
    ],
  },
  {
    number: 7,
    heading: "WhatsApp Use",
    blocks: [
      p("Tistra Health may allow users to send meal updates and receive messages through WhatsApp."),
      p("By connecting a WhatsApp number, you confirm that:"),
      ul([
        "You own or have permission to use that number.",
        "You consent to receive Service-related messages from Tistra Health.",
        "You understand that WhatsApp is operated by Meta or its affiliates, not by Tistra.",
        "Your use of WhatsApp is also subject to WhatsApp's own terms, policies, and availability.",
      ]),
      p("Tistra is not responsible for WhatsApp outages, delays, message failures, device issues, telecom charges, or changes made by WhatsApp or Meta."),
      p("You may be able to disconnect your WhatsApp number or stop receiving messages through account settings, support, or available unsubscribe instructions."),
    ],
  },
  {
    number: 8,
    heading: "Accounts and Security",
    blocks: [
      p("You are responsible for maintaining the confidentiality of your account, login method, linked WhatsApp number, dashboard access, and any authentication links or codes."),
      p("You agree not to:"),
      ul([
        "Share account access with unauthorized users.",
        "Access another person's account without permission.",
        "Misrepresent your identity.",
        "Add another person's data without consent.",
        "Interfere with the Service or attempt to bypass security controls.",
      ]),
      p("You must notify us promptly if you believe your account has been compromised."),
    ],
  },
  {
    number: 9,
    heading: "User Content",
    blocks: [
      p("“User Content” means any information you submit to the Service, including meal photos, text descriptions, notes, WhatsApp messages, profile information, client information, family-member information, and related data."),
      p("You retain ownership of your User Content. However, you grant Tistra a limited permission to use, process, store, analyze, transmit, and display your User Content as necessary to provide, maintain, secure, improve, and support the Service."),
      p("You confirm that your User Content:"),
      ul([
        "Is accurate to the best of your knowledge.",
        "Does not violate another person's rights.",
        "Does not contain illegal, harmful, abusive, or misleading material.",
        "Is shared with appropriate consent where it relates to another person.",
      ]),
    ],
  },
  {
    number: 10,
    heading: "Privacy and Data",
    blocks: [
      p("Your use of the Service is also governed by our Privacy Policy."),
      p("We aim to handle nutrition and personal data responsibly. We do not sell your personal nutrition data or use it for third-party advertising."),
      p("Depending on where you and other users are located, privacy and data protection laws may give you certain rights over your personal data."),
      p("Before launch, Tistra should maintain a separate Privacy Policy covering:"),
      ul([
        "What data is collected.",
        "How meal photos and WhatsApp messages are processed.",
        "Who can view family or client data.",
        "How long data is retained.",
        "How users can delete or export data.",
        "Which subprocessors are used.",
        "Cross-border data transfers.",
        "Contact details for data requests.",
      ]),
    ],
  },
  {
    number: 11,
    heading: "Paid Plans, Trials, and Subscriptions",
    blocks: [
      p("Tistra Health may offer free plans, free trials, paid subscriptions, usage-based plans, family plans, coach plans, gym plans, add-on users, or other paid features."),
      p("Prices, billing periods, included features, limits, and currencies will be shown before purchase."),
      p("By purchasing a paid plan, you agree to pay all applicable fees, taxes, and charges shown at checkout."),
    ],
  },
  {
    number: 12,
    heading: "How Payments Are Processed",
    blocks: [
      p("Payments are processed through third-party payment processors, such as Stripe, Razorpay, PayPal, bank card networks, UPI providers, or other supported providers depending on your country and payment method."),
      p("When you make a payment, you may be asked to provide payment information directly to the payment processor. Tistra does not store your full card number or complete payment credentials on its own servers."),
      p("By purchasing a subscription, you authorize Tistra and its payment processors to charge your selected payment method for:"),
      ul([
        "The initial subscription fee.",
        "Recurring subscription fees.",
        "Add-on users or additional seats.",
        "Applicable taxes.",
        "Any other charges clearly shown before purchase.",
      ]),
      p("For recurring subscriptions, your payment method may be stored by the payment processor for future billing cycles."),
    ],
  },
  {
    number: 13,
    heading: "Auto-Renewal",
    blocks: [
      p("Unless stated otherwise at checkout, paid subscriptions renew automatically at the end of each billing period."),
      p("You authorize us and our payment processors to automatically charge your payment method at the start of each renewal period until you cancel."),
      p("You can cancel your subscription through your account settings, billing portal, or by contacting us at tistrahealth@gmail.com."),
      p("Cancellation will normally take effect at the end of the current billing period unless otherwise required by applicable law or stated in your plan."),
    ],
  },
  {
    number: 14,
    heading: "Free Trials",
    blocks: [
      p("Tistra may offer free trials or free starter plans."),
      p("If a free trial does not require a payment method, you will not be charged unless you later choose to subscribe."),
      p("If a free trial requires a payment method, we will clearly disclose whether the trial converts into a paid subscription. If it does, your payment method may be charged automatically when the trial ends unless you cancel before the trial expiry date."),
    ],
  },
  {
    number: 15,
    heading: "Failed Payments",
    blocks: [
      p("If a payment fails, we may:"),
      ul([
        "Notify you and ask you to update your payment method.",
        "Retry the payment through our payment processor.",
        "Suspend, downgrade, or limit access to paid features.",
        "Cancel your subscription if payment remains unpaid.",
      ]),
      p("We are not responsible for bank fees, card fees, overdraft charges, currency conversion fees, or charges imposed by your payment provider."),
    ],
  },
  {
    number: 16,
    heading: "Refunds",
    blocks: [
      p("Unless stated otherwise at checkout or required by applicable law, subscription fees are non-refundable."),
      p("We may, at our discretion, provide refunds, credits, or extensions in limited circumstances, such as duplicate billing, technical errors, or prolonged service failure."),
      p("No refund is guaranteed unless required by law."),
    ],
  },
  {
    number: 17,
    heading: "Price Changes",
    blocks: [
      p("We may change prices, plan limits, or included features from time to time."),
      p("For existing recurring subscriptions, we will make reasonable efforts to notify you before a material price increase takes effect. If you do not agree with the updated price, you may cancel before the next renewal."),
    ],
  },
  {
    number: 18,
    heading: "Taxes and Currency",
    blocks: [
      p("Prices may be shown in different currencies depending on your location, billing country, or selected payment method."),
      p("You are responsible for any applicable taxes, duties, GST, VAT, sales tax, withholding tax, foreign exchange charges, or bank fees, unless these are already included in the price shown at checkout."),
    ],
  },
  {
    number: 19,
    heading: "Acceptable Use",
    blocks: [
      p("You agree not to use Tistra Health to:"),
      ul([
        "Violate any law or regulation.",
        "Submit false, harmful, abusive, discriminatory, or illegal content.",
        "Track another person without consent.",
        "Provide medical, dietetic, or clinical services without appropriate qualifications.",
        "Upload images or content that you do not have the right to share.",
        "Reverse engineer, scrape, overload, or interfere with the Service.",
        "Attempt to access data belonging to another user.",
        "Use the Service for emergency monitoring or life-critical decisions.",
        "Misrepresent AI-generated outputs as professional medical advice.",
      ]),
    ],
  },
  {
    number: 20,
    heading: "Service Availability",
    blocks: [
      p("We aim to provide a reliable Service, but we do not guarantee that the Service will always be available, uninterrupted, secure, or error-free."),
      p("The Service may be affected by:"),
      ul([
        "Maintenance.",
        "Internet or telecom failures.",
        "WhatsApp or third-party platform outages.",
        "Payment processor issues.",
        "AI model errors.",
        "Bugs or security incidents.",
        "Events outside our reasonable control.",
      ]),
      p("We may modify, suspend, or discontinue parts of the Service at any time."),
    ],
  },
  {
    number: 21,
    heading: "Third-Party Services",
    blocks: [
      p("Tistra Health may rely on third-party services, including hosting providers, AI providers, analytics tools, WhatsApp or Meta services, payment processors, email providers, and other infrastructure providers."),
      p("Your use of third-party services may be subject to their separate terms and privacy policies."),
      p("Tistra is not responsible for third-party services that we do not control."),
    ],
  },
  {
    number: 22,
    heading: "Intellectual Property",
    blocks: [
      p("Tistra Health, including the website, dashboard, software, design, branding, logo, workflows, reports, templates, text, and underlying technology, is owned by or licensed to Tistra."),
      p("You may not copy, modify, distribute, sell, reverse engineer, or create derivative works from the Service except as allowed by law or with our written permission."),
    ],
  },
  {
    number: 23,
    heading: "Feedback",
    blocks: [
      p("If you provide feedback, suggestions, ideas, or feature requests, you allow Tistra to use them without restriction or compensation."),
    ],
  },
  {
    number: 24,
    heading: "Suspension and Termination",
    blocks: [
      p("We may suspend or terminate your account or access to the Service if:"),
      ul([
        "You breach these Terms.",
        "Payment fails.",
        "We believe your use creates legal, security, privacy, or safety risks.",
        "You misuse another person's data.",
        "You use the Service in a way that could harm Tistra, users, or third parties.",
      ]),
      p("You may stop using the Service at any time. You may also request account deletion through the available account tools or by contacting tistrahealth@gmail.com."),
    ],
  },
  {
    number: 25,
    heading: "Disclaimers",
    blocks: [
      p("The Service is provided on an “as is” and “as available” basis."),
      p("To the fullest extent permitted by law, Tistra disclaims all warranties, whether express, implied, statutory, or otherwise, including warranties of accuracy, reliability, fitness for a particular purpose, merchantability, non-infringement, availability, and suitability for health, medical, dietetic, or fitness purposes."),
      p("We do not warrant that:"),
      ul([
        "The Service will meet your expectations.",
        "Meal analysis will be accurate.",
        "Nutrition trends will be complete.",
        "Suggestions will be suitable for your personal circumstances.",
        "The Service will identify health risks, allergens, deficiencies, or medical concerns.",
        "The Service will be uninterrupted or error-free.",
      ]),
    ],
  },
  {
    number: 26,
    heading: "Limitation of Liability",
    blocks: [
      p("To the fullest extent permitted by law, Tistra will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, including loss of profits, loss of data, loss of goodwill, health-related outcomes, personal injury, business interruption, or reliance on Service outputs."),
      p("To the fullest extent permitted by law, Tistra's total liability for any claim arising from or relating to the Service will not exceed the amount you paid to Tistra in the three months before the event giving rise to the claim, or SGD 100, whichever is higher."),
      p("Nothing in these Terms excludes liability that cannot be excluded under applicable law."),
    ],
  },
  {
    number: 27,
    heading: "Indemnity",
    blocks: [
      p("You agree to indemnify and hold harmless Tistra, its directors, officers, employees, contractors, and affiliates from any claims, losses, liabilities, damages, costs, or expenses arising from:"),
      ul([
        "Your use of the Service.",
        "Your breach of these Terms.",
        "Your User Content.",
        "Your advice or services to clients.",
        "Your use of another person's data without consent.",
        "Your violation of law or third-party rights.",
      ]),
    ],
  },
  {
    number: 28,
    heading: "Changes to These Terms",
    blocks: [
      p("We may update these Terms from time to time."),
      p("If changes are material, we will make reasonable efforts to notify you through the website, dashboard, email, WhatsApp, or other appropriate channels."),
      p("Your continued use of the Service after updated Terms take effect means you accept the updated Terms."),
    ],
  },
  {
    number: 29,
    heading: "Governing Law and Disputes",
    blocks: [
      p("These Terms are governed by the laws of Singapore, unless applicable consumer protection laws require otherwise."),
      p("The courts of Singapore will have exclusive jurisdiction over disputes arising from or relating to these Terms or the Service, unless applicable law requires a different forum."),
    ],
  },
];
