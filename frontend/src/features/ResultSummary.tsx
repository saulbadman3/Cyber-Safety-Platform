import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Result } from "../api";
import { uk } from "../i18n/uk";
import { Card, RiskBadge } from "../components";

const PALETTE = ["#0c766e", "#8bc9ba", "#c9d9d5", "#f0b45d", "#cf6a5d", "#79aeb2", "#a49acb", "#7a929a"];

export function ResultSummary({ result }: { result: Result }) {
  const risk = result.risk_level;
  return (
    <div className="grid gap-6 lg:grid-cols-[.95fr_1.05fr]">
      <Card className="flex flex-col items-center justify-center text-center">
        <p className="eyebrow">{uk.rating}</p>
        <div className="relative mt-4 grid h-52 w-52 place-items-center rounded-full" style={{
          background: "conic-gradient(#0c766e " + result.total_score + "%, #dff4ef 0)",
        }}>
          <div className="grid h-40 w-40 place-items-center rounded-full bg-white shadow-inner">
            <div><div className="text-5xl font-bold tracking-tight">{result.total_score}</div><div className="text-sm text-muted">/ 100</div></div>
          </div>
        </div>
        <h2 className="mt-5 text-xl font-bold">{uk.risk}</h2>
        <RiskBadge level={risk} label={result.risk_label} />
        <p className="mt-4 max-w-sm text-sm text-muted">{uk.pickRisk}</p>
      </Card>
      <Card>
        <h2 className="text-lg font-bold">{uk.categoryScores}</h2>
        <div className="mt-3 h-64" aria-label={uk.categoryScores}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={result.categories} dataKey="score" nameKey="title" cx="50%" cy="50%" outerRadius="74%" innerRadius="42%" paddingAngle={2}>
                {result.categories.map((item, index) => <Cell key={item.slug} fill={PALETTE[index % PALETTE.length]} />)}
              </Pie>
              <Tooltip formatter={(value: number) => value + " / 100"} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {result.categories.map((category, index) => (
            <li key={category.slug} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2"><span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: PALETTE[index % PALETTE.length] }} /><span className="truncate">{category.title}</span></span>
              <strong>{Math.round(Number(category.score))}</strong>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="lg:col-span-2">
        <h2 className="text-lg font-bold">{uk.weakest}</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {result.weakest_categories.map((category, index) => (
            <article key={category.slug} className="rounded-2xl border border-line bg-canvas p-4">
              <p className="eyebrow">{uk.priorityHigh} #{index + 1}</p>
              <h3 className="mt-2 font-bold">{category.title}</h3>
              <p className="mt-1 text-sm text-muted">{Math.round(Number(category.score))} / 100</p>
            </article>
          ))}
        </div>
      </Card>
    </div>
  );
}
