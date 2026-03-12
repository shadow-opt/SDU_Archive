import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
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

type QuizCollection = {
  id: string;
  title: string;
  description?: string | null;
  sort_order: number;
  is_published: boolean;
  question_count: number;
};

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

type QuizCollectionDashboard = {
  range_days?: number | null;
  collection_id?: string | null;
  collections: Array<{
    collection_id: string;
    title: string;
    is_published: boolean;
    question_count: number;
    participant_count: number;
    completed_user_count: number;
    completion_rate: number;
    total_answers: number;
    total_points_awarded: number;
    average_score: number;
    average_accuracy: number;
  }>;
  wrong_questions: Array<{
    question_id: string;
    collection_id: string;
    collection_title: string;
    prompt: string;
    wrong_count: number;
    attempt_count: number;
    accuracy_rate: number;
  }>;
  leaderboard: Array<{
    user_id: string;
    email: string;
    total_points: number;
    total_answers: number;
    accuracy_rate: number;
  }>;
};

export default function AdminDashboard() {
  const [rangeDays, setRangeDays] = useState<string>('all');
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>('all');
  const { data, error, isLoading, mutate } = useSWR<DashboardData>('/api/admin/dashboard', fetcher);
  const { data: collections } = useSWR<QuizCollection[]>('/api/quiz/collections/admin', fetcher);
  const statsKey = useMemo(() => {
    const params = new URLSearchParams();
    if (rangeDays !== 'all') {
      params.set('days', rangeDays);
    }
    if (selectedCollectionId !== 'all') {
      params.set('collection_id', selectedCollectionId);
    }
    const query = params.toString();
    return `/api/admin/dashboard/quiz-collections${query ? `?${query}` : ''}`;
  }, [rangeDays, selectedCollectionId]);
  const { data: collectionStats, error: statsError, isLoading: statsLoading, mutate: mutateCollectionStats } = useSWR<QuizCollectionDashboard>(statsKey, fetcher);

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

  const visibleCollectionCount = collectionStats?.collections.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-serif font-bold">答题状况统计大盘</h1>
        <button
          type="button"
          onClick={() => {
            void mutate();
            void mutateCollectionStats();
          }}
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
                <BarChart data={data.wrong_questions} margin={{ top: 8, right: 8, bottom: 20, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="prompt"
                    tickFormatter={(value: string | number) => String(value).slice(0, 8)}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ fontSize: '12px' }}
                    labelFormatter={(label: ReactNode) => `题目: ${String(label ?? '').slice(0, 30)}...`}
                  />
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
                <BarChart data={data.top_users} margin={{ top: 8, right: 8, bottom: 20, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="email"
                    tickFormatter={(value: string | number) => String(value).split('@')[0].slice(0, 8)}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ fontSize: '12px' }}
                    labelFormatter={(label: ReactNode) => String(label ?? '')}
                  />
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

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-lg">专题维度统计</CardTitle>
              <p className="text-sm text-ink-light mt-1">按专题查看参与人数、完成率、平均得分、正确率与错题表现。</p>
            </div>
            <div className="flex flex-col gap-3 md:flex-row">
              <select
                value={rangeDays}
                onChange={(event) => setRangeDays(event.target.value)}
                className="px-3 py-2 rounded-md border border-ink-dark/20 bg-white text-sm"
              >
                <option value="all">全部时间</option>
                <option value="1">近 1 天</option>
                <option value="7">近 7 天</option>
                <option value="30">近 30 天</option>
              </select>
              <select
                value={selectedCollectionId}
                onChange={(event) => setSelectedCollectionId(event.target.value)}
                className="px-3 py-2 rounded-md border border-ink-dark/20 bg-white text-sm"
              >
                <option value="all">全部专题</option>
                {(collections ?? []).map((collection) => (
                  <option key={collection.id} value={collection.id}>{collection.title}</option>
                ))}
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {statsError && <InlineNotice type="error" message="专题统计加载失败，请稍后重试" />}
          {statsLoading && <p className="text-sm text-ink-light">专题统计加载中...</p>}

          {!statsLoading && !!collectionStats && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="rounded-xl border border-ink-dark/10 px-4 py-4">
                  <p className="text-sm text-ink-light">统计中的专题数</p>
                  <p className="text-3xl font-bold text-[#9C0C13] mt-2">{visibleCollectionCount}</p>
                </div>
                <div className="rounded-xl border border-ink-dark/10 px-4 py-4">
                  <p className="text-sm text-ink-light">专题总参与人次</p>
                  <p className="text-3xl font-bold text-[#9C0C13] mt-2">{collectionStats.collections.reduce((sum, item) => sum + item.participant_count, 0)}</p>
                </div>
                <div className="rounded-xl border border-ink-dark/10 px-4 py-4">
                  <p className="text-sm text-ink-light">专题总作答数</p>
                  <p className="text-3xl font-bold text-[#9C0C13] mt-2">{collectionStats.collections.reduce((sum, item) => sum + item.total_answers, 0)}</p>
                </div>
                <div className="rounded-xl border border-ink-dark/10 px-4 py-4">
                  <p className="text-sm text-ink-light">专题总积分发放</p>
                  <p className="text-3xl font-bold text-[#9C0C13] mt-2">{collectionStats.collections.reduce((sum, item) => sum + item.total_points_awarded, 0)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div>
                  <div className="h-72 mb-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={collectionStats.collections} margin={{ top: 8, right: 8, bottom: 20, left: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="title" tickFormatter={(value: string | number) => String(value).slice(0, 8)} tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip contentStyle={{ fontSize: '12px' }} />
                        <Bar dataKey="participant_count" fill="#9C0C13" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="overflow-x-auto border border-ink-dark/10 rounded-lg">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50 text-left">
                        <tr>
                          <th className="px-3 py-2">专题</th>
                          <th className="px-3 py-2">参与人数</th>
                          <th className="px-3 py-2">完成率</th>
                          <th className="px-3 py-2">平均得分</th>
                          <th className="px-3 py-2">平均正确率</th>
                        </tr>
                      </thead>
                      <tbody>
                        {collectionStats.collections.map((item) => (
                          <tr key={item.collection_id} className="border-t border-ink-dark/10">
                            <td className="px-3 py-2">
                              <div className="font-medium">{item.title}</div>
                              <div className="text-xs text-ink-light">题目数：{item.question_count} · {item.is_published ? '已发布' : '未发布'}</div>
                            </td>
                            <td className="px-3 py-2">{item.participant_count}</td>
                            <td className="px-3 py-2">{item.completion_rate.toFixed(2)}%</td>
                            <td className="px-3 py-2">{item.average_score.toFixed(2)}</td>
                            <td className="px-3 py-2">{item.average_accuracy.toFixed(2)}%</td>
                          </tr>
                        ))}
                        {!collectionStats.collections.length && (
                          <tr>
                            <td colSpan={5} className="px-3 py-6 text-center text-ink-light">暂无专题统计数据</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="overflow-x-auto border border-ink-dark/10 rounded-lg">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50 text-left">
                        <tr>
                          <th className="px-3 py-2">专题错题榜</th>
                          <th className="px-3 py-2">答错次数</th>
                          <th className="px-3 py-2">尝试数</th>
                          <th className="px-3 py-2">正确率</th>
                        </tr>
                      </thead>
                      <tbody>
                        {collectionStats.wrong_questions.map((item) => (
                          <tr key={item.question_id} className="border-t border-ink-dark/10 align-top">
                            <td className="px-3 py-2">
                              <div className="font-medium line-clamp-2">{item.prompt}</div>
                              <div className="text-xs text-ink-light mt-1">{item.collection_title}</div>
                            </td>
                            <td className="px-3 py-2">{item.wrong_count}</td>
                            <td className="px-3 py-2">{item.attempt_count}</td>
                            <td className="px-3 py-2">{item.accuracy_rate.toFixed(2)}%</td>
                          </tr>
                        ))}
                        {!collectionStats.wrong_questions.length && (
                          <tr>
                            <td colSpan={4} className="px-3 py-6 text-center text-ink-light">暂无错题数据</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="overflow-x-auto border border-ink-dark/10 rounded-lg">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50 text-left">
                        <tr>
                          <th className="px-3 py-2">专题排行榜</th>
                          <th className="px-3 py-2">积分</th>
                          <th className="px-3 py-2">答题数</th>
                          <th className="px-3 py-2">正确率</th>
                        </tr>
                      </thead>
                      <tbody>
                        {collectionStats.leaderboard.map((item) => (
                          <tr key={item.user_id} className="border-t border-ink-dark/10">
                            <td className="px-3 py-2 truncate max-w-[220px]">{item.email}</td>
                            <td className="px-3 py-2">{item.total_points}</td>
                            <td className="px-3 py-2">{item.total_answers}</td>
                            <td className="px-3 py-2">{item.accuracy_rate.toFixed(2)}%</td>
                          </tr>
                        ))}
                        {!collectionStats.leaderboard.length && (
                          <tr>
                            <td colSpan={4} className="px-3 py-6 text-center text-ink-light">暂无排行榜数据</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
