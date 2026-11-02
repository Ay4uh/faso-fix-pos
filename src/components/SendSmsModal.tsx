import React, { useState } from 'react';
import { Ticket } from '../types';
import { X, Send, MessageSquare, Check, Phone } from 'lucide-react';

interface SendSmsModalProps {
  ticket: Ticket | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const SendSmsModal: React.FC<SendSmsModalProps> = ({ ticket, onClose, onSuccess }) => {
  if (!ticket) return null;

  const defaultTemplates = [
    `Hi ${ticket.customer.fullName}, ApexFix update: Your ${ticket.deviceMakeModel} repair is COMPLETED and ready for pickup at Bench #04! Total: $${ticket.price.toFixed(2)}.`,
    `Hi ${ticket.customer.fullName}, your ${ticket.deviceMakeModel} diagnostic is in progress. Required components have been ordered. We will notify you once received!`,
    `Hi ${ticket.customer.fullName}, our technician Alex Mercer is actively working on your ${ticket.deviceMakeModel}. Expected completion by ${new Date(ticket.dueDate).toLocaleDateString()}.`,
  ];

  const [message, setMessage] = useState(defaultTemplates[0]);
  const [isSending, setIsSending] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSending(true);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          customerPhone: ticket.customer.phoneNumber,
        }),
      });

      if (!res.ok) throw new Error('Failed to dispatch notification');

      setSentSuccess(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    } catch (err) {
      alert('Failed to send SMS message');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900">Send Customer SMS Update</h3>
              <p className="text-[11px] text-slate-500">Instant dispatch to customer mobile</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSend} className="p-5 space-y-4 text-xs">
          {/* Recipient summary */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <div>
              <span className="font-bold text-slate-900 block">{ticket.customer.fullName}</span>
              <span className="text-slate-500 font-mono flex items-center gap-1">
                <Phone className="w-3 h-3 text-slate-400" />
                {ticket.customer.phoneNumber}
              </span>
            </div>
            <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
              #{ticket.ticketNumber}
            </span>
          </div>

          {/* Quick template buttons */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Quick Templates
            </label>
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => setMessage(defaultTemplates[0])}
                className="w-full text-left p-2 rounded-lg border border-slate-200 hover:bg-indigo-50/50 hover:border-indigo-300 transition-colors text-[11px] text-slate-700"
              >
                ✅ <strong>Ready for Pickup:</strong> Work order finished, total due.
              </button>
              <button
                type="button"
                onClick={() => setMessage(defaultTemplates[1])}
                className="w-full text-left p-2 rounded-lg border border-slate-200 hover:bg-amber-50/50 hover:border-amber-300 transition-colors text-[11px] text-slate-700"
              >
                📦 <strong>Parts Ordered:</strong> Waiting on component delivery.
              </button>
              <button
                type="button"
                onClick={() => setMessage(defaultTemplates[2])}
                className="w-full text-left p-2 rounded-lg border border-slate-200 hover:bg-blue-50/50 hover:border-blue-300 transition-colors text-[11px] text-slate-700"
              >
                ⚙️ <strong>In-Progress Bench:</strong> Active diagnostics update.
              </button>
            </div>
          </div>

          {/* Message textarea */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              SMS Message Body
            </label>
            <textarea
              rows={3}
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-xs font-sans leading-relaxed"
            />
          </div>

          {/* Footer action */}
          <div className="pt-2 flex items-center justify-between">
            <div>
              {sentSuccess && (
                <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> SMS dispatched!
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSending || sentSuccess}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold shadow-sm transition-all cursor-pointer disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSending ? 'Sending...' : 'Send SMS'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
