import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiBase, getAuthHeaders, getAuthToken, parseApiError } from '../services/api';
import InlineNotice from '../components/InlineNotice';

type Question = {
  id: string;
  prompt: string;
  options: string[];
  points: number;
};

export default function Quiz() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedQuestionId, setSelectedQuestionId] = useState('');
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [status, setStatus] = useState('');
  const [score, setScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const token = getAuthToken();

  useEffect(() => {
    const fetchQuestions = async () => {
      if (!token) return;
      setLoading(true);
      try {
        const res = await fetch(`${apiBase}/api/quiz/questions`, {
          headers: getAuthHeaders(true),
        });
        if (!res.ok) {
          setStatus(await parseApiError(res, '题目加载失败'));
          return;
        }
        const data = (await res.json()) as Question[];
        setQuestions(data);
      } catch {
        setStatus('题目加载失败，请稍后重试');
      } finally {
        setLoading(false);
      }
    };

    void fetchQuestions();
  }, [token]);

  const submitAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQuestionId || selectedOption === null || !token) return;

    setStatus('提交中...');
    try {
      const res = await fetch(`${apiBase}/api/quiz/questions/${selectedQuestionId}/submit`, {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: JSON.stringify({ answer_index: selectedOption }),
      });

      if (!res.ok) {
        setStatus(await parseApiError(res, '提交失败'));
        return;
      }

      const data = (await res.json()) as { correct: boolean; awarded: number; total_points: number };
      setScore(data.total_points);
      setStatus(data.correct ? `回答正确，+${data.awarded}分` : '回答错误');
    } catch {
      setStatus('提交失败，请稍后重试');
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

  const selectedQuestion = questions.find((q) => q.id === selectedQuestionId) ?? null;

  return (
    <div className="max-w-3xl mx-auto bg-white border border-ink-dark/10 rounded-2xl p-8">
      <h2 className="text-2xl font-serif font-bold mb-2">互动题库</h2>
      <p className="text-ink-light mb-6">登录用户可参与答题并累计积分。</p>

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
          >
            <option value="">请选择题目</option>
            {questions.map((q) => (
              <option key={q.id} value={q.id}>
                {q.prompt.slice(0, 60)}{q.prompt.length > 60 ? '...' : ''}
              </option>
            ))}
          </select>
        </div>

        {selectedQuestion && (
          <div className="border border-ink-dark/10 rounded-xl p-5 bg-paper-bg/50">
            <p className="font-medium mb-4">{selectedQuestion.prompt}</p>
            <div className="space-y-3">
              {selectedQuestion.options.map((option, idx) => (
                <label key={idx} className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="quiz-option"
                    checked={selectedOption === idx}
                    onChange={() => setSelectedOption(idx)}
                    className="mt-1"
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
            <p className="mt-4 text-sm text-ink-light">本题分值：{selectedQuestion.points}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !selectedQuestionId || selectedOption === null || status === '提交中...'}
          className="w-full py-3 bg-sdu-red text-white rounded-lg font-medium hover:bg-sdu-red-hover disabled:opacity-50"
        >
          {status === '提交中...' ? '提交中...' : '提交答案'}
        </button>
      </form>

      {status && status !== '提交中...' && (
        <InlineNotice
          message={status}
          type={status.includes('正确') ? 'success' : 'error'}
          className="mt-4"
        />
      )}
      {score !== null && (
        <div className="mt-2 text-sm text-green-700">当前累计积分：{score}</div>
      )}
    </div>
  );
}
