import React, { useState } from 'react';
import { Ticket } from '../types';
import {
  X,
  Printer,
  Trash2,
  Save,
  CheckCircle2,
  Clock,
  Package,
  AlertCircle,
  Phone,
  Mail,
  MapPin,
  Calendar,
  DollarSign,
  Wrench,
  Hash,
} from 'lucide-react';

interface TicketDetailModalProps {
  ticket: Ticket | null;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<Ticket>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onPrint: (ticket: Ticket) => void;
}

export const TicketDetailModal: React.FC<TicketDetailModalProps> = ({
  ticket,
  onClose,
  onUpdate,
  onDelete,
  onPrint,
}) => {
  if (!ticket) return null;

  const [status, setStatus] = useState<Ticket['status']>(ticket.status);
  const [price, setPrice] = useState(ticket.price.toString());
  const [technicianNote, setTechnicianNote] = useState(ticket.technicianNote || '');
  const [faultDescription, setFaultDescription] = useState(ticket.faultDescription);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onUpdate(ticket.id, {
        status,
        price: parseFloat(price) || ticket.price,
        technicianNote,
        faultDescription,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (confirm(`Are you sure you want to permanently delete ticket #${ticket.ticketNumber}?`)) {
      await onDelete(ticket.id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <span className="font-mono text-base font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-lg">
              #{ticket.ticketNumber}
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900">{ticket.deviceMakeModel}</h2>
              <p className="text-[11px] text-slate-500 font-mono">
                {ticket.serialNumber || 'No Serial Logged'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPrint(ticket)}
              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition-colors"
              title="Print Receipt"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              onClick={handleDelete}
              className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
              title="Delete Ticket"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 text-xs max-h-[75vh] overflow-y-auto">
          {/* Status Stepper / Switcher */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
              Work Order Status Lifecycle
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setStatus('PENDING')}
                className={`py-2 px-3 rounded-lg font-semibold flex items-center justify-center gap-1.5 border transition-all ${
                  status === 'PENDING'
                    ? 'bg-slate-800 text-white border-slate-800 shadow-sm'
                    : 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200'
                }`}
              >
                <AlertCircle className="w-3.5 h-3.5" />
                Pending
              </button>

              <button
                type="button"
                onClick={() => setStatus('IN_PROGRESS')}
                className={`py-2 px-3 rounded-lg font-semibold flex items-center justify-center gap-1.5 border transition-all ${
                  status === 'IN_PROGRESS'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                In-Progress
              </button>

              <button
                type="button"
                onClick={() => setStatus('WAITING_ON_PARTS')}
                className={`py-2 px-3 rounded-lg font-semibold flex items-center justify-center gap-1.5 border transition-all ${
                  status === 'WAITING_ON_PARTS'
                    ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                    : 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200'
                }`}
              >
                <Package className="w-3.5 h-3.5" />
                Parts Waiting
              </button>

              <button
                type="button"
                onClick={() => setStatus('COMPLETED')}
                className={`py-2 px-3 rounded-lg font-semibold flex items-center justify-center gap-1.5 border transition-all ${
                  status === 'COMPLETED'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                    : 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Completed
              </button>
            </div>
          </div>

          {/* Customer Details Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Customer Information
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900">{ticket.customer.fullName}</span>
              </div>
              <div className="flex items-center gap-2 font-mono">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <span>{ticket.customer.phoneNumber}</span>
              </div>
              {ticket.customer.email && (
                <div className="flex items-center gap-2 text-slate-500">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span>{ticket.customer.email}</span>
                </div>
              )}
              {ticket.customer.address && (
                <div className="flex items-center gap-2 text-slate-500">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  <span>{ticket.customer.address}</span>
                </div>
              )}
            </div>
          </div>

          {/* Fault Description & Tech Notes */}
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Reported Fault Description
              </label>
              <textarea
                rows={2}
                value={faultDescription}
                onChange={(e) => setFaultDescription(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Technician Diagnostic Bench Notes
              </label>
              <textarea
                rows={3}
                value={technicianNote}
                onChange={(e) => setTechnicianNote(e.target.value)}
                placeholder="Log work completed, parts used, power rail voltages, or next steps..."
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 font-mono text-xs"
              />
            </div>
          </div>

          {/* Pricing & Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Repair Price Estimate ($)
              </label>
              <div className="relative">
                <DollarSign className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="number"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 font-mono text-slate-900 font-bold bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Due Date
              </label>
              <div className="flex items-center gap-1.5 py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-mono">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>{new Date(ticket.dueDate).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            {saveSuccess && (
              <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Changes saved!
              </span>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-all cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Saving...' : 'Save Updates'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
