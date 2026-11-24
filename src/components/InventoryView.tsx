import React, { useEffect, useState } from 'react';
import {
  Package,
  AlertTriangle,
  CheckCircle2,
  Search,
  Plus,
  X,
  Trash2,
  ArrowUp,
  ArrowDown,
  ShoppingCart,
  Download,
  Printer,
} from 'lucide-react';
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

  // Purchase Order Generation Modal
  const [isPoModalOpen, setIsPoModalOpen] = useState(false);
  const [poSupplierFilter, setPoSupplierFilter] = useState('ALL');
  const [poQuantities, setPoQuantities] = useState<Record<string, number>>({});

  const handleOpenPoModal = () => {
    const initial: Record<string, number> = {};
    parts.forEach((p) => {
      if (p.stock <= p.reorderPoint) {
        initial[p.id] = Math.max(5, p.reorderPoint * 3 - p.stock);
      }
    });
    setPoQuantities(initial);
    setIsPoModalOpen(true);
  };

  const handleExportCsv = (format: 'mobilesentrix' | 'injuredgadgets' | 'standard') => {
    const selectedIds = Object.keys(poQuantities).filter((id) => (poQuantities[id] || 0) > 0);
    const selectedParts = parts.filter(
      (p) =>
        selectedIds.includes(p.id) &&
        (poSupplierFilter === 'ALL' || (p.supplier || '').toLowerCase().includes(poSupplierFilter.toLowerCase()))
    );

    if (selectedParts.length === 0) {
      alert('No parts selected for Purchase Order.');
      return;
    }

    let csvContent = '';
    let fileName = `Purchase_Order_${new Date().toISOString().slice(0, 10)}.csv`;

    if (format === 'mobilesentrix') {
      csvContent = 'SKU,Quantity,Notes\n';
      selectedParts.forEach((p) => {
        csvContent += `"${p.sku || p.name}",${poQuantities[p.id]},"Faso Fix Restock"\n`;
      });
      fileName = `MobileSentrix_PO_${new Date().toISOString().slice(0, 10)}.csv`;
    } else if (format === 'injuredgadgets') {
      csvContent = 'Part Number,Quantity,Description\n';
      selectedParts.forEach((p) => {
        csvContent += `"${p.sku || ''}",${poQuantities[p.id]},"${p.name}"\n`;
      });
      fileName = `InjuredGadgets_PO_${new Date().toISOString().slice(0, 10)}.csv`;
    } else {
      csvContent = 'SKU,Part Name,Supplier,Current Stock,Order Qty,Wholesale Cost,Total Cost\n';
      selectedParts.forEach((p) => {
        const qty = poQuantities[p.id];
        const cost = (p.costCents / 100).toFixed(2);
        const total = ((p.costCents * qty) / 100).toFixed(2);
        csvContent += `"${p.sku}","${p.name}","${p.supplier || 'N/A'}",${p.stock},${qty},"$${cost}","$${total}"\n`;
      });
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    posAudio.playSuccessChime();
  };

  const handlePrintPo = () => {
    const selectedIds = Object.keys(poQuantities).filter((id) => (poQuantities[id] || 0) > 0);
    const selectedParts = parts.filter(
      (p) =>
        selectedIds.includes(p.id) &&
        (poSupplierFilter === 'ALL' || (p.supplier || '').toLowerCase().includes(poSupplierFilter.toLowerCase()))
    );

    if (selectedParts.length === 0) {
      alert('No parts selected for Purchase Order.');
      return;
    }

    let totalCents = 0;
    const rowsHtml = selectedParts
      .map((p) => {
        const qty = poQuantities[p.id];
        const extCents = p.costCents * qty;
        totalCents += extCents;
        return `<tr>
          <td style="padding:6px;border-bottom:1px solid #ddd;font-family:monospace;font-weight:bold">${p.sku}</td>
          <td style="padding:6px;border-bottom:1px solid #ddd">${p.name}</td>
          <td style="padding:6px;border-bottom:1px solid #ddd">${p.supplier || 'Vendor'}</td>
          <td style="padding:6px;border-bottom:1px solid #ddd;text-align:center">${p.stock}</td>
          <td style="padding:6px;border-bottom:1px solid #ddd;text-align:center;font-weight:bold">${qty}</td>
          <td style="padding:6px;border-bottom:1px solid #ddd;text-align:right">$${(p.costCents / 100).toFixed(2)}</td>
          <td style="padding:6px;border-bottom:1px solid #ddd;text-align:right;font-weight:bold">$${(extCents / 100).toFixed(2)}</td>
        </tr>`;
      })
      .join('');

    const poNumber = `PO-${Date.now().toString().slice(-6)}`;
    const html = `<!doctype html><html><head><title>Purchase Order ${poNumber}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 12px; color: #1e293b; padding: 20px; }
      table { width: 100%; border-collapse: collapse; margin-top: 15px; }
      th { background: #f1f5f9; padding: 8px; text-align: left; font-size: 11px; text-transform: uppercase; border-bottom: 2px solid #cbd5e1; }
      .header { display: flex; justify-content: space-between; border-bottom: 2px solid #4f46e5; padding-bottom: 10px; margin-bottom: 15px; }
      .total-row { font-size: 14px; font-weight: bold; text-align: right; margin-top: 15px; }
    </style></head><body>
      <div class="header">
        <div>
          <h1 style="margin:0;font-size:20px;color:#1e1b4b">FASO FIX ELECTRONICS</h1>
          <div style="font-size:11px;color:#64748b">Inventory Re-order Purchase Order</div>
        </div>
        <div style="text-align:right">
          <h2 style="margin:0;font-size:16px;color:#4f46e5">${poNumber}</h2>
          <div style="font-size:11px;color:#64748b">Date: ${new Date().toLocaleDateString()}</div>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>SKU</th><th>Part Description</th><th>Supplier</th><th style="text-align:center">In Stock</th><th style="text-align:center">Order Qty</th><th style="text-align:right">Wholesale Cost</th><th style="text-align:right">Extended Total</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <div class="total-row">Estimated Total Cost: $${(totalCents / 100).toFixed(2)} CAD</div>
      <div style="margin-top:40px;border-top:1px solid #ccc;padding-top:10px;display:flex;justify-content:space-between;font-size:11px;color:#64748b">
        <span>Authorized Signature: _______________________________</span>
        <span>Account: FASO-REPAIR-VENDOR</span>
      </div>
    </body></html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (win) {
      win.focus();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  };

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
            onClick={handleOpenPoModal}
            title="Generate Purchase Order for Low-Stock Items"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold shadow-xs cursor-pointer transition whitespace-nowrap ${
              parts.some((p) => p.stock <= p.reorderPoint)
                ? 'bg-amber-500 hover:bg-amber-600 text-white'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>
              Restock PO {parts.filter((p) => p.stock <= p.reorderPoint).length > 0 && `(${parts.filter((p) => p.stock <= p.reorderPoint).length})`}
            </span>
          </button>

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
                  placeholder="Part name"
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
                    placeholder="SKU or part number"
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
                  placeholder="Supplier or vendor name"
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

      {/* ========================================================
          PURCHASE ORDER RESTOCK MODAL (MobileSentrix / Injured Gadgets)
         ======================================================== */}
      {isPoModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                  <ShoppingCart className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 leading-tight">
                    Supplier Purchase Order Builder
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Auto-compiled from low stock thresholds. Ready for 1-click supplier catalog import.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsPoModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Supplier Filter */}
            <div className="flex items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 text-xs shrink-0">
              <span className="font-bold text-slate-700">Filter by Supplier:</span>
              <div className="flex gap-1.5 overflow-x-auto">
                {['ALL', 'MobileSentrix', 'Injured Gadgets'].map((supp) => (
                  <button
                    key={supp}
                    type="button"
                    onClick={() => setPoSupplierFilter(supp)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                      poSupplierFilter === supp
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    {supp}
                  </button>
                ))}
              </div>
            </div>

            {/* Reorder Table */}
            <div className="flex-1 overflow-y-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="py-2 px-3">SKU</th>
                    <th className="py-2 px-3">Component</th>
                    <th className="py-2 px-3">Supplier</th>
                    <th className="py-2 px-3 text-center">On Hand</th>
                    <th className="py-2 px-3 text-center w-28">Order Qty</th>
                    <th className="py-2 px-3 text-right">Unit Cost</th>
                    <th className="py-2 px-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parts
                    .filter(
                      (p) =>
                        poSupplierFilter === 'ALL' ||
                        (p.supplier || '').toLowerCase().includes(poSupplierFilter.toLowerCase())
                    )
                    .map((p) => {
                      const qty = poQuantities[p.id] || 0;
                      const isLow = p.stock <= p.reorderPoint;
                      return (
                        <tr
                          key={p.id}
                          className={`hover:bg-slate-50/80 transition ${
                            isLow ? 'bg-amber-50/30' : ''
                          }`}
                        >
                          <td className="py-2 px-3 font-mono font-bold text-indigo-700">
                            {p.sku}
                          </td>
                          <td className="py-2 px-3">
                            <div className="font-semibold text-slate-800">{p.name}</div>
                            {isLow && (
                              <span className="text-[10px] text-amber-700 font-bold">
                                Low Stock Alert
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-slate-500">{p.supplier || 'N/A'}</td>
                          <td className="py-2 px-3 text-center font-mono font-bold">
                            {p.stock}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <input
                              type="number"
                              min="0"
                              value={qty}
                              onChange={(e) => {
                                const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                                setPoQuantities((prev) => ({ ...prev, [p.id]: val }));
                              }}
                              className="w-16 px-2 py-1 text-center font-mono font-bold bg-white border border-slate-300 rounded-md focus:border-indigo-600 focus:outline-none"
                            />
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-slate-600">
                            ${(p.costCents / 100).toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                            ${((p.costCents * qty) / 100).toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            {/* Bottom Actions Bar */}
            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="text-xs">
                <span className="text-slate-500">Estimated PO Spend: </span>
                <span className="font-mono font-black text-sm text-indigo-700">
                  $
                  {(
                    parts.reduce((sum, p) => sum + p.costCents * (poQuantities[p.id] || 0), 0) /
                    100
                  ).toFixed(2)}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleExportCsv('mobilesentrix')}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>MobileSentrix CSV</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExportCsv('injuredgadgets')}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Injured Gadgets CSV</span>
                </button>
                <button
                  type="button"
                  onClick={handlePrintPo}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print PO Slip</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
