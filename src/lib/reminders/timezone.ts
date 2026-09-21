// The table and picker list live in @nutriai/nutrition-core now so the
// mobile API (and the mobile app) apply the same guess when a contact is
// created — previously only this web form did, and every contact created
// from the app silently got the column default of Asia/Kolkata.
export { guessTimezoneFromCountryCode, COMMON_TIMEZONES } from "@nutriai/nutrition-core";
