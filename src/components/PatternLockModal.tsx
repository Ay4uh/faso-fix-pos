import React, { useState, useEffect, useRef } from 'react';
import { X, RotateCcw, Check, Lock, Smartphone } from 'lucide-react';

interface Point {
  id: number;
  x: number;
  y: number;
}

const DOTS: Point[] = [
  { id: 1, x: 45, y: 45 },
  { id: 2, x: 120, y: 45 },
  { id: 3, x: 195, y: 45 },
  { id: 4, x: 45, y: 120 },
  { id: 5, x: 120, y: 120 },
  { id: 6, x: 195, y: 120 },
  { id: 7, x: 45, y: 195 },
  { id: 8, x: 120, y: 195 },
  { id: 9, x: 195, y: 195 },
];

/**
 * Parses pattern string like "1-2-5-8" or "1258" or "1,2,5,8" into array of numbers [1, 2, 5, 8]
 */
export function parsePattern(str: string | null | undefined): number[] {
  if (!str) return [];
  const digits = str.replace(/[^1-9]/g, '').split('').map(Number);
  // Deduplicate consecutive identical digits while keeping order
  const result: number[] = [];
  for (const d of digits) {
    if (d >= 1 && d <= 9 && !result.includes(d)) {
      result.push(d);
    }
  }
  return result;
}

/**
 * Compact mini SVG preview of 3x3 pattern lock for inline chips / badges
 */
export const PatternLockPreview: React.FC<{
  pattern: string | null | undefined;
  size?: number;
  className?: string;
}> = ({ pattern, size = 32, className = '' }) => {
  const sequence = parsePattern(pattern);
  const dotMap = new Map(DOTS.map((d) => [d.id, d]));

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 240 240"
      className={`shrink-0 ${className}`}
      aria-label={`Pattern: ${sequence.join('-') || 'None'}`}
    >
      <rect width="240" height="240" rx="40" fill="#f8fafc" />
      {/* Connecting Lines */}
      {sequence.map((dotId, idx) => {
        if (idx === 0) return null;
        const prev = dotMap.get(sequence[idx - 1]);
        const curr = dotMap.get(dotId);
        if (!prev || !curr) return null;
        return (
          <line
            key={`preview-line-${idx}`}
            x1={prev.x}
            y1={prev.y}
            x2={curr.x}
            y2={curr.y}
            stroke="#7c3aed"
            strokeWidth="16"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
      {/* Dots */}
      {DOTS.map((dot) => {
        const isSelected = sequence.includes(dot.id);
        return (
          <circle
            key={`preview-dot-${dot.id}`}
            cx={dot.x}
            cy={dot.y}
            r={isSelected ? 18 : 10}
            fill={isSelected ? '#7c3aed' : '#cbd5e1'}
          />
        );
      })}
    </svg>
  );
};

interface PatternLockModalProps {
  isOpen: boolean;
  initialPattern?: string | null;
  deviceName?: string;
  onClose: () => void;
  onSave: (pattern: string) => void;
  readOnly?: boolean;
}

export const PatternLockModal: React.FC<PatternLockModalProps> = ({
  isOpen,
  initialPattern = '',
  deviceName = 'Device',
  onClose,
  onSave,
  readOnly = false,
}) => {
  const [selectedDots, setSelectedDots] = useState<number[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [currentCoord, setCurrentCoord] = useState<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedDots(parsePattern(initialPattern));
      setCurrentCoord(null);
      setIsDragging(false);
    }
  }, [isOpen, initialPattern]);

  if (!isOpen) return null;

  const dotMap = new Map(DOTS.map((d) => [d.id, d]));

  const getSvgCoordinates = (e: React.PointerEvent<SVGSVGElement>): { x: number; y: number } | null => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = 240 / rect.width;
    const scaleY = 240 / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const checkDotCollision = (coord: { x: number; y: number }): number | null => {
    for (const dot of DOTS) {
      const dist = Math.hypot(dot.x - coord.x, dot.y - coord.y);
      if (dist <= 26) {
        return dot.id;
      }
    }
    return null;
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (readOnly) return;
    const coord = getSvgCoordinates(e);
    if (!coord) return;
    const dotId = checkDotCollision(coord);
    if (dotId) {
      setIsDragging(true);
      if (!selectedDots.includes(dotId)) {
        setSelectedDots([dotId]);
      } else {
        setSelectedDots([dotId]);
      }
      setCurrentCoord(coord);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (readOnly || !isDragging) return;
    const coord = getSvgCoordinates(e);
    if (!coord) return;
    setCurrentCoord(coord);
    const dotId = checkDotCollision(coord);
    if (dotId && !selectedDots.includes(dotId)) {
      setSelectedDots((prev) => [...prev, dotId]);
    }
  };

  const handlePointerUp = () => {
    if (readOnly) return;
    setIsDragging(false);
    setCurrentCoord(null);
  };

  const handleDotClick = (dotId: number) => {
    if (readOnly) return;
    if (selectedDots.includes(dotId)) {
      // If clicking already selected dot at the end, remove it; otherwise reset to this dot
      if (selectedDots[selectedDots.length - 1] === dotId) {
        setSelectedDots((prev) => prev.slice(0, -1));
      }
    } else {
      setSelectedDots((prev) => [...prev, dotId]);
    }
  };

  const handleClear = () => {
    setSelectedDots([]);
    setCurrentCoord(null);
  };

  const handleSave = () => {
    const patternStr = selectedDots.join('-');
    onSave(patternStr);
    onClose();
  };

  const patternDisplay = selectedDots.length > 0 ? selectedDots.join(' → ') : 'None';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        className="bg-white rounded-3xl border border-slate-200/90 shadow-2xl max-w-sm w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Device Pattern Lock</h3>
              <p className="text-[11px] text-slate-500 font-medium truncate max-w-[200px]">{deviceName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 flex flex-col items-center space-y-4">
          <div className="text-center">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Pattern Sequence
            </span>
            <div className="text-sm font-mono font-bold text-purple-700 bg-purple-50 px-3 py-1 rounded-full border border-purple-200/60 mt-1 inline-flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-purple-500" />
              <span>{patternDisplay}</span>
            </div>
          </div>

          {/* Interactive 3x3 SVG Grid */}
          <div className="relative p-3 bg-gradient-to-b from-slate-50 to-slate-100/90 rounded-2xl border border-slate-200 shadow-inner select-none touch-none">
            <svg
              ref={svgRef}
              width="240"
              height="240"
              viewBox="0 0 240 240"
              className="cursor-crosshair overflow-visible"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            >
              <defs>
                <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.15" />
                </filter>
              </defs>

              {/* Connecting Completed Path Lines */}
              {selectedDots.map((dotId, idx) => {
                if (idx === 0) return null;
                const prev = dotMap.get(selectedDots[idx - 1]);
                const curr = dotMap.get(dotId);
                if (!prev || !curr) return null;
                return (
                  <line
                    key={`line-${idx}`}
                    x1={prev.x}
                    y1={prev.y}
                    x2={curr.x}
                    y2={curr.y}
                    stroke="#7c3aed"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="transition-all duration-100"
                  />
                );
              })}

              {/* Active dragging temporary line */}
              {isDragging && currentCoord && selectedDots.length > 0 && (
                (() => {
                  const lastDot = dotMap.get(selectedDots[selectedDots.length - 1]);
                  if (!lastDot) return null;
                  return (
                    <line
                      x1={lastDot.x}
                      y1={lastDot.y}
                      x2={currentCoord.x}
                      y2={currentCoord.y}
                      stroke="#a78bfa"
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray="4 4"
                    />
                  );
                })()
              )}

              {/* 3x3 Nodes */}
              {DOTS.map((dot) => {
                const indexInSequence = selectedDots.indexOf(dot.id);
                const isSelected = indexInSequence !== -1;
                const isLast = isSelected && indexInSequence === selectedDots.length - 1;

                return (
                  <g
                    key={`dot-group-${dot.id}`}
                    onClick={() => handleDotClick(dot.id)}
                    className="cursor-pointer"
                  >
                    {/* Invisible larger hit target */}
                    <circle cx={dot.x} cy={dot.y} r="28" fill="transparent" />

                    {/* Outer Glow Ring for selected */}
                    {isSelected && (
                      <circle
                        cx={dot.x}
                        cy={dot.y}
                        r={isLast ? 22 : 18}
                        fill="#ede9fe"
                        stroke="#7c3aed"
                        strokeWidth="2"
                        className="animate-in zoom-in-50 duration-150"
                      />
                    )}

                    {/* Inner Core Circle */}
                    <circle
                      cx={dot.x}
                      cy={dot.y}
                      r={isSelected ? 14 : 9}
                      fill={isSelected ? '#7c3aed' : '#94a3b8'}
                      filter="url(#shadow)"
                      className="transition-all duration-150"
                    />

                    {/* Order Number Badge */}
                    {isSelected && (
                      <text
                        x={dot.x}
                        y={dot.y + 3.5}
                        textAnchor="middle"
                        fontSize="11"
                        fontWeight="bold"
                        fill="#ffffff"
                        className="pointer-events-none font-mono"
                      >
                        {indexInSequence + 1}
                      </text>
                    )}

                    {/* Dot Position Hint (1-9) when idle */}
                    {!isSelected && (
                      <text
                        x={dot.x}
                        y={dot.y + 3}
                        textAnchor="middle"
                        fontSize="9"
                        fill="#cbd5e1"
                        className="pointer-events-none font-mono"
                      >
                        {dot.id}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          <p className="text-[11px] text-slate-500 text-center max-w-xs">
            {readOnly
              ? 'Swipe sequence recorded during customer device intake.'
              : 'Drag or click the dots in sequence (1-9) to record the unlock pattern.'}
          </p>
        </div>

        {/* Modal Footer Controls */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
          {!readOnly && (
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-200/60 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>Clear</span>
            </button>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl text-slate-600 hover:bg-slate-200/50 text-xs font-semibold transition cursor-pointer"
            >
              {readOnly ? 'Close' : 'Cancel'}
            </button>

            {!readOnly && (
              <button
                type="button"
                onClick={handleSave}
                className="px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm shadow-purple-600/30 transition cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save Pattern</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
