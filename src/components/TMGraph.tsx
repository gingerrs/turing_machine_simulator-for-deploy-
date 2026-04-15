import React, { useState, useEffect, useCallback } from 'react';
import { 
  ReactFlow, 
  Background, 
  Controls, 
  MarkerType, 
  applyNodeChanges, 
  applyEdgeChanges,
  Node,
  Edge,
  Connection,
  NodeChange,
  EdgeChange,
  Panel,
  Position,
  ConnectionMode,
  BaseEdge,
  EdgeProps,
  EdgeLabelRenderer,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import * as dagre from 'dagre';
import { Plus, X } from 'lucide-react';

type Rule = {
  currentState: string;
  readSymbol: string;
  newState: string;
  writeSymbol: string;
  direction: 'L' | 'R' | 'N';
};

interface TMGraphProps {
  rules: Rule[];
  onChange: (rules: Rule[]) => void;
}

type EdgeMeta = {
  edgeId: string;
  ruleIndex: number;
  parallelIndex: number;
  parallelTotal: number;
  loopIndex: number;
  loopTotal: number;
  manualBend: number;
  onBendChange?: (edgeId: string, bend: number) => void;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const getCenteredIndex = (index: number, total: number) => index - (total - 1) / 2;

const getLabelT = (centeredIndex: number) => clamp(0.5 + centeredIndex * 0.1, 0.22, 0.78);

const getQuadraticPoint = (
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  t: number,
) => {
  const mt = 1 - t;
  return {
    x: mt * mt * x0 + 2 * mt * t * cx + t * t * x1,
    y: mt * mt * y0 + 2 * mt * t * cy + t * t * y1,
  };
};

const getQuadraticTangent = (
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  t: number,
) => {
  return {
    x: 2 * (1 - t) * (cx - x0) + 2 * t * (x1 - cx),
    y: 2 * (1 - t) * (cy - y0) + 2 * t * (y1 - cy),
  };
};

const getCubicPoint = (
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number,
) => {
  const mt = 1 - t;
  return {
    x:
      mt * mt * mt * p0.x +
      3 * mt * mt * t * p1.x +
      3 * mt * t * t * p2.x +
      t * t * t * p3.x,
    y:
      mt * mt * mt * p0.y +
      3 * mt * mt * t * p1.y +
      3 * mt * t * t * p2.y +
      t * t * t * p3.y,
  };
};

const getCubicTangent = (
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number,
) => {
  const mt = 1 - t;
  return {
    x:
      3 * mt * mt * (p1.x - p0.x) +
      6 * mt * t * (p2.x - p1.x) +
      3 * t * t * (p3.x - p2.x),
    y:
      3 * mt * mt * (p1.y - p0.y) +
      6 * mt * t * (p2.y - p1.y) +
      3 * t * t * (p3.y - p2.y),
  };
};

const getUnitNormal = (tangentX: number, tangentY: number) => {
  const length = Math.hypot(tangentX, tangentY) || 1;
  return { x: -tangentY / length, y: tangentX / length };
};

const ParallelEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style = {},
  markerEnd,
  label,
  labelStyle,
  labelBgStyle,
  data,
}: EdgeProps) => {
  const meta = (data ?? {}) as Partial<EdgeMeta>;
  const total = meta.parallelTotal ?? 1;
  const centeredIndex = getCenteredIndex(meta.parallelIndex ?? 0, total);
  const manualBend = meta.manualBend ?? 0;
  const offset = centeredIndex * 44 + manualBend;

  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const length = Math.hypot(dx, dy) || 1;
  const normalX = -dy / length;
  const normalY = dx / length;

  const controlX = (sourceX + targetX) / 2 + normalX * offset;
  const controlY = (sourceY + targetY) / 2 + normalY * offset;
  const edgePath = `M ${sourceX} ${sourceY} Q ${controlX} ${controlY} ${targetX} ${targetY}`;
  const labelT = getLabelT(centeredIndex);
  const curvePoint = getQuadraticPoint(sourceX, sourceY, controlX, controlY, targetX, targetY, labelT);
  const tangent = getQuadraticTangent(sourceX, sourceY, controlX, controlY, targetX, targetY, labelT);
  const labelNormal = getUnitNormal(tangent.x, tangent.y);
  const labelOffset = 14 + Math.abs(centeredIndex) * 8;
  const labelX = curvePoint.x + labelNormal.x * labelOffset;
  const labelY = curvePoint.y + labelNormal.y * labelOffset;

  const handlePointerDown: React.PointerEventHandler<HTMLButtonElement> = (event) => {
    if (!meta.onBendChange || !meta.edgeId) return;
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startY = event.clientY;
    const startBend = manualBend;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      const dragOnNormal = deltaX * normalX + deltaY * normalY;
      meta.onBendChange!(meta.edgeId!, clamp(startBend + dragOnNormal, -220, 220));
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} id={id} />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
              ...labelBgStyle,
              padding: '2px 4px',
              borderRadius: '4px',
            }}
            className="nodrag nopan"
          >
            <span style={labelStyle}>{label as string}</span>
          </div>
        </EdgeLabelRenderer>
      )}
      <EdgeLabelRenderer>
        <button
          type="button"
          onPointerDown={handlePointerDown}
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${curvePoint.x}px, ${curvePoint.y}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan w-3 h-3 rounded-full border border-blue-500 bg-white shadow-sm cursor-grab active:cursor-grabbing"
          title="Перетягни, щоб змінити вигин ребра"
          aria-label="Перетягни, щоб змінити вигин ребра"
        />
      </EdgeLabelRenderer>
    </>
  );
};

const SelfLoopEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style = {},
  markerEnd,
  label,
  labelStyle,
  labelBgStyle,
  data,
}: EdgeProps) => {
  const meta = (data ?? {}) as Partial<EdgeMeta>;
  const total = meta.loopTotal ?? 1;
  const centeredIndex = getCenteredIndex(meta.loopIndex ?? 0, total);
  const manualBend = meta.manualBend ?? 0;
  const horizontalSpread = centeredIndex * 34 + manualBend;
  const height = 72 + Math.abs(centeredIndex) * 28;
  const p0 = { x: sourceX, y: sourceY };
  const p1 = { x: sourceX + 44 + horizontalSpread, y: sourceY - height };
  const p2 = { x: targetX - 44 + horizontalSpread, y: targetY - height };
  const p3 = { x: targetX, y: targetY };
  const edgePath = `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${p3.x} ${p3.y}`;

  const labelT = getLabelT(centeredIndex);
  const curvePoint = getCubicPoint(p0, p1, p2, p3, labelT);
  const tangent = getCubicTangent(p0, p1, p2, p3, labelT);
  const labelNormal = getUnitNormal(tangent.x, tangent.y);
  const labelOffset = 16 + Math.abs(centeredIndex) * 10;
  const labelX = curvePoint.x + labelNormal.x * labelOffset;
  const labelY = curvePoint.y + labelNormal.y * labelOffset;

  const handlePointerDown: React.PointerEventHandler<HTMLButtonElement> = (event) => {
    if (!meta.onBendChange || !meta.edgeId) return;
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startBend = manualBend;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      meta.onBendChange!(meta.edgeId!, clamp(startBend + deltaX, -260, 260));
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} id={id} />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
              ...labelBgStyle,
              padding: '2px 4px',
              borderRadius: '4px',
            }}
            className="nodrag nopan"
          >
            <span style={labelStyle}>{label as string}</span>
          </div>
        </EdgeLabelRenderer>
      )}
      <EdgeLabelRenderer>
        <button
          type="button"
          onPointerDown={handlePointerDown}
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${curvePoint.x}px, ${curvePoint.y}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan w-3 h-3 rounded-full border border-blue-500 bg-white shadow-sm cursor-grab active:cursor-grabbing"
          title="Перетягни, щоб змістити петлю"
          aria-label="Перетягни, щоб змістити петлю"
        />
      </EdgeLabelRenderer>
    </>
  );
};

const edgeTypes = {
  parallel: ParallelEdge,
  self: SelfLoopEdge,
};

const isValidConnection = () => true;

const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: 'LR', ranksep: 100, nodesep: 50 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: 80, height: 40 });
  });

  edges.forEach((edge) => {
    if (edge.source !== edge.target) {
      dagreGraph.setEdge(edge.source, edge.target);
    }
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    // Only update position if it hasn't been manually moved (we can check if it's at 0,0 initially)
    // But for simplicity, we'll just layout everything initially.
    return {
      ...node,
      position: node.position.x === 0 && node.position.y === 0 ? {
        x: nodeWithPosition.x - 40,
        y: nodeWithPosition.y - 20,
      } : node.position,
    };
  });

  return { nodes: layoutedNodes, edges };
};

export default function TMGraph({ rules, onChange }: TMGraphProps) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [isLayouted, setIsLayouted] = useState(false);
  const [manualBends, setManualBends] = useState<Record<string, number>>({});

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingConnection, setPendingConnection] = useState<Connection | null>(null);
  const [editingRuleIndex, setEditingRuleIndex] = useState<number | null>(null);
  const [ruleForm, setRuleForm] = useState<{readSymbol: string, writeSymbol: string, direction: 'L'|'R'|'N'}>({
    readSymbol: '1', writeSymbol: '1', direction: 'R'
  });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Sync rules to graph
  useEffect(() => {
    const uniqueStates = Array.from(new Set(rules.flatMap(r => [r.currentState, r.newState])));
    
    const edgesByPair = new Map<string, number>();
    const edgesByPairTotal = new Map<string, number>();
    const loopsByState = new Map<string, number>();
    const loopsByStateTotal = new Map<string, number>();

    rules.forEach((r) => {
      if (r.currentState === r.newState) {
        loopsByStateTotal.set(r.currentState, (loopsByStateTotal.get(r.currentState) ?? 0) + 1);
      } else {
        const pairKey = `${r.currentState}=>${r.newState}`;
        edgesByPairTotal.set(pairKey, (edgesByPairTotal.get(pairKey) ?? 0) + 1);
      }
    });

    const newEdges: Edge[] = rules.map((r, i) => {
      const isSelfLoop = r.currentState === r.newState;
      const edgeId = `e-${i}`;
      const pairKey = `${r.currentState}=>${r.newState}`;
      const parallelIndex = edgesByPair.get(pairKey) ?? 0;
      const loopIndex = loopsByState.get(r.currentState) ?? 0;

      if (isSelfLoop) {
        loopsByState.set(r.currentState, loopIndex + 1);
      } else {
        edgesByPair.set(pairKey, parallelIndex + 1);
      }

      return {
        id: `e-${i}`,
        source: r.currentState,
        target: r.newState,
        type: isSelfLoop ? 'self' : 'parallel',
        label: `${r.readSymbol} → ${r.writeSymbol},${r.direction}`,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { strokeWidth: 2 },
        labelBgStyle: { fill: '#ffffff', fillOpacity: 0.9, rx: 4 },
        labelStyle: { fontWeight: 'bold', fill: '#374151', fontSize: 10 },
        data: {
          edgeId,
          ruleIndex: i,
          parallelIndex,
          parallelTotal: edgesByPairTotal.get(pairKey) ?? 1,
          loopIndex,
          loopTotal: loopsByStateTotal.get(r.currentState) ?? 1,
          manualBend: manualBends[edgeId] ?? 0,
          onBendChange: (changedEdgeId: string, bend: number) => {
            setManualBends((current) => ({ ...current, [changedEdgeId]: bend }));
          },
        } satisfies EdgeMeta,
      };
    });

    setNodes((currentNodes) => {
      const existingNodesMap = new Map(currentNodes.map(n => [n.id, n]));
      const nextNodes = [...currentNodes];
      let nodesChanged = false;

      uniqueStates.forEach(s => {
        if (!existingNodesMap.has(s)) {
          nodesChanged = true;
          nextNodes.push({
            id: s,
            data: { label: s },
            position: { x: 0, y: 0 },
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
            style: { 
              borderRadius: '8px', 
              border: '2px solid #3b82f6', 
              background: '#eff6ff', 
              color: '#1e3a8a', 
              fontWeight: 'bold', 
              width: 80, 
              textAlign: 'center' as const
            }
          });
        }
      });

      if (!isLayouted && nextNodes.length > 0) {
        setTimeout(() => setIsLayouted(true), 0);
        const { nodes: layoutedNodes } = getLayoutedElements(nextNodes, newEdges);
        return layoutedNodes;
      }

      if (nodesChanged) {
        return nextNodes.map(n => {
          if (n.position.x === 0 && n.position.y === 0) {
            return { ...n, position: { x: Math.random() * 200, y: Math.random() * 200 } };
          }
          return n;
        });
      }

      return currentNodes;
    });

    setEdges(newEdges);
  }, [rules, isLayouted, manualBends]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const removedEdges = changes.filter(c => c.type === 'remove');
      if (removedEdges.length > 0) {
        const removedIds = removedEdges.map(e => e.id);
        const newRules = rules.filter((_, i) => !removedIds.includes(`e-${i}`));
        onChange(newRules);
      }
      setEdges((eds) => applyEdgeChanges(changes, eds));
    },
    [rules, onChange]
  );

  const onConnect = useCallback(
    (params: Connection) => {
      setPendingConnection(params);
      setEditingRuleIndex(null);
      setRuleForm({ readSymbol: '1', writeSymbol: '1', direction: 'R' });
      setIsModalOpen(true);
    },
    []
  );

  const createSelfLoopFromSelectedNode = useCallback(() => {
    if (!selectedNodeId) return;
    setPendingConnection({
      source: selectedNodeId,
      target: selectedNodeId,
      sourceHandle: null,
      targetHandle: null,
    });
    setEditingRuleIndex(null);
    setRuleForm({ readSymbol: '1', writeSymbol: '1', direction: 'R' });
    setIsModalOpen(true);
  }, [selectedNodeId]);

  const onEdgeClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      const ruleIndex = edge.data?.ruleIndex as number;
      if (ruleIndex !== undefined) {
        const rule = rules[ruleIndex];
        setPendingConnection({ source: rule.currentState, target: rule.newState, sourceHandle: null, targetHandle: null });
        setEditingRuleIndex(ruleIndex);
        setRuleForm({
          readSymbol: rule.readSymbol,
          writeSymbol: rule.writeSymbol,
          direction: rule.direction
        });
        setIsModalOpen(true);
      }
    },
    [rules]
  );

  const handleSaveRule = () => {
    if (!pendingConnection || !pendingConnection.source || !pendingConnection.target) return;

    const newRule: Rule = {
      currentState: pendingConnection.source,
      readSymbol: ruleForm.readSymbol || '_',
      newState: pendingConnection.target,
      writeSymbol: ruleForm.writeSymbol || '_',
      direction: ruleForm.direction
    };

    if (editingRuleIndex !== null) {
      const newRules = [...rules];
      newRules[editingRuleIndex] = newRule;
      onChange(newRules);
    } else {
      onChange([...rules, newRule]);
    }
    
    setIsModalOpen(false);
    setPendingConnection(null);
    setEditingRuleIndex(null);
  };

  // Modal state for adding node
  const [isAddNodeModalOpen, setIsAddNodeModalOpen] = useState(false);
  const [newNodeName, setNewNodeName] = useState('');
  const [addNodeError, setAddNodeError] = useState('');

  const openAddNodeModal = () => {
    setNewNodeName(`q${nodes.length}`);
    setAddNodeError('');
    setIsAddNodeModalOpen(true);
  };

  const handleAddNodeSubmit = () => {
    const stateName = newNodeName.trim();
    if (!stateName) {
      setAddNodeError('Назва стану не може бути порожньою');
      return;
    }
    
    if (nodes.some(n => n.id === stateName)) {
      setAddNodeError('Стан з такою назвою вже існує!');
      return;
    }

    const newNode: Node = {
      id: stateName,
      data: { label: stateName },
      position: { x: 100, y: 100 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      style: { 
        borderRadius: '8px', 
        border: '2px solid #3b82f6', 
        background: '#eff6ff', 
        color: '#1e3a8a', 
        fontWeight: 'bold', 
        width: 80, 
        textAlign: 'center' as const
      }
    };
    
    setNodes(nds => [...nds, newNode]);
    setIsAddNodeModalOpen(false);
  };

  return (
    <div className="h-full w-full relative bg-gray-50 rounded-b-xl overflow-hidden">
      <ReactFlow 
        nodes={nodes} 
        edges={edges} 
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgeClick={onEdgeClick}
        onNodeClick={(_, node) => setSelectedNodeId(node.id)}
        onPaneClick={() => setSelectedNodeId(null)}
        isValidConnection={isValidConnection}
        connectionMode={ConnectionMode.Loose}
        fitView
        attributionPosition="bottom-right"
      >
        <Background color="#ccc" gap={16} />
        <Controls />
        <Panel position="top-left" className="bg-white/90 backdrop-blur-sm p-2 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center gap-2">
            <button 
              onClick={openAddNodeModal}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-md font-medium text-sm transition-colors border border-blue-200"
            >
              <Plus size={16} />
              Додати стан
            </button>
            <button
              onClick={createSelfLoopFromSelectedNode}
              disabled={!selectedNodeId}
              className="px-3 py-1.5 rounded-md font-medium text-sm transition-colors border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              title={selectedNodeId ? `Створити петлю для ${selectedNodeId}` : 'Оберіть стан, щоб додати петлю'}
            >
              Додати петлю
            </button>
          </div>
        </Panel>
      </ReactFlow>
      
      <div className="absolute bottom-4 left-4 z-10 bg-white/90 backdrop-blur-sm p-3 rounded-lg shadow-sm text-xs border border-gray-200 text-gray-600 max-w-xs">
        <p className="font-semibold text-gray-800 mb-1">Підказки:</p>
        <ul className="list-disc pl-4 space-y-1">
          <li>З'єднайте два вузли, щоб створити правило.</li>
          <li>Кратні ребра між тими самими станами підтримуються.</li>
          <li>Оберіть вузол і натисніть "Додати петлю" для переходу qX -&gt; qX.</li>
          <li>Клікніть на стрілочку, щоб відредагувати перехід.</li>
          <li>Виділіть зв'язок і натисніть <kbd className="bg-gray-100 px-1 rounded border">Backspace</kbd> для видалення.</li>
        </ul>
      </div>

      {isAddNodeModalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-80 overflow-hidden border border-gray-200">
            <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-semibold text-gray-800">Додати новий стан</h3>
              <button onClick={() => setIsAddNodeModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Назва стану</label>
                <input 
                  type="text" 
                  value={newNodeName}
                  onChange={e => setNewNodeName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddNodeSubmit()}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                  placeholder="Напр., q1"
                  autoFocus
                />
                {addNodeError && <p className="text-red-500 text-xs mt-1">{addNodeError}</p>}
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
              <button 
                onClick={() => setIsAddNodeModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 bg-gray-100 rounded-lg transition-colors"
              >
                Скасувати
              </button>
              <button 
                onClick={handleAddNodeSubmit}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
              >
                Додати
              </button>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-80 overflow-hidden border border-gray-200">
            <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-semibold text-gray-800">
                {editingRuleIndex !== null ? 'Редагувати перехід' : 'Новий перехід'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between text-sm font-mono bg-gray-50 p-2 rounded border border-gray-200">
                <span className="text-blue-600 font-bold">{pendingConnection?.source}</span>
                <span className="text-gray-400">→</span>
                <span className="text-blue-600 font-bold">{pendingConnection?.target}</span>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Символ читання</label>
                  <input 
                    type="text" 
                    value={ruleForm.readSymbol}
                    onChange={e => setRuleForm({...ruleForm, readSymbol: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                    placeholder="1 або _"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Символ запису</label>
                  <input 
                    type="text" 
                    value={ruleForm.writeSymbol}
                    onChange={e => setRuleForm({...ruleForm, writeSymbol: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                    placeholder="0 або _"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Напрямок руху</label>
                <div className="flex gap-2">
                  {(['L', 'N', 'R'] as const).map(dir => (
                    <button
                      key={dir}
                      onClick={() => setRuleForm({...ruleForm, direction: dir})}
                      className={`flex-1 py-2 rounded-lg font-mono text-sm font-bold transition-colors border ${
                        ruleForm.direction === dir 
                          ? 'bg-blue-50 border-blue-500 text-blue-700' 
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {dir === 'L' ? '← L' : dir === 'R' ? 'R →' : '↓ N'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 bg-gray-100 rounded-lg transition-colors"
              >
                Скасувати
              </button>
              <button 
                onClick={handleSaveRule}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
              >
                Зберегти
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}