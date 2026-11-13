"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney } from "@/lib/money";

const palette = ["#0d5c4b", "#c9a227", "#235c9c", "#9a6206", "#7c5cbf", "#16794f", "#b3261e", "#68716c"];

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--foreground)",
  fontSize: 12,
  boxShadow: "var(--shadow-card)",
} as const;

function monthLabel(month: string): string {
  const [year, m] = month.split("-");
  const date = new Date(Date.UTC(Number(year), Number(m) - 1, 1));
  return new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }).format(date);
}

export function ForecastChart({
  data,
  currency,
}: {
  data: Array<{ month: string; amountMinor: number; eventCount: number }>;
  currency: string;
}) {
  if (data.length === 0) {
    return <ChartEmpty message="No scheduled charges in this horizon." />;
  }
  return (
    <div className="h-64 w-full" role="img" aria-label="Monthly forecast of subscription charges">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={monthLabel}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(value: number) => formatMoney(value, currency, "en-GB", { maximumFractionDigits: 0 })}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={70}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value) => [formatMoney(Number(value), currency), "Charges"]}
            labelFormatter={(label) => monthLabel(String(label))}
          />
          <Area
            type="monotone"
            dataKey="amountMinor"
            stroke="var(--primary)"
            strokeWidth={2}
            fill="url(#forecastFill)"
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CategoryChart({
  data,
  currency,
}: {
  data: Array<{ name: string; valueMinor: number }>;
  currency: string;
}) {
  const rows = data.filter((row) => row.valueMinor > 0);
  if (rows.length === 0) return <ChartEmpty message="Add priced subscriptions to see the split." />;
  return (
    <div className="h-64 w-full" role="img" aria-label="Monthly spend by category">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={rows} dataKey="valueMinor" nameKey="name" innerRadius="58%" outerRadius="86%" paddingAngle={2}>
            {rows.map((row, index) => (
              <Cell key={row.name} fill={palette[index % palette.length]} stroke="var(--card)" strokeWidth={2} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value, name) => [formatMoney(Number(value), currency), String(name)]}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SpendBarChart({
  data,
  currency,
}: {
  data: Array<{ name: string; valueMinor: number }>;
  currency: string;
}) {
  if (data.length === 0) return <ChartEmpty message="Nothing to chart yet." />;
  return (
    <div className="h-64 w-full" role="img" aria-label="Spend by provider">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval={0}
            angle={data.length > 6 ? -28 : 0}
            textAnchor={data.length > 6 ? "end" : "middle"}
            height={data.length > 6 ? 62 : 30}
          />
          <YAxis
            tickFormatter={(value: number) => formatMoney(value, currency, "en-GB", { maximumFractionDigits: 0 })}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={70}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value) => [formatMoney(Number(value), currency), "Monthly"]}
          />
          <Bar dataKey="valueMinor" radius={[6, 6, 0, 0]} fill="var(--primary)" maxBarSize={44} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PriceHistoryChart({
  data,
  currency,
}: {
  data: Array<{ date: string; priceMinor: number }>;
  currency: string;
}) {
  if (data.length < 2) {
    return <ChartEmpty message="Record at least two prices to see the trend." />;
  }
  return (
    <div className="h-48 w-full" role="img" aria-label="Recorded price history">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis
            tickFormatter={(value: number) => formatMoney(value, currency, "en-GB", { maximumFractionDigits: 2 })}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={70}
            domain={["auto", "auto"]}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value) => [formatMoney(Number(value), currency), "Price"]}
          />
          <Line type="stepAfter" dataKey="priceMinor" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="grid h-64 w-full place-items-center rounded-xl border border-dashed border-border-strong bg-muted/40 px-4 text-center text-[12.5px] text-muted-foreground">
      {message}
    </div>
  );
}
