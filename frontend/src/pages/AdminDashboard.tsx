import { useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiBase, getAuthHeaders, fetcher } from '../services/api';
import InlineNotice from '../components/InlineNotice';

type QuizCollection = {
  id: string;
  title: string;
  description?: string | null;
  sort_order: number;
  is_published: boolean;
  question_count: number;
};

type UserSegment = 'all' | 'guest' | 'registered';
type ExportKind = 'collections' | 'wrong_questions' | 'leaderboard';

type QuizCollectionDashboard = {
  range_days?: number | null;
  collection_id?: string | null;
  user_segment: UserSegment;
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
    role: 'admin' | 'user' | 'guest';
    total_points: number;
    total_answers: number;
    accuracy_rate: number;
  }>;
  daily_trend: Array<{
    date: string;
    participant_count: number;
    total_answers: number;
    total_points_awarded: number;
    accuracy_rate: number;
    guest_answers: number;
    registered_answers: number;
  }>;
  segments: Array<{
    segment: 'guest' | 'registered';
    participant_count: number;
    total_answers: number;
    total_points_awarded: number;
    accuracy_rate: number;
  }>;
};

const formatNumber = (value: number) => new Intl.NumberFormat('zh-CN').format(value);
const formatPercent = (value: number) => `${value.toFixed(1)}%`;
const displayUser = (email: string, role: string) => (role === 'guest' ? '游客用户' : email);
const segmentLabel = (segment: 'guest' | 'registered') => (segment === 'guest' ? '游客' : '实名用户');

export default function AdminDashboard() {
  const [rangeDays, setRangeDays] = useState<string>('30');
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>('all');
  const [userSegment, setUserSegment] = useState<UserSegment>('all');
  const [leaderboardLimit, setLeaderboardLimit] = useState('10');
  const [exporting, setExporting] = useState<ExportKind | null>(null);
  const { data: collections } = useSWR<QuizCollection[]>('/api/quiz/collections/admin', fetcher);
  const statsKey = useMemo(() => {
    const params = new URLSearchParams({ user_segment: userSegment, leaderboard_limit: leaderboardLimit });
    if (rangeDays !== 'all') {
      params.set('days', rangeDays);
    }
    if (selectedCollectionId !== 'all') {
      params.set('collection_id', selectedCollectionId);
    }
    return `/api/admin/dashboard/quiz-collections?${params.toString()}`;
  }, [leaderboardLimit, rangeDays, selectedCollectionId, userSegment]);
  const { data, error, isLoading, mutate } = useSWR<QuizCollectionDashboard>(statsKey, fetcher);

  const selectedCollection = useMemo(
    () => (collections ?? []).find((collection) => collection.id === selectedCollectionId) ?? null,
    [collections, selectedCollectionId],
  );

  const totals = useMemo(() => {
    const source = data?.collections ?? [];
    const participantCount = source.reduce((sum, item) => sum + item.participant_count, 0);
    const totalAnswers = source.reduce((sum, item) => sum + item.total_answers, 0);
    const totalPoints = source.reduce((sum, item) => sum + item.total_points_awarded, 0);
    const weightedAccuracy = totalAnswers
      ? source.reduce((sum, item) => sum + item.total_answers * item.average_accuracy, 0) / totalAnswers
      : 0;
    return { participantCount, totalAnswers, totalPoints, weightedAccuracy };
  }, [data?.collections]);

  const segmentMax = useMemo(
    () => Math.max(1, ...(data?.segments ?? []).map((item) => item.total_answers)),
    [data?.segments],
  );

  const exportCsv = async (kind: ExportKind) => {
    setExporting(kind);
    const params = new URLSearchParams({ kind, user_segment: userSegment });
    if (rangeDays !== 'all') {
      params.set('days', rangeDays);
    }
    if (selectedCollectionId !== 'all') {
      params.set('collection_id', selectedCollectionId);
    }
    try {
      const res = await fetch(`${apiBase}/api/admin/dashboard/quiz-collections/export?${params.toString()}`, {
        headers: getAuthHeaders(false),
      });
      if (!res.ok) {
        throw new Error('导出失败');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `quiz-${kind}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(null);
    }
  };

  if (error) {
    return <InlineNotice type="error" message="统计数据加载失败，请稍后重试" />;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-ink-dark/10 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm text-ink-light">互动答题运营</p>
            <h1 className="mt-1 text-2xl font-serif font-bold text-ink-dark">答题统计大盘</h1>
            <p className="mt-2 text-sm text-ink-light">
              {selectedCollection ? `当前查看：${selectedCollection.title}` : '全专题总览'}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5 xl:min-w-[760px]">
            <select value={rangeDays} onChange={(event) => setRangeDays(event.target.value)} className="rounded-lg border border-ink-dark/20 bg-white px-3 py-2 text-sm">
              <option value="all">全部时间</option>
              <option value="1">近 1 天</option>
              <option value="7">近 7 天</option>
              <option value="30">近 30 天</option>
              <option value="90">近 90 天</option>
            </select>
            <select value={selectedCollectionId} onChange={(event) => setSelectedCollectionId(event.target.value)} className="rounded-lg border border-ink-dark/20 bg-white px-3 py-2 text-sm md:col-span-2">
              <option value="all">全部专题</option>
              {(collections ?? []).map((collection) => (
                <option key={collection.id} value={collection.id}>{collection.title}</option>
              ))}
            </select>
            <select value={userSegment} onChange={(event) => setUserSegment(event.target.value as UserSegment)} className="rounded-lg border border-ink-dark/20 bg-white px-3 py-2 text-sm">
              <option value="all">全部用户</option>
              <option value="registered">实名用户</option>
              <option value="guest">游客</option>
            </select>
            <button type="button" onClick={() => void mutate()} className="rounded-lg border border-ink-dark/20 px-3 py-2 text-sm hover:border-sdu-red">
              刷新数据
            </button>
          </div>
        </div>
      </section>

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-xl border border-ink-dark/10 bg-white" />
          ))}
        </div>
      )}

      {data && (
        <>
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              { label: '参与人数', value: formatNumber(totals.participantCount), hint: `${data.collections.length} 个专题` },
              { label: '总作答数', value: formatNumber(totals.totalAnswers), hint: '当前筛选口径' },
              { label: '平均正确率', value: formatPercent(totals.weightedAccuracy), hint: '按答题数加权' },
              { label: '发放积分', value: formatNumber(totals.totalPoints), hint: '答对题目累计' },
            ].map((item) => (
              <article key={item.label} className="rounded-xl border border-ink-dark/10 bg-white p-5 shadow-sm">
                <p className="text-sm text-ink-light">{item.label}</p>
                <p className="mt-3 text-3xl font-bold text-sdu-red">{item.value}</p>
                <p className="mt-2 text-xs text-ink-light">{item.hint}</p>
              </article>
            ))}
          </section>

          <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <article className="rounded-xl border border-ink-dark/10 bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-serif font-bold">每日趋势</h2>
                  <p className="text-sm text-ink-light">参与、答题量与正确率变化</p>
                </div>
                <div className="flex items-center gap-4 text-xs text-ink-light">
                  <span>答题数</span>
                  <span>正确率</span>
                </div>
              </div>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.daily_trend} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} domain={[0, 100]} />
                    <Tooltip contentStyle={{ fontSize: '12px' }} />
                    <Line yAxisId="left" type="monotone" dataKey="total_answers" name="答题数" stroke="#9C0C13" strokeWidth={2} dot={false} />
                    <Line yAxisId="left" type="monotone" dataKey="participant_count" name="参与人数" stroke="#2563EB" strokeWidth={2} dot={false} />
                    <Line yAxisId="right" type="monotone" dataKey="accuracy_rate" name="正确率" stroke="#15803D" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {!data.daily_trend.length && <p className="py-6 text-center text-sm text-ink-light">当前筛选暂无趋势数据</p>}
            </article>

            <aside className="rounded-xl border border-ink-dark/10 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-serif font-bold">用户类型</h2>
              <p className="mt-1 text-sm text-ink-light">游客与实名用户对比</p>
              <div className="mt-5 space-y-5">
                {data.segments.map((item) => (
                  <div key={item.segment}>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-medium text-ink-dark">{segmentLabel(item.segment)}</span>
                      <span className="text-ink-light">{formatNumber(item.total_answers)} 题</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100">
                      <div className="h-2 rounded-full bg-sdu-red" style={{ width: `${Math.max(4, (item.total_answers / segmentMax) * 100)}%` }} />
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-ink-light">
                      <span>参与 {formatNumber(item.participant_count)}</span>
                      <span>积分 {formatNumber(item.total_points_awarded)}</span>
                      <span>正确率 {formatPercent(item.accuracy_rate)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </aside>
          </section>

          <section className="rounded-xl border border-ink-dark/10 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-serif font-bold">专题运营</h2>
                <p className="text-sm text-ink-light">参与人数、完成率、得分与正确率</p>
              </div>
              <button type="button" onClick={() => void exportCsv('collections')} className="rounded-lg border border-ink-dark/20 px-3 py-2 text-sm hover:border-sdu-red" disabled={exporting === 'collections'}>
                {exporting === 'collections' ? '导出中...' : '导出专题 CSV'}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-ink-light">
                  <tr>
                    <th className="px-3 py-3">专题</th>
                    <th className="px-3 py-3">参与</th>
                    <th className="px-3 py-3">完成率</th>
                    <th className="px-3 py-3">平均得分</th>
                    <th className="px-3 py-3">正确率</th>
                    <th className="px-3 py-3">答题数</th>
                    <th className="px-3 py-3">积分</th>
                  </tr>
                </thead>
                <tbody>
                  {data.collections.map((item) => (
                    <tr key={item.collection_id} className="border-t border-ink-dark/10">
                      <td className="px-3 py-3">
                        <div className="font-medium text-ink-dark">{item.title}</div>
                        <div className="mt-1 text-xs text-ink-light">{item.question_count} 题 · {item.is_published ? '已发布' : '未发布'}</div>
                      </td>
                      <td className="px-3 py-3">{formatNumber(item.participant_count)}</td>
                      <td className="px-3 py-3">{formatPercent(item.completion_rate)}</td>
                      <td className="px-3 py-3">{item.average_score.toFixed(1)}</td>
                      <td className="px-3 py-3">{formatPercent(item.average_accuracy)}</td>
                      <td className="px-3 py-3">{formatNumber(item.total_answers)}</td>
                      <td className="px-3 py-3">{formatNumber(item.total_points_awarded)}</td>
                    </tr>
                  ))}
                  {!data.collections.length && (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-ink-light">暂无专题统计数据</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <article className="rounded-xl border border-ink-dark/10 bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-serif font-bold">错题诊断</h2>
                  <p className="text-sm text-ink-light">优先处理答错次数高、正确率低的题目</p>
                </div>
                <button type="button" onClick={() => void exportCsv('wrong_questions')} className="rounded-lg border border-ink-dark/20 px-3 py-2 text-sm hover:border-sdu-red" disabled={exporting === 'wrong_questions'}>
                  {exporting === 'wrong_questions' ? '导出中...' : '导出错题'}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left text-ink-light">
                    <tr>
                      <th className="px-3 py-3">题目</th>
                      <th className="px-3 py-3">答错</th>
                      <th className="px-3 py-3">尝试</th>
                      <th className="px-3 py-3">正确率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.wrong_questions.map((item) => (
                      <tr key={item.question_id} className="border-t border-ink-dark/10 align-top">
                        <td className="px-3 py-3">
                          <div className="line-clamp-2 font-medium text-ink-dark">{item.prompt}</div>
                          <div className="mt-1 text-xs text-ink-light">{item.collection_title}</div>
                        </td>
                        <td className="px-3 py-3 text-sdu-red font-semibold">{item.wrong_count}</td>
                        <td className="px-3 py-3">{item.attempt_count}</td>
                        <td className="px-3 py-3">{formatPercent(item.accuracy_rate)}</td>
                      </tr>
                    ))}
                    {!data.wrong_questions.length && (
                      <tr>
                        <td colSpan={4} className="px-3 py-8 text-center text-ink-light">暂无错题数据</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="rounded-xl border border-ink-dark/10 bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-serif font-bold">排行榜</h2>
                  <p className="text-sm text-ink-light">按积分和答题数排序</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select value={leaderboardLimit} onChange={(event) => setLeaderboardLimit(event.target.value)} className="rounded-lg border border-ink-dark/20 bg-white px-3 py-2 text-sm">
                    <option value="10">Top 10</option>
                    <option value="30">Top 30</option>
                    <option value="100">Top 100</option>
                  </select>
                  <button type="button" onClick={() => void exportCsv('leaderboard')} className="rounded-lg border border-ink-dark/20 px-3 py-2 text-sm hover:border-sdu-red" disabled={exporting === 'leaderboard'}>
                    {exporting === 'leaderboard' ? '导出中...' : '导出排行'}
                  </button>
                </div>
              </div>
              <div className="mb-4 h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.leaderboard.slice(0, 10)} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="email" tickFormatter={(value: string) => value.split('@')[0].slice(0, 8)} tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value) => [String(value), '积分']} labelFormatter={(value) => String(value).startsWith('guest-') ? '游客用户' : String(value)} contentStyle={{ fontSize: '12px' }} />
                    <Bar dataKey="total_points" fill="#9C0C13" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left text-ink-light">
                    <tr>
                      <th className="px-3 py-3">用户</th>
                      <th className="px-3 py-3">积分</th>
                      <th className="px-3 py-3">答题</th>
                      <th className="px-3 py-3">正确率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.leaderboard.map((item) => (
                      <tr key={item.user_id} className="border-t border-ink-dark/10">
                        <td className="px-3 py-3">
                          <div className="max-w-[220px] truncate font-medium text-ink-dark">{displayUser(item.email, item.role)}</div>
                          <div className="mt-1 text-xs text-ink-light">{item.role === 'guest' ? '游客' : item.email}</div>
                        </td>
                        <td className="px-3 py-3">{formatNumber(item.total_points)}</td>
                        <td className="px-3 py-3">{formatNumber(item.total_answers)}</td>
                        <td className="px-3 py-3">{formatPercent(item.accuracy_rate)}</td>
                      </tr>
                    ))}
                    {!data.leaderboard.length && (
                      <tr>
                        <td colSpan={4} className="px-3 py-8 text-center text-ink-light">暂无排行榜数据</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        </>
      )}
    </div>
  );
}
