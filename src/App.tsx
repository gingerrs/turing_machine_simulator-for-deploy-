import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipForward, RotateCcw, BookOpen, AlertCircle, Settings, FileText, Table2, Network, Upload } from 'lucide-react';
import { motion } from 'motion/react';
import TMTable from './components/TMTable';
import TMGraph from './components/TMGraph';

type Rule = {
  currentState: string;
  readSymbol: string;
  newState: string;
  writeSymbol: string;
  direction: 'L' | 'R' | 'N';
};

const CELL_WIDTH = 64; // 4rem = 64px

const getConfigurationSignature = (tape: Record<number, string>, head: number, state: string): string => {
  const tapeEntries = Object.entries(tape)
    .map(([index, symbol]) => [Number(index), symbol] as const)
    .sort((a, b) => a[0] - b[0])
    .map(([index, symbol]) => `${index}:${symbol}`)
    .join('|');
  return `${state}#${head}#${tapeEntries}`;
};

const parseProgram = (prog: string): Rule[] => {
  const rules: Rule[] = [];
  const lines = prog.split('\n');
  
  // Format: {readSymbol, currentState} -> {writeSymbol, direction, newState}
  // Use * instead of + to allow empty fields during editing in the table
  const regex = /\{\s*([^,]*)\s*,\s*([^}]*)\s*\}\s*->\s*\{\s*([^,]*)\s*,\s*([^,]*)\s*,\s*([^}]*)\s*\}/;
  
  for (const line of lines) {
    const trimmed = line.split('//')[0].trim();
    if (!trimmed) continue;
    
    const match = trimmed.match(regex);
    if (match) {
      rules.push({
        readSymbol: match[1].trim(),
        currentState: match[2].trim(),
        writeSymbol: match[3].trim(),
        direction: match[4].trim().toUpperCase() as 'L' | 'R' | 'N',
        newState: match[5].trim()
      });
    } else {
      // Fallback to old format just in case
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 5 && !trimmed.includes('->')) {
        rules.push({
          currentState: parts[0],
          readSymbol: parts[1],
          newState: parts[2],
          writeSymbol: parts[3],
          direction: parts[4].toUpperCase() as 'L' | 'R' | 'N'
        });
      }
    }
  }
  return rules;
};

const serializeProgram = (rules: Rule[]): string => {
  return rules.map(r => `{${r.readSymbol}, ${r.currentState}} -> {${r.writeSymbol}, ${r.direction}, ${r.newState}}`).join('\n');
};

export default function App() {
  const [tape, setTape] = useState<Record<number, string>>({});
  const [head, setHead] = useState(0);
  const [state, setState] = useState('q0');
  const [program, setProgram] = useState('');
  const [initialTape, setInitialTape] = useState('');
  const [initialState, setInitialState] = useState('q0');
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState(500);
  const [stepCount, setStepCount] = useState(0);
  const [spaceMemoryCount, setSpaceMemoryCount] = useState(1);
  const [maxOperations, setMaxOperations] = useState(10000);
  const [error, setError] = useState<string | null>(null);
  
  const [view, setView] = useState<'text' | 'table' | 'graph'>('text');

  const machineState = useRef({ tape, head, state, stepCount });
  const visitedCellsRef = useRef<Set<number>>(new Set([0]));
  const seenConfigurationsRef = useRef<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    machineState.current = { tape, head, state, stepCount };
  }, [tape, head, state, stepCount]);

  useEffect(() => {
    reset();
  }, []);

  const reset = () => {
    setIsRunning(false);
    const newTape: Record<number, string> = {};
    for (let i = 0; i < initialTape.length; i++) {
      if (initialTape[i] !== '_') {
        newTape[i] = initialTape[i];
      }
    }
    setTape(newTape);
    setHead(0);
    const startState = initialState || 'q0';
    setState(startState);
    setStepCount(0);
    visitedCellsRef.current = new Set([0]);
    setSpaceMemoryCount(1);
    seenConfigurationsRef.current = new Set([
      getConfigurationSignature(newTape, 0, startState),
    ]);
    setError(null);
  };

  const step = () => {
    const { tape: currentTape, head: currentHead, state: currentState, stepCount: currentStepCount } = machineState.current;

    if (currentStepCount >= maxOperations) {
      setIsRunning(false);
      setError(`Досягнуто ліміт операцій (${maxOperations}). Можливе зациклення програми.`);
      return;
    }
    
    if (currentState.toLowerCase() === 'qf') {
      setIsRunning(false);
      return;
    }

    const currentSymbol = currentTape[currentHead] || '_';
    const parsedRules = parseProgram(program);
    const rule = parsedRules.find(r => r.currentState === currentState && r.readSymbol === currentSymbol);

    if (!rule) {
      setIsRunning(false);
      setError(`Не знайдено правило для стану '${currentState}' та символу '${currentSymbol}'`);
      return;
    }

    const newTape = { ...currentTape };
    if (rule.writeSymbol !== '_') {
      newTape[currentHead] = rule.writeSymbol;
    } else {
      delete newTape[currentHead];
    }
    
    const newHead = rule.direction === 'L' ? currentHead - 1 : rule.direction === 'R' ? currentHead + 1 : currentHead;
    visitedCellsRef.current.add(newHead);
    
    setTape(newTape);
    setHead(newHead);
    setState(rule.newState);
    const nextStepCount = currentStepCount + 1;
    setStepCount(nextStepCount);
    setSpaceMemoryCount(visitedCellsRef.current.size);

    if (rule.newState.toLowerCase() === 'qf') {
      setIsRunning(false);
      return;
    }

    const nextSignature = getConfigurationSignature(newTape, newHead, rule.newState);
    if (seenConfigurationsRef.current.has(nextSignature)) {
      setIsRunning(false);
      setError('Виявлено зациклення: конфігурація машини повторюється.');
      return;
    }
    seenConfigurationsRef.current.add(nextSignature);

    if (nextStepCount >= maxOperations) {
      setIsRunning(false);
      setError(`Досягнуто ліміт операцій (${maxOperations}). Можливе зациклення програми.`);
    }
  };

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      step();
    }, speed);
    return () => clearInterval(interval);
  }, [isRunning, speed, program]);

  const handleRulesChange = (newRules: Rule[]) => {
    setProgram(serializeProgram(newRules));
  };

  const handleProgramFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const parsedRules = parseProgram(content);
      if (parsedRules.length === 0) {
        setError('Файл не містить валідних правил переходу.');
        return;
      }

      setProgram(content.replace(/\r\n/g, '\n'));
      setError(null);
      setView('text');
    } catch {
      setError('Не вдалося прочитати файл правил.');
    } finally {
      event.target.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 font-sans flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold font-mono shadow-md">
            TM
          </div>
          <h1 className="text-xl font-bold text-gray-800 tracking-tight">Симулятор Машини Тюрінга</h1>
        </div>
      </header>

      <main className="flex-1 p-6 flex flex-col gap-6 max-w-6xl mx-auto w-full">
        
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
            <h2 className="font-semibold text-gray-700 flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                {isRunning && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>}
                <span className={`relative inline-flex rounded-full h-3 w-3 ${isRunning ? 'bg-blue-500' : 'bg-gray-400'}`}></span>
              </span>
              Стрічка
            </h2>
            <div className="flex gap-4 text-sm font-mono">
              <div className="bg-white px-3 py-1 rounded border border-gray-200 shadow-sm flex items-center">
                <span className="text-gray-500 mr-2 text-xs">СТАН:</span>
                <span className={`font-bold ${state.toLowerCase() === 'qf' ? 'text-green-600' : 'text-blue-600'}`}>{state}</span>
              </div>
              <div className="bg-white px-3 py-1 rounded border border-gray-200 shadow-sm flex items-center">
                <span className="text-gray-500 mr-2 text-xs">КРОК:</span>
                <span className="font-bold">{stepCount}</span>
              </div>
              <div className="bg-white px-3 py-1 rounded border border-gray-200 shadow-sm flex items-center">
                <span className="text-gray-500 mr-2 text-xs">ПАМʼЯТЬ:</span>
                <span className="font-bold">{spaceMemoryCount}</span>
              </div>
            </div>
          </div>
          
          <div className="relative w-full h-40 bg-gray-100 overflow-hidden flex items-center justify-center shadow-inner">
            <div className="absolute z-20 pointer-events-none flex flex-col items-center justify-center">
              <div className="w-16 h-20 border-4 border-blue-500 rounded-lg shadow-[0_0_15px_rgba(59,130,246,0.4)] bg-blue-500/5"></div>
              <div className="text-blue-600 mt-2 font-black text-[10px] tracking-widest bg-white/90 px-2 py-0.5 rounded shadow-sm border border-blue-100">HEAD</div>
            </div>

            <motion.div 
              className="absolute h-full flex items-center"
              style={{ left: '50%' }}
              animate={{ x: -head * CELL_WIDTH - CELL_WIDTH / 2 }}
              transition={{ duration: speed < 100 ? 0 : speed / 1000, ease: "linear" }}
            >
              {Array.from({ length: 41 }).map((_, idx) => {
                const i = head - 20 + idx;
                const symbol = tape[i] || '_';
                const isHead = i === head;
                return (
                  <div 
                    key={i} 
                    style={{ width: CELL_WIDTH, left: i * CELL_WIDTH }}
                    className={`absolute h-16 flex items-center justify-center border-2 text-2xl font-mono shadow-sm rounded-md transition-colors
                      ${isHead ? 'border-blue-400 bg-white text-blue-900 z-10' : 'border-gray-300 bg-white text-gray-800'}
                      ${symbol === '_' ? 'text-gray-300' : 'font-bold'}
                    `}
                  >
                    {symbol}
                  </div>
                );
              })}
            </motion.div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-md flex items-start gap-3 shadow-sm">
              <AlertCircle className="text-red-500 mt-0.5 shrink-0" size={20} />
              <div>
                <h3 className="text-red-800 font-medium">Помилка виконання</h3>
                <p className="text-red-700 text-sm mt-1">{error}</p>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsRunning(!isRunning)}
                disabled={state.toLowerCase() === 'qf' || error !== null}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium text-white transition-all shadow-sm
                  ${state.toLowerCase() === 'qf' || error !== null 
                    ? 'bg-gray-400 cursor-not-allowed' 
                    : isRunning 
                      ? 'bg-amber-500 hover:bg-amber-600' 
                      : 'bg-green-600 hover:bg-green-700'}`}
              >
                {isRunning ? <Pause size={18} /> : <Play size={18} />}
                {isRunning ? 'Пауза' : 'Старт'}
              </button>
              
              <button
                onClick={step}
                disabled={isRunning || state.toLowerCase() === 'qf' || error !== null}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <SkipForward size={18} />
                Крок
              </button>
              
              <button
                onClick={reset}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200 transition-all"
              >
                <RotateCcw size={18} />
                Скинути
              </button>
            </div>

            <div className="flex items-center gap-4 bg-gray-50 px-4 py-2 rounded-lg border border-gray-200">
              <span className="text-sm font-medium text-gray-600">Швидкість:</span>
              <input 
                type="range" 
                min="50" 
                max="1000" 
                step="50"
                value={1050 - speed}
                onChange={(e) => setSpeed(1050 - parseInt(e.target.value))}
                className="w-32 accent-blue-600"
              />
              <span className="text-xs font-mono text-gray-500 w-12 text-right">{speed}ms</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-[400px]">
          
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <h2 className="font-semibold text-gray-700 flex items-center gap-2">
                <Settings size={18} className="text-gray-500" />
                Налаштування
              </h2>
            </div>
            <div className="p-4 flex flex-col gap-5 flex-1">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Вхідні дані</label>
                <input 
                  type="text" 
                  value={initialTape}
                  onChange={(e) => {
                    setInitialTape(e.target.value);
                    if (!isRunning && stepCount === 0) {
                      const newTape: Record<number, string> = {};
                      for (let i = 0; i < e.target.value.length; i++) {
                        if (e.target.value[i] !== '_') {
                          newTape[i] = e.target.value[i];
                        }
                      }
                      setTape(newTape);
                    }
                  }}
                  className="w-full font-mono bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5"
                  placeholder="Напр. 1011"
                />
                <p className="text-xs text-gray-500 mt-1.5">Використовуйте _ для порожніх клітинок</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Початковий стан</label>
                <input 
                  type="text" 
                  value={initialState}
                  onChange={(e) => {
                    setInitialState(e.target.value);
                    if (!isRunning && stepCount === 0) {
                      setState(e.target.value || 'q0');
                    }
                  }}
                  className="w-full font-mono bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5"
                  placeholder="Напр. q0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Ліміт кроків</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={maxOperations}
                  onChange={(e) => setMaxOperations(Math.max(1, Number.parseInt(e.target.value || '1', 10)))}
                  className="w-full font-mono bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5"
                  placeholder="Напр. 10000"
                />
                <p className="text-xs text-gray-500 mt-1.5">Автозупинка симуляції при перевищенні ліміту.</p>
              </div>

              <div className="mt-auto bg-blue-50/50 p-4 rounded-lg border border-blue-100">
                <h3 className="text-sm font-semibold text-blue-800 flex items-center gap-2 mb-3">
                  <BookOpen size={16} />
                  Як писати правила (Текст)
                </h3>
                <div className="text-xs text-blue-800/80 space-y-3">
                  <p>Кожен рядок — це одне правило переходу.</p>
                  <p className="font-semibold">Формат:</p>
                  <code className="block bg-white p-2 rounded border border-blue-200 font-mono text-[11px] shadow-sm">
                    {'{Символ, Стан} -> {НовийСимвол, Напрямок, НовийСтан}'}
                  </code>
                  <p className="font-semibold mt-2">Приклад:</p>
                  <code className="block bg-white p-2 rounded border border-blue-200 font-mono text-[11px] shadow-sm">
                    {'{1, q0} -> {0, R, q1}'}
                  </code>
                  <ul className="list-disc pl-4 space-y-1.5 mt-2">
                    <li><strong>Символ:</strong> те, що машина читає/пише (напр., <code>0</code>, <code>1</code>).</li>
                    <li><strong>Порожній символ:</strong> використовуйте <code>_</code> (підкреслення).</li>
                    <li><strong>Напрямок:</strong> <code>L</code> (вліво), <code>R</code> (вправо), <code>N</code> (на місці).</li>
                    <li><strong>Зупинка:</strong> перехід у стан <code>qf</code> зупиняє машину.</li>
                    <li><strong>Коментарі:</strong> починаються з <code>//</code>.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
              <h2 className="font-semibold text-gray-700">Правила переходів</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
                >
                  <Upload size={16} />
                  Завантажити файл
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.tm,.rules,text/plain"
                  className="hidden"
                  onChange={handleProgramFileUpload}
                />
                <div className="flex bg-gray-200/50 p-1 rounded-lg">
                  <button 
                    onClick={() => setView('text')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${view === 'text' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                  >
                    <FileText size={16} />
                    Текст
                  </button>
                  <button 
                    onClick={() => setView('table')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${view === 'table' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                  >
                    <Table2 size={16} />
                    Таблиця
                  </button>
                  <button 
                    onClick={() => setView('graph')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${view === 'graph' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                  >
                    <Network size={16} />
                    Граф
                  </button>
                </div>
              </div>
            </div>
            <div className="flex-1 p-0 relative min-h-[400px]">
              {view === 'text' && (
                <textarea
                  value={program}
                  onChange={(e) => setProgram(e.target.value)}
                  className="w-full h-full absolute inset-0 p-5 font-mono text-sm bg-[#1e1e1e] text-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 resize-none rounded-b-xl leading-relaxed"
                  spellCheck="false"
                />
              )}
              {view === 'table' && (
                <div className="absolute inset-0">
                  <TMTable rules={parseProgram(program)} onChange={handleRulesChange} />
                </div>
              )}
              {view === 'graph' && (
                <div className="absolute inset-0">
                  <TMGraph rules={parseProgram(program)} onChange={handleRulesChange} />
                </div>
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}