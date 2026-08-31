"use client";

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";

// ---------------------------------------------------------------------------
// Types passed from the server component
// ---------------------------------------------------------------------------

export type ActivityPoint = {
  date: string; // "Aug 28"
  runs: number;
};

export type OutcomePoint = {
  date: string; // "Aug 28"
  solved: number;
  failed: number;
};

export type SongPlay = {
  label: string;  // truncated "Title – Artist"
  plays: number;
  solves: number;
};

export type DashboardChartsProps = {
  activityData: ActivityPoint[];
  outcomeData: OutcomePoint[];
  topSongs: SongPlay[];
};

// ---------------------------------------------------------------------------
// Shared chart style
// ---------------------------------------------------------------------------

const AXIS_COLOR = "#6b7280";
const GRID_COLOR = "rgba(107,114,128,0.12)";
const VIOLET = "#7c3aed";
const FUCHSIA = "#c026d3";
const EMERALD = "#10b981";
const RED = "#ef4444";

const tooltipStyle: React.CSSProperties = {
  backgroundColor: "var(--surface-strong, #1c1c2e)",
  border: "1px solid var(--hairline, rgba(255,255,255,0.08))",
  borderRadius: 12,
  fontSize: 12,
  color: "var(--text, #f0f0f5)",
  boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
};

const labelStyle: React.CSSProperties = {
  color: "var(--text-dim, #9ca3af)",
  fontWeight: 600,
  fontSize: 11,
};

// ---------------------------------------------------------------------------
// Chart: Daily games played (area)
// ---------------------------------------------------------------------------

function ActivityChart({ data }: { data: ActivityPoint[] }) {
  if (data.length === 0) {
    return <EmptyState label="No game activity in the last 14 days" />;
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="actGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={VIOLET} stopOpacity={0.35} />
            <stop offset="95%" stopColor={VIOLET} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: AXIS_COLOR, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: AXIS_COLOR, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={32}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelStyle={labelStyle}
          itemStyle={{ color: VIOLET }}
          cursor={{ stroke: VIOLET, strokeWidth: 1, strokeDasharray: "4 2" }}
        />
        <Area
          type="monotone"
          dataKey="runs"
          name="Games played"
          stroke={VIOLET}
          fill="url(#actGrad)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: VIOLET, stroke: "#fff", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Chart: Solved vs failed per day (stacked bar)
// ---------------------------------------------------------------------------

function OutcomeChart({ data }: { data: OutcomePoint[] }) {
  if (data.length === 0) {
    return <EmptyState label="No rounds resolved in the last 14 days" />;
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }} barSize={14}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: AXIS_COLOR, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: AXIS_COLOR, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={32}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelStyle={labelStyle}
          cursor={{ fill: "rgba(107,114,128,0.06)" }}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, color: AXIS_COLOR, paddingTop: 8 }}
        />
        <Bar dataKey="solved" name="Guessed ✓" stackId="a" fill={EMERALD} radius={[0, 0, 0, 0]} />
        <Bar dataKey="failed" name="Missed ✗" stackId="a" fill={RED} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Chart: Top 10 songs by plays (horizontal bar)
// ---------------------------------------------------------------------------

const BAR_PALETTE = [VIOLET, FUCHSIA, "#4f46e5", "#0ea5e9", "#06b6d4"];

function TopSongsChart({ data }: { data: SongPlay[] }) {
  if (data.length === 0) {
    return <EmptyState label="No song play data yet" />;
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 34)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 16, left: 4, bottom: 0 }}
        barSize={14}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} horizontal={false} />
        <XAxis
          type="number"
          tick={{ fill: AXIS_COLOR, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="label"
          tick={{ fill: AXIS_COLOR, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={160}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelStyle={labelStyle}
          cursor={{ fill: "rgba(107,114,128,0.06)" }}
        />
        <Bar dataKey="plays" name="Times played" radius={[0, 4, 4, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={BAR_PALETTE[i % BAR_PALETTE.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Shared empty state
// ---------------------------------------------------------------------------

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex h-40 items-center justify-center">
      <p className="text-sm text-(--text-faint)">{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChartCard wrapper
// ---------------------------------------------------------------------------

function ChartCard({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-(--hairline) bg-(--surface-strong) p-5 ${className}`}>
      <p className="text-sm font-semibold text-(--text)">{title}</p>
      {subtitle && <p className="mt-0.5 text-xs text-(--text-faint)">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public export
// ---------------------------------------------------------------------------

export function DashboardCharts({ activityData, outcomeData, topSongs }: DashboardChartsProps) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Full-width activity area chart */}
      <ChartCard
        title="Daily Games Played"
        subtitle="Total game sessions started per day — last 14 days"
        className="lg:col-span-2"
      >
        <ActivityChart data={activityData} />
      </ChartCard>

      {/* Solved vs failed */}
      <ChartCard
        title="Songs Guessed vs Missed"
        subtitle="Resolved rounds per day — last 14 days"
      >
        <OutcomeChart data={outcomeData} />
      </ChartCard>

      {/* Top 10 songs */}
      <ChartCard
        title="Top 10 Most Played Songs"
        subtitle="All-time play count from the catalog"
      >
        <TopSongsChart data={topSongs} />
      </ChartCard>
    </div>
  );
}
