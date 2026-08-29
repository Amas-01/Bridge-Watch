import type { BridgeHealthPoint } from "../../services/api";

interface Props {
  points: BridgeHealthPoint[];
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function scoreColor(score: number) {
  if (score >= 80) return "text-green-400";
  if (score >= 50) return "text-yellow-400";
  return "text-red-400";
}

export default function AnnotationList({ points }: Props) {
  const annotated = points.filter((p) => p.annotation);

  if (annotated.length === 0) {
    return (
      <p className="text-stellar-text-secondary text-sm py-2">
        No significant health changes detected in this period.
      </p>
    );
  }

  return (
    <ul className="space-y-2" aria-label="Health change annotations">
      {annotated.map((p, i) => (
        <li
          key={i}
          className="flex items-start gap-3 text-sm border-l-2 border-yellow-500/60 pl-3"
        >
          <div className="flex-1 min-w-0">
            <p className="text-white">{p.annotation}</p>
            <p className="text-stellar-text-secondary text-xs">{formatTime(p.timestamp)}</p>
          </div>
          <span className={`font-semibold shrink-0 ${scoreColor(p.score)}`}>
            {p.score}
          </span>
        </li>
      ))}
    </ul>
  );
}
