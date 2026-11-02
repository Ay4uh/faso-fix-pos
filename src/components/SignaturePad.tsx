import React, { useRef, useEffect, useState } from 'react';
import { Eraser, PenTool } from 'lucide-react';

interface SignaturePadProps {
  initialSignature?: string | null;
  onSave?: (dataUrl: string) => void;
  onClear?: () => void;
  readOnly?: boolean;
  height?: number;
}

export const SignaturePad: React.FC<SignaturePadProps> = ({
  initialSignature,
  onSave,
  onClear,
  readOnly = false,
  height = 140,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(!!initialSignature);

  // Setup canvas size with DPI scaling
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = canvas.getBoundingClientRect();
    
    // Scale for crispness
    canvas.width = rect.width * ratio;
    canvas.height = height * ratio;
    ctx.scale(ratio, ratio);

    ctx.strokeStyle = '#0f172a'; // Slate 900
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (initialSignature) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, height);
      };
      img.src = initialSignature;
      setHasSignature(true);
    }
  }, [initialSignature, height]);

  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();

    if ('touches' in e) {
      const touch = e.touches[0];
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      };
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (readOnly) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasSignature(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || readOnly) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas && onSave) {
      const dataUrl = canvas.toDataURL('image/png');
      onSave(dataUrl);
    }
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    ctx.clearRect(0, 0, canvas.width / ratio, canvas.height / ratio);
    setHasSignature(false);
    if (onClear) onClear();
  };

  return (
    <div className="space-y-1.5 w-full select-none">
      <div className="relative border border-slate-300 rounded-xl bg-white overflow-hidden shadow-xs">
        <canvas
          ref={canvasRef}
          style={{ height: `${height}px`, touchAction: 'none' }}
          className={`w-full ${readOnly ? 'cursor-default' : 'cursor-crosshair bg-slate-50/50'}`}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />

        {/* Signature Baseline Line */}
        <div className="absolute bottom-6 left-6 right-6 border-b border-dashed border-slate-300 pointer-events-none flex justify-between items-center text-[10px] text-slate-400 font-sans">
          <span className="flex items-center gap-1 font-medium">
            <PenTool className="w-3 h-3 text-slate-400" />
            Customer Authorization Signature Line (Touch or Mouse)
          </span>
          <span className="font-mono text-[9px] uppercase tracking-wider">ApexFix Legal Waiver</span>
        </div>

        {/* Clear Action Button */}
        {!readOnly && (
          <div className="absolute top-2 right-2 flex items-center gap-1">
            {hasSignature && (
              <button
                type="button"
                onClick={handleClear}
                className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-slate-600 bg-white/90 hover:bg-slate-100 rounded-md border border-slate-200 shadow-2xs transition-colors cursor-pointer"
                title="Clear Signature"
              >
                <Eraser className="w-3 h-3 text-slate-500" />
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      <p className="text-[10px] text-slate-400 leading-tight">
        Authorized customer signature confirms device intake condition, disclaims pre-existing liquid damage, and acknowledges the standard 90-day parts warranty.
      </p>
    </div>
  );
};
