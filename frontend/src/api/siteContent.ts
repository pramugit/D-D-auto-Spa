import { apiClient } from "./client";

export interface HeroSlide {
  eyebrow: string;
  headlineA: string;
  headlineB: string;
  headlineC: string;
  body: string;
}

export interface FeatureCard {
  title: string;
  body: string;
  dark: boolean;
}

export interface ServiceCard {
  title: string;
  body: string;
  image: string;
}

export interface SiteContentData {
  contact: {
    location: string;
    email: string;
    hours: string;
    /** Shown as call links in the top bar; several numbers separated by "/". */
    phone?: string;
  };
  hero: {
    slides: HeroSlide[];
  };
  features: FeatureCard[];
  about: {
    image: string;
    paragraph: string;
    bullets: string[];
  };
  services: ServiceCard[];
}

export interface SiteContent {
  id: string;
  key: string;
  data: SiteContentData;
  updatedAt: string;
}

export async function getSiteContent(key: string) {
  const { data } = await apiClient.get<SiteContent | null>(`/site-content/${key}`);
  return data;
}

export async function updateSiteContent(key: string, contentData: SiteContentData) {
  const { data } = await apiClient.put<SiteContent>(`/site-content/${key}`, { data: contentData });
  return data;
}

export async function uploadContentImage(file: File) {
  const form = new FormData();
  form.append("image", file);
  const { data } = await apiClient.post<{ url: string }>("/site-content/upload-image", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data.url;
}

/** The shop's scan-to-pay QR image (e.g. a LankaQR merchant code), shown at
 *  the counter on Daily Jobs' payment step. Stored as site content key
 *  "payment-qr"; null until an admin uploads one. */
export interface PaymentQr {
  imageUrl: string;
  note?: string;
}

export async function getPaymentQr(): Promise<PaymentQr | null> {
  const { data } = await apiClient.get<{ data: PaymentQr } | null>("/site-content/payment-qr");
  return data?.data ?? null;
}

export async function setPaymentQr(qr: PaymentQr): Promise<PaymentQr> {
  const { data } = await apiClient.put<{ data: PaymentQr }>("/site-content/payment-qr", { data: qr });
  return data.data;
}
