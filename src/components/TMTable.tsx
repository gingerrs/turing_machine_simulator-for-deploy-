import React from 'react';
import { Trash2, Plus } from 'lucide-react';

type Rule = {
  currentState: string;
  readSymbol: string;
  newState: string;
  writeSymbol: string;
  direction: 'L' | 'R' | 'N';
};

interface TMTableProps {
  rules: Rule[];
  onChange: (rules: Rule[]) => void;
}

export default function TMTable({ rules, onChange }: TMTableProps) {
  const updateRule = (index: number, field: keyof Rule, value: string) => {
    const newRules = [...rules];
    newRules[index] = { ...newRules[index], [field]: value };
    onChange(newRules);
  };

  const deleteRule = (index: number) => {
    const newRules = rules.filter((_, i) => i !== index);
    onChange(newRules);
  };

  const addRule = () => {
    onChange([...rules, { currentState: 'q0', readSymbol: '0', newState: 'q0', writeSymbol: '0', direction: 'R' }]);
  };

  return (
    <div className="h-full flex flex-col bg-white rounded-b-xl overflow-hidden">
      <div className="flex-1 overflow-auto p-4">
        <table className="w-full text-sm text-left border-collapse">
          <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="p-3 border-b font-semibold text-gray-600">Поточний стан (q_i)</th>
              <th className="p-3 border-b font-semibold text-gray-600">Символ читання</th>
              <th className="p-3 border-b font-semibold text-gray-600">Символ запису</th>
              <th className="p-3 border-b font-semibold text-gray-600">Напрямок</th>
              <th className="p-3 border-b font-semibold text-gray-600">Новий стан (q_j)</th>
              <th className="p-3 border-b font-semibold text-gray-600 w-16 text-center">Дії</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r, i) => (
              <tr key={i} className="border-b hover:bg-gray-50 transition-colors">
                <td className="p-2">
                  <input 
                    className="w-full p-2 border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono text-sm" 
                    value={r.currentState} 
                    onChange={e => updateRule(i, 'currentState', e.target.value)} 
                    placeholder="q0"
                  />
                </td>
                <td className="p-2">
                  <input 
                    className="w-full p-2 border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono text-sm" 
                    value={r.readSymbol} 
                    onChange={e => updateRule(i, 'readSymbol', e.target.value)} 
                    placeholder="1"
                  />
                </td>
                <td className="p-2">
                  <input 
                    className="w-full p-2 border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono text-sm" 
                    value={r.writeSymbol} 
                    onChange={e => updateRule(i, 'writeSymbol', e.target.value)} 
                    placeholder="1"
                  />
                </td>
                <td className="p-2">
                  <select 
                    className="w-full p-2 border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono text-sm bg-white" 
                    value={r.direction} 
                    onChange={e => updateRule(i, 'direction', e.target.value as any)}
                  >
                    <option value="L">L (Вліво)</option>
                    <option value="R">R (Вправо)</option>
                    <option value="N">N (На місці)</option>
                  </select>
                </td>
                <td className="p-2">
                  <input 
                    className="w-full p-2 border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono text-sm" 
                    value={r.newState} 
                    onChange={e => updateRule(i, 'newState', e.target.value)} 
                    placeholder="q1"
                  />
                </td>
                <td className="p-2 text-center">
                  <button 
                    onClick={() => deleteRule(i)} 
                    className="p-2 text-red-500 hover:bg-red-50 rounded transition-colors"
                    title="Видалити правило"
                  >
                    <Trash2 size={18} />
                  </button>
                </td>
              </tr>
            ))}
            {rules.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-gray-500">
                  Немає правил. Додайте перше правило.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="p-4 border-t border-gray-100 bg-gray-50">
        <button 
          onClick={addRule} 
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm shadow-sm"
        >
          <Plus size={16} />
          Додати правило
        </button>
      </div>
    </div>
  );
}