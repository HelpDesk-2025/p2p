import { useState } from 'react';
import { X, Download, Loader2, FileSpreadsheet } from 'lucide-react';
import { FilterColumn, FilterValues } from './FilterModal';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  columns: FilterColumn[];
  onExport: (filterValues: FilterValues) => void;
  title?: string;
  exporting?: boolean;
}

export default function ExportModal({ isOpen, onClose, columns, onExport, title = 'Export to Excel', exporting = false }: ExportModalProps) {
  const [filterValues, setFilterValues] = useState<FilterValues>({});

  if (!isOpen) return null;

  const handleExport = () => {
    onExport(filterValues);
  };

  const handleClose = () => {
    setFilterValues({});
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 rounded-t-2xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">{title}</h3>
              <p className="text-sm text-slate-500">Filter data before exporting</p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {columns.map((col) => (
            <div key={col.key} className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">{col.label}</label>
              {col.type === 'text' && (
                <input
                  type="text"
                  value={filterValues[col.key] || ''}
                  onChange={(e) => setFilterValues(prev => ({ ...prev, [col.key]: e.target.value }))}
                  placeholder={`Filter by ${col.label.toLowerCase()}...`}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                />
              )}
              {col.type === 'select' && (
                <select
                  value={filterValues[col.key] || ''}
                  onChange={(e) => setFilterValues(prev => ({ ...prev, [col.key]: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none bg-white"
                >
                  <option value="">All</option>
                  {col.options?.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              )}
              {col.type === 'dateRange' && (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={filterValues[col.key + '_from'] || ''}
                    onChange={(e) => setFilterValues(prev => ({ ...prev, [col.key + '_from']: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                  />
                  <input
                    type="date"
                    value={filterValues[col.key + '_to'] || ''}
                    onChange={(e) => setFilterValues(prev => ({ ...prev, [col.key + '_to']: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                  />
                </div>
              )}
              {col.type === 'number' && (
                <input
                  type="number"
                  value={filterValues[col.key] || ''}
                  onChange={(e) => setFilterValues(prev => ({ ...prev, [col.key]: e.target.value }))}
                  placeholder={`Filter by ${col.label.toLowerCase()}...`}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                />
              )}
            </div>
          ))}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 rounded-b-2xl flex items-center justify-between">
          <button
            onClick={() => setFilterValues({})}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Reset Filters
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Export
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
