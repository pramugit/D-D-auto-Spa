import { apiClient } from "./client";
import type { JobNotification } from "./types";

export async function listJobNotifications(): Promise<JobNotification[]> {
  const { data } = await apiClient.get<JobNotification[]>("/job-notifications");
  return data;
}
