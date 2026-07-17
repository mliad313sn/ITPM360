'use client';

import {
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip, LabelList, CartesianGrid, Legend,
} from 'recharts';

// Status colors (RAG is a state, not a series) — validated palette, always labeled
export const RAG_COLORS = { green: '#0ca30c', amber: '#fab219', red: '#d03b3b' } as const;
const SERIES_1 = '#2a78d6'; // single-series magnitude
const INK_MUTED = '#898781';
const GRID = '#e1e0d9';

const tooltipStyle = {
  fontSize: 12,
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
};

export function RagDonut({ data }: { data: { name: string; key: keyof typeof RAG_COLORS; value: number }[] }) {
  const total = data.reduce((n, d) => n + d.value, 0);
  return (
    <div className="relative h-56">
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="62%"
            outerRadius="88%"
            paddingAngle={2}
            strokeWidth={2}
            stroke="#ffffff"
          >
            {data.map((d) => (
              <Cell key={d.key} fill={RAG_COLORS[d.key]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            iconSize={8}
            formatter={(value: string) => {
              const d = data.find((x) => x.name === value);
              return <span style={{ color: '#52514e', fontSize: 12 }}>{value} ({d?.value ?? 0})</span>;
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-6">
        <span className="text-2xl font-bold text-slate-900">{total}</span>
        <span className="text-xs text-slate-400">projects</span>
      </div>
    </div>
  );
}

export function StatusBars({ data }: { data: { name: string; value: number }[] }) {
  return (
    <div className="h-56">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 18, right: 8, left: -22, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: INK_MUTED }} axisLine={{ stroke: '#c3c2b7' }} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: INK_MUTED }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
          <Bar dataKey="value" name="Projects" fill={SERIES_1} radius={[4, 4, 0, 0]} maxBarSize={44}>
            <LabelList dataKey="value" position="top" style={{ fontSize: 11, fill: '#52514e' }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CountryRagBars({
  data,
}: {
  data: { country: string; green: number; amber: number; red: number }[];
}) {
  return (
    <div className="h-56">
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 24, left: -8, bottom: 0 }}>
          <CartesianGrid horizontal={false} stroke={GRID} strokeWidth={1} />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: INK_MUTED }} axisLine={{ stroke: '#c3c2b7' }} tickLine={false} />
          <YAxis type="category" dataKey="country" width={92} tick={{ fontSize: 11, fill: '#52514e' }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
          <Legend iconType="circle" iconSize={8} formatter={(v: string) => <span style={{ color: '#52514e', fontSize: 12 }}>{v}</span>} />
          <Bar dataKey="green" name="Green" stackId="rag" fill={RAG_COLORS.green} maxBarSize={22} stroke="#ffffff" strokeWidth={2} />
          <Bar dataKey="amber" name="Amber" stackId="rag" fill={RAG_COLORS.amber} maxBarSize={22} stroke="#ffffff" strokeWidth={2} />
          <Bar dataKey="red" name="Red" stackId="rag" fill={RAG_COLORS.red} maxBarSize={22} stroke="#ffffff" strokeWidth={2} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
