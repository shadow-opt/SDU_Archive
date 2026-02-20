import useSWR from 'swr';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetcher } from '../services/api';
import InlineNotice from '../components/InlineNotice';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

type DashboardData = {
  kpi: {
    total_users: number;
    total_answers: number;
    average_accuracy: number;
    today_points: number;
  };
  wrong_questions: Array<{
    question_id: string;
    prompt: string;
    wrong_count: number;
    accuracy_rate: number;
  }>;
  top_users: Array<{
    user_id: string;
    email: string;
    total_points: number;
    total_answers: number;
  }>;
};

export default function AdminDashboard() {
  const { data, error, isLoading, mutate } = useSWR<DashboardData>('/api/admin/dashboard', fetcher);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-56 bg-gray-100 rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="h-24 rounded-xl border border-ink-dark/10 bg-gray-50 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <InlineNotice
        type="error"
        message="统计数据加载失败，请稍后重试"
      />
    );
  }

  const cards = [
    { label: '总用户数', value: data.kpi.total_users },
    { label: '总答题数', value: data.kpi.total_answers },
    { label: '全站平均准确率', value: `${data.kpi.average_accuracy.toFixed(2)}%` },
    { label: '今日新增积分', value: data.kpi.today_points },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-serif font-bold">答题状况统计大盘</h1>
        <button
          type="button"
          onClick={() => void mutate()}
          className="px-3 py-2 rounded-md border border-ink-dark/20 hover:border-[#9C0C13] text-sm"
        >
          刷新数据
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardHeader>
              <CardTitle className="text-sm text-ink-light font-sans">{card.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-[#9C0C13]">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">高频错题榜单 Top 5</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 mb-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.wrong_questions} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="prompt" tickFormatter={(value: string | number) => String(value).slice(0, 8)} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="wrong_count" fill="#9C0C13" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-3 py-2">题干</th>
                  <th className="px-3 py-2">答错次数</th>
                  <th className="px-3 py-2">准确率%</th>
                </tr>
              </thead>
              <tbody>
                {data.wrong_questions.map((item) => (
                  <tr key={item.question_id} className="border-t border-ink-dark/10">
                    <td className="px-3 py-2 line-clamp-2">{item.prompt}</td>
                    <td className="px-3 py-2">{item.wrong_count}</td>
                    <td className="px-3 py-2">{item.accuracy_rate.toFixed(2)}</td>
                  </tr>
                ))}
                {!data.wrong_questions.length && (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-ink-light">暂无数据</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">活跃用户积分榜 Top 10</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 mb-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.top_users} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="email" tickFormatter={(value: string | number) => String(value).split('@')[0].slice(0, 8)} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="total_points" fill="#9C0C13" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-3 py-2">用户</th>
                  <th className="px-3 py-2">积分</th>
                  <th className="px-3 py-2">答题数</th>
                </tr>
              </thead>
              <tbody>
                {data.top_users.map((item) => (
                  <tr key={item.user_id} className="border-t border-ink-dark/10">
                    <td className="px-3 py-2 truncate max-w-[220px]">{item.email}</td>
                    <td className="px-3 py-2">{item.total_points}</td>
                    <td className="px-3 py-2">{item.total_answers}</td>
                  </tr>
                ))}
                {!data.top_users.length && (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-ink-light">暂无数据</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
