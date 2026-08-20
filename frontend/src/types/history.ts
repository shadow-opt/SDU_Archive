export type HistorySource = {
  label: string;
  url?: string;
};

export type HistoryMedia = {
  src: string;
  alt: string;
  caption: string;
  credit: string;
  sourceUrl: string;
};

export type HistoryEvent = {
  id: string;
  sortYear: number;
  year: string;
  title: string;
  summary: string;
  details: string[];
  sources: HistorySource[];
  media?: HistoryMedia;
};

export type HistoryPeriod = {
  id: string;
  range: string;
  startYear: number;
  title: string;
  lead: string;
  events: HistoryEvent[];
};

export type HistoryLineageNode = {
  id: string;
  eventId: string;
  year: string;
  label: string;
  x: number;
  y: number;
  tone: 'origin' | 'core' | 'branch' | 'convergence' | 'extension';
};

export type HistoryLineageLink = {
  from: string;
  to: string;
  kind: 'continuation' | 'convergence' | 'extension';
};
