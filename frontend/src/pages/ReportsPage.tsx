import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import * as reportsApi from "../api/reports";
import type {
  BayUtilization,
  RepeatCustomerRate,
  RevenuePoint,
  TechnicianStat,
  TopService,
} from "../api/reports";
import { apiErrorMessage } from "../api/client";

// Validated single sequential hue (blue, step 450) from the dataviz skill's
// reference palette — every chart on this page is a single-series
// magnitude bar, so one hue is all that's needed.
const SERIES_COLOR = "#2a78d6";
const GRID_COLOR = "#e1e0d9";
const AXIS_COLOR = "#898781";
const INK_COLOR = "#0b0b0b";

type Granularity = "daily" | "weekly" | "monthly";

export function ReportsPage() {
  const [granularity, setGranularity] = useState<Granularity>("daily");
  const [revenue, setRevenue] = useState<RevenuePoint[]>([]);
  const [topServices, setTopServices] = useState<TopService[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianStat[]>([]);
  const [bays, setBays] = useState<BayUtilization[]>([]);
  const [repeatRate, setRepeatRate] = useState<RepeatCustomerRate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadStatic() {
    try {
      const [services, techs, bayData, repeat] = await Promise.all([
        reportsApi.getTopServices(),
        reportsApi.getTechnicianStats(),
        reportsApi.getBayUtilization(),
        reportsApi.getRepeatCustomerRate(),
      ]);
      setTopServices(services);
      setTechnicians(techs);
      setBays(bayData);
      setRepeatRate(repeat);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStatic();
  }, []);

  useEffect(() => {
    reportsApi
      .getRevenue(granularity)
      .then(setRevenue)
      .catch((err) => setError(apiErrorMessage(err)));
  }, [granularity]);

  const totalRevenue = revenue.reduce((sum, p) => sum + p.revenue, 0);

  if (loading) return <div className="text-slate-400">Loading...</div>;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-slate-800">Reports &amp; Analytics</h1>
      {error && <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Total Revenue (shown period)" value={`$${totalRevenue.toFixed(2)}`} />
        <StatTile label="Repeat Customer Rate" value={repeatRate ? `${repeatRate.repeatRate}%` : "—"} />
        <StatTile label="Customers with Bookings" value={repeatRate ? String(repeatRate.totalCustomers) : "—"} />
        <StatTile label="Active Bays" value={String(bays.length)} />
      </div>

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase text-slate-500">Revenue Over Time</h2>
          <div className="flex gap-1">
            {(["daily", "weekly", "monthly"] as Granularity[]).map((g) => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${
                  granularity === g ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
        {revenue.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">No verified payments in this view yet.</div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={revenue} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
              <XAxis dataKey="period" tick={{ fontSize: 11, fill: AXIS_COLOR }} axisLine={{ stroke: GRID_COLOR }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: AXIS_COLOR }} axisLine={false} tickLine={false} width={50} />
              <Tooltip
                formatter={(value) => [`$${Number(value).toFixed(2)}`, "Revenue"]}
                contentStyle={{ fontSize: 12, borderRadius: 6, borderColor: GRID_COLOR }}
              />
              <Bar dataKey="revenue" fill={SERIES_COLOR} radius={[4, 4, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500">Most Booked Services</h2>
          {topServices.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">No bookings yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(180, topServices.length * 40)}>
              <BarChart
                data={topServices}
                layout="vertical"
                margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: AXIS_COLOR }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 12, fill: INK_COLOR }}
                  axisLine={false}
                  tickLine={false}
                  width={140}
                />
                <Tooltip
                  formatter={(value) => [String(value), "Bookings"]}
                  contentStyle={{ fontSize: 12, borderRadius: 6, borderColor: GRID_COLOR }}
                />
                <Bar dataKey="count" fill={SERIES_COLOR} radius={[0, 4, 4, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500">Bay Utilization (last 30 days)</h2>
          {bays.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">No bays configured.</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(180, bays.length * 40)}>
              <BarChart data={bays} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} horizontal={false} />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 11, fill: AXIS_COLOR }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: INK_COLOR }} axisLine={false} tickLine={false} width={60} />
                <Tooltip
                  formatter={(value) => [`${value}%`, "Utilization"]}
                  contentStyle={{ fontSize: 12, borderRadius: 6, borderColor: GRID_COLOR }}
                />
                <Bar dataKey="utilizationRate" fill={SERIES_COLOR} radius={[0, 4, 4, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500">Technician Job Counts &amp; Average Completion Time</h2>
        {technicians.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">No technicians on staff yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-400">
              <tr>
                <th className="py-1.5">Technician</th>
                <th className="py-1.5">Total Jobs</th>
                <th className="py-1.5">Completed</th>
                <th className="py-1.5">Avg. Completion Time</th>
              </tr>
            </thead>
            <tbody>
              {technicians.map((t) => (
                <tr key={t.technicianId} className="border-t border-slate-100">
                  <td className="py-1.5 font-medium text-slate-800">{t.name}</td>
                  <td className="py-1.5 text-slate-600">{t.jobCount}</td>
                  <td className="py-1.5 text-slate-600">{t.completedCount}</td>
                  <td className="py-1.5 text-slate-600">
                    {t.avgCompletionMinutes !== null ? `${t.avgCompletionMinutes} min` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs uppercase text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-800" style={{ fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
    </div>
  );
}
