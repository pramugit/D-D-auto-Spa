import { apiClient } from "./client";

export interface SiteImage {
  id: string;
  slot: number;
  url: string;
  updatedAt: string;
}

export async function listSiteImages() {
  const { data } = await apiClient.get<SiteImage[]>("/site-images");
  return data;
}

export async function replaceSiteImage(slot: number, file: File) {
  const form = new FormData();
  form.append("image", file);
  const { data } = await apiClient.put<SiteImage>(`/site-images/${slot}`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}
