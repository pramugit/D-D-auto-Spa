import type { SiteContentData } from "../api/siteContent";

export const DEFAULT_SITE_CONTENT: SiteContentData = {
  contact: {
    location: "Colombo, Sri Lanka",
    email: "hello@autobody.test",
    hours: "Mon - Sat: 8:00 AM - 6:00 PM",
  },
  hero: {
    slides: [
      {
        eyebrow: "Keep your car shining",
        headlineA: "We Provide Car",
        headlineB: "Detailing",
        headlineC: "Services",
        body: "From a full wash and polish to paint correction, our certified specialists treat every panel with care so your car looks showroom-ready every visit.",
      },
      {
        eyebrow: "Protect your paintwork",
        headlineA: "We Provide Ceramic",
        headlineB: "Coating",
        headlineC: "Services",
        body: "A durable ceramic layer that guards your paint against UV, dust and minor scratches, while keeping that just-detailed shine for months.",
      },
    ],
  },
  features: [
    { title: "Quality Service", body: "Every wash, polish and coating job is inspected before handover.", dark: false },
    { title: "Online Booking", body: "Pick a service, a bay slot, and book in a couple of minutes.", dark: true },
    { title: "Certified Technicians", body: "Trained staff using proper equipment and detailing products.", dark: false },
    { title: "Fair Pricing", body: "Transparent pricing per vehicle type, shown before you book.", dark: true },
  ],
  about: {
    image:
      "https://plus.unsplash.com/premium_photo-1661443450192-f589ab785b62?fm=jpg&q=60&w=800&auto=format&fit=crop",
    paragraph:
      "AutoBody is a dedicated exterior & interior detailing station — wash, wax, polish, paint correction, ceramic coating and dent/scratch removal. No mechanical repairs, just a car that looks its absolute best.",
    bullets: [
      "We care about your car as much as you do.",
      "Certified & trained staff using proper equipment.",
      "Transparent pricing, booked online in minutes.",
    ],
  },
  services: [
    {
      title: "Auto Detailing",
      body: "A deep clean of your car's interior and exterior for a showroom-like finish.",
      image:
        "https://plus.unsplash.com/premium_photo-1682096769615-9c1729638821?fm=jpg&q=60&w=600&auto=format&fit=crop",
    },
    {
      title: "Express Exterior",
      body: "A quick, effective wash to remove dirt and grime and bring back the shine.",
      image:
        "https://images.unsplash.com/photo-1678383408281-b350a3a9b7e1?fm=jpg&q=60&w=600&auto=format&fit=crop",
    },
    {
      title: "Full Tire Wash",
      body: "We clean, shine and protect your tires and rims to keep them looking their best.",
      image:
        "https://images.unsplash.com/photo-1763596554080-0ead6713db60?fm=jpg&q=60&w=600&auto=format&fit=crop",
    },
    {
      title: "Protective Coating",
      body: "Premium ceramic coating to protect your paint from UV, dust and minor scratches.",
      image:
        "https://plus.unsplash.com/premium_photo-1663045588286-b9257e377a2e?fm=jpg&q=60&w=600&auto=format&fit=crop",
    },
  ],
};
