import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const PIE_COLORS = ['#0f766e', '#2563eb', '#d97706', '#7c3aed', '#dc2626', '#0891b2', '#65a30d', '#9333ea'];

interface SurveyResultsChartsProps {
  pieData: { name: string; value: number }[];
  branchBarData: { name: string; metric: number; respondents: number }[];
  hasSentimentAnalytics: boolean;
  locale: string;
}

export function SurveyResultsCharts({
  pieData,
  branchBarData,
  hasSentimentAnalytics,
  locale,
}: SurveyResultsChartsProps) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <div className="rounded-lg border bg-background p-4">
        <p className="mb-3 text-sm font-semibold">
          {hasSentimentAnalytics ? 'Overall Response Distribution' : 'Answer Distribution'}
        </p>
        <ResponsiveContainer width="100%" height={320}>
          <PieChart>
            <Pie data={pieData} cx="50%" cy="50%" innerRadius={75} outerRadius={115} paddingAngle={3} dataKey="value">
              {pieData.map((_, index) => <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(value) => hasSentimentAnalytics ? `${value}%` : Number(value).toLocaleString(locale)} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="rounded-lg border bg-background p-4">
        <p className="mb-3 text-sm font-semibold">
          {hasSentimentAnalytics ? 'Satisfaction by Branch' : 'Responses by Branch'}
        </p>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={branchBarData} layout="vertical" margin={{ left: 12, right: 18 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              type="number"
              domain={hasSentimentAnalytics ? [0, 100] : undefined}
              tickFormatter={(value) => hasSentimentAnalytics ? `${value}%` : String(value)}
              tick={{ fontSize: 11 }}
            />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
            <Tooltip formatter={(value) => hasSentimentAnalytics ? `${value}%` : `${value} respondents`} />
            <Bar dataKey="metric" fill="#10b981" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
