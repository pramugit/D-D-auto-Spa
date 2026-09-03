import { useEffect, useRef, useState, type ReactNode } from "react";
import * as siteImagesApi from "../api/siteImages";
import type { SiteImage } from "../api/siteImages";
import * as siteContentApi from "../api/siteContent";
import type { SiteContentData } from "../api/siteContent";
import { DEFAULT_SITE_CONTENT } from "../config/siteContentDefaults";
import { apiErrorMessage, resolveMediaUrl } from "../api/client";

function SectionCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:outline-none";

function ImageField({
  label,
  value,
  onChange,
  onUpload,
  uploading,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  onUpload: (file: File) => void;
  uploading: boolean;
}) {
  const fileInput = useRef<HTMLInputElement | null>(null);
  return (
    <Field label={label}>
      <div className="flex items-start gap-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
          {value && <img src={value} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="flex-1 space-y-1.5">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass}
            placeholder="Image URL"
          />
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Upload image"}
          </button>
        </div>
      </div>
    </Field>
  );
}

export function SiteGalleryPage() {
  const [images, setImages] = useState<SiteImage[]>([]);
  const [content, setContent] = useState<SiteContentData>(DEFAULT_SITE_CONTENT);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savingSlot, setSavingSlot] = useState<number | null>(null);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [savingContent, setSavingContent] = useState(false);
  const fileInputs = useRef<Record<number, HTMLInputElement | null>>({});

  async function load() {
    setError(null);
    try {
      const [imageList, contentResult] = await Promise.all([
        siteImagesApi.listSiteImages(),
        siteContentApi.getSiteContent("landing"),
      ]);
      setImages(imageList);
      if (contentResult?.data) setContent(contentResult.data);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleGalleryFileChange(slot: number, file: File | undefined) {
    if (!file) return;
    setError(null);
    setSavingSlot(slot);
    try {
      const updated = await siteImagesApi.replaceSiteImage(slot, file);
      setImages((prev) => {
        const others = prev.filter((img) => img.slot !== slot);
        return [...others, updated].sort((a, b) => a.slot - b.slot);
      });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSavingSlot(null);
    }
  }

  async function handleContentImageUpload(key: string, file: File, onDone: (url: string) => void) {
    setError(null);
    setUploadingKey(key);
    try {
      const url = await siteContentApi.uploadContentImage(file);
      onDone(url);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setUploadingKey(null);
    }
  }

  async function saveContent() {
    setError(null);
    setNotice(null);
    setSavingContent(true);
    try {
      await siteContentApi.updateSiteContent("landing", content);
      setNotice("Saved. The landing page will reflect these changes on next load.");
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSavingContent(false);
    }
  }

  function updateSlide(index: number, field: keyof SiteContentData["hero"]["slides"][number], value: string) {
    setContent((prev) => {
      const slides = [...prev.hero.slides];
      slides[index] = { ...slides[index], [field]: value };
      return { ...prev, hero: { slides } };
    });
  }

  function updateFeature(index: number, field: "title" | "body", value: string) {
    setContent((prev) => {
      const features = [...prev.features];
      features[index] = { ...features[index], [field]: value };
      return { ...prev, features };
    });
  }

  function updateService(index: number, field: "title" | "body" | "image", value: string) {
    setContent((prev) => {
      const services = [...prev.services];
      services[index] = { ...services[index], [field]: value };
      return { ...prev, services };
    });
  }

  function updateBullet(index: number, value: string) {
    setContent((prev) => {
      const bullets = [...prev.about.bullets];
      bullets[index] = value;
      return { ...prev, about: { ...prev.about, bullets } };
    });
  }

  const slots = Array.from({ length: 7 }, (_, i) => i + 1);

  return (
    <div className="space-y-6 pb-16">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Website Content</h1>
        <p className="mt-1 text-sm text-slate-500">
          Everything shown on the public landing page (<code>/</code>) — text and images — is
          editable here.
        </p>
      </div>

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
      {notice && <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</div>}

      <SectionCard title="Gallery Strip" description="The scrolling photo strip below the cover video.">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
          {slots.map((slot) => {
            const image = images.find((img) => img.slot === slot);
            const saving = savingSlot === slot;
            return (
              <div key={slot} className="flex flex-col gap-2">
                <div
                  className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
                  style={{ aspectRatio: "4 / 6" }}
                >
                  {image ? (
                    <img
                      src={resolveMediaUrl(image.url)}
                      alt={`Slot ${slot}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-slate-400">Empty</div>
                  )}
                </div>
                <input
                  ref={(el) => {
                    fileInputs.current[slot] = el;
                  }}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleGalleryFileChange(slot, e.target.files?.[0])}
                />
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => fileInputs.current[slot]?.click()}
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {saving ? "Uploading…" : "Change"}
                </button>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Contact Bar" description="Shown in the thin bar at the very top of the page.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Location">
            <input
              className={inputClass}
              value={content.contact.location}
              onChange={(e) => setContent((prev) => ({ ...prev, contact: { ...prev.contact, location: e.target.value } }))}
            />
          </Field>
          <Field label="Email">
            <input
              className={inputClass}
              value={content.contact.email}
              onChange={(e) => setContent((prev) => ({ ...prev, contact: { ...prev.contact, email: e.target.value } }))}
            />
          </Field>
          <Field label="Hours">
            <input
              className={inputClass}
              value={content.contact.hours}
              onChange={(e) => setContent((prev) => ({ ...prev, contact: { ...prev.contact, hours: e.target.value } }))}
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Hero Slides" description="The two rotating headlines over the cover video.">
        <div className="grid gap-6 md:grid-cols-2">
          {content.hero.slides.map((slide, i) => (
            <div key={i} className="space-y-3 rounded-md border border-slate-100 p-3">
              <p className="text-xs font-semibold text-slate-400">Slide {i + 1}</p>
              <Field label="Eyebrow">
                <input className={inputClass} value={slide.eyebrow} onChange={(e) => updateSlide(i, "eyebrow", e.target.value)} />
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Headline A">
                  <input className={inputClass} value={slide.headlineA} onChange={(e) => updateSlide(i, "headlineA", e.target.value)} />
                </Field>
                <Field label="Headline B (accent)">
                  <input className={inputClass} value={slide.headlineB} onChange={(e) => updateSlide(i, "headlineB", e.target.value)} />
                </Field>
                <Field label="Headline C">
                  <input className={inputClass} value={slide.headlineC} onChange={(e) => updateSlide(i, "headlineC", e.target.value)} />
                </Field>
              </div>
              <Field label="Body">
                <textarea
                  className={inputClass}
                  rows={3}
                  value={slide.body}
                  onChange={(e) => updateSlide(i, "body", e.target.value)}
                />
              </Field>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Feature Cards" description="The four small cards below the gallery strip.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {content.features.map((feature, i) => (
            <div key={i} className="space-y-3 rounded-md border border-slate-100 p-3">
              <Field label="Title">
                <input className={inputClass} value={feature.title} onChange={(e) => updateFeature(i, "title", e.target.value)} />
              </Field>
              <Field label="Body">
                <textarea
                  className={inputClass}
                  rows={3}
                  value={feature.body}
                  onChange={(e) => updateFeature(i, "body", e.target.value)}
                />
              </Field>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="About Section">
        <ImageField
          label="About Photo"
          value={content.about.image}
          onChange={(url) => setContent((prev) => ({ ...prev, about: { ...prev.about, image: url } }))}
          onUpload={(file) =>
            handleContentImageUpload("about", file, (url) =>
              setContent((prev) => ({ ...prev, about: { ...prev.about, image: url } })),
            )
          }
          uploading={uploadingKey === "about"}
        />
        <Field label="Paragraph">
          <textarea
            className={inputClass}
            rows={3}
            value={content.about.paragraph}
            onChange={(e) => setContent((prev) => ({ ...prev, about: { ...prev.about, paragraph: e.target.value } }))}
          />
        </Field>
        <div className="grid gap-3 md:grid-cols-3">
          {content.about.bullets.map((bullet, i) => (
            <Field key={i} label={`Checklist item ${i + 1}`}>
              <input className={inputClass} value={bullet} onChange={(e) => updateBullet(i, e.target.value)} />
            </Field>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Services" description="The four service cards near the bottom of the page.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {content.services.map((service, i) => (
            <div key={i} className="space-y-3 rounded-md border border-slate-100 p-3">
              <ImageField
                label="Image"
                value={service.image}
                onChange={(url) => updateService(i, "image", url)}
                onUpload={(file) => handleContentImageUpload(`service-${i}`, file, (url) => updateService(i, "image", url))}
                uploading={uploadingKey === `service-${i}`}
              />
              <Field label="Title">
                <input className={inputClass} value={service.title} onChange={(e) => updateService(i, "title", e.target.value)} />
              </Field>
              <Field label="Body">
                <textarea
                  className={inputClass}
                  rows={3}
                  value={service.body}
                  onChange={(e) => updateService(i, "body", e.target.value)}
                />
              </Field>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="sticky bottom-4 flex justify-end">
        <button
          type="button"
          onClick={saveContent}
          disabled={savingContent}
          className="rounded-md bg-sky-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-sky-600 disabled:opacity-50"
        >
          {savingContent ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
