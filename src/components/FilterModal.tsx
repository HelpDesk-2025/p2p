import { useState, useEffect } from 'react';
import { X, Filter, RotateCcw } from 'lucide-react';

export interface FilterColumn {
  key: string;
  label: string;
  type: 'text' | 'select' | 'multiSelect' | 'date' | 'number' | 'dateRange';
  options?: { value: string; label: string }[];
}

export interface FilterValues {
  [key: string]: string;
}

interface FilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  columns: FilterColumn[];
  values: FilterValues;
  onApply: (values: FilterValues) => void;
}

export default function FilterModal({ isOpen, onClose, columns, values, onApply }: FilterModalProps) {
  const [localValues, setLocalValues] = useState<FilterValues>({});

  useEffect(() => {
    if (isOpen) {
      setLocalValues({ ...values });
    }
  }, [isOpen, values]);

  if (!isOpen) return null;

  const handleChange = (key: string, value: string) => {
    setLocalValues(prev => ({ ...prev, [key]: value }));
  };

  const handleApply = () => {
    onApply(localValues);
    onClose();
  };

  const handleReset = () => {
    const empty: FilterValues = {};
    columns.forEach(col => {
      empty[col.key] = '';
      if (col.type === 'dateRange') {
        empty[col.key + '_from'] = '';
        empty[col.key + '_to'] = '';
      }
    });
    setLocalValues(empty);
  };

  const activeCount = Object.entries(localValues).filter(([, v]) => v !== '' && v !== undefined).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
              <Filter className="w-4.5 h-4.5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Filters</h3>
              <p className="text-xs text-slate-500">
                {activeCount > 0 ? `${activeCount} active filter${activeCount > 1 ? 's' : ''}` : 'No filters applied'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {columns.map((col) => (
            <div key={col.key}>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{col.label}</label>

              {col.type === 'text' && (
                <input
                  type="text"
                  value={localValues[col.key] || ''}
                  onChange={(e) => handleChange(col.key, e.target.value)}
                  placeholder={`Filter by ${col.label.toLowerCase()}...`}
                  className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                />
              )}

              {col.type === 'number' && (
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={localValues[col.key + '_min'] || ''}
                    onChange={(e) => handleChange(col.key + '_min', e.target.value)}
                    placeholder="Min"
                    className="flex-1 px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  />
                  <span className="flex items-center text-slate-400 text-sm">to</span>
                  <input
                    type="number"
                    value={localValues[col.key + '_max'] || ''}
                    onChange={(e) => handleChange(col.key + '_max', e.target.value)}
                    placeholder="Max"
                    className="flex-1 px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  />
                </div>
              )}

              {col.type === 'select' && (
                <select
                  value={localValues[col.key] || ''}
                  onChange={(e) => handleChange(col.key, e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white transition-all"
                >
                  <option value="">All</option>
                  {col.options?.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              )}

              {col.type === 'multiSelect' && (
                <div className="border border-slate-300 rounded-lg p-2 bg-white space-y-1.5 max-h-48 overflow-y-auto">
                  {col.options?.map((opt) => {
                    const selected = (localValues[col.key] || '').split(',').filter(Boolean);
                    const isChecked = selected.includes(opt.value);
                    return (
                      <label
                        key={opt.value}
                        className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 cursor-pointer text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...selected, opt.value]
                              : selected.filter((v) => v !== opt.value);
                            handleChange(col.key, next.join(','));
                          }}
                          className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                        />
                        <span className="text-slate-700">{opt.label}</span>
                      </label>
                    );
                  })}
                  {(!col.options || col.options.length === 0) && (
                    <div className="text-xs text-slate-400 px-2 py-1">No options available</div>
                  )}
                </div>
              )}

              {col.type === 'date' && (
                <input
                  type="date"
                  value={localValues[col.key] || ''}
                  onChange={(e) => handleChange(col.key, e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                />
              )}

              {col.type === 'dateRange' && (
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={localValues[col.key + '_from'] || ''}
                    onChange={(e) => handleChange(col.key + '_from', e.target.value)}
                    className="flex-1 px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  />
                  <span className="flex items-center text-slate-400 text-sm">to</span>
                  <input
                    type="date"
                    value={localValues[col.key + '_to'] || ''}
                    onChange={(e) => handleChange(col.key + '_to', e.target.value)}
                    className="flex-1 px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between gap-3">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Apply Filters
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function applyFilters<T extends Record<string, any>>(
  items: T[],
  filterValues: FilterValues,
  columns: FilterColumn[],
  getFieldValue: (item: T, key: string) => any
): T[] {
  const hasActiveFilters = Object.entries(filterValues).some(([, v]) => v !== '' && v !== undefined);
  if (!hasActiveFilters) return items;

  return items.filter(item => {
    return columns.every(col => {
      if (col.type === 'text') {
        const filterVal = (filterValues[col.key] || '').toLowerCase();
        if (!filterVal) return true;
        const fieldVal = String(getFieldValue(item, col.key) || '').toLowerCase();
        return fieldVal.includes(filterVal);
      }

      if (col.type === 'select') {
        const filterVal = filterValues[col.key] || '';
        if (!filterVal) return true;
        const fieldVal = String(getFieldValue(item, col.key) || '').toLowerCase();
        return fieldVal === filterVal.toLowerCase();
      }

      if (col.type === 'multiSelect') {
        const raw = filterValues[col.key] || '';
        const selected = raw.split(',').filter(Boolean).map((v) => v.toLowerCase());
        if (selected.length === 0) return true;
        const fieldVal = String(getFieldValue(item, col.key) || '').toLowerCase();
        return selected.includes(fieldVal);
      }

      if (col.type === 'date') {
        const filterVal = filterValues[col.key] || '';
        if (!filterVal) return true;
        const fieldVal = getFieldValue(item, col.key);
        if (!fieldVal) return false;
        return new Date(fieldVal).toISOString().split('T')[0] === filterVal;
      }

      if (col.type === 'dateRange') {
        const from = filterValues[col.key + '_from'] || '';
        const to = filterValues[col.key + '_to'] || '';
        if (!from && !to) return true;
        const fieldVal = getFieldValue(item, col.key);
        if (!fieldVal) return false;
        const dateVal = new Date(fieldVal).toISOString().split('T')[0];
        if (from && dateVal < from) return false;
        if (to && dateVal > to) return false;
        return true;
      }

      if (col.type === 'number') {
        const min = filterValues[col.key + '_min'] || '';
        const max = filterValues[col.key + '_max'] || '';
        if (!min && !max) return true;
        const fieldVal = Number(getFieldValue(item, col.key) || 0);
        if (min && fieldVal < Number(min)) return false;
        if (max && fieldVal > Number(max)) return false;
        return true;
      }

      return true;
    });
  });
}

export function getActiveFilterCount(values: FilterValues): number {
  return Object.entries(values).filter(([, v]) => v !== '' && v !== undefined).length;
}
