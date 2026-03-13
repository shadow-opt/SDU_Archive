import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import InlineNotice from '../components/InlineNotice';
import { getAuthToken } from '../services/api';
import {
  fetchQuizCollections,
  fetchQuizQuestions,
  fetchQuizSummary,
  toQuizErrorMessage,
  type Question,
  type QuizCollection,
  type QuizSummary,
  type SubmissionResult,
} from './quiz/shared';

type LocationState = {
  lastSubmission?: SubmissionResult;
};

export default function QuizResults() {
  const token = getAuthToken();
  const location = useLocation();
  const { collectionId = '' } = useParams();
  const state = (location.state as LocationState | null) ?? null;
  const [collections, setCollections] = useState<QuizCollection[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [summary, setSummary] = useState<QuizSummary | null>(null);
  const [notice, setNotice] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [loading, setLoading] = useState(false);
  const [reloadSeed, setReloadSeed] = useState(0);

  const reloadResultData = () => setReloadSeed((value) => value + 1);

  useEffect(() => {
    if (!token || !collectionId) return;
    const controller = new AbortController();
    setLoading(true);
    void Promise.all([
      fetchQuizCollections(controller.signal),
      fetchQuizQuestions(collectionId, controller.signal),
      fetchQuizSummary(collectionId, controller.signal),
    ])
      .then(([nextCollections, nextQuestions, nextSummary]) => {
        setCollections(nextCollections);
        setQuestions(nextQuestions);
        setSummary(nextSummary);
        setNotice(null);
      })
      .catch((error) => {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        setCollections([]);
        setQuestions([]);
        setSummary(null);
        setNotice({ msg: toQuizErrorMessage(error, '结果加载失败，请稍后重试'), type: 'error' });
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [collectionId, reloadSeed, token]);

  const selectedCollection = useMemo(
    () => collections.find((collection) => collection.id === collectionId) ?? null,
    [collectionId, collections],
  );

  if (!token) {
    return (
      <div className="max-w-2xl mx-auto bg-white border border-ink-dark/10 rounded-2xl p-8 text-center">
        <h2 className="text-2xl font-serif font-bold mb-3">专题结果页</h2>
        <p className="text-ink-light mb-6">查看结果需要先登录账号。</p>
        <Link to="/" className="inline-flex px-5 py-2.5 bg-sdu-red text-white rounded-lg hover:bg-sdu-red-hover transition-colors">
          返回首页登录
        </Link>
      </div>
    );
  }

  if (!loading && !selectedCollection && notice?.type !== 'error') {
    return (
      <div className="max-w-3xl mx-auto bg-white border border-ink-dark/10 rounded-2xl p-8 text-center">
        <h2 className="text-2xl font-serif font-bold mb-3">专题不存在</h2>
        <p className="text-ink-light mb-6">请返回专题列表重新选择。</p>
        <Link to="/quiz" className="inline-flex px-5 py-2.5 bg-sdu-red text-white rounded-lg hover:bg-sdu-red-hover transition-colors">
          返回专题列表
        </Link>
      </div>
    );
  }

  const answeredCount = summary?.total_answers ?? 0;
  const totalQuestions = summary?.total_questions ?? questions.length;
  const remainingCount = Math.max(totalQuestions - answeredCount, 0);
  const accuracy = answeredCount > 0
    ? Math.round((summary!.answer_history.filter((item) => item.is_correct).length / answeredCount) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-ink-dark/10 rounded-2xl p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-sdu-red mb-2">互动答题 / 结果页</p>
            <h1 className="text-3xl font-serif font-bold text-ink-dark mb-3">{selectedCollection?.title ?? '专题结果'}</h1>
            <p className="text-ink-light max-w-3xl">查看本专题作答结果与历史记录。</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/quiz" className="px-4 py-2.5 rounded-lg border border-ink-dark/20 hover:border-sdu-red transition-colors">返回专题列表</Link>
            {collectionId && (
              <Link to={`/quiz/${collectionId}`} className="px-4 py-2.5 rounded-lg bg-sdu-red text-white hover:bg-sdu-red-hover transition-colors">
                返回作答页
              </Link>
            )}
          </div>
        </div>
      </div>

      {state?.lastSubmission && (
        <div className={[
          'rounded-2xl border p-5',
          state.lastSubmission.correct ? 'border-green-200 bg-green-50 text-green-900' : 'border-red-200 bg-red-50 text-red-900',
        ].join(' ')}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
            <h2 className="text-lg font-semibold">最近一次提交结果</h2>
            <span className="text-sm font-medium">
              {state.lastSubmission.correct ? `回答正确，+${state.lastSubmission.awarded} 分` : '回答错误'}
            </span>
          </div>
          <p className="text-sm">你的答案：{state.lastSubmission.selected_option}</p>
          <p className="text-sm mt-1">正确答案：{state.lastSubmission.correct_option}</p>
          {state.lastSubmission.explanation && <p className="text-sm mt-1">题目解析：{state.lastSubmission.explanation}</p>}
        </div>
      )}

      {notice && <InlineNotice message={notice.msg} type={notice.type} />}
      {notice?.type === 'error' && !loading && (
        <button
          type="button"
          onClick={reloadResultData}
          className="px-4 py-2 rounded-lg border border-ink-dark/20 hover:border-sdu-red transition-colors"
        >
          重试加载
        </button>
      )}
      {loading && <p className="text-sm text-ink-light">加载中...</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="bg-white border border-ink-dark/10 rounded-2xl p-5">
          <p className="text-sm text-ink-light mb-2">累计积分</p>
          <p className="text-3xl font-bold text-sdu-red">{summary?.total_points ?? 0}</p>
        </div>
        <div className="bg-white border border-ink-dark/10 rounded-2xl p-5">
          <p className="text-sm text-ink-light mb-2">完成进度</p>
          <p className="text-3xl font-bold text-ink-dark">{answeredCount}/{totalQuestions}</p>
        </div>
        <div className="bg-white border border-ink-dark/10 rounded-2xl p-5">
          <p className="text-sm text-ink-light mb-2">正确率</p>
          <p className="text-3xl font-bold text-ink-dark">{accuracy}%</p>
        </div>
        <div className="bg-white border border-ink-dark/10 rounded-2xl p-5">
          <p className="text-sm text-ink-light mb-2">剩余未答</p>
          <p className="text-3xl font-bold text-ink-dark">{remainingCount}</p>
        </div>
      </div>

      <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)] gap-6">
        <div className="bg-white border border-ink-dark/10 rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-xl font-serif font-bold">作答历史</h2>
            <span className="text-xs text-ink-light">{summary?.answer_history.length ?? 0} 条记录</span>
          </div>

          {!summary?.answer_history.length && !loading && (
            <p className="text-sm text-ink-light">你还没有答题记录，前往作答页开始挑战。</p>
          )}

          {!!summary?.answer_history.length && (
            <div className="space-y-4">
              {summary.answer_history.map((item) => (
                <article key={item.question_id} className="rounded-xl border border-ink-dark/10 px-4 py-4 bg-paper-bg/40">
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                    <h3 className="font-medium text-ink-dark">{item.prompt}</h3>
                    <span className={item.is_correct ? 'text-xs text-green-700' : 'text-xs text-red-700'}>
                      {item.is_correct ? `正确 +${item.points_awarded}` : '错误'}
                    </span>
                  </div>
                  <div className="text-sm space-y-1">
                    <p className="text-ink-light">你的答案：{item.selected_option}</p>
                    <p className="text-ink-light">正确答案：{item.correct_option}</p>
                    {item.explanation && <p className="text-ink-dark">题目解析：{item.explanation}</p>}
                    <p className="text-xs text-ink-light pt-1">提交时间：{new Date(item.answered_at).toLocaleString()}</p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <aside className="bg-white border border-ink-dark/10 rounded-2xl p-5 sm:p-6 h-fit">
          <h2 className="text-xl font-serif font-bold mb-4">专题概览</h2>
          <div className="space-y-4 text-sm">
            <div className="rounded-xl bg-paper-bg/50 px-4 py-4">
              <p className="text-ink-light mb-1">专题说明</p>
              <p className="text-ink-dark">{selectedCollection?.description || '暂无专题说明'}</p>
            </div>
            <div className="rounded-xl bg-paper-bg/50 px-4 py-4">
              <p className="text-ink-light mb-1">题目总数</p>
              <p className="text-2xl font-bold text-ink-dark">{questions.length}</p>
            </div>
            <div className="rounded-xl bg-paper-bg/50 px-4 py-4">
              <p className="text-ink-light mb-1">学习建议</p>
              <p className="text-ink-dark">{remainingCount > 0 ? `还有 ${remainingCount} 道题待完成。` : '当前专题已全部完成。'}</p>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
