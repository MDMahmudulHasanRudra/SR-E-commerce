"use client";

import { useId, useMemo, useState } from "react";

export const CHART_COLORS = ["#1d5d45", "#c3a94e", "#7f9470", "#cf7a55", "#7086a8", "#a07fa8"];

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const magnitude = Math.pow(10, exponent);
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const current = points[i];
    const next = points[i + 1];
    const midX = (current.x + next.x) / 2;
    d += ` C ${midX} ${current.y}, ${midX} ${next.y}, ${next.x} ${next.y}`;
  }
  return d;
}

function shortLabel(label: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(label)) {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
      new Date(`${label}T00:00:00`),
    );
  }
  if (/^\d{4}-\d{2}$/.test(label)) {
    return new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" }).format(
      new Date(`${label}-01T00:00:00`),
    );
  }
  return label;
}

export type ChartPoint = { label: string; value: number };

export function AreaChart({
  data,
  height = 260,
  color = "#1d5d45",
  formatValue = (value: number) => String(value),
  showGrid = true,
}: {
  data: ChartPoint[];
  height?: number;
  color?: string;
  formatValue?: (value: number) => string;
  showGrid?: boolean;
}) {
  const gradientId = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const width = 760;
  const pad = { left: 54, right: 14, top: 16, bottom: 30 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = niceMax(Math.max(...data.map((point) => point.value), 0));

  const points = data.map((point, index) => ({
    x: pad.left + (data.length <= 1 ? innerW / 2 : (index / (data.length - 1)) * innerW),
    y: pad.top + innerH - (point.value / max) * innerH,
  }));

  const line = smoothPath(points);
  const area = points.length
    ? `${line} L ${points[points.length - 1].x} ${pad.top + innerH} L ${points[0].x} ${pad.top + innerH} Z`
    : "";

  const labelIndexes = useMemo(() => {
    if (data.length <= 5) return data.map((_, index) => index);
    const count = 5;
    const set = new Set<number>();
    for (let i = 0; i < count; i += 1) set.add(Math.round((i / (count - 1)) * (data.length - 1)));
    return [...set];
  }, [data]);

  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="relative w-full" style={{ height }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-full w-full overflow-visible"
        preserveAspectRatio="none"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(event) => {
          if (data.length === 0) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = (event.clientX - rect.left) / rect.width;
          const approximate = (ratio * width - pad.left) / innerW;
          const index = Math.round(approximate * (data.length - 1));
          setHover(Math.max(0, Math.min(data.length - 1, index)));
        }}
      >
        <defs>
          <linearGradient id={`area-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {showGrid &&
          gridLines.map((ratio) => {
            const y = pad.top + innerH * ratio;
            return (
              <g key={ratio}>
                <line
                  x1={pad.left}
                  x2={width - pad.right}
                  y1={y}
                  y2={y}
                  stroke="#e8e6dd"
                  strokeWidth="1"
                  strokeDasharray={ratio === 1 ? undefined : "3 5"}
                />
                <text
                  x={pad.left - 10}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-[#9a9d92] text-[10px]"
                  style={{ fontSize: 10 }}
                >
                  {formatValue(max * (1 - ratio))}
                </text>
              </g>
            );
          })}
        {area && <path d={area} fill={`url(#area-${gradientId})`} />}
        {line && <path d={line} fill="none" stroke={color} strokeWidth="2.25" strokeLinejoin="round" />}
        {hover !== null && points[hover] && (
          <g>
            <line
              x1={points[hover].x}
              x2={points[hover].x}
              y1={pad.top}
              y2={pad.top + innerH}
              stroke="#b9b6a9"
              strokeDasharray="3 4"
            />
            <circle cx={points[hover].x} cy={points[hover].y} r="5" fill="#fff" stroke={color} strokeWidth="2.5" />
          </g>
        )}
        {labelIndexes.map((index) => (
          <text
            key={index}
            x={points[index]?.x ?? 0}
            y={height - 8}
            textAnchor={index === 0 ? "start" : index === data.length - 1 ? "end" : "middle"}
            className="fill-[#8d9186]"
            style={{ fontSize: 10 }}
          >
            {shortLabel(data[index]?.label ?? "")}
          </text>
        ))}
      </svg>
      {hover !== null && data[hover] && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs shadow-lg"
          style={{
            left: `${((points[hover].x / width) * 100).toFixed(2)}%`,
            top: 0,
          }}
        >
          <p className="font-medium text-ink-soft">{shortLabel(data[hover].label)}</p>
          <p className="num font-semibold text-ink">{formatValue(data[hover].value)}</p>
        </div>
      )}
    </div>
  );
}

export function BarChart({
  data,
  height = 240,
  color = "#1d5d45",
  secondaryColor = "#d8d5c8",
  formatValue = (value: number) => String(value),
  secondaryLabel,
}: {
  data: { label: string; value: number; secondary?: number }[];
  height?: number;
  color?: string;
  secondaryColor?: string;
  formatValue?: (value: number) => string;
  secondaryLabel?: string;
}) {
  const width = 760;
  const pad = { left: 54, right: 14, top: 16, bottom: 30 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = niceMax(
    Math.max(...data.map((point) => Math.max(point.value, point.secondary ?? 0)), 0),
  );
  const slot = innerW / Math.max(1, data.length);
  const barWidth = Math.max(2, Math.min(18, slot * 0.34));
  const hasSecondary = data.some((point) => point.secondary !== undefined);
  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="w-full" style={{ height }}>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" preserveAspectRatio="none">
        {gridLines.map((ratio) => {
          const y = pad.top + innerH * ratio;
          return (
            <g key={ratio}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y}
                y2={y}
                stroke="#e8e6dd"
                strokeDasharray={ratio === 1 ? undefined : "3 5"}
              />
              <text x={pad.left - 10} y={y + 4} textAnchor="end" style={{ fontSize: 10 }} fill="#9a9d92">
                {formatValue(max * (1 - ratio))}
              </text>
            </g>
          );
        })}
        {data.map((point, index) => {
          const groupX = pad.left + slot * index + slot / 2;
          const valueHeight = (point.value / max) * innerH;
          const secondaryHeight = ((point.secondary ?? 0) / max) * innerH;
          return (
            <g key={`${point.label}-${index}`}>
              <title>{`${shortLabel(point.label)}: ${formatValue(point.value)}`}</title>
              {hasSecondary && (
                <rect
                  x={groupX - barWidth - 1}
                  y={pad.top + innerH - secondaryHeight}
                  width={barWidth}
                  height={Math.max(secondaryHeight, 1)}
                  rx="2"
                  fill={secondaryColor}
                />
              )}
              <rect
                x={hasSecondary ? groupX + 1 : groupX - barWidth / 2}
                y={pad.top + innerH - Math.max(valueHeight, 1)}
                width={barWidth}
                height={Math.max(valueHeight, 1)}
                rx="2"
                fill={color}
              />
              {index % Math.max(1, Math.ceil(data.length / 8)) === 0 && (
                <text
                  x={groupX}
                  y={height - 8}
                  textAnchor="middle"
                  style={{ fontSize: 10 }}
                  fill="#8d9186"
                >
                  {shortLabel(point.label)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hasSecondary && secondaryLabel && (
        <div className="mt-1 flex items-center justify-center gap-2 text-[11px] text-muted">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: color }} />
          <span>{secondaryLabel}</span>
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: secondaryColor }} />
          <span>Expenses</span>
        </div>
      )}
    </div>
  );
}

export function Donut({
  data,
  size = 176,
  thickness = 18,
  centerLabel,
  centerValue,
}: {
  data: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex items-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#f0eee6"
            strokeWidth={thickness}
          />
          {total > 0 &&
            data.map((item) => {
              const length = (item.value / total) * circumference;
              const dash = Math.max(length - 3, 0);
              const element = (
                <circle
                  key={item.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={item.color}
                  strokeWidth={thickness}
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="round"
                />
              );
              offset += length;
              return element;
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="num text-xl font-semibold tracking-tight">{centerValue ?? total}</span>
          {centerLabel && <span className="mt-0.5 text-[11px] text-muted">{centerLabel}</span>}
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-2.5">
        {data.map((item) => (
          <li key={item.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: item.color }} />
              <span className="truncate capitalize text-ink-soft">{item.label}</span>
            </span>
            <span className="num shrink-0 text-xs font-medium text-muted">
              {total > 0 ? `${Math.round((item.value / total) * 100)}%` : "0%"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Sparkline({
  data,
  color = "#1d5d45",
  height = 36,
  width = 120,
  fill = false,
}: {
  data: number[];
  color?: string;
  height?: number;
  width?: number;
  fill?: boolean;
}) {
  const gradientId = useId().replace(/:/g, "");
  if (data.length === 0) return <div style={{ height }} />;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const span = max - min || 1;
  const points = data.map((value, index) => ({
    x: data.length <= 1 ? width / 2 : (index / (data.length - 1)) * width,
    y: height - 3 - ((value - min) / span) * (height - 6),
  }));
  const line = smoothPath(points);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      {fill && (
        <>
          <defs>
            <linearGradient id={`spark-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.24" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${line} L ${width} ${height} L 0 ${height} Z`} fill={`url(#spark-${gradientId})`} />
        </>
      )}
      <path d={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function ProgressBar({
  value,
  max = 100,
  tone = "brand",
  className = "",
}: {
  value: number;
  max?: number;
  tone?: "brand" | "amber" | "rose" | "blue" | "zinc";
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(max, 1)) * 100));
  const colors: Record<string, string> = {
    brand: "#1d5d45",
    amber: "#d99a2b",
    rose: "#d2604c",
    blue: "#5b7fb8",
    zinc: "#9b9e93",
  };
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-[#eeece4] ${className}`}>
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${pct}%`, background: colors[tone] }}
      />
    </div>
  );
}
