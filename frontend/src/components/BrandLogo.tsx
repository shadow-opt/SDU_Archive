type BrandLogoProps = {
  title: string;
  subtitle?: string;
  className?: string;
  titleClassName?: string;
  subtitleClassName?: string;
  iconClassName?: string;
  stacked?: boolean;
  theme?: 'light' | 'dark';
};

export default function BrandLogo({
  title,
  subtitle,
  className = '',
  titleClassName = '',
  subtitleClassName = '',
  iconClassName = '',
  stacked = false,
  theme = 'light',
}: BrandLogoProps) {
  const titleTone = theme === 'dark' ? 'text-white' : 'text-sdu-red';
  const subtitleTone = theme === 'dark' ? 'text-white/70' : 'text-ink-light';
  const iconTone = theme === 'dark'
    ? 'border-white/10 bg-white/95'
    : 'border-sdu-red/10 bg-white';

  return (
    <div className={`flex ${stacked ? 'flex-col items-center text-center' : 'items-center'} gap-3 ${className}`.trim()}>
      <img
        src="/sdu-favicon-large.png"
        alt="山东大学图标"
        className={`h-10 w-10 shrink-0 rounded-xl border object-cover p-1 shadow-sm ${iconTone} ${iconClassName}`.trim()}
        loading="lazy"
      />
      <div>
        <p className={`font-serif font-bold tracking-wide ${titleTone} ${titleClassName}`.trim()}>{title}</p>
        {subtitle ? <p className={`text-sm ${subtitleTone} ${subtitleClassName}`.trim()}>{subtitle}</p> : null}
      </div>
    </div>
  );
}
