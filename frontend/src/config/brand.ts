/**
 * Business identity, from the D & D Auto Spa logo/banner PDF. One place to
 * change the name, logo, address and phone numbers shown across the app.
 * (The public website's contact bar is editable separately under Website
 * Gallery → Contact Bar.)
 */
export const BRAND = {
  name: "D & D Auto Spa",
  tagline: "Premium Car Wash & Detailing",
  slogan: "Wash • Polish • Protect",
  address: "431/D, Ihala Kosgama, Kosgama",
  phones: ["+94 71 969 7014", "+94 72 310 2373"],
  /** White + red artwork on a transparent background — for dark surfaces. */
  logo: "/brand/logo.png",
} as const;

export const telHref = (phone: string) => `tel:${phone.replace(/[^+\d]/g, "")}`;
