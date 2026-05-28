import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import InlineNotice from '../components/InlineNotice';
import { ensureGuestQuizToken, getQuizAuthToken } from '../services/api';
import { fetchQuizCollections, toQuizErrorMessage, type QuizCollection } from './quiz/shared';

export default function QuizTopics() {
  const [quizToken, setQuizToken] = useState(() => getQuizAuthToken());
  const [collections, setCollections] = useState<QuizCollection[]>([]);
  const [notice, setNotice] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadSeed, setReloadSeed] = useState(0);

  const reloadTopics = () => setReloadSeed((value) => value + 1);

  useEffect(() => {
    const controller = new AbortController();
    void ensureGuestQuizToken()
      .then((token) => {
        setQuizToken(token);
        setLoading(true);
        return fetchQuizCollections(controller.signal);
      })
      .then((data) => {
        setCollections(data);
        setNotice(null);
      })
      .catch((error) => {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        setNotice({ msg: toQuizErrorMessage(error, '专题加载失败，请稍后重试'), type: 'error' });
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [reloadSeed]);

  const totalQuestions = useMemo(
    () => collections.reduce((sum, collection) => sum + collection.question_count, 0),
    [collections],
  );
  const totalAnswered = useMemo(
    () => collections.reduce((sum, collection) => sum + collection.answered_count, 0),
    [collections],
  );
  const totalPoints = useMemo(
    () => collections.reduce((sum, collection) => sum + collection.total_points, 0),
    [collections],
  );

  return (
    <div className="space-y-6">
      <section className="bg-white border border-ink-dark/10 rounded-2xl p-6 md:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-sdu-red mb-3">专题列表</p>
            <h1 className="text-3xl md:text-4xl font-serif font-bold text-ink-dark mb-3">互动答题</h1>
            <p className="text-ink-light max-w-2xl">选择专题开始作答！</p>
          </div>
          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3 md:min-w-0 md:w-auto">
            <div className="rounded-2xl border border-ink-dark/10 px-4 py-3 bg-paper-bg/40">
              <p className="text-xs text-ink-light mb-1">专题数</p>
              <p className="text-2xl font-bold text-sdu-red">{collections.length}</p>
            </div>
            <div className="rounded-2xl border border-ink-dark/10 px-4 py-3 bg-paper-bg/40">
              <p className="text-xs text-ink-light mb-1">已答题</p>
              <p className="text-2xl font-bold text-ink-dark">{totalAnswered}/{totalQuestions}</p>
            </div>
            <div className="rounded-2xl border border-ink-dark/10 px-4 py-3 bg-paper-bg/40">
              <p className="text-xs text-ink-light mb-1">累计积分</p>
              <p className="text-2xl font-bold text-sdu-red">{totalPoints}</p>
            </div>
          </div>
        </div>
      </section>

      {notice && <InlineNotice message={notice.msg} type={notice.type} />}
      {notice?.type === 'error' && !loading && (
        <button
          type="button"
          onClick={reloadTopics}
          className="px-4 py-2 rounded-lg border border-ink-dark/20 hover:border-sdu-red transition-colors"
        >
          重试加载
        </button>
      )}

      {loading && <p className="text-sm text-ink-light">{quizToken ? '加载中...' : '正在进入答题...'}</p>}

      {!loading && !collections.length && (
        <div className="bg-white border border-ink-dark/10 rounded-2xl p-8 text-center text-ink-light">
          暂无可用专题。
        </div>
      )}

      {!!collections.length && (
        <section className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
          {collections.map((collection) => {
            const progress = collection.question_count > 0
              ? Math.round((collection.answered_count / collection.question_count) * 100)
              : 0;
            const completed = collection.question_count > 0 && collection.answered_count >= collection.question_count;
            return (
              <article key={collection.id} className="bg-white border border-ink-dark/10 rounded-2xl p-6 flex flex-col gap-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-serif font-bold text-ink-dark">{collection.title}</h2>
                    <p className="text-sm text-ink-light mt-2 line-clamp-3">{collection.description || '暂无专题说明'}</p>
                  </div>
                  <span className={[
                    'shrink-0 text-xs rounded-full px-3 py-1.5',
                    completed ? 'bg-green-100 text-green-700' : 'bg-sdu-red/10 text-sdu-red',
                  ].join(' ')}>
                    {completed ? '已完成' : `${progress}%`}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                  <div className="rounded-xl bg-paper-bg/50 px-3 py-3">
                    <p className="text-ink-light mb-1">题目</p>
                    <p className="font-semibold text-ink-dark">{collection.question_count}</p>
                  </div>
                  <div className="rounded-xl bg-paper-bg/50 px-3 py-3">
                    <p className="text-ink-light mb-1">已答</p>
                    <p className="font-semibold text-ink-dark">{collection.answered_count}</p>
                  </div>
                  <div className="rounded-xl bg-paper-bg/50 px-3 py-3">
                    <p className="text-ink-light mb-1">积分</p>
                    <p className="font-semibold text-sdu-red">{collection.total_points}</p>
                  </div>
                </div>

                <div className="mt-auto flex flex-wrap gap-3">
                  <Link
                    to={`/quiz/${collection.id}`}
                    className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-sdu-red text-white hover:bg-sdu-red-hover transition-colors"
                  >
                    {collection.answered_count > 0 ? '继续作答' : '开始作答'}
                  </Link>
                  <Link
                    to={`/quiz/${collection.id}/result`}
                    className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg border border-ink-dark/20 hover:border-sdu-red transition-colors"
                  >
                    查看结果
                  </Link>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
