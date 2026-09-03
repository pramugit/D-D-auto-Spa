import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useCustomerAuth } from "../hooks/useCustomerAuth";
import { listSiteImages } from "../api/siteImages";
import { getSiteContent, type SiteContentData } from "../api/siteContent";
import { resolveMediaUrl } from "../api/client";
import { DEFAULT_SITE_CONTENT } from "../config/siteContentDefaults";
import * as catalogApi from "../api/catalog";
import type { ServiceCategory, ServicePackage } from "../api/types";

const NAV_LINKS = [
  { label: "Home", href: "#top" },
  { label: "About", href: "#about" },
  { label: "Services", href: "#services" },
  { label: "Price List", href: "#price-list" },
  { label: "Contact", href: "#contact" },
];

function LocationIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
      <path
        d="M12 21s7-6.1 7-11.5A7 7 0 105 9.5C5 14.9 12 21 12 21z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="12" cy="9.5" r="2.2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 7l9 6l9-6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0 text-sky-500">
      <circle cx="12" cy="12" r="10" fill="currentColor" fillOpacity="0.12" />
      <path d="M8 12l2.5 2.5L16 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const DEFAULT_GALLERY_IMAGES = [
  "/gallery-1.jpg",
  "/gallery-2.jpg",
  "/gallery-3.jpg",
  "/gallery-4.jpg",
  "/gallery-5.jpg",
  "/gallery-6.jpg",
  "/gallery-7.jpg",
];

function GallerySlideshow() {
  const [images, setImages] = useState<string[]>(DEFAULT_GALLERY_IMAGES);

  useEffect(() => {
    listSiteImages()
      .then((data) => {
        if (data.length > 0) {
          setImages(data.map((img) => resolveMediaUrl(img.url)));
        }
      })
      .catch(() => {
        // Keep the static defaults if the API is unreachable.
      });
  }, []);

  const track = [...images, ...images];

  return (
    <div className="overflow-hidden bg-slate-50 py-4">
      <div className="animate-marquee flex w-max gap-5">
        {track.map((src, i) => (
          <div
            key={`${src}-${i}`}
            className="w-64 shrink-0 overflow-hidden rounded-xl bg-white shadow-md ring-1 ring-black/5"
            style={{ aspectRatio: "4 / 6" }}
          >
            <img src={src} alt="" className="h-full w-full object-cover" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
      <path
        d={direction === "left" ? "M15 6l-6 6l6 6" : "M9 6l6 6l-6 6"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function money(value: string | number) {
  return `$${Number(value).toFixed(2)}`;
}

/** Mirrors the staff Service Catalog page's data (/catalog) for public viewing. */
function CatalogSection({ customerHref }: { customerHref: string }) {
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      catalogApi.listCategories(),
      catalogApi.listServices({ active: true }),
      catalogApi.listPackages(),
    ])
      .then(([cats, services, pkgs]) => {
        setCategories(
          cats.map((c) => ({ ...c, services: services.filter((s) => s.categoryId === c.id) })),
        );
        setPackages(pkgs.filter((p) => p.active));
      })
      .catch(() => {
        setError("Couldn't load the price list right now — please try again shortly.");
      });
  }, []);

  if (error) return null;
  if (categories.every((c) => !c.services?.length) && packages.length === 0) return null;

  return (
    <section id="price-list" className="px-6 py-16 md:px-12">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-sky-500">Full Price List</p>
          <h2 className="mt-2 text-2xl font-extrabold text-blue-950 sm:text-3xl">Every Service We Offer</h2>
        </div>

        {categories
          .filter((c) => c.services && c.services.length > 0)
          .map((category) => (
            <div key={category.id} className="mt-10">
              <h3 className="mb-4 text-lg font-bold capitalize text-blue-950">
                {category.name.toLowerCase()}
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {category.services!.map((s) => (
                  <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-bold text-blue-950">{s.name}</h4>
                      <span className="shrink-0 text-xs text-slate-400">{s.durationMinutes} min</span>
                    </div>
                    {s.description && <p className="mt-1.5 text-sm text-slate-600">{s.description}</p>}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {s.pricing.map((p) => (
                        <span
                          key={p.id}
                          className="rounded-md bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700"
                        >
                          {p.vehicleType}: {money(p.price)}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

        {packages.length > 0 && (
          <div className="mt-10">
            <h3 className="mb-4 text-lg font-bold text-blue-950">Bundled Packages</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {packages.map((p) => (
                <div key={p.id} className="rounded-xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-bold text-blue-950">{p.name}</h4>
                    <span className="shrink-0 rounded-full bg-blue-950 px-2.5 py-0.5 text-xs font-semibold text-white">
                      {money(p.discountedPrice)}
                    </span>
                  </div>
                  {p.description && <p className="mt-1.5 text-sm text-slate-600">{p.description}</p>}
                  <p className="mt-3 text-xs text-slate-500">
                    Includes: {p.services.map((link) => link.service.name).join(", ")}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-10 text-center">
          <Link
            to={customerHref}
            className="inline-flex items-center gap-2 rounded-full bg-sky-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-600"
          >
            Book a Service &rarr;
          </Link>
        </div>
      </div>
    </section>
  );
}

export function LandingPage() {
  const { isAuthenticated: isCustomerAuthenticated } = useCustomerAuth();
  const [slide, setSlide] = useState(0);
  const [content, setContent] = useState<SiteContentData>(DEFAULT_SITE_CONTENT);

  useEffect(() => {
    getSiteContent("landing")
      .then((result) => {
        if (result?.data) setContent(result.data);
      })
      .catch(() => {
        // Keep the static defaults if the API is unreachable.
      });
  }, []);

  // This page never force-redirects a signed-in user away — it's the
  // one place the Back button (see BackButton.tsx) can always land on,
  // so its links just adapt to point at the right place instead. Staff
  // sign-in has no link anywhere on this public page — it's only reachable
  // by going directly to /staff-portal/login.
  const customerHref = isCustomerAuthenticated ? "/portal/bookings" : "/portal/login";
  const customerLabel = isCustomerAuthenticated ? "My Bookings" : "Customer Portal";
  const bookLabel = isCustomerAuthenticated ? "My Bookings" : "Book Now";

  const slides = content.hero.slides;
  const active = slides[slide] ?? slides[0];

  return (
    <div id="top" className="font-display min-h-screen bg-white text-slate-800">
      {/* ---- Utility bar ---- */}
      <div className="bg-blue-950 px-6 py-2 text-xs text-blue-100 md:px-12">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-1.5">
              <LocationIcon /> {content.contact.location}
            </span>
            <a href={`mailto:${content.contact.email}`} className="flex items-center gap-1.5 hover:text-white">
              <MailIcon /> {content.contact.email}
            </a>
            <span className="hidden items-center gap-1.5 sm:flex">
              <ClockIcon /> {content.contact.hours}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link to={customerHref} className="hover:text-white">
              {customerLabel}
            </Link>
          </div>
        </div>
      </div>

      {/* ---- Main nav ---- */}
      <header className="border-b border-slate-100 px-6 py-4 md:px-12">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <span className="text-xl font-extrabold tracking-tight text-blue-950">
            Auto<span className="text-sky-500">Body</span>
          </span>
          <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
            {NAV_LINKS.map((link, i) => (
              <a
                key={link.href}
                href={link.href}
                className={i === 0 ? "text-sky-500" : "transition hover:text-sky-500"}
              >
                {link.label}
              </a>
            ))}
          </nav>
          <Link
            to={customerHref}
            className="rounded-full bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-600"
          >
            {bookLabel}
          </Link>
        </div>
      </header>

      {/* ---- Hero ---- */}
      <section className="relative overflow-hidden bg-blue-950">
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 h-full w-full object-cover opacity-40"
        >
          <source src="/cover.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-r from-blue-950 via-blue-950/85 to-blue-950/40" />

        <div className="relative mx-auto max-w-6xl px-6 py-20 md:px-12 md:py-28">
          <div className="max-w-xl">
            <p className="animate-fade-in-up text-sm font-semibold uppercase tracking-widest text-sky-400">
              {active.eyebrow}
            </p>
            <h1 className="animate-fade-in-up mt-3 text-3xl font-extrabold leading-tight text-white sm:text-4xl md:text-5xl" style={{ animationDelay: "0.1s" }}>
              {active.headlineA} <span className="text-sky-400">{active.headlineB}</span>{" "}
              {active.headlineC}
            </h1>
            <p className="animate-fade-in-up mt-5 max-w-md text-blue-100" style={{ animationDelay: "0.2s" }}>
              {active.body}
            </p>
            <div className="animate-fade-in-up mt-8 flex flex-wrap gap-4" style={{ animationDelay: "0.3s" }}>
              <Link
                to={customerHref}
                className="rounded-full bg-sky-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-600"
              >
                {bookLabel} &rarr;
              </Link>
              <a
                href="#about"
                className="rounded-full border border-white/40 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Learn More &rarr;
              </a>
            </div>
          </div>
        </div>

        <button
          type="button"
          aria-label="Previous slide"
          onClick={() => setSlide((s) => (s + slides.length - 1) % slides.length)}
          className="absolute left-4 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 md:flex"
        >
          <ChevronIcon direction="left" />
        </button>
        <button
          type="button"
          aria-label="Next slide"
          onClick={() => setSlide((s) => (s + 1) % slides.length)}
          className="absolute right-4 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 md:flex"
        >
          <ChevronIcon direction="right" />
        </button>
      </section>

      {/* ---- Gallery slideshow ---- */}
      <GallerySlideshow />

      {/* ---- Feature cards ---- */}
      <section className="px-6 py-14 md:px-12">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 md:grid-cols-4">
          {content.features.map((f) => (
            <div
              key={f.title}
              className={`rounded-xl p-6 ${
                f.dark ? "bg-blue-950 text-white" : "bg-sky-50 text-blue-950"
              }`}
            >
              <h3 className="font-bold">{f.title}</h3>
              <p className={`mt-2 text-sm ${f.dark ? "text-blue-200" : "text-blue-950/70"}`}>
                {f.body}
              </p>
              <a
                href="#services"
                className={`mt-4 inline-block rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                  f.dark
                    ? "bg-sky-500 text-white hover:bg-sky-400"
                    : "bg-blue-950 text-white hover:bg-blue-900"
                }`}
              >
                More
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* ---- About ---- */}
      <section id="about" className="px-6 py-16 md:px-12">
        <div className="mx-auto grid max-w-6xl items-center gap-10 md:grid-cols-2">
          <div className="relative">
            <div className="absolute -bottom-4 -right-4 h-full w-full rounded-2xl bg-sky-100" />
            <img
              src={content.about.image}
              alt="Technician detailing a car"
              className="relative h-80 w-full rounded-2xl object-cover shadow-lg md:h-96"
            />
            <div className="absolute -bottom-4 left-4 rounded-xl bg-blue-950 px-4 py-3 text-xs font-semibold text-white shadow-lg">
              Certified &amp; Trained Technicians
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-sky-500">About Us</p>
            <h2 className="mt-2 text-2xl font-extrabold text-blue-950 sm:text-3xl">
              We Provide Quality Car <span className="text-sky-500">Detailing</span> Services
            </h2>
            <p className="mt-4 text-slate-600">{content.about.paragraph}</p>
            <ul className="mt-5 space-y-3 text-sm text-slate-700">
              {content.about.bullets.map((bullet) => (
                <li key={bullet} className="flex items-start gap-2">
                  <CheckIcon /> {bullet}
                </li>
              ))}
            </ul>
            <Link
              to={customerHref}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-sky-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-600"
            >
              Discover More &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* ---- Services ---- */}
      <section id="services" className="bg-slate-50 px-6 py-16 md:px-12">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-sky-500">Services</p>
            <h2 className="mt-2 text-2xl font-extrabold text-blue-950 sm:text-3xl">What We Offer</h2>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {content.services.map((s) => (
              <div key={s.title} className="overflow-hidden rounded-xl bg-white shadow-sm">
                <img src={s.image} alt="" className="h-40 w-full object-cover" />
                <div className="p-5">
                  <h3 className="font-bold text-blue-950">{s.title}</h3>
                  <p className="mt-2 text-sm text-slate-600">{s.body}</p>
                  <Link
                    to={customerHref}
                    className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-sky-500 hover:text-sky-600"
                  >
                    Read More &rarr;
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Full price list (mirrors the staff /catalog page) ---- */}
      <CatalogSection customerHref={customerHref} />

      {/* ---- Footer ---- */}
      <footer id="contact" className="bg-blue-950 px-6 py-10 md:px-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-sm text-blue-200 sm:flex-row">
          <span className="font-semibold text-white">
            Auto<span className="text-sky-400">Body</span> Service Station
          </span>
          <div className="flex items-center gap-6">
            <Link to={customerHref} className="hover:text-white">
              {customerLabel}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
