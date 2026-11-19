import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import * as jobNotificationsApi from "../api/jobNotifications";
import type { JobNotification } from "../api/types";
import { apiErrorMessage } from "../api/client";

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleString();
}

export function JobNotificationsPage() {
  const [notifications, setNotifications] = useState<JobNotification[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setError(null);
    try {
      const data = await jobNotificationsApi.listJobNotifications();
      setNotifications(data);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const overdueCount = notifications.filter((n) => n.type === "PHOTOS_OVERDUE").length;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Job Notifications</h1>
        <button
          onClick={load}
          className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-black"
        >
          Refresh
        </button>
      </div>

      <p className="mb-4 text-sm text-neutral-400">
        A log of technician "send images" actions on the Job Board, plus a warning whenever a job has sat in{" "}
        <strong>In Progress</strong>, <strong>Quality Check</strong>, <strong>Ready</strong>, or{" "}
        <strong>Completed</strong> for more than 15 minutes without any photos being sent to the customer.
      </p>

      {overdueCount > 0 && (
        <div className="mb-4 rounded-md bg-red-950 px-3 py-2 text-sm font-medium text-red-300">
          {overdueCount} job{overdueCount > 1 ? "s" : ""} overdue for a customer photo update.
        </div>
      )}
      {error && <div className="mb-4 rounded-md bg-red-950 px-3 py-2 text-sm text-red-600">{error}</div>}

      {loading ? (
        <div className="text-neutral-500">Loading...</div>
      ) : notifications.length === 0 ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-6 text-center text-sm text-neutral-500">
          No job notifications yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900">
          <table className="w-full text-sm">
            <thead className="bg-black text-left text-xs uppercase text-neutral-400">
              <tr>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Vehicle / Customer</th>
                <th className="px-4 py-2">Message</th>
                <th className="px-4 py-2">Technician</th>
                <th className="px-4 py-2">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {notifications.map((n) => (
                <tr key={n.id} className={n.type === "PHOTOS_OVERDUE" ? "bg-red-950/50" : undefined}>
                  <td className="px-4 py-2">
                    {n.type === "PHOTOS_UPLOADED" ? (
                      <span className="rounded-full bg-red-950 px-2 py-0.5 text-xs font-medium text-red-400">
                        Uploaded
                      </span>
                    ) : n.type === "PHOTOS_SENT" ? (
                      <span className="rounded-full bg-red-950 px-2 py-0.5 text-xs font-medium text-red-400">
                        Images Sent
                      </span>
                    ) : (
                      <span className="rounded-full bg-red-950 px-2 py-0.5 text-xs font-medium text-red-300">
                        ⚠ Overdue
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <Link to={`/job-board/${n.jobCardId}`} className="font-medium text-white hover:underline">
                      {n.jobCard.booking.vehicle.plateNumber}
                    </Link>
                    <div className="text-xs text-neutral-400">{n.jobCard.booking.customer.name}</div>
                  </td>
                  <td className="px-4 py-2 text-neutral-300">{n.message}</td>
                  <td className="px-4 py-2 text-neutral-400">{n.technician?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-xs text-neutral-500">{timeAgo(n.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
