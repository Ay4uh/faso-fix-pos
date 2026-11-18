import React, { useEffect, useState } from 'react';
import { Package, AlertTriangle, CheckCircle2, Search, Plus, X, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { posAudio } from '../utils/audio';
import { fetchWithAuth } from '../utils/auth';

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  category: string;
  costCents: number;
  priceCents: number;
  stock: number;
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
  const [reorderPoint, setReorderPoint] = useState('2');
  const [supplier, setSupplier] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchInventory = () => {
    setLoading(true);
    fetchWithAuth('/api/inventory')
      .then((res) => res.json())
      .then((data) => {
        const raw = data.data || [];
        // Map raw items so they conform to costCents, priceCents, stock
        const normalized: InventoryItem[] = raw.map((p: any) => ({
          id: p.id,
          sku: p.sku,
          name: p.name,
          category: p.category || 'GENERAL',
          costCents: p.costCents ?? p.costInCents ?? 0,
          priceCents: p.priceCents ?? p.retailInCents ?? 0,
          stock: p.stock ?? p.stockQuantity ?? 0,
          reorderPoint: p.reorderPoint ?? 2,
          supplier: p.supplier,
        }));
        setParts(normalized);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  const handleCreatePart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    setActionError(null);
    try {
      const res = await fetchWithAuth('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: sku.trim() || undefined,
          name: name.trim(),
          category,
          costCents: Math.round((parseFloat(cost) || 0) * 100),
          priceCents: Math.round((parseFloat(retail) || 0) * 100),
          stock: parseInt(stock, 10) || 0,
          reorderPoint: parseInt(reorderPoint, 10) || 2,
          supplier: supplier.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to create part');

      posAudio.playSuccessChime();
      setIsAddModalOpen(false);
      setName('');
      setSku('');
      setCost('');
      setRetail('');
      setSupplier('');
      fetchInventory();
    } catch (err: any) {
      setActionError(err.message || 'Could not save inventory item');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdjustStock = async (partId: string, delta: number) => {
    try {
      const res = await fetchWithAuth(`/api/inventory/${partId}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Adjustment failed');
      }
      posAudio.playScanBeep();
      fetchInventory();
    } catch (err: any) {
      alert(err.message || 'Adjustment failed');
    }
  };

  const handleDeletePart = async (partId: string, partName: string) => {
    if (!window.confirm(`Delete ${partName} from inventory catalog?`)) return;
    try {
      const res = await fetchWithAuth(`/api/inventory/${partId}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Delete failed');
      }
      fetchInventory();
    } catch (err: any) {
      alert(err.message || 'Could not delete part');
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
            Real-time stock quantities, supplier SKUs, and margin tracking with automated reorder points
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
              <th className="py-2.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-slate-400">
                  Loading inventory catalog...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-slate-400">
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
                const cost = part.costCents / 100;
                const sell = part.priceCents / 100;
                const margin = sell > 0 ? Math.round(((sell - cost) / sell) * 100) : 0;
                const isLow = part.stock <= part.reorderPoint;

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
                          {part.stock === 0 ? 'Out of Stock' : `${part.stock} remaining`}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full text-[11px]">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                          {part.stock} in stock
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-slate-500">
                      {part.supplier || 'Direct'}
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1 justify-end">
                        <button
                          onClick={() => handleAdjustStock(part.id, 1)}
                          className="p-1 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded border border-slate-200"
                          title="Add 1 to stock"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleAdjustStock(part.id, -1)}
                          disabled={part.stock <= 0}
                          className="p-1 text-slate-600 hover:text-amber-700 hover:bg-amber-50 rounded border border-slate-200 disabled:opacity-40"
                          title="Deduct 1 from stock"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleDeletePart(part.id, part.name)}
                          className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                          title="Delete part"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-sm text-slate-900">Add Inventory Part</h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreatePart} className="p-5 space-y-3">
              {actionError && (
                <div className="p-2.5 bg-red-50 text-red-700 text-xs rounded border border-red-200">
                  {actionError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Part Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. iPhone 15 Pro OLED Screen"
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    SKU / Part #
                  </label>
                  <input
                    type="text"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder="PRT-15P-SCR"
                    className="w-full px-3 py-1.5 text-xs font-mono uppercase bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                  >
                    <option value="SCREEN">Screen & Display</option>
                    <option value="BATTERY">Battery Pack</option>
                    <option value="CHARGING">Charging Port</option>
                    <option value="CAMERA">Camera Module</option>
                    <option value="HOUSING">Back Glass & Housing</option>
                    <option value="GENERAL">General Supply</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Wholesale Cost ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                    placeholder="45.00"
                    className="w-full px-3 py-1.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Retail Sell Price ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={retail}
                    onChange={(e) => setRetail(e.target.value)}
                    placeholder="129.99"
                    className="w-full px-3 py-1.5 text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Initial Stock Count
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Low Stock Reorder Alert
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={reorderPoint}
                    onChange={(e) => setReorderPoint(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Supplier / Vendor
                </label>
                <input
                  type="text"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder="e.g. MobileSentrix, Injured Gadgets"
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Save Component'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
