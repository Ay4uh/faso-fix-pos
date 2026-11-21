import { useEffect, useRef } from 'react';

interface BarcodeScannerOptions {
  onScanTicket?: (ticketQuery: string) => void;
  onScanItem?: (skuOrBarcode: string) => void;
  onScan?: (code: string) => void;
  enabled?: boolean;
}

export function useBarcodeScanner({
  onScanTicket,
  onScanItem,
  onScan,
  enabled = true,
}: BarcodeScannerOptions) {
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is actively typing in a standard input/textarea/select
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      // Fast typing from a barcode scanner is typically < 50ms per key
      const now = Date.now();
      const timeDiff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      if (e.key === 'Enter') {
        const scanned = bufferRef.current.trim();
        bufferRef.current = '';

        if (scanned.length >= 2) {
          // If it was captured inside an input but came rapidly like a scanner, we can still process
          if (onScan) onScan(scanned);

          // Check if ticket format
          if (
            scanned.toUpperCase().startsWith('WO-') ||
            scanned.startsWith('#') ||
            /^\d{1,6}$/.test(scanned)
          ) {
            const clean = scanned.toUpperCase().replace(/^WO-/, '').replace(/^#/, '');
            if (onScanTicket) {
              onScanTicket(clean);
              e.preventDefault();
            }
          } else if (onScanItem) {
            onScanItem(scanned);
          }
        }
        return;
      }

      // If key is printable character
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // If time between keystrokes was > 120ms and buffer has started, clear buffer unless it's new
        if (timeDiff > 120 && !isInput) {
          bufferRef.current = '';
        }

        // Only append to background scanner buffer if not typing inside an input field
        // OR if keys are arriving at scanner speeds (< 45ms)
        if (!isInput || timeDiff < 45) {
          bufferRef.current += e.key;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [enabled, onScanTicket, onScanItem, onScan]);
}
