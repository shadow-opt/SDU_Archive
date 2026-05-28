import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import InlineNotice from '../components/InlineNotice';
import { ensureGuestQuizToken, getQuizAuthToken } from '../services/api';
import {
  fetchQuizCollections,
  fetchQuizQuestions,
  fetchQuizSummary,
  isExpiredAuthError,
  toQuizErrorMessage,
  type Question,
  type QuizCollection,
  type QuizSummary,
} from './quiz/shared';

export default function QuizResults() {
  const [quizToken, setQuizToken] = useState(() => getQuizAuthToken());
  const { collectionId = '' } = useParams();
  const [collections, setCollections] = useState<QuizCollection[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [summary, setSummary] = useState<QuizSummary | null>(null);
  const [notice, setNotice] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadSeed, setReloadSeed] = useState(0);

  const reloadResultData = () => setReloadSeed((value) => value + 1);

  useEffect(() => {
    if (!collectionId) return;
    const controller = new AbortController();
    const loadResultData = async (allowGuestRetry = true) => {
      const token = await ensureGuestQuizToken();
      try {
        setQuizToken(token);
        setLoading(true);
        return await Promise.all([
          fetchQuizCollections(controller.signal),
          fetchQuizQuestions(collectionId, controller.signal),
          fetchQuizSummary(collectionId, controller.signal),
        ]);
      } catch (error) {
        if (allowGuestRetry && isExpiredAuthError(error)) {
          const nextToken = await ensureGuestQuizToken();
          setQuizToken(nextToken);
          return await loadResultData(false);
        }
        throw error;
      }
    };
    void loadResultData()
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
  }, [collectionId, reloadSeed]);

  const selectedCollection = useMemo(
    () => collections.find((collection) => collection.id === collectionId) ?? null,
    [collectionId, collections],
  );

  if (!loading && !selectedCollection && notice?.type !== 'error') {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-ink-dark/10 bg-white p-6 text-center sm:p-8">
        <h2 className="text-2xl font-serif font-bold mb-3">专题不存在</h2>
        <p className="text-ink-light mb-6">请返回专题列表重新选择。</p>
        <Link to="/quiz" className="inline-flex w-full justify-center rounded-lg bg-sdu-red px-5 py-2.5 text-white transition-colors hover:bg-sdu-red-hover sm:w-auto">
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
  const latestAnswer = summary?.answer_history[0] ?? null;

  return (
    <div className="space-y-4 overflow-x-hidden sm:space-y-6">
      <div className="rounded-2xl border border-ink-dark/10 bg-white p-4 sm:p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="mb-2 text-sm uppercase tracking-[0.12em] text-sdu-red sm:tracking-[0.2em]">互动答题 / 结果页</p>
            <h1 className="mb-3 text-2xl font-serif font-bold text-ink-dark sm:text-3xl">{selectedCollection?.title ?? '专题结果'}</h1>
            <p className="text-ink-light max-w-3xl">查看本专题作答结果与历史记录。</p>
          </div>
          <div className="grid w-full grid-cols-1 gap-3 sm:w-auto sm:grid-cols-2">
            <Link to="/quiz" className="rounded-lg border border-ink-dark/20 px-4 py-2.5 text-center transition-colors hover:border-sdu-red">返回专题列表</Link>
            {collectionId && (
              <Link to={`/quiz/${collectionId}`} className="rounded-lg bg-sdu-red px-4 py-2.5 text-center text-white transition-colors hover:bg-sdu-red-hover">
                返回作答页
              </Link>
            )}
          </div>
        </div>
      </div>

      {notice && <InlineNotice message={notice.msg} type={notice.type} />}
      {notice?.type === 'error' && !loading && (
        <button
          type="button"
          onClick={reloadResultData}
          className="w-full rounded-lg border border-ink-dark/20 px-4 py-2 transition-colors hover:border-sdu-red sm:w-auto"
        >
          重试加载
        </button>
      )}
      {loading && <p className="text-sm text-ink-light">{quizToken ? '加载中...' : '正在进入答题...'}</p>}

      {latestAnswer && (
        <div className={[
          'rounded-2xl border p-4 sm:p-5',
          latestAnswer.is_correct ? 'border-green-200 bg-green-50 text-green-900' : 'border-amber-200 bg-amber-50 text-amber-900',
        ].join(' ')}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">最近一次作答</h2>
            <span className="text-sm font-medium">
              {latestAnswer.is_correct ? `回答正确，+${latestAnswer.points_awarded} 分` : '回答错误'}
            </span>
          </div>
          <p className="text-sm font-medium text-ink-dark">{latestAnswer.prompt}</p>
          <p className="mt-2 text-sm">你的答案：{latestAnswer.selected_option}</p>
          <p className="mt-1 text-sm">正确答案：{latestAnswer.correct_option}</p>
          {latestAnswer.explanation && <p className="mt-1 text-sm text-ink-dark">题目解析：{latestAnswer.explanation}</p>}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-ink-dark/10 bg-white p-4 sm:p-5">
          <p className="text-sm text-ink-light mb-2">累计积分</p>
          <p className="text-2xl font-bold text-sdu-red sm:text-3xl">{summary?.total_points ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-ink-dark/10 bg-white p-4 sm:p-5">
          <p className="text-sm text-ink-light mb-2">完成进度</p>
          <p className="text-2xl font-bold text-ink-dark sm:text-3xl">{answeredCount}/{totalQuestions}</p>
        </div>
        <div className="rounded-2xl border border-ink-dark/10 bg-white p-4 sm:p-5">
          <p className="text-sm text-ink-light mb-2">正确率</p>
          <p className="text-2xl font-bold text-ink-dark sm:text-3xl">{accuracy}%</p>
        </div>
        <div className="rounded-2xl border border-ink-dark/10 bg-white p-4 sm:p-5">
          <p className="text-sm text-ink-light mb-2">剩余未答</p>
          <p className="text-2xl font-bold text-ink-dark sm:text-3xl">{remainingCount}</p>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
        <div className="min-w-0 rounded-2xl border border-ink-dark/10 bg-white p-4 sm:p-6">
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
                <article key={item.question_id} className="rounded-xl border border-ink-dark/10 bg-paper-bg/40 px-3 py-3 sm:px-4 sm:py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                    <h3 className="min-w-0 font-medium text-ink-dark">{item.prompt}</h3>
                    <span className={item.is_correct ? 'text-xs text-green-700' : 'text-xs text-red-700'}>
                      {item.is_correct ? `正确 +${item.points_awarded}` : '错误'}
                    </span>
                  </div>
                  <div className="space-y-1 break-words text-sm">
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

        <aside className="h-fit rounded-2xl border border-ink-dark/10 bg-white p-4 sm:p-6">
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
