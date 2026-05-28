import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import InlineNotice from '../components/InlineNotice';
import { ensureGuestQuizToken, getQuizAuthToken } from '../services/api';
import {
  buildHistoryMap,
  fetchQuizCollections,
  fetchQuizQuestions,
  fetchQuizSummary,
  isExpiredAuthError,
  pickInitialQuestionId,
  submitQuizAnswer,
  toQuizErrorMessage,
  type AnswerHistoryItem,
  type Question,
  type QuizCollection,
  type QuizSummary,
  type SubmissionResult,
} from './quiz/shared';

export default function QuizPlay() {
  const [quizToken, setQuizToken] = useState(() => getQuizAuthToken());
  const { collectionId = '' } = useParams();
  const [collections, setCollections] = useState<QuizCollection[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [summary, setSummary] = useState<QuizSummary | null>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState('');
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [lastSubmission, setLastSubmission] = useState<SubmissionResult | null>(null);
  const [notice, setNotice] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reloadSeed, setReloadSeed] = useState(0);

  const reloadQuizData = () => setReloadSeed((value) => value + 1);

  useEffect(() => {
    if (!collectionId) return;
    const controller = new AbortController();
    const loadQuizData = async (allowGuestRetry = true) => {
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
          return await loadQuizData(false);
        }
        throw error;
      }
    };
    void loadQuizData()
      .then(([nextCollections, nextQuestions, nextSummary]) => {
        const historyMap = buildHistoryMap(nextSummary);
        setCollections(nextCollections);
        setQuestions(nextQuestions);
        setSummary(nextSummary);
        setSelectedQuestionId((currentId) => pickInitialQuestionId(nextQuestions, historyMap, currentId));
        setSelectedOption(null);
        setLastSubmission(null);
        setNotice(null);
      })
      .catch((error) => {
        setCollections([]);
        setQuestions([]);
        setSummary(null);
        setSelectedQuestionId('');
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        setNotice({ msg: toQuizErrorMessage(error, '题目加载失败，请稍后重试'), type: 'error' });
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [collectionId, reloadSeed]);

  const selectedCollection = useMemo(
    () => collections.find((collection) => collection.id === collectionId) ?? null,
    [collectionId, collections],
  );
  const historyMap = useMemo(() => buildHistoryMap(summary), [summary]);
  const selectedQuestion = useMemo(
    () => questions.find((question) => question.id === selectedQuestionId) ?? null,
    [questions, selectedQuestionId],
  );
  const selectedHistory: AnswerHistoryItem | null = selectedQuestion ? historyMap.get(selectedQuestion.id) ?? null : null;
  const nextUnansweredQuestion = useMemo(() => {
    const unansweredQuestions = questions.filter((question) => !historyMap.has(question.id));
    if (!selectedQuestion) {
      return unansweredQuestions[0] ?? null;
    }
    return unansweredQuestions.find((question) => question.order_index > selectedQuestion.order_index)
      ?? unansweredQuestions[0]
      ?? null;
  }, [historyMap, questions, selectedQuestion]);
  const answeredCount = summary?.total_answers ?? 0;
  const totalQuestions = summary?.total_questions ?? questions.length;
  const remainingCount = Math.max(totalQuestions - answeredCount, 0);
  const progressPercent = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;

  const renderActionControls = () => (
    selectedHistory ? (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {nextUnansweredQuestion ? (
          <button
            type="button"
            onClick={() => {
              setSelectedQuestionId(nextUnansweredQuestion.id);
              setSelectedOption(null);
              setLastSubmission(null);
              setNotice(null);
            }}
            className="rounded-lg bg-sdu-red px-4 py-3 text-center font-medium text-white hover:bg-sdu-red-hover"
          >
            继续下一题
          </button>
        ) : (
          <Link
            to={`/quiz/${collectionId}/result`}
            className="rounded-lg bg-sdu-red px-4 py-3 text-center font-medium text-white hover:bg-sdu-red-hover"
          >
            查看完整结果
          </Link>
        )}
        <Link
          to={`/quiz/${collectionId}/result`}
          className="rounded-lg border border-ink-dark/20 bg-white px-4 py-3 text-center font-medium hover:border-sdu-red"
        >
          {nextUnansweredQuestion ? '查看结果页' : '返回结果页'}
        </Link>
      </div>
    ) : (
      <button
        type="submit"
        disabled={loading || !selectedQuestion || selectedOption === null || submitting}
        className="w-full rounded-lg bg-sdu-red py-3 font-medium text-white hover:bg-sdu-red-hover disabled:opacity-50"
      >
        {submitting ? '提交中...' : '提交答案'}
      </button>
    )
  );

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedQuestion || selectedOption === null) return;
    setSubmitting(true);
    setNotice(null);
    try {
      const result = await submitQuizAnswer(selectedQuestion.id, selectedOption);
      const [nextQuestions, nextSummary] = await Promise.all([
        fetchQuizQuestions(collectionId),
        fetchQuizSummary(collectionId),
      ]);
      setQuestions(nextQuestions);
      setSummary(nextSummary);
      setSelectedQuestionId(result.question_id);
      setSelectedOption(null);
      setLastSubmission(result);
      setNotice(null);
    } catch (error) {
      const message = toQuizErrorMessage(error, '提交失败，请稍后重试');
      if (message.includes('你已经提交过这道题')) {
        try {
          const [nextQuestions, nextSummary] = await Promise.all([
            fetchQuizQuestions(collectionId),
            fetchQuizSummary(collectionId),
          ]);
          setQuestions(nextQuestions);
          setSummary(nextSummary);
          setSelectedQuestionId(selectedQuestion.id);
          setSelectedOption(null);
          setLastSubmission(null);
          setNotice({ msg: message, type: 'info' });
        } catch {
          setNotice({ msg: message, type: 'info' });
        }
      } else {
        setNotice({ msg: message, type: 'error' });
      }
    } finally {
      setSubmitting(false);
    }
  };

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

  return (
    <div className="space-y-3 overflow-x-hidden pb-24 sm:space-y-6 md:pb-0">
      <div className="rounded-xl border border-ink-dark/10 bg-white p-3 shadow-sm md:hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-sdu-red">互动答题</p>
            <h1 className="mt-1 line-clamp-2 text-lg font-serif font-bold leading-snug text-ink-dark">{selectedCollection?.title ?? '专题作答'}</h1>
          </div>
          <div className="flex shrink-0 gap-2 text-xs">
            <Link to="/quiz" className="rounded-md border border-ink-dark/15 px-2.5 py-1.5 text-ink-dark">专题</Link>
            {collectionId && <Link to={`/quiz/${collectionId}/result`} className="rounded-md bg-sdu-red px-2.5 py-1.5 text-white">结果</Link>}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-lg bg-paper-bg/70 px-3 py-2">
            <p className="text-ink-light">积分</p>
            <p className="mt-0.5 font-semibold text-sdu-red">{summary?.total_points ?? 0}</p>
          </div>
          <div className="rounded-lg bg-paper-bg/70 px-3 py-2">
            <p className="text-ink-light">进度</p>
            <p className="mt-0.5 font-semibold text-ink-dark">{answeredCount}/{totalQuestions}</p>
          </div>
          <div className="rounded-lg bg-paper-bg/70 px-3 py-2">
            <p className="text-ink-light">剩余</p>
            <p className="mt-0.5 font-semibold text-ink-dark">{remainingCount}</p>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-sdu-red transition-all" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      <div className="hidden rounded-2xl border border-ink-dark/10 bg-white p-4 sm:p-6 md:block md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="mb-2 text-sm uppercase tracking-[0.12em] text-sdu-red sm:tracking-[0.2em]">互动答题 / 作答页</p>
            <h1 className="mb-3 text-2xl font-serif font-bold text-ink-dark sm:text-3xl">{selectedCollection?.title ?? '专题作答'}</h1>
            <p className="text-ink-light max-w-3xl">{selectedCollection?.description || '选择题目并提交答案。'}</p>
          </div>
          <div className="grid w-full grid-cols-1 gap-3 sm:w-auto sm:grid-cols-2">
            <Link to="/quiz" className="rounded-lg border border-ink-dark/20 px-4 py-2.5 text-center transition-colors hover:border-sdu-red">返回专题列表</Link>
            {collectionId && (
              <Link to={`/quiz/${collectionId}/result`} className="rounded-lg bg-sdu-red px-4 py-2.5 text-center text-white transition-colors hover:bg-sdu-red-hover">
                查看结果页
              </Link>
            )}
          </div>
        </div>
      </div>

      {notice && <InlineNotice message={notice.msg} type={notice.type} />}
      {notice?.type === 'error' && !loading && (
        <button
          type="button"
          onClick={reloadQuizData}
          className="w-full rounded-lg border border-ink-dark/20 px-4 py-2 transition-colors hover:border-sdu-red sm:w-auto"
        >
          重试加载
        </button>
      )}
      {loading && <p className="text-sm text-ink-light">{quizToken ? '加载中...' : '正在进入答题...'}</p>}

      <div className="hidden grid-cols-1 gap-4 md:grid md:grid-cols-3">
        <div className="rounded-2xl border border-ink-dark/10 bg-white p-4 sm:p-5">
          <p className="text-sm text-ink-light mb-2">累计积分</p>
          <p className="text-2xl font-bold text-sdu-red sm:text-3xl">{summary?.total_points ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-ink-dark/10 bg-white p-4 sm:p-5">
          <p className="text-sm text-ink-light mb-2">答题进度</p>
          <p className="text-2xl font-bold text-ink-dark sm:text-3xl">{answeredCount}/{totalQuestions}</p>
        </div>
        <div className="rounded-2xl border border-ink-dark/10 bg-white p-4 sm:p-5">
          <p className="text-sm text-ink-light mb-2">剩余未答</p>
          <p className="text-2xl font-bold text-ink-dark sm:text-3xl">{remainingCount}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="hidden h-fit rounded-2xl border border-ink-dark/10 bg-white p-5 xl:block">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-xl font-serif font-bold">题目导航</h2>
            <span className="text-xs text-ink-light">共 {questions.length} 题</span>
          </div>
          <div className="space-y-3 max-h-none overflow-visible pr-0 xl:max-h-[620px] xl:overflow-y-auto xl:pr-1">
            {questions.map((question) => {
              const answered = historyMap.has(question.id);
              const active = question.id === selectedQuestionId;
              return (
                <button
                  key={question.id}
                  type="button"
                  onClick={() => {
                    setSelectedQuestionId(question.id);
                    setSelectedOption(null);
                    setLastSubmission(null);
                  }}
                  className={[
                    'w-full text-left rounded-xl border px-4 py-3 transition-colors',
                    active ? 'border-sdu-red bg-sdu-red/5' : 'border-ink-dark/10 hover:border-sdu-red/40',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <p className="font-medium text-sm text-ink-dark line-clamp-2">#{question.order_index} {question.prompt}</p>
                    <span className={answered ? 'text-xs text-green-700 shrink-0' : 'text-xs text-amber-700 shrink-0'}>
                      {answered ? '已答' : '待答'}
                    </span>
                  </div>
                  <p className="text-xs text-ink-light">分值：{question.points}</p>
                </button>
              );
            })}
            {!questions.length && !loading && <p className="text-sm text-ink-light">当前专题暂无题目。</p>}
          </div>
        </aside>

        <section className="min-w-0 rounded-xl border border-ink-dark/10 bg-white p-3 shadow-sm sm:p-5 md:rounded-2xl md:p-8">
          <form id="quiz-answer-form" onSubmit={onSubmit} className="space-y-4 md:space-y-6">
            <div className="rounded-xl border border-ink-dark/10 bg-paper-bg/40 p-3 md:border-0 md:bg-transparent md:p-0">
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="block text-sm font-medium text-ink-dark">切换题目</label>
                <span className="text-xs text-ink-light">已答 {answeredCount}/{totalQuestions}</span>
              </div>
              <select
                className="w-full rounded-lg border border-ink-dark/20 bg-white px-3 py-2.5 text-sm md:px-4 md:py-3"
                value={selectedQuestionId}
                onChange={(event) => {
                  setSelectedQuestionId(event.target.value);
                  setSelectedOption(null);
                  setLastSubmission(null);
                }}
                disabled={!questions.length || loading}
              >
                <option value="">请选择题目</option>
                {questions.map((question) => (
                  <option key={question.id} value={question.id}>
                    {historyMap.has(question.id) ? '✓ 已答 ' : '○ 未答 '}
                    #{question.order_index} · {question.prompt.slice(0, 60)}{question.prompt.length > 60 ? '...' : ''}
                  </option>
                ))}
              </select>
            </div>

            {selectedQuestion && (
              <div className="space-y-3 rounded-xl border border-ink-dark/10 bg-white p-3 md:space-y-4 md:bg-paper-bg/40 md:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2 md:gap-3">
                  <h2 className="text-lg font-semibold leading-relaxed text-ink-dark sm:text-xl">{selectedQuestion.prompt}</h2>
                  <span className={selectedHistory ? 'rounded-full bg-green-100 px-2.5 py-1 text-xs text-green-700' : 'rounded-full bg-sdu-red/10 px-2.5 py-1 text-xs text-sdu-red'}>
                    {selectedHistory ? '已作答' : '待作答'}
                  </span>
                </div>
                <p className="text-xs text-ink-light md:text-sm">本题分值：{selectedQuestion.points}</p>

                {lastSubmission?.question_id === selectedQuestion.id && (
                  <div
                    className={[
                      'rounded-xl border px-3 py-3 text-sm md:px-4',
                      lastSubmission.correct ? 'border-green-200 bg-green-50 text-green-900' : 'border-amber-200 bg-amber-50 text-amber-900',
                    ].join(' ')}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">{lastSubmission.correct ? `回答正确，+${lastSubmission.awarded} 分` : '回答错误'}</p>
                      <p>当前累计 {lastSubmission.total_points} 分</p>
                    </div>
                    <p className="mt-2">你的答案：{lastSubmission.selected_option}</p>
                    <p className="mt-1">正确答案：{lastSubmission.correct_option}</p>
                    {lastSubmission.explanation && <p className="mt-1 text-ink-dark">题目解析：{lastSubmission.explanation}</p>}
                  </div>
                )}

                <div className="space-y-2.5 md:space-y-3">
                  {selectedQuestion.options.map((option, index) => {
                    const checked = selectedOption === index;
                    const isCorrectOption = selectedHistory?.correct_index === index;
                    const isSelectedInHistory = selectedHistory?.selected_index === index;
                    if (selectedHistory) {
                      return (
                        <div
                          key={index}
                          className={[
                            'flex min-h-[54px] items-start gap-2.5 rounded-xl border px-3 py-3 md:gap-3 md:px-4',
                            isCorrectOption
                              ? 'border-green-200 bg-green-50 text-green-900'
                              : isSelectedInHistory
                                ? 'border-red-200 bg-red-50 text-red-900'
                                : 'border-ink-dark/10 bg-white text-ink-dark',
                          ].join(' ')}
                        >
                          <span className="mt-0.5 shrink-0 text-xs font-semibold">
                            {isCorrectOption && isSelectedInHistory ? '正确答案 / 你的选择' : isCorrectOption ? '正确答案' : isSelectedInHistory ? '你的选择' : `选项 ${index + 1}`}
                          </span>
                          <span className="min-w-0 break-words">{option}</span>
                        </div>
                      );
                    }
                    return (
                      <label key={index} className="flex min-h-[56px] cursor-pointer items-start gap-3 rounded-xl border border-ink-dark/10 bg-white px-3 py-3.5 hover:border-sdu-red/40 md:px-4">
                        <input
                          type="radio"
                          name="quiz-option"
                          checked={checked}
                          onChange={() => setSelectedOption(index)}
                          disabled={submitting}
                          className="mt-1 h-4 w-4 shrink-0 accent-sdu-red"
                        />
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-paper-bg text-xs font-semibold text-ink-light">
                          {String.fromCharCode(65 + index)}
                        </span>
                        <span className="min-w-0 break-words">{option}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="hidden md:block">{renderActionControls()}</div>
            <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-dark/10 bg-white/95 p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
              <div className="mx-auto max-w-6xl">{renderActionControls()}</div>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
