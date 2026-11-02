import React, { useEffect, useState } from 'react';
import { Package, AlertTriangle, CheckCircle2, Search, Plus, X } from 'lucide-react';

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  category: string;
  costInCents: number;
  retailInCents: number;
  stockQuantity: number;
  reorderPoint: number;
  supplier?: string | null;
}

export const InventoryView: React.FC = () => {
  const [parts, setParts] = useState<InventoryItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Add Part Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('SCREEN');
  const [cost, setCost] = useState('');
  const [retail, setRetail] = useState('');
  const [stock, setStock] = useState('5');
  const [supplier, setSupplier] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchInventory = () => {
    setLoading(true);
    fetch('/api/inventory')
      .then((res) => res.json())
      .then((data) => {
        setParts(data.data || []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  const handleCreatePart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: sku.trim() || undefined,
          name: name.trim(),
          category,
          cost: parseFloat(cost) || 0,
          retail: parseFloat(retail) || 0,
          stockQuantity: parseInt(stock) || 0,
          supplier: supplier.trim() || undefined,
        }),
      });

      if (!res.ok) throw new Error('Failed to create part');

      setIsAddModalOpen(false);
      setName('');
      setSku('');
      setCost('');
      setRetail('');
      setSupplier('');
      fetchInventory();
    } catch {
      alert('Could not save inventory item');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filtered = parts.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      (p.supplier && p.supplier.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Package className="w-4 h-4 text-indigo-600" />
            Repair Parts & Components Inventory
          </h2>
          <p className="text-xs text-slate-500">
            Real-time stock quantities, supplier SKUs, and margin tracking
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search part name or SKU..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
            />
          </div>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs cursor-pointer transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Part</span>
          </button>
        </div>
      </div>

      {/* Parts Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <th className="py-2.5 px-4">SKU Code</th>
              <th className="py-2.5 px-4">Component Name</th>
              <th className="py-2.5 px-4">Category</th>
              <th className="py-2.5 px-4">Unit Cost</th>
              <th className="py-2.5 px-4">Retail Sell</th>
              <th className="py-2.5 px-4">Gross Margin</th>
              <th className="py-2.5 px-4">Stock Level</th>
              <th className="py-2.5 px-4">Supplier</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-400">
                  Loading inventory catalog...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-400">
                  <div className="max-w-xs mx-auto space-y-2">
                    <Package className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="font-semibold text-slate-700 text-xs">Inventory Catalog Empty</p>
                    <p className="text-[11px] text-slate-400">
                      Click &ldquo;+ Add Part&rdquo; above to log replacement screens, batteries, or hardware components into your inventory.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((part) => {
                const cost = part.costInCents / 100;
                const sell = part.retailInCents / 100;
                const margin = sell > 0 ? Math.round(((sell - cost) / sell) * 100) : 0;
                const isLow = part.stockQuantity <= part.reorderPoint;

                return (
                  <tr key={part.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-4 font-mono font-bold text-indigo-600">
                      {part.sku}
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-slate-900">
                      {part.name}
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
                        {part.category}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-500">
                      ${cost.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-4 font-mono font-bold text-slate-900">
                      ${sell.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-4 font-mono font-semibold text-emerald-600">
                      +{margin}%
                    </td>
                    <td className="py-2.5 px-4">
                      {isLow ? (
                        <span className="inline-flex items-center gap-1 font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full text-[11px]">
                          <AlertTriangle className="w-3 h-3 text-amber-500" />
                          {part.stockQuantity === 0 ? 'Out of Stock' : `${part.stockQuantity} remaining`}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full text-[11px]">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                          {part.stockQuantity} in stock
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-slate-500">
                      {part.supplier || 'Direct'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add Part Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Package className="w-4 h-4 text-indigo-600" />
                Add New Inventory Component
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreatePart} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Part / Component Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. iPhone 15 Pro OLED Display OEM"
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    SKU Code
                  </label>
                  <input
                    type="text"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder="PRT-IP15P-SCR"
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    <option value="SCREEN">Screen / Display</option>
                    <option value="BATTERY">Battery Cell</option>
                    <option value="CHARGING_PORT">Charging Port</option>
                    <option value="FAN">Fan / Cooling</option>
                    <option value="LOGIC_BOARD">Micro-solder IC</option>
                    <option value="GENERAL">General Hardware</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Cost Price ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                    placeholder="45.00"
                    className="w-full px-2 py-1.5 font-mono text-xs bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Retail Price ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={retail}
                    onChange={(e) => setRetail(e.target.value)}
                    placeholder="99.00"
                    className="w-full px-2 py-1.5 font-mono text-xs bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Initial Stock
                  </label>
                  <input
                    type="number"
                    required
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    className="w-full px-2 py-1.5 font-mono text-xs bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Supplier / Distributor
                </label>
                <input
                  type="text"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder="e.g. MobileSentrix US / InjuredGadgets"
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold shadow-xs cursor-pointer"
                >
                  {isSubmitting ? 'Saving...' : 'Add to Inventory'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
