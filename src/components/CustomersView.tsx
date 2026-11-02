import React, { useState } from 'react';
import { Customer, Ticket } from '../types';
import { Search, User, Phone, Mail, MapPin, Wrench, Plus } from 'lucide-react';

interface CustomersViewProps {
  customers: Customer[];
  tickets: Ticket[];
  onOpenCreateWithCustomer?: (customer: Customer) => void;
}

export const CustomersView: React.FC<CustomersViewProps> = ({
  customers,
  tickets,
  onOpenCreateWithCustomer,
}) => {
  const [search, setSearch] = useState('');

  const filtered = customers.filter(
    (c) =>
      c.fullName.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search) ||
      (c.email && c.email.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Registered CRM Customers</h2>
          <p className="text-xs text-slate-500">
            Total of {customers.length} client accounts on file
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer name or phone..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.length === 0 ? (
          <div className="col-span-full py-16 text-center bg-white rounded-xl border border-slate-200">
            <User className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-slate-700">No Customers On File</h3>
            <p className="text-xs text-slate-400 mt-1">
              Customer profiles will automatically be saved here as repair tickets are created.
            </p>
          </div>
        ) : (
          filtered.map((customer) => {
            const custTickets = tickets.filter((t) => t.customerId === customer.id);
            const totalSpendDollars =
              customer.totalPaidCents !== undefined
                ? customer.totalPaidCents / 100
                : custTickets.reduce(
                    (acc, t) => acc + (t.totals ? t.totals.paidCents / 100 : 0),
                    0
                  );
            const ticketCount = customer.ticketCount ?? custTickets.length;

            return (
              <div
                key={customer.id}
                className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-700 font-bold flex items-center justify-center text-xs border border-indigo-100">
                        {customer.fullName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-xs leading-tight">
                          {customer.fullName}
                        </h3>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                          Client #{customer.id.slice(0, 8)}
                        </p>
                      </div>
                    </div>

                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-mono">
                      ${totalSpendDollars.toFixed(2)}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-600">
                    <div className="flex items-center gap-2 font-mono">
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{customer.phone}</span>
                    </div>
                    {customer.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{customer.email}</span>
                      </div>
                    )}
                    {customer.address && (
                      <div className="flex items-center gap-2 text-slate-500">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{customer.address}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 font-medium">
                    {ticketCount} {ticketCount === 1 ? 'ticket' : 'tickets'} logged
                  </span>
                  {onOpenCreateWithCustomer ? (
                    <button
                      onClick={() => onOpenCreateWithCustomer(customer)}
                      className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      New Ticket
                    </button>
                  ) : (
                    <span className="font-mono text-indigo-600 font-semibold flex items-center gap-1">
                      <Wrench className="w-3 h-3" />
                      Active history
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
