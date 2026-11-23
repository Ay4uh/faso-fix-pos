import React, { useState, useEffect } from 'react';
import { Ticket } from '../types';
import { X, MessageSquare, Send } from 'lucide-react';
import { posAudio } from '../utils/audio';
import { fetchWithAuth } from '../utils/auth';

interface SendSmsModalProps {
  ticket: Ticket | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const SendSmsModal: React.FC<SendSmsModalProps> = ({ ticket, onClose, onSuccess }) => {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (ticket) {
      setMessage(
        `Hello ${ticket.customer.fullName}, Faso Fix update: Your ${ticket.device?.name || 'device'} (WO #${ticket.ticketNumber}) is currently ${ticket.status.toLowerCase().replace(/_/g, ' ')}.`
      );
      setErrorMsg(null);
    }
  }, [ticket?.id]);

  if (!ticket) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setIsSending(true);
    setErrorMsg(null);
    try {
      const res = await fetchWithAuth(`/api/tickets/${ticket.id}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message.trim(),
          customerPhone: ticket.customer.phone,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || 'SMS transmission failed');
      }

      posAudio.playScanBeep();
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not send SMS');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-xs text-slate-900">
                Send SMS Update (WO #{ticket.ticketNumber})
              </h3>
              <p className="text-[10px] text-slate-500">
                To {ticket.customer.fullName} • {ticket.customer.phone}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {errorMsg && (
            <div className="p-2.5 bg-red-50 text-red-700 text-xs rounded border border-red-200">
              {errorMsg}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Text Message Body
            </label>
            <textarea
              rows={4}
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
            />
            <span className="text-[10px] text-slate-400 mt-1 block">
              Sends text directly to customer and records in work order audit history.
            </span>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSending}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs cursor-pointer disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSending ? 'Sending...' : 'Send Text'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
