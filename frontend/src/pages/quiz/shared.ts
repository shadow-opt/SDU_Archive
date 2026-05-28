import { quizApiRequest } from '../../services/api';

export type QuizCollection = {
  id: string;
  title: string;
  description?: string | null;
  question_count: number;
  answered_count: number;
  total_points: number;
  is_published: boolean;
};

export type Question = {
  id: string;
  collection_id: string;
  prompt: string;
  options: string[];
  points: number;
  order_index: number;
  question_type: 'single_choice';
  answered: boolean;
};

export type AnswerHistoryItem = {
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

export type QuizSummary = {
  collection_id?: string | null;
  total_points: number;
  total_answers: number;
  total_questions: number;
  answer_history: AnswerHistoryItem[];
};

export type SubmissionResult = {
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

const QUIZ_ERROR_MESSAGE_MAP: Record<string, string> = {
  'Already answered': '你已经提交过这道题，可直接查看结果页。',
  'Invalid answer index': '所选答案无效，请重新选择后再提交。',
  'Question not found': '题目不存在或已下线，请刷新后重试。',
  'Collection not found': '专题不存在或已下线，请返回列表重新选择。',
  'Collection title already exists': '专题名称已存在，请更换后再试。',
  '登录已过期，请重新登录': '登录已过期，请重新登录。',
  '权限不足，无法执行该操作': '权限不足，无法执行该操作。',
};

export const toQuizErrorMessage = (error: unknown, fallback: string): string => {
  const message = error instanceof Error ? error.message : fallback;
  return QUIZ_ERROR_MESSAGE_MAP[message] ?? message ?? fallback;
};

export const buildHistoryMap = (summary: QuizSummary | null) => new Map(summary?.answer_history.map((item) => [item.question_id, item]) ?? []);

export const pickInitialQuestionId = (questions: Question[], historyMap: Map<string, AnswerHistoryItem>, currentId = '') => {
  if (currentId && questions.some((question) => question.id === currentId)) {
    return currentId;
  }
  const nextUnanswered = questions.find((question) => !historyMap.has(question.id));
  return nextUnanswered?.id ?? questions[0]?.id ?? '';
};

export const fetchQuizCollections = (signal?: AbortSignal) => quizApiRequest<QuizCollection[]>(
  '/api/quiz/collections',
  { signal },
  '专题加载失败',
);

export const fetchQuizQuestions = (collectionId: string, signal?: AbortSignal) => quizApiRequest<Question[]>(
  `/api/quiz/collections/${collectionId}/questions`,
  { signal },
  '题目加载失败',
);

export const fetchQuizSummary = (collectionId: string, signal?: AbortSignal) => quizApiRequest<QuizSummary>(
  `/api/quiz/collections/${collectionId}/summary`,
  { signal },
  '答题记录加载失败',
);

export const submitQuizAnswer = (questionId: string, answerIndex: number) => quizApiRequest<SubmissionResult>(
  `/api/quiz/questions/${questionId}/submit`,
  {
    method: 'POST',
    body: JSON.stringify({ answer_index: answerIndex }),
  },
  '提交失败',
);
