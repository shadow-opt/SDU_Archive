import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import InlineNotice from '../components/InlineNotice';
import { ensureGuestQuizToken, getQuizAuthToken } from '../services/api';
import {
  buildHistoryMap,
  fetchQuizCollections,
  fetchQuizQuestions,
  fetchQuizSummary,
  pickInitialQuestionId,
  submitQuizAnswer,
  toQuizErrorMessage,
  type AnswerHistoryItem,
  type Question,
  type QuizCollection,
  type QuizSummary,
} from './quiz/shared';

export default function QuizPlay() {
  const [quizToken, setQuizToken] = useState(() => getQuizAuthToken());
  const navigate = useNavigate();
  const { collectionId = '' } = useParams();
  const [collections, setCollections] = useState<QuizCollection[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [summary, setSummary] = useState<QuizSummary | null>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState('');
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reloadSeed, setReloadSeed] = useState(0);

  const reloadQuizData = () => setReloadSeed((value) => value + 1);

  useEffect(() => {
    if (!collectionId) return;
    const controller = new AbortController();
    void ensureGuestQuizToken()
      .then((token) => {
        setQuizToken(token);
        setLoading(true);
        return Promise.all([
          fetchQuizCollections(controller.signal),
          fetchQuizQuestions(collectionId, controller.signal),
          fetchQuizSummary(collectionId, controller.signal),
        ]);
      })
      .then(([nextCollections, nextQuestions, nextSummary]) => {
        const historyMap = buildHistoryMap(nextSummary);
        setCollections(nextCollections);
        setQuestions(nextQuestions);
        setSummary(nextSummary);
        setSelectedQuestionId((currentId) => pickInitialQuestionId(nextQuestions, historyMap, currentId));
        setSelectedOption(null);
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
  const answeredCount = summary?.total_answers ?? 0;
  const totalQuestions = summary?.total_questions ?? questions.length;
  const remainingCount = Math.max(totalQuestions - answeredCount, 0);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedQuestion || selectedOption === null) return;
    setSubmitting(true);
    setNotice({ msg: '提交中...', type: 'info' });
    try {
      const result = await submitQuizAnswer(selectedQuestion.id, selectedOption);
      navigate(`/quiz/${collectionId}/result`, {
        state: {
          lastSubmission: result,
        },
      });
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
          setSelectedOption(null);
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
      <div className="max-w-3xl mx-auto bg-white border border-ink-dark/10 rounded-2xl p-8 text-center">
        <h2 className="text-2xl font-serif font-bold mb-3">专题不存在</h2>
        <p className="text-ink-light mb-6">请返回专题列表重新选择。</p>
        <Link to="/quiz" className="inline-flex px-5 py-2.5 bg-sdu-red text-white rounded-lg hover:bg-sdu-red-hover transition-colors">
          返回专题列表
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-ink-dark/10 rounded-2xl p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-sdu-red mb-2">互动答题 / 作答页</p>
            <h1 className="text-3xl font-serif font-bold text-ink-dark mb-3">{selectedCollection?.title ?? '专题作答'}</h1>
            <p className="text-ink-light max-w-3xl">{selectedCollection?.description || '选择题目并提交答案。'}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/quiz" className="px-4 py-2.5 rounded-lg border border-ink-dark/20 hover:border-sdu-red transition-colors">返回专题列表</Link>
            {collectionId && (
              <Link to={`/quiz/${collectionId}/result`} className="px-4 py-2.5 rounded-lg bg-sdu-red text-white hover:bg-sdu-red-hover transition-colors">
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
          className="px-4 py-2 rounded-lg border border-ink-dark/20 hover:border-sdu-red transition-colors"
        >
          重试加载
        </button>
      )}
      {loading && <p className="text-sm text-ink-light">{quizToken ? '加载中...' : '正在进入答题...'}</p>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-ink-dark/10 rounded-2xl p-5">
          <p className="text-sm text-ink-light mb-2">累计积分</p>
          <p className="text-3xl font-bold text-sdu-red">{summary?.total_points ?? 0}</p>
        </div>
        <div className="bg-white border border-ink-dark/10 rounded-2xl p-5">
          <p className="text-sm text-ink-light mb-2">答题进度</p>
          <p className="text-3xl font-bold text-ink-dark">{answeredCount}/{totalQuestions}</p>
        </div>
        <div className="bg-white border border-ink-dark/10 rounded-2xl p-5">
          <p className="text-sm text-ink-light mb-2">剩余未答</p>
          <p className="text-3xl font-bold text-ink-dark">{remainingCount}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)] gap-6">
        <aside className="bg-white border border-ink-dark/10 rounded-2xl p-5 h-fit">
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

        <section className="bg-white border border-ink-dark/10 rounded-2xl p-5 md:p-8">
          <form onSubmit={onSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-ink-dark mb-2">当前题目</label>
              <select
                className="w-full px-4 py-3 rounded-lg border border-ink-dark/20"
                value={selectedQuestionId}
                onChange={(event) => {
                  setSelectedQuestionId(event.target.value);
                  setSelectedOption(null);
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
              <div className="border border-ink-dark/10 rounded-xl p-5 bg-paper-bg/40 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h2 className="text-xl font-semibold text-ink-dark">{selectedQuestion.prompt}</h2>
                  <span className={selectedHistory ? 'text-xs rounded-full px-3 py-1 bg-green-100 text-green-700' : 'text-xs rounded-full px-3 py-1 bg-sdu-red/10 text-sdu-red'}>
                    {selectedHistory ? '已作答' : '待作答'}
                  </span>
                </div>
                <p className="text-sm text-ink-light">本题分值：{selectedQuestion.points}</p>

                <div className="space-y-3">
                  {selectedQuestion.options.map((option, index) => {
                    const checked = selectedOption === index;
                    const isCorrectOption = selectedHistory?.correct_index === index;
                    const isSelectedInHistory = selectedHistory?.selected_index === index;
                    if (selectedHistory) {
                      return (
                        <div
                          key={index}
                          className={[
                            'flex items-start gap-3 rounded-lg border px-4 py-3',
                            isCorrectOption
                              ? 'border-green-200 bg-green-50 text-green-900'
                              : isSelectedInHistory
                                ? 'border-red-200 bg-red-50 text-red-900'
                                : 'border-ink-dark/10 bg-white text-ink-dark',
                          ].join(' ')}
                        >
                          <span className="mt-0.5 text-xs font-semibold">
                            {isCorrectOption ? '正确答案' : isSelectedInHistory ? '你的选择' : `选项 ${index + 1}`}
                          </span>
                          <span>{option}</span>
                        </div>
                      );
                    }
                    return (
                      <label key={index} className="flex items-start gap-3 cursor-pointer rounded-lg border border-ink-dark/10 px-4 py-3 bg-white hover:border-sdu-red/40">
                        <input
                          type="radio"
                          name="quiz-option"
                          checked={checked}
                          onChange={() => setSelectedOption(index)}
                          disabled={submitting}
                          className="mt-1"
                        />
                        <span>{option}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !selectedQuestion || selectedOption === null || submitting || !!selectedHistory}
              className="w-full py-3 bg-sdu-red text-white rounded-lg font-medium hover:bg-sdu-red-hover disabled:opacity-50"
            >
              {selectedHistory ? '本题已作答，请前往结果页查看详情' : submitting ? '提交中...' : '提交答案并查看结果'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
