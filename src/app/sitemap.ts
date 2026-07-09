import type { MetadataRoute } from "next";

const SITE_URL = "https://tistrahealth.com";

const ROUTES = [
  "/",
  "/family",
  "/family/india",
  "/family/add-users",
  "/coach",
  "/coach/india",
  "/coach/add-users",
  "/me",
  "/me/india",
  "/me/add-users",
  "/privacy",
  "/terms",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified: new Date(),
  }));
}
