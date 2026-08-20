import { useMemo, useRef, useState } from 'react';
import { ArrowDownRight, ExternalLink } from 'lucide-react';
import {
  HISTORY_LINEAGE_VIEWBOX,
  historyLineageBackdrop,
  historyLineageLinks,
  historyLineageNodes,
} from '../data/historyLineage';
import type { HistoryEvent, HistoryLineageLink, HistoryLineageNode } from '../types/history';

type HistoryLineageMapProps = {
  events: HistoryEvent[];
  onOpenEvent: (eventId: string) => void;
};

const toneClassNames: Record<HistoryLineageNode['tone'], string> = {
  origin: 'border-[#d1b778] bg-[#d1b778] text-[#241f18]',
  core: 'border-white/35 bg-[#f5f1e8] text-[#211f1c]',
  branch: 'border-[#b8ccc5]/45 bg-[#244743] text-white',
  convergence: 'border-[#c84c56] bg-[#9c0c13] text-white',
  extension: 'border-[#d1b778]/55 bg-[#342f2b] text-white',
};

const linkColors: Record<HistoryLineageLink['kind'], string> = {
  continuation: '#d8d1c3',
  convergence: '#c84c56',
  extension: '#88aaa0',
};

const nodeById = new Map(historyLineageNodes.map((node) => [node.id, node]));

const connectorPath = (link: HistoryLineageLink) => {
  const source = nodeById.get(link.from);
  const target = nodeById.get(link.to);
  if (!source || !target) return '';

  const sourceX = source.x * 10;
  const targetX = target.x * 10;
  const middleX = sourceX + ((targetX - sourceX) * 0.52);
  return `M ${sourceX} ${source.y} C ${middleX} ${source.y}, ${middleX} ${target.y}, ${targetX} ${target.y}`;
};

export default function HistoryLineageMap({ events, onOpenEvent }: HistoryLineageMapProps) {
  const [selectedNodeId, setSelectedNodeId] = useState(historyLineageNodes[0].id);
  const [backdropFailed, setBackdropFailed] = useState(false);
  const nodeRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedNode = nodeById.get(selectedNodeId) ?? historyLineageNodes[0];

  const eventById = useMemo(() => new Map(events.map((event) => [event.id, event])), [events]);
  const selectedEvent = eventById.get(selectedNode.eventId);
  const connectedNodeIds = useMemo(() => {
    const connected = new Set([selectedNodeId]);
    historyLineageLinks.forEach((link) => {
      if (link.from === selectedNodeId) connected.add(link.to);
      if (link.to === selectedNodeId) connected.add(link.from);
    });
    return connected;
  }, [selectedNodeId]);

  const handleNodeKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (index + direction + historyLineageNodes.length) % historyLineageNodes.length;
    const nextNode = historyLineageNodes[nextIndex];
    setSelectedNodeId(nextNode.id);
    nodeRefs.current[nextIndex]?.focus();
  };

  return (
    <section id="history-lineage" aria-labelledby="history-lineage-title" className="scroll-mt-16 bg-[#171d1b] text-white">
      <div className="mx-auto max-w-[92rem] px-5 pb-6 pt-16 sm:px-8 lg:px-12 lg:pt-20">
        <div className="grid gap-8 border-b border-white/15 pb-10 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-end">
          <div>
            <p className="text-xs font-semibold text-[#d1b778]">校史谱系</p>
            <h2 id="history-lineage-title" className="mt-3 max-w-4xl font-serif text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
              多源汇流，弦歌不辍
            </h2>
          </div>
          <p className="max-w-xl text-sm leading-7 text-white/68 sm:text-base sm:leading-8">
            从大学堂肇始、青岛办学与解放区办学，到1951年合校和2000年三校合并，山东大学的办学文脉在迁转与汇聚中延续。
          </p>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-white/60" aria-label="谱系连线图例">
          <span className="inline-flex items-center gap-2"><i className="h-px w-8 bg-[#d8d1c3]" />沿革</span>
          <span className="inline-flex items-center gap-2"><i className="h-px w-8 bg-[#c84c56]" />汇流</span>
          <span className="inline-flex items-center gap-2"><i className="h-px w-8 bg-[#88aaa0]" />拓展</span>
        </div>
      </div>

      <div
        className="lineage-scroll overflow-x-auto overscroll-x-contain pb-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#f2d99b]"
        tabIndex={0}
        aria-label="山东大学历史沿革谱系图"
      >
        <div className="relative mx-auto h-[36.875rem] min-w-[82rem] max-w-[92rem] overflow-hidden border-y border-white/10 bg-[#111715]">
          {!backdropFailed ? (
            <img
              src={historyLineageBackdrop.src}
              alt=""
              aria-hidden="true"
              width="1200"
              height="800"
              loading="lazy"
              onError={() => setBackdropFailed(true)}
              className="absolute inset-0 h-full w-full object-cover opacity-[0.13] grayscale"
            />
          ) : null}
          <div className="absolute inset-0 bg-[#07100d]/80" aria-hidden="true" />

          <div aria-hidden="true" className="absolute left-[2.5%] top-14 z-[1] font-serif text-lg text-white/16">大学堂与青岛办学</div>
          <div aria-hidden="true" className="absolute left-[2.5%] top-[20rem] z-[1] font-serif text-lg text-white/16">解放区办学</div>
          <div aria-hidden="true" className="absolute left-[65%] top-[30.5rem] z-[1] font-serif text-lg text-white/16">三校合流</div>

          <svg
            aria-hidden="true"
            className="absolute inset-0 h-full w-full"
            viewBox={`0 0 ${HISTORY_LINEAGE_VIEWBOX.width} ${HISTORY_LINEAGE_VIEWBOX.height}`}
            preserveAspectRatio="none"
          >
            {[1901, 1930, 1951, 2000, 2022].map((year, index) => {
              const x = [65, 390, 690, 870, 940][index];
              return (
                <g key={year}>
                  <line x1={x} y1="35" x2={x} y2="555" stroke="rgba(255,255,255,0.08)" strokeDasharray="3 8" />
                  <text x={x + 8} y="35" fill="rgba(255,255,255,0.32)" fontSize="12">{year}</text>
                </g>
              );
            })}

            {historyLineageLinks.map((link) => {
              const isActive = link.from === selectedNodeId || link.to === selectedNodeId;
              return (
                <path
                  key={`${link.from}-${link.to}`}
                  d={connectorPath(link)}
                  fill="none"
                  stroke={isActive ? '#f2d99b' : linkColors[link.kind]}
                  strokeOpacity={isActive ? 1 : 0.55}
                  strokeWidth={isActive ? 3 : 1.5}
                  vectorEffect="non-scaling-stroke"
                  className={`lineage-path ${isActive ? 'is-active' : ''}`}
                />
              );
            })}
          </svg>

          {historyLineageNodes.map((node, index) => {
            const selected = node.id === selectedNodeId;
            const connected = connectedNodeIds.has(node.id);
            return (
              <button
                key={node.id}
                ref={(element) => { nodeRefs.current[index] = element; }}
                type="button"
                aria-pressed={selected}
                aria-label={`${node.label}，${node.year}`}
                onClick={() => setSelectedNodeId(node.id)}
                onKeyDown={(event) => handleNodeKeyDown(event, index)}
                className={`lineage-node absolute z-10 w-[8.6rem] border px-3 py-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f2d99b] focus-visible:ring-offset-2 focus-visible:ring-offset-[#111715] ${toneClassNames[node.tone]} ${
                  selected ? 'is-selected' : connected ? 'is-connected' : ''
                }`}
                style={{ left: `${node.x}%`, top: node.y }}
              >
                <span aria-hidden="true" className="lineage-node-accent" />
                <span className="block text-[0.65rem] font-semibold opacity-65">{node.year}</span>
                <span className="mt-1 block font-serif text-sm font-semibold leading-snug">{node.label}</span>
              </button>
            );
          })}

          {!backdropFailed ? (
            <a
              href={historyLineageBackdrop.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="absolute bottom-3 right-4 z-20 inline-flex items-center gap-1 text-[0.65rem] text-white/45 transition-colors hover:text-white"
            >
              {historyLineageBackdrop.caption} · {historyLineageBackdrop.credit}
              <ExternalLink aria-hidden="true" className="h-3 w-3" />
            </a>
          ) : null}
        </div>
      </div>

      <div className="mx-auto max-w-[92rem] px-5 pb-16 pt-5 sm:px-8 lg:px-12 lg:pb-20">
        <div aria-live="polite" className="grid gap-6 border-t border-white/15 pt-7 md:grid-cols-[9rem_minmax(0,1fr)_auto] md:items-center">
          <div>
            <p className="text-xs text-white/45">当前节点</p>
            <p className="mt-1 font-serif text-2xl font-semibold text-[#f2d99b]">{selectedNode.year}</p>
          </div>
          <div>
            <h3 className="font-serif text-2xl font-semibold">{selectedNode.label}</h3>
            {selectedEvent ? <p className="mt-2 max-w-3xl text-sm leading-7 text-white/65">{selectedEvent.summary}</p> : null}
          </div>
          {selectedEvent ? (
            <button
              type="button"
              onClick={() => onOpenEvent(selectedEvent.id)}
              className="inline-flex min-h-11 items-center justify-center gap-2 border border-[#f2d99b]/55 px-4 py-2.5 text-sm font-semibold text-[#f2d99b] transition-colors hover:bg-[#f2d99b] hover:text-[#211f1c] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f2d99b]"
            >
              查看年表
              <ArrowDownRight aria-hidden="true" className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
