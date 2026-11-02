import React from 'react';

interface BarcodeProps {
  value: string;
  width?: number;
  height?: number;
  className?: string;
}

export const Barcode: React.FC<BarcodeProps> = ({
  value,
  width = 160,
  height = 42,
  className = '',
}) => {
  // Deterministic barcode pattern generation from string
  const hash = value.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const bars: { x: number; w: number }[] = [];

  let curX = 10;
  const totalWidth = width - 20;
  let i = 0;

  while (curX < totalWidth) {
    const w = ((hash + i * 7) % 3) + 1; // 1, 2, or 3 px wide
    bars.push({ x: curX, w });
    curX += w + (((hash + i * 13) % 2) + 1); // 1 or 2 px gap
    i++;
  }

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="overflow-visible"
      >
        {bars.map((bar, idx) => (
          <rect
            key={idx}
            x={bar.x}
            y={2}
            width={bar.w}
            height={height - 12}
            fill="#0f172a"
          />
        ))}
      </svg>
      <span className="font-mono text-[9px] tracking-widest text-slate-600 -mt-2 uppercase font-bold">
        *{value}*
      </span>
    </div>
  );
};
