import React from 'react';

interface ConfidenceIndicatorProps {
  confidence?: number;
  className?: string;
  showBar?: boolean;
}

export const ConfidenceIndicator: React.FC<ConfidenceIndicatorProps> = ({
  confidence,
  className = '',
  showBar = true
}) => {
  // Normalize and clamp confidence score between 0 and 100
  const score = typeof confidence === 'number' && !isNaN(confidence)
    ? Math.max(0, Math.min(100, Math.round(confidence)))
    : 85;

  let theme = {
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    bar: 'bg-emerald-500',
    dot: 'bg-emerald-500',
    label: 'High',
  };

  if (score < 70) {
    theme = {
      badge: 'bg-rose-50 text-rose-700 border-rose-200',
      bar: 'bg-rose-500',
      dot: 'bg-rose-500',
      label: 'Low',
    };
  } else if (score < 85) {
    theme = {
      badge: 'bg-amber-50 text-amber-700 border-amber-200',
      bar: 'bg-amber-500',
      dot: 'bg-amber-500',
      label: 'Medium',
    };
  }

  return (
    <div
      className={`inline-flex flex-col gap-1 min-w-[70px] ${className}`}
      title={`Confidence: ${score}% (${theme.label})`}
    >
      <div className="flex items-center justify-between gap-1.5">
        <span
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold border font-mono tracking-tight leading-none ${theme.badge}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${theme.dot}`} />
          {score}%
        </span>
      </div>

      {showBar && (
        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden border border-slate-200/60">
          <div
            className={`h-full rounded-full transition-all duration-500 ${theme.bar}`}
            style={{ width: `${score}%` }}
          />
        </div>
      )}
    </div>
  );
};
