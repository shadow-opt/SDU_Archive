import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest, getAuthToken } from '../services/api';
import InlineNotice from '../components/InlineNotice';

type QuizCollection = {
  id: string;
  title: string;
  description?: string | null;
  question_count: number;
  answered_count: number;
  total_points: number;
  is_published: boolean;
};

type Question = {
  id: string;
  collection_id: string;
  prompt: string;
  options: string[];
  points: number;
  order_index: number;
  question_type: 'single_choice';
  answered: boolean;
};

type AnswerHistoryItem = {
  question_id: string;
  prompt: string;
  question_type: 'single_choice';
  selected_index: number;
  selected_option: string;
  correct_index: number;
  correct_option: string;
  is_correct: boolean;
  points_awarded: number;
  explanation?: string | null;
  answered_at: string;
};

type QuizSummary = {
  collection_id?: string | null;
  total_points: number;
  total_answers: number;
  total_questions: number;
  answer_history: AnswerHistoryItem[];
};

type SubmissionResult = {
  question_id: string;
  collection_id: string;
  selected_index: number;
  selected_option: string;
  correct: boolean;
  awarded: number;
  total_points: number;
  total_answers: number;
  correct_index: number;
  correct_option: string;
  explanation?: string | null;
};

const buildHistoryMap = (summary: QuizSummary | null) => new Map(summary?.answer_history.map((item) => [item.question_id, item]) ?? []);

const pickInitialQuestionId = (questions: Question[], historyMap: Map<string, AnswerHistoryItem>, currentId = '') => {
  if (currentId && questions.some((question) => question.id === currentId)) {
    return currentId;
  }
  const nextUnanswered = questions.find((question) => !historyMap.has(question.id));
  return nextUnanswered?.id ?? questions[0]?.id ?? '';
};

export default function Quiz() {
  const [collections, setCollections] = useState<QuizCollection[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [summary, setSummary] = useState<QuizSummary | null>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState('');
  const [selectedQuestionId, setSelectedQuestionId] = useState('');
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const token = getAuthToken();

  const loadCollections = useCallback(async () => {
    if (!token) return [] as QuizCollection[];
    const nextCollections = await apiRequest<QuizCollection[]>('/api/quiz/collections', { redirectOn401To: '/' }, '专题加载失败');
    setCollections(nextCollections);
    setSelectedCollectionId((currentId) => {
      if (currentId && nextCollections.some((collection) => collection.id === currentId)) {
        return currentId;
      }
      return nextCollections[0]?.id ?? '';
    });
    return nextCollections;
  }, [token]);

  const loadCollectionData = useCallback(async (collectionId: string) => {
    if (!token || !collectionId) {
      setQuestions([]);
      setSummary(null);
      setSelectedQuestionId('');
      return;
    }

    setLoading(true);
    try {
      const [questionList, userSummary] = await Promise.all([
        apiRequest<Question[]>(`/api/quiz/collections/${collectionId}/questions`, { redirectOn401To: '/' }, '题目加载失败'),
        apiRequest<QuizSummary>(`/api/quiz/collections/${collectionId}/summary`, { redirectOn401To: '/' }, '答题记录加载失败'),
      ]);
      const historyMap = buildHistoryMap(userSummary);
      setQuestions(questionList);
      setSummary(userSummary);
      setSelectedQuestionId((currentId) => pickInitialQuestionId(questionList, historyMap, currentId));
      setNotice(null);
    } catch (error) {
      setQuestions([]);
      setSummary(null);
      setSelectedQuestionId('');
      setNotice({ msg: error instanceof Error ? error.message : '题目加载失败，请稍后重试', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    void loadCollections()
      .catch((error) => {
        setNotice({ msg: error instanceof Error ? error.message : '专题加载失败，请稍后重试', type: 'error' });
      })
      .finally(() => setLoading(false));
  }, [loadCollections, token]);

  useEffect(() => {
    void loadCollectionData(selectedCollectionId);
  }, [loadCollectionData, selectedCollectionId]);

  const submitAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQuestionId || selectedOption === null || !token || !selectedCollectionId) return;

    const selectedQuestion = questions.find((question) => question.id === selectedQuestionId);
    if (!selectedQuestion) return;

    setNotice({ msg: '提交中...', type: 'info' });
    setSubmitting(true);
    try {
      const data = await apiRequest<SubmissionResult>(`/api/quiz/questions/${selectedQuestionId}/submit`, {
        method: 'POST',
        body: JSON.stringify({ answer_index: selectedOption }),
        redirectOn401To: '/',
      }, '提交失败');

      setNotice({ msg: data.correct ? `回答正确，+${data.awarded}分` : '回答错误', type: data.correct ? 'success' : 'error' });
      await Promise.all([
        loadCollectionData(selectedCollectionId),
        loadCollections(),
      ]);
      setSelectedOption(null);
    } catch (error) {
      setNotice({ msg: error instanceof Error ? error.message : '提交失败，请稍后重试', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="max-w-2xl mx-auto bg-white border border-ink-dark/10 rounded-2xl p-8 text-center">
        <h2 className="text-2xl font-serif font-bold mb-3">互动题库</h2>
        <p className="text-ink-light mb-6">答题需要先登录账号。</p>
        <Link to="/" className="inline-flex px-5 py-2.5 bg-sdu-red text-white rounded-lg hover:bg-sdu-red-hover transition-colors">
          返回首页登录
        </Link>
      </div>
    );
  }

  const selectedCollection = useMemo(
    () => collections.find((collection) => collection.id === selectedCollectionId) ?? null,
    [collections, selectedCollectionId],
  );
  const historyMap = buildHistoryMap(summary);
  const selectedQuestion = questions.find((q) => q.id === selectedQuestionId) ?? null;
  const selectedHistory = selectedQuestion ? historyMap.get(selectedQuestion.id) ?? null : null;
  const totalQuestions = summary?.total_questions ?? questions.length;
  const answeredCount = summary?.total_answers ?? questions.filter((q) => q.answered).length;
  const remainingCount = Math.max(totalQuestions - answeredCount, 0);
  const allCompleted = totalQuestions > 0 && answeredCount >= totalQuestions;

  if (!loading && collections.length === 0) {
    return (
      <div className="max-w-3xl mx-auto bg-white border border-ink-dark/10 rounded-2xl p-8 text-center">
        <h2 className="text-2xl font-serif font-bold mb-3">互动题库</h2>
        <p className="text-ink-light">当前还没有已发布的专题，请稍后再来。</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="bg-white border border-ink-dark/10 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-2xl font-serif font-bold mb-2">互动题库</h2>
            <p className="text-ink-light">先选择专题，再进入专题内逐题作答。成绩与历史会按当前题库规则实时重算。</p>
          </div>
          <span className="text-sm text-ink-light">共 {collections.length} 个专题</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {collections.map((collection) => {
            const isActive = collection.id === selectedCollectionId;
            const progress = collection.question_count > 0
              ? Math.round((collection.answered_count / collection.question_count) * 100)
              : 0;
            return (
              <button
                key={collection.id}
                type="button"
                onClick={() => {
                  setSelectedCollectionId(collection.id);
                  setSelectedOption(null);
                }}
                className={[
                  'text-left rounded-2xl border p-5 transition-colors',
                  isActive ? 'border-sdu-red bg-sdu-red/5' : 'border-ink-dark/10 hover:border-sdu-red/40 bg-white',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="font-semibold text-ink-dark">{collection.title}</p>
                    {collection.description && <p className="text-sm text-ink-light mt-1 line-clamp-2">{collection.description}</p>}
                  </div>
                  <span className="text-xs rounded-full px-2.5 py-1 bg-sdu-red/10 text-sdu-red">{progress}%</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="text-ink-light">题目</p>
                    <p className="font-semibold">{collection.question_count}</p>
                  </div>
                  <div>
                    <p className="text-ink-light">已答</p>
                    <p className="font-semibold">{collection.answered_count}</p>
                  </div>
                  <div>
                    <p className="text-ink-light">积分</p>
                    <p className="font-semibold text-sdu-red">{collection.total_points}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

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

      {allCompleted && (
        <div className="bg-white border border-green-200 rounded-2xl p-6">
          <h3 className="text-xl font-serif font-bold text-green-800 mb-2">🎉 已完成全部答题</h3>
          <p className="text-green-700">你已完成全部 {totalQuestions} 道题目，可继续查看历史结果与题目解析。</p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)] gap-6">
        <div className="bg-white border border-ink-dark/10 rounded-2xl p-8">
      <h2 className="text-2xl font-serif font-bold mb-2">{selectedCollection?.title ?? '请选择专题'}</h2>
      <p className="text-ink-light mb-6">
        {selectedCollection?.description ?? '登录用户可参与答题并累计积分，已答题支持回看正确答案与解析。'}
      </p>

      <form onSubmit={submitAnswer} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-ink-dark mb-2">选择题目</label>
          <select
            className="w-full px-4 py-3 rounded-lg border border-ink-dark/20"
            value={selectedQuestionId}
            onChange={(e) => {
              setSelectedQuestionId(e.target.value);
              setSelectedOption(null);
            }}
            disabled={!selectedCollectionId || loading}
          >
            <option value="">{selectedCollectionId ? '请选择题目' : '请先选择专题'}</option>
            {questions.map((q) => (
              <option key={q.id} value={q.id}>
                {historyMap.has(q.id) ? '✓ 已答 ' : '○ 未答 '}
                #{q.order_index} · 
                {q.prompt.slice(0, 60)}
                {q.prompt.length > 60 ? '...' : ''}
              </option>
            ))}
          </select>
        </div>

        {selectedQuestion && (
          <div className="border border-ink-dark/10 rounded-xl p-5 bg-paper-bg/50">
            <div className="flex items-start justify-between gap-4 mb-4">
              <p className="font-medium text-lg">{selectedQuestion.prompt}</p>
              <span className="shrink-0 inline-flex px-3 py-1 rounded-full text-xs font-medium bg-sdu-red/10 text-sdu-red">
                {selectedHistory ? '已作答' : '待作答'}
              </span>
            </div>
            <div className="space-y-3">
              {selectedQuestion.options.map((option, idx) => {
                const isSelected = selectedOption === idx;
                const isCorrectOption = selectedHistory?.correct_index === idx;
                const isChosenInHistory = selectedHistory?.selected_index === idx;

                if (selectedHistory) {
                  return (
                    <div
                      key={idx}
                      className={[
                        'flex items-start gap-3 rounded-lg border px-4 py-3',
                        isCorrectOption
                          ? 'border-green-200 bg-green-50 text-green-900'
                          : isChosenInHistory
                            ? 'border-red-200 bg-red-50 text-red-900'
                            : 'border-ink-dark/10 bg-white text-ink-dark',
                      ].join(' ')}
                    >
                      <span className="mt-0.5 text-xs font-semibold">
                        {isCorrectOption ? '正确' : isChosenInHistory ? '你的选择' : `选项 ${idx + 1}`}
                      </span>
                      <span>{option}</span>
                    </div>
                  );
                }

                return (
                  <label key={idx} className="flex items-start gap-3 cursor-pointer rounded-lg border border-ink-dark/10 px-4 py-3 bg-white hover:border-sdu-red/40">
                    <input
                      type="radio"
                      name="quiz-option"
                      checked={isSelected}
                      onChange={() => setSelectedOption(idx)}
                      className="mt-1"
                    />
                    <span>{option}</span>
                  </label>
                );
              })}
            </div>
            <p className="mt-4 text-sm text-ink-light">本题分值：{selectedQuestion.points}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !selectedCollectionId || !selectedQuestionId || selectedOption === null || submitting || !!selectedHistory}
          className="w-full py-3 bg-sdu-red text-white rounded-lg font-medium hover:bg-sdu-red-hover disabled:opacity-50"
        >
          {selectedHistory ? '本题已作答，可查看解析' : submitting ? '提交中...' : '提交答案'}
        </button>
      </form>

      {notice && !submitting && (
        <InlineNotice
          message={notice.msg}
          type={notice.type}
          className="mt-4"
        />
      )}

      {selectedHistory && (
        <div className="mt-6 p-5 rounded-xl border border-blue-200 bg-blue-50">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h4 className="text-base font-semibold text-blue-900">作答结果</h4>
            <span className={selectedHistory.is_correct ? 'text-sm font-medium text-green-700' : 'text-sm font-medium text-red-700'}>
              {selectedHistory.is_correct ? `回答正确，+${selectedHistory.points_awarded} 分` : '回答错误'}
            </span>
          </div>
          <div className="space-y-2 text-sm text-blue-900">
            <p>你的答案：{selectedHistory.selected_option}</p>
            <p>正确答案：{selectedHistory.correct_option}</p>
            {selectedHistory.explanation && <p>题目解析：{selectedHistory.explanation}</p>}
            <p className="text-blue-700">提交时间：{new Date(selectedHistory.answered_at).toLocaleString()}</p>
          </div>
        </div>
      )}

        {loading && <p className="mt-4 text-sm text-ink-light">加载中...</p>}
        </div>

        <aside className="bg-white border border-ink-dark/10 rounded-2xl p-6 h-fit">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="text-xl font-serif font-bold">专题历史</h3>
            <span className="text-xs text-ink-light">最近 {summary?.answer_history.length ?? 0} 条</span>
          </div>

          {!summary?.answer_history.length && (
            <p className="text-sm text-ink-light">你还没有答题记录，选择左侧题目开始作答。</p>
          )}

          {!!summary?.answer_history.length && (
            <div className="space-y-3 max-h-[640px] overflow-y-auto pr-1">
              {summary.answer_history.map((item) => (
                <button
                  key={item.question_id}
                  type="button"
                  onClick={() => {
                    setSelectedQuestionId(item.question_id);
                    setSelectedOption(null);
                  }}
                  className={[
                    'w-full text-left rounded-xl border px-4 py-3 transition-colors',
                    selectedQuestionId === item.question_id
                      ? 'border-sdu-red bg-sdu-red/5'
                      : 'border-ink-dark/10 hover:border-sdu-red/40',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <p className="font-medium line-clamp-2 text-sm text-ink-dark">{item.prompt}</p>
                    <span className={item.is_correct ? 'shrink-0 text-xs font-medium text-green-700' : 'shrink-0 text-xs font-medium text-red-700'}>
                      {item.is_correct ? '正确' : '错误'}
                    </span>
                  </div>
                  <p className="text-xs text-ink-light">你的答案：{item.selected_option}</p>
                  <p className="text-xs text-ink-light mt-1">正确答案：{item.correct_option}</p>
                  <p className="text-xs text-ink-light mt-2">{new Date(item.answered_at).toLocaleString()}</p>
                </button>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
