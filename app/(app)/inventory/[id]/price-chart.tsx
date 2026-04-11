"use client";

/**
 * Market price history chart for a single card + finish combination.
 * Receives plain serializable data from the server (no Prisma/Decimal types).
 */
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export interface PriceChartPoint {
  /** ISO date string */
  date: string;
  /** Market price as a number, or null if unavailable */
  market: number | null;
}

function formatAxisDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatTooltipDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length || label == null) return null;
  return (
    <div className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs shadow-sm dark:border-white/10 dark:bg-zinc-900">
      <p className="mb-1 text-neutral-500">{formatTooltipDate(label)}</p>
      <p className="font-medium tabular-nums">
        ${payload[0].value.toFixed(2)}
      </p>
    </div>
  );
}

export function PriceChart({ data }: { data: PriceChartPoint[] }) {
  const points = data.filter((d) => d.market != null);

  if (points.length < 2) {
    return (
      <p className="py-6 text-center text-sm text-neutral-500">
        Not enough price history to display a chart.
      </p>
    );
  }

  // Recharts needs numeric values; already filtered above.
  const chartData = points.map((p) => ({ date: p.date, market: p.market as number }));

  const prices = chartData.map((p) => p.market);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  // Give a small padding so the line doesn't hug the chart edges.
  const pad = Math.max((max - min) * 0.1, 0.5);
  const domain: [number, number] = [
    Math.max(0, Math.floor((min - pad) * 100) / 100),
    Math.ceil((max + pad) * 100) / 100,
  ];

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
        <XAxis
          dataKey="date"
          tickFormatter={formatAxisDate}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          minTickGap={40}
        />
        <YAxis
          domain={domain}
          tickFormatter={(v: number) => `$${v.toFixed(0)}`}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={44}
        />
        <Tooltip content={<CustomTooltip />} />
        <Line
          type="monotone"
          dataKey="market"
          stroke="#DC2626"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: "#DC2626" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
