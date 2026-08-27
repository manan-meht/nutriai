import Link from "next/link";
import { cookies, headers } from "next/headers";
import { GOOGLE_ADS_ID } from "@/components/marketing/GoogleAdsTag";
import { CONSENT_COOKIE, consentRequiredFor, parseConsent } from "@/lib/privacy/consent";
import { userDataScript } from "@/lib/privacy/enhanced-conversions";
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCoachProfile } from "@/lib/club/coach-queries";
import { CoachShell } from "@/components/coach/CoachShell";
import { CLUB_TOKENS as T } from "@/components/coach/tokens";
import { CLUB_CANONICAL_ORIGIN } from "@/lib/club/host";

// Shown once, immediately after a coach publishes their profile.
//
// It exists for two reasons. Publishing used to happen silently in place —
// a button changed label and nothing else — which is a poor moment for the
// one thing a coach has been working towards. And the Google Ads
// conversion needs a page of its own: putting the tag on /settings would
// count a conversion every time a coach opened their settings, quietly
// inflating the campaign's numbers with people who converted weeks ago.
//
// Reached only by the redirect in PublishSection. Anyone arriving here
// whose profile is not actually live is sent back, so the tag cannot fire
// on a page load that did not follow a real publish.

export const dynamic = "force-dynamic";

/** The conversion label from Google Ads, the part after the slash in
 * "<GOOGLE_ADS_ID>/<label>" (Goals -> Conversions -> the action ->
 * "Install the tag yourself").
 *
 * This action is event-based, not URL-based. The earlier URL-based setup
 * never reported anything: Google Ads shows a conversion action as
 * unconnected until it actually RECEIVES a conversion, and an event with
 * no label is silently dropped. Firing the labelled event is what makes
 * the action go live.
 *
 * Publishing still navigates with a full page load rather than
 * router.push — a client-side route change would not run this script. */
const CONVERSION_LABEL = "3TrvCLHh6uUcENLH38dE";

/** Value Google Ads attributes to one coach signup. Reported so the
 * campaign optimises on a conversion worth something rather than a bare
 * count; SGD to match the Ads account's currency. */
const CONVERSION_VALUE = 1.0;
const CONVERSION_CURRENCY = "SGD";

export const metadata = {
  title: "Your profile is live | Tistra Coach",
  robots: { index: false, follow: false },
};

export default async function CoachPublishedPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?product=coach");

  const admin = createServiceClient();
  const profile = await getCoachProfile(admin, user.id);
  if (!profile) redirect("/settings");
  // Not live: either they never published, or they have since paused. Either
  // way this is not a conversion and the tag must not load.
  if (profile.status !== "published") redirect("/settings");

  const publicUrl = `${CLUB_CANONICAL_ORIGIN}/coaches/${profile.id}`;

  // Enhanced conversions, gated on the same signal as ad_user_data. An EEA
  // visitor who has not accepted gets no user_data block emitted at all —
  // not a denied one, none — so there is nothing for the tag to send even
  // if Consent Mode were misconfigured.
  const country = (await headers()).get("cf-ipcountry");
  const stored = parseConsent((await cookies()).get(CONSENT_COOKIE)?.value);
  const userData = userDataScript(user.email, {
    required: consentRequiredFor(country),
    stored,
  });

  return (
    <CoachShell active="settings" coachName={profile.displayName} photoUrl={profile.photoUrl}>
      {/* The conversion itself. Separate from the base tag above, because
          loading gtag is not a conversion — this is the line that reports
          one, and it needs the conversion LABEL from Google Ads appended to
          the account id. Until CONVERSION_LABEL is filled in it stays
          inert rather than reporting an unlabelled event Google would
          silently drop. */}
      {/* The conversion itself. Separate from the base tag, because loading
          gtag is not a conversion — this is the line that reports one, and
          it needs the conversion LABEL appended to the account id.

          Plain <script>, not next/script, for the same reason as the base
          tag: this runs during parse rather than waiting on hydration.

          It re-declares the dataLayer queue instead of assuming the base
          tag's gtag already exists. React hoists scripts into the head,
          and this one must not depend on landing after the base tag: if it
          ran first, gtag would be undefined and the conversion lost
          silently. Pushing to dataLayer is order-independent — gtag.js
          drains whatever it finds queued when it loads.

          Guarded on the label so an unlabelled event — which Google drops
          silently, looking exactly like success — can never be sent. */}
      {CONVERSION_LABEL && (
        <script
          id="google-ads-coach-signup-conversion"
          dangerouslySetInnerHTML={{
            __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
${userData}gtag('event', 'conversion', {`
              + `'send_to': '${GOOGLE_ADS_ID}/${CONVERSION_LABEL}',`
              + `'value': ${CONVERSION_VALUE},`
              + `'currency': '${CONVERSION_CURRENCY}'});`,
          }}
        />
      )}

      <section
        className="mx-auto max-w-xl rounded-2xl border p-8 text-center"
        style={{ backgroundColor: T.surfaceContainerLowest, borderColor: T.outlineVariant }}
      >
        <p className="text-4xl" aria-hidden="true">🎉</p>
        <h1 className="mt-4 text-2xl font-semibold tracking-[-0.01em]">Your profile is live</h1>
        <p className="mt-3 text-[15px] leading-7" style={{ color: T.onSurfaceVariant }}>
          Clients searching your skills can now find you and book a session. Payments go
          straight to your Stripe account, and you&rsquo;ll get an email for every booking.
        </p>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full px-6 py-3 text-[15px] font-medium"
            style={{ backgroundColor: T.primary, color: T.onPrimary }}
          >
            View my public profile
          </a>
          <Link
            href="/settings"
            className="rounded-full border px-6 py-3 text-[15px] font-medium"
            style={{ borderColor: T.outlineVariant, color: T.onSurface }}
          >
            Back to settings
          </Link>
        </div>

        <p className="mt-6 text-[13px]" style={{ color: T.onSurfaceVariant }}>
          Share your profile link anywhere — clients don&rsquo;t need an account to book.
        </p>
      </section>
    </CoachShell>
  );
}
