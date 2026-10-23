import { PricingSection } from "./PricingSection";
import { resolveRequestBillingMarket } from "@/lib/billing/request-market";
import { isCheckoutEnabledForMarket } from "@/lib/billing/provider-registry";
import { publicPlanPrices } from "@/lib/pricing/plan-prices";

/** Server wrapper for PricingSection: resolves the visitor's market the way
 * checkout does and passes down that market's checkout prices, so what the
 * page shows is what checkout charges. */
export async function LocalPricingSection({ sourcePage }: { sourcePage: string }) {
  const { market, ipCountry, confirmedCountry } = await resolveRequestBillingMarket();
  return (
    <PricingSection
      sourcePage={sourcePage}
      market={market}
      prices={publicPlanPrices(market)}
      checkoutAvailable={isCheckoutEnabledForMarket(market)}
      detectedCountry={ipCountry}
      confirmedCountry={confirmedCountry}
    />
  );
}
