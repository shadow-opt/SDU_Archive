type NoticeType = 'info' | 'success' | 'error';

type InlineNoticeProps = {
  message: string;
  type?: NoticeType;
  className?: string;
};

const styleMap: Record<NoticeType, string> = {
  info: 'bg-blue-50 text-blue-800 border border-blue-200',
  success: 'bg-green-50 text-green-800 border border-green-200',
  error: 'bg-red-50 text-red-800 border border-red-200',
};

export default function InlineNotice({ message, type = 'info', className = '' }: InlineNoticeProps) {
  if (!message) return null;
  return <div className={`text-sm p-3 rounded-lg ${styleMap[type]} ${className}`.trim()}>{message}</div>;
}
