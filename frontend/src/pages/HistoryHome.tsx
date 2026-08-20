import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ChevronDown, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import HistoryLineageMap from '../components/HistoryLineageMap';
import { historyHeroMedia, historyPeriods } from '../data/history';
import type { HistoryEvent, HistorySource } from '../types/history';

const allEvents = historyPeriods.flatMap((period) => period.events);

const sourceKey = (source: HistorySource) => `${source.label}-${source.url ?? 'local'}`;

function EventSource({ source }: { source: HistorySource }) {
  if (!source.url) {
    return <span>{source.label}</span>;
  }

  return (
    <a
      href={source.url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-sdu-red underline-offset-4 hover:underline"
    >
      {source.label}
      <ExternalLink aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
    </a>
  );
}

function HistoryEventRow({ event }: { event: HistoryEvent }) {
  const [expanded, setExpanded] = useState(false);
  const detailId = `${event.id}-details`;
  const linkedSources = event.sources.filter((source) => source.url);

  useEffect(() => {
    const handleOpenEvent = (browserEvent: Event) => {
      if ((browserEvent as CustomEvent<string>).detail === event.id) {
        setExpanded(true);
      }
    };
    window.addEventListener('history:open-event', handleOpenEvent);
    return () => window.removeEventListener('history:open-event', handleOpenEvent);
  }, [event.id]);

  return (
    <article id={event.id} className="history-reveal scroll-mt-28 border-t border-ink-dark/15">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        aria-controls={detailId}
        className="group grid w-full grid-cols-[5.5rem_minmax(0,1fr)_1.75rem] gap-3 py-6 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sdu-red sm:grid-cols-[8rem_minmax(0,1fr)_2rem] sm:gap-6 sm:py-8"
      >
        <time className="font-serif text-lg font-semibold text-sdu-red sm:text-2xl">{event.year}</time>
        <span className="min-w-0">
          <span className="block font-serif text-xl font-semibold leading-snug text-ink-dark sm:text-2xl">
            {event.title}
          </span>
          <span className="mt-2 block text-sm leading-6 text-ink-light sm:text-base sm:leading-7">
            {event.summary}
          </span>
        </span>
        <span className="flex h-8 w-8 items-center justify-center self-start border border-ink-dark/20 text-ink-dark transition-colors group-hover:border-sdu-red group-hover:text-sdu-red">
          <ChevronDown
            aria-hidden="true"
            className={`h-4 w-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          />
        </span>
      </button>

      {expanded ? (
        <div
          id={detailId}
          className={`grid grid-cols-1 gap-5 pb-8 sm:pl-[9.5rem] ${
            linkedSources.length ? 'lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-10' : ''
          }`}
        >
          <div className="space-y-3 text-sm leading-7 text-ink-dark sm:text-base sm:leading-8">
            {event.details.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </div>
          {linkedSources.length ? (
            <div className="border-l-2 border-sdu-red/50 pl-4 text-xs leading-6 text-ink-light sm:text-sm">
              <p className="mb-1 font-semibold text-ink-dark">相关资料</p>
              {linkedSources.map((source) => (
                <p key={sourceKey(source)}><EventSource source={source} /></p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export default function HistoryHome() {
  const [activePeriodId, setActivePeriodId] = useState(historyPeriods[0].id);
  const [heroImageFailed, setHeroImageFailed] = useState(false);

  const publicSources = useMemo(() => {
    const uniqueSources = new Map<string, HistorySource>();
    allEvents.flatMap((event) => event.sources).forEach((source) => {
      if (source.url) {
        uniqueSources.set(sourceKey(source), source);
      }
    });
    return [...uniqueSources.values()];
  }, []);

  useEffect(() => {
    const sections = historyPeriods
      .map((period) => document.getElementById(`period-${period.id}`))
      .filter((section): section is HTMLElement => Boolean(section));

    const revealItems = [...document.querySelectorAll<HTMLElement>('.history-reveal')];
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!('IntersectionObserver' in window) || reduceMotion) {
      revealItems.forEach((item) => item.classList.add('is-visible'));
      return undefined;
    }

    const sectionObserver = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visibleEntry) {
          setActivePeriodId(visibleEntry.target.id.replace('period-', ''));
        }
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: [0, 0.15, 0.4] },
    );

    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );

    sections.forEach((section) => sectionObserver.observe(section));
    revealItems.forEach((item) => revealObserver.observe(item));

    return () => {
      sectionObserver.disconnect();
      revealObserver.disconnect();
    };
  }, []);

  const scrollToPeriod = (periodId: string) => {
    setActivePeriodId(periodId);
    document.getElementById(`period-${periodId}`)?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
  };

  const scrollToLineage = () => {
    document.getElementById('history-lineage')?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
  };

  const openTimelineEvent = useCallback((eventId: string) => {
    window.dispatchEvent(new CustomEvent<string>('history:open-event', { detail: eventId }));
    window.requestAnimationFrame(() => {
      document.getElementById(eventId)?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'center',
      });
    });
  }, []);

  return (
    <div className="history-page bg-[#f6f5f2] text-ink-dark">
      <section className="relative flex min-h-[calc(100svh-10rem)] items-end overflow-hidden bg-[#74141d] text-white">
        {!heroImageFailed ? (
          <img
            src={historyHeroMedia.src}
            alt={historyHeroMedia.alt}
            onError={() => setHeroImageFailed(true)}
            className="absolute inset-0 h-full w-full object-cover object-center"
            width="800"
            height="533"
            loading="eager"
            fetchPriority="high"
          />
        ) : null}
        <div className="absolute inset-0 bg-black/55" aria-hidden="true" />

        <div className="relative mx-auto w-full max-w-7xl px-5 pb-12 pt-24 sm:px-8 sm:pb-16 lg:px-12 lg:pb-20">
          <div className="max-w-4xl">
            <p className="text-sm font-semibold text-white/80">浩然长卷 · 1901至今</p>
            <h1 className="mt-4 font-serif text-5xl font-bold leading-tight text-white sm:text-6xl lg:text-7xl">
              山东大学校史
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-white/90 sm:text-lg">
              建校以来，山东大学历经更名、迁徙与重组，始终在时代进程中延续办学文脉。
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={scrollToLineage}
                className="inline-flex min-h-11 items-center gap-2 bg-white px-5 py-3 text-sm font-semibold text-[#74141d] transition-colors hover:bg-[#f1efea] focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#74141d]"
              >
                探索校史谱系
                <ArrowDown aria-hidden="true" className="h-4 w-4" />
              </button>
              <Link
                to="/ask"
                className="inline-flex min-h-11 items-center border border-white/60 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white hover:text-[#74141d] focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                进入 AI 问史
              </Link>
            </div>
            <dl className="mt-10 hidden max-w-2xl grid-cols-3 border-t border-white/30 pt-5 sm:grid">
              <div>
                <dt className="font-serif text-2xl font-semibold">1901</dt>
                <dd className="mt-1 text-xs text-white/65">大学堂肇始</dd>
              </div>
              <div className="border-l border-white/25 pl-6">
                <dt className="font-serif text-2xl font-semibold">1951</dt>
                <dd className="mt-1 text-xs text-white/65">两校汇流</dd>
              </div>
              <div className="border-l border-white/25 pl-6">
                <dt className="font-serif text-2xl font-semibold">2000</dt>
                <dd className="mt-1 text-xs text-white/65">三校合并</dd>
              </div>
            </dl>
          </div>
        </div>

        {!heroImageFailed ? (
          <a
            href={historyHeroMedia.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="absolute bottom-3 right-4 text-xs text-white/70 underline-offset-4 hover:text-white hover:underline sm:right-8"
          >
            {historyHeroMedia.caption} · {historyHeroMedia.credit}
          </a>
        ) : null}
      </section>

      <HistoryLineageMap events={allEvents} onOpenEvent={openTimelineEvent} />

      <section aria-labelledby="history-chronicle-title" className="bg-[#f6f5f2]">
        <div className="border-b border-ink-dark/15 bg-[#efeee9]">
          <div className="mx-auto grid max-w-7xl gap-6 px-5 py-12 sm:px-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-end lg:px-12 lg:py-16">
            <div>
              <p className="text-xs font-semibold text-sdu-red">校史年表</p>
              <h2 id="history-chronicle-title" className="mt-3 font-serif text-4xl font-semibold sm:text-5xl">七章校史，逐年展开</h2>
            </div>
            <div className="border-l-2 border-sdu-red/45 pl-5">
              <p className="font-serif text-lg font-semibold text-ink-dark">七个时期 · 二十四个节点</p>
              <p className="mt-2 text-sm leading-7 text-ink-light">从1901年的大学堂，走向开放而多元的山东大学。</p>
            </div>
          </div>
        </div>

        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-5 py-14 sm:px-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-16 lg:px-12 lg:py-20">
          <nav aria-label="校史时期导航" className="lg:sticky lg:top-24 lg:self-start">
          <p className="mb-3 hidden text-xs font-semibold text-ink-light lg:block">时期导航</p>
          <div className="-mx-5 flex gap-1 overflow-x-auto border-y border-ink-dark/15 bg-white px-5 py-2 sm:-mx-8 sm:px-8 lg:mx-0 lg:block lg:overflow-visible lg:border-0 lg:bg-transparent lg:p-0">
            {historyPeriods.map((period) => {
              const active = period.id === activePeriodId;
              return (
                <button
                  key={period.id}
                  type="button"
                  onClick={() => scrollToPeriod(period.id)}
                  aria-current={active ? 'true' : undefined}
                  className={`shrink-0 border-l-2 px-3 py-2 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sdu-red lg:block lg:w-full lg:py-3 ${
                    active
                      ? 'border-sdu-red bg-sdu-red/5 font-semibold text-sdu-red'
                      : 'border-transparent text-ink-light hover:border-ink-dark/25 hover:text-ink-dark'
                  }`}
                >
                  <span className="block">{period.title}</span>
                  <span className="mt-0.5 block text-xs opacity-70">{period.range}</span>
                </button>
              );
            })}
          </div>
          </nav>

          <div className="min-w-0">
          {historyPeriods.map((period) => (
            <section
              key={period.id}
              id={`period-${period.id}`}
              data-history-period={period.id}
              className="scroll-mt-24 pb-20 last:pb-0"
            >
              <header className="history-reveal mb-8 grid gap-4 border-l-4 border-sdu-red pl-5 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-8 sm:pl-7">
                <div>
                  <p className="font-serif text-lg font-semibold text-sdu-red">{period.range}</p>
                </div>
                <div>
                  <h2 className="font-serif text-3xl font-semibold leading-tight sm:text-4xl">{period.title}</h2>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-ink-light sm:text-base">{period.lead}</p>
                </div>
              </header>

              <div>
                {period.events.map((event) => <HistoryEventRow key={event.id} event={event} />)}
              </div>
            </section>
          ))}
          </div>
        </div>
      </section>

      <section className="bg-[#173f3c] text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:px-12 lg:py-20">
          <div>
            <p className="text-xs font-semibold text-white/65">办学文脉</p>
            <p className="mt-3 font-serif text-4xl font-semibold">与时代同行</p>
          </div>
          <p className="max-w-3xl font-serif text-xl leading-10 text-white/90 sm:text-2xl sm:leading-[2]">
            在曲折前进的道路上，山东大学与祖国同呼吸、共命运，为国家高等教育的发展和各项建设事业持续贡献力量。
          </p>
        </div>
      </section>

      <section aria-labelledby="history-sources-title" className="bg-white">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:px-12 lg:py-16">
          <h2 id="history-sources-title" className="font-serif text-2xl font-semibold">延伸阅读</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-ink-light">
            本页内容依据山东大学校史资料及学校公开资料整理。
          </p>
          <ul className="mt-7 grid gap-x-10 gap-y-3 border-t border-ink-dark/15 pt-6 text-sm leading-6 text-ink-light md:grid-cols-2">
            {publicSources.map((source) => (
              <li key={sourceKey(source)} className="border-b border-ink-dark/10 pb-3">
                <EventSource source={source} />
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
