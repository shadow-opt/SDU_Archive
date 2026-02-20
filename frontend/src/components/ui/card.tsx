import type { PropsWithChildren } from 'react';

type CardProps = PropsWithChildren<{
  className?: string;
}>;

export function Card({ className = '', children }: CardProps) {
  return <div className={`rounded-xl border border-ink-dark/10 bg-white shadow-sm ${className}`}>{children}</div>;
}

export function CardHeader({ className = '', children }: CardProps) {
  return <div className={`p-4 pb-2 ${className}`}>{children}</div>;
}

export function CardTitle({ className = '', children }: CardProps) {
  return <h3 className={`font-serif font-bold ${className}`}>{children}</h3>;
}

export function CardContent({ className = '', children }: CardProps) {
  return <div className={`p-4 pt-2 ${className}`}>{children}</div>;
}
