import { apiRequest } from '../../services/api';

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

export const buildHistoryMap = (summary: QuizSummary | null) => new Map(summary?.answer_history.map((item) => [item.question_id, item]) ?? []);

export const pickInitialQuestionId = (questions: Question[], historyMap: Map<string, AnswerHistoryItem>, currentId = '') => {
  if (currentId && questions.some((question) => question.id === currentId)) {
    return currentId;
  }
  const nextUnanswered = questions.find((question) => !historyMap.has(question.id));
  return nextUnanswered?.id ?? questions[0]?.id ?? '';
};

export const fetchQuizCollections = () => apiRequest<QuizCollection[]>('/api/quiz/collections', { redirectOn401To: '/' }, '专题加载失败');

export const fetchQuizQuestions = (collectionId: string) => apiRequest<Question[]>(`/api/quiz/collections/${collectionId}/questions`, { redirectOn401To: '/' }, '题目加载失败');

export const fetchQuizSummary = (collectionId: string) => apiRequest<QuizSummary>(`/api/quiz/collections/${collectionId}/summary`, { redirectOn401To: '/' }, '答题记录加载失败');

export const submitQuizAnswer = (questionId: string, answerIndex: number) => apiRequest<SubmissionResult>(
  `/api/quiz/questions/${questionId}/submit`,
  {
    method: 'POST',
    body: JSON.stringify({ answer_index: answerIndex }),
    redirectOn401To: '/',
  },
  '提交失败',
);
