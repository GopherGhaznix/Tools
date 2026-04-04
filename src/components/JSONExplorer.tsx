import React, { useState, useEffect, useMemo, useRef } from 'react';

import Logo from './Logo';
import MonacoEditor from '@monaco-editor/react';
import {
  quicktype,
  InputData,
  jsonInputForTargetLanguage,
} from "quicktype-core";

import { ReactFlow, Controls, Background, MarkerType, Handle, Position } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { 
  FileText, 
  Layout as LayoutIcon, 
  ChevronRight, 
  ChevronDown, 
  Search,
  MinusSquare,
  PlusSquare,
  RefreshCw,
  Code,
  Moon,
  Sun,
  Terminal,
  Network,
  ArrowRight,
  ArrowDown
} from 'lucide-react';

type JsonValue = string | number | boolean | null | { [key: string]: JsonValue } | JsonValue[];

interface TreeState {
  [path: string]: boolean;
}

const getLayoutedElements = (nodes: any[], edges: any[], direction = 'TB') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  
  const nodeWidth = 250;
  
  dagreGraph.setGraph({ rankdir: direction, align: 'UL', marginx: 50, marginy: 50 });
  
  nodes.forEach((node) => {
    const height = 40 + (node.data.fields?.length || 0) * 24;
    dagreGraph.setNode(node.id, { width: nodeWidth, height });
  });
  
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });
  
  dagre.layout(dagreGraph);
  
  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    node.targetPosition = direction === 'LR' ? 'left' : 'top';
    node.sourcePosition = direction === 'LR' ? 'right' : 'bottom';
    
    const height = 40 + (node.data.fields?.length || 0) * 24;
    node.position = {
      x: nodeWithPosition.x - nodeWidth / 2,
      y: nodeWithPosition.y - height / 2,
    };
    return node;
  });
  
  return { nodes, edges };
};

const CustomJsonNode = ({ data, isConnectable, targetPosition, sourcePosition }: any) => {
  return (
    <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', minWidth: '250px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
      {data.label !== 'Root' && <Handle type="target" position={targetPosition || Position.Top} isConnectable={isConnectable} style={{ background: 'var(--text-secondary)' }} />}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)', borderTopLeftRadius: '8px', borderTopRightRadius: '8px', fontWeight: 'bold', fontSize: '14px', color: 'var(--active-text)', display: 'flex', justifyContent: 'space-between' }}>
        <span>{data.label}</span>
        <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{data.isArray ? 'Array' : 'Object'}</span>
      </div>
      <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {data.fields && data.fields.length > 0 ? data.fields.map((f: any, i: number) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span style={{ color: 'var(--syntax-string)', fontWeight: 500 }}>{f.key}</span>
            <span style={{ color: 'var(--text-primary)', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.value}>{f.value}</span>
          </div>
        )) : <span style={{ color: 'var(--text-secondary)', fontSize: '12px', fontStyle: 'italic' }}>Empty</span>}
      </div>
      <Handle type="source" position={sourcePosition || Position.Bottom} isConnectable={isConnectable} style={{ background: 'var(--text-secondary)' }} />
    </div>
  );
};

const nodeTypes = { jsonNode: CustomJsonNode };

const JSONExplorer: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'text' | 'viewer' | 'models' | 'graph'>(() => (localStorage.getItem('json-explorer-tab') as any) || 'text');
  const [input, setInput] = useState(() => localStorage.getItem('json-explorer-input') || '');
  const [parsedData, setParsedData] = useState<JsonValue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [targetLanguage, setTargetLanguage] = useState(() => localStorage.getItem('json-explorer-lang') || 'typescript');
  const [generatedModel, setGeneratedModel] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('json-explorer-theme');
    return saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });
  const [selectedPath, setSelectedPath] = useState<string[]>(() => {
    const saved = localStorage.getItem('json-explorer-path');
    try { return saved ? JSON.parse(saved) : ['JSON']; } catch { return ['JSON']; }
  });
  const [expandedNodes, setExpandedNodes] = useState<TreeState>(() => {
    const saved = localStorage.getItem('json-explorer-expanded');
    try { return saved ? JSON.parse(saved) : { 'JSON': true }; } catch { return { 'JSON': true }; }
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [jsPathQuery, setJsPathQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [copied, setCopied] = useState(false);

  const [nodes, setNodes] = useState<any[]>([]);
  const [edges, setEdges] = useState<any[]>([]);
  const [layoutDirection, setLayoutDirection] = useState<'LR' | 'TB'>('LR');

  useEffect(() => {
    if (activeTab === 'graph' && parsedData) {
      const generatedNodes: any[] = [];
      const generatedEdges: any[] = [];
      let nextId = 1;

      const traverse = (obj: any, parentId: string | null = null, edgeLabel: string = '', path: string[] = ['JSON']) => {
        const id = `node-${nextId++}`;
        const fields: any[] = [];
        
        if (Array.isArray(obj)) {
           obj.forEach((val, index) => {
             const childPath = [...path, String(index)];
             if (typeof val === 'object' && val !== null) {
               traverse(val, id, `[${index}]`, childPath);
             } else {
               fields.push({ key: `[${index}]`, value: String(val), path: childPath });
             }
           });
        } else if (typeof obj === 'object' && obj !== null) {
           Object.entries(obj).forEach(([key, val]) => {
             const childPath = [...path, key];
             if (typeof val === 'object' && val !== null) {
               traverse(val, id, key, childPath);
             } else {
               fields.push({ key, value: String(val), path: childPath });
             }
           });
        }

        generatedNodes.push({
          id,
          position: { x: 0, y: 0 },
          data: { 
            label: parentId ? edgeLabel || 'Object' : 'Root',
            fields, 
            isArray: Array.isArray(obj),
            path
          },
          type: 'jsonNode'
        });

        if (parentId) {
          generatedEdges.push({
            id: `edge-${parentId}-${id}`,
            source: parentId,
            target: id,
            label: edgeLabel,
            type: 'smoothstep',
            markerEnd: { type: MarkerType.ArrowClosed }
          });
        }
      };
      
      traverse(parsedData);
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(generatedNodes, generatedEdges, layoutDirection);
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
    }
  }, [parsedData, activeTab, layoutDirection]);

  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<'value' | 'type' | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  // Generate all valid JS dot-notation paths for intelliSense
  const nodePaths = useMemo(() => {
    if (!parsedData) return [];
    const paths: { pathString: string, pathArray: string[], type: string }[] = [];
    
    const collectPaths = (v: any, arrayPath: string[]) => {
      let jsString = '';
      arrayPath.slice(1).forEach(seg => {
        if (/^\d+$/.test(seg)) {
          jsString += `[${seg}]`;
        } else {
          jsString += (jsString === '' ? seg : `.${seg}`);
        }
      });
      
      let t: string = typeof v;
      if (v === null) t = 'null';
      else if (Array.isArray(v)) t = 'array';
      else if (typeof v === 'object') t = 'object';
      
      paths.push({ pathString: jsString === '' ? 'Root (JSON)' : jsString, pathArray: arrayPath, type: t });
      
      if (Array.isArray(v)) {
        v.forEach((item, index) => collectPaths(item, [...arrayPath, String(index)]));
      } else if (typeof v === 'object' && v !== null) {
        Object.keys(v).forEach(key => collectPaths(v[key], [...arrayPath, key]));
      }
    };
    
    collectPaths(parsedData, ['JSON']);
    return paths;
  }, [parsedData]);

  const filteredPaths = useMemo(() => {
    if (!jsPathQuery.trim()) return nodePaths.slice(0, 50);
    const query = jsPathQuery.toLowerCase();
    return nodePaths.filter(p => p.pathString.toLowerCase().includes(query)).slice(0, 50);
  }, [jsPathQuery, nodePaths]);

  const handleSelectPath = (pathObj: { pathString: string, pathArray: string[] }) => {
    setJsPathQuery(pathObj.pathString === 'Root (JSON)' ? '' : pathObj.pathString);
    setShowSuggestions(false);
    
    const newExpanded = { ...expandedNodes };
    let currentArr: string[] = [];
    pathObj.pathArray.forEach(seg => {
      currentArr.push(seg);
      newExpanded[JSON.stringify(currentArr)] = true;
    });
    setExpandedNodes(newExpanded);
    setSelectedPath(pathObj.pathArray);
  };

  const getSubStringHighlight = (text: string, query: string) => {
    if (!query) return <span>{text}</span>;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return <span>{text}</span>;
    return (
      <>
        {text.substring(0, idx)}
        <span style={{ color: 'var(--highlight-bg)', fontWeight: 'bold' }}>{text.substring(idx, idx + query.length)}</span>
        {text.substring(idx + query.length)}
      </>
    );
  };

  // Drag to resize state
  const [splitPosition, setSplitPosition] = useState(() => {
    const saved = localStorage.getItem('json-explorer-split');
    return saved ? parseFloat(saved) : 60;
  });
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const startDrag = (e: React.MouseEvent) => {
    setIsDragging(true);
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newSplit = ((e.clientX - containerRect.left) / containerRect.width) * 100;
      setSplitPosition(Math.max(15, Math.min(85, newSplit)));
    };

    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Persist state to localStorage
  useEffect(() => {
    localStorage.setItem('json-explorer-tab', activeTab);
    localStorage.setItem('json-explorer-input', input);
    localStorage.setItem('json-explorer-path', JSON.stringify(selectedPath));
    localStorage.setItem('json-explorer-expanded', JSON.stringify(expandedNodes));
    localStorage.setItem('json-explorer-split', splitPosition.toString());
    localStorage.setItem('json-explorer-lang', targetLanguage);
  }, [activeTab, input, selectedPath, expandedNodes, splitPosition, targetLanguage]);

  // Theme logic
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('json-explorer-theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  // Sync parsed data when input changes
  useEffect(() => {
    if (!input.trim()) {
      setParsedData(null);
      setError(null);
      return;
    }
    try {
      const parsed = JSON.parse(input);
      setParsedData(parsed);
      setError(null);
    } catch (e: any) {
      setError(e.message);
      setParsedData(null);
    }
  }, [input]);

  const generateMongooseSchema = (data: any, rootName = 'GeneratedModel') => {
    let str = `const mongoose = require('mongoose');\n\n`;
    
    const buildSchema = (obj: any, indent = '  ') => {
      let out = '{\n';
      Object.keys(obj).forEach(k => {
        const v = obj[k];
        out += `${indent}${k}: `;
        
        let t = 'mongoose.Schema.Types.Mixed';
        if (Array.isArray(v)) {
          if (v.length > 0 && typeof v[0] === 'object' && v[0] !== null) {
            out += '[' + buildSchema(v[0], indent + '  ').trim() + '],\n';
          } else {
            if (v.length > 0) {
              if (typeof v[0] === 'string') t = 'String';
              else if (typeof v[0] === 'number') t = 'Number';
              else if (typeof v[0] === 'boolean') t = 'Boolean';
            }
            out += `[${t}],\n`;
          }
        } else if (v === null) {
          out += `mongoose.Schema.Types.Mixed,\n`;
        } else if (typeof v === 'object') {
          out += buildSchema(v, indent + '  ') + ',\n';
        } else if (typeof v === 'string') {
          if (/^\d{4}-\d{2}-\d{2}T/.test(v)) out += `Date,\n`;
          else out += `String,\n`;
        } else if (typeof v === 'number') {
          out += `Number,\n`;
        } else if (typeof v === 'boolean') {
          out += `Boolean,\n`;
        }
      });
      out += indent.slice(0, -2) + '}';
      return out;
    };

    let targetData = data;
    if (Array.isArray(data)) targetData = data[0] || {};
    
    str += `const ${rootName}Schema = new mongoose.Schema(${buildSchema(targetData)});\n\n`;
    str += `module.exports = mongoose.model('${rootName}', ${rootName}Schema);`;
    return str;
  };

  const generateProtobuf = (data: any, rootName = 'GeneratedModel') => {
    let lines: string[] = [`syntax = "proto3";\n`];
    
    const buildMessage = (obj: any, name: string) => {
      let str = `message ${name} {\n`;
      let fieldIdx = 1;
      Object.keys(obj).forEach(k => {
        const v = obj[k];
        let t = 'string';
        if (Array.isArray(v)) {
           if (v.length > 0 && typeof v[0] === 'object' && v[0] !== null) {
             const subName = k.charAt(0).toUpperCase() + k.slice(1);
             buildMessage(v[0], subName);
             str += `  repeated ${subName} ${k} = ${fieldIdx++};\n`;
             return;
           } else {
             if (v.length > 0) {
               if (typeof v[0] === 'number') t = 'int32';
               else if (typeof v[0] === 'boolean') t = 'bool';
             }
             str += `  repeated ${t} ${k} = ${fieldIdx++};\n`;
             return;
           }
        } else if (typeof v === 'object' && v !== null) {
           const subName = k.charAt(0).toUpperCase() + k.slice(1);
           buildMessage(v, subName);
           str += `  ${subName} ${k} = ${fieldIdx++};\n`;
           return;
        } else if (typeof v === 'number') {
          t = Number.isInteger(v) ? 'int32' : 'float';
        } else if (typeof v === 'boolean') {
          t = 'bool';
        }
        str += `  ${t} ${k} = ${fieldIdx++};\n`;
      });
      str += `}\n`;
      lines.push(str);
    };

    let targetData = data;
    if (Array.isArray(data)) targetData = data[0] || {};
    buildMessage(targetData, rootName);

    return lines.join('\n');
  };

  const generateGraphQL = (data: any, rootName = 'GeneratedModel') => {
    let lines: string[] = [];
    
    const buildType = (obj: any, name: string) => {
      let str = `type ${name} {\n`;
      Object.keys(obj).forEach(k => {
        const v = obj[k];
        let t = 'String';
        if (Array.isArray(v)) {
          if (v.length > 0 && typeof v[0] === 'object' && v[0] !== null) {
            const subName = k.charAt(0).toUpperCase() + k.slice(1);
            buildType(v[0], subName);
            str += `  ${k}: [${subName}]\n`;
            return;
          } else {
            if (v.length > 0) {
               if (typeof v[0] === 'number') t = Number.isInteger(v[0]) ? 'Int' : 'Float';
               else if (typeof v[0] === 'boolean') t = 'Boolean';
            }
            str += `  ${k}: [${t}]\n`;
            return;
          }
        } else if (typeof v === 'object' && v !== null) {
          const subName = k.charAt(0).toUpperCase() + k.slice(1);
          buildType(v, subName);
          str += `  ${k}: ${subName}\n`;
          return;
        } else if (typeof v === 'number') {
          t = Number.isInteger(v) ? 'Int' : 'Float';
        } else if (typeof v === 'boolean') {
          t = 'Boolean';
        }
        str += `  ${k}: ${t}\n`;
      });
      str += `}\n`;
      lines.push(str);
    };

    let targetData = data;
    if (Array.isArray(data)) targetData = data[0] || {};
    buildType(targetData, rootName);

    return lines.join('\n');
  };

  const handleFormat = () => {
    if (!parsedData) return;
    setInput(JSON.stringify(parsedData, null, 2));
  };

  const handleMinify = () => {
    if (!parsedData) return;
    setInput(JSON.stringify(parsedData));
  };

  const handleClear = () => {
    setInput('');
    setParsedData(null);
    setError(null);
    setSelectedPath(['JSON']);
  };

  const generateModel = async () => {
    if (!input.trim() || !parsedData) {
      setGeneratedModel('');
      return;
    }
    setIsGenerating(true);
    setModelError(null);
    try {
      if (targetLanguage === 'mongoose') {
        const schemaCode = generateMongooseSchema(parsedData);
        setGeneratedModel(schemaCode);
        setIsGenerating(false);
        return;
      }
      if (targetLanguage === 'protobuf') {
        setGeneratedModel(generateProtobuf(parsedData));
        setIsGenerating(false);
        return;
      }
      if (targetLanguage === 'graphql') {
        setGeneratedModel(generateGraphQL(parsedData));
        setIsGenerating(false);
        return;
      }

      let langToPass: any = targetLanguage;
      if (targetLanguage === 'python-pydantic') langToPass = 'python';

      const jsonInput = jsonInputForTargetLanguage(langToPass);
      await jsonInput.addSource({
        name: "GeneratedModel",
        samples: [input],
      });

      const inputData = new InputData();
      inputData.addInput(jsonInput);

      const quicktypeOptions: any = {
        inputData,
        lang: langToPass,
        rendererOptions: {
          "just-types": "true"
        }
      };

      const { lines } = await quicktype(quicktypeOptions);
      let output = lines.join("\n");
      
      if (targetLanguage === 'python-pydantic') {
        output = "from pydantic import BaseModel\nfrom typing import Optional, List, Any\n\n" + output.replace(/class (\w+):/g, "class $1(BaseModel):");
      }
      setGeneratedModel(output);
    } catch (err: any) {
      setModelError(err.message || 'Error generating model');
      setGeneratedModel('');
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'models') {
      generateModel();
    }
  }, [parsedData, targetLanguage, activeTab]);

  const handleRandom = () => {
    const samples = [
      {
        "id": 1,
        "name": "Leanne Graham",
        "username": "Bret",
        "email": "Sincere@april.biz",
        "address": {
          "street": "Kulas Light",
          "suite": "Apt. 556",
          "city": "Gwenborough",
          "zipcode": "92998-3874",
          "geo": {
            "lat": "-37.3159",
            "lng": "81.1496"
          }
        },
        "phone": "1-770-736-8031 x56442",
        "website": "hildegard.org",
        "company": {
          "name": "Romaguera-Crona",
          "catchPhrase": "Multi-layered client-server neural-net",
          "bs": "harness real-time e-markets"
        }
      },
      {
        "status": "success",
        "timestamp": new Date().toISOString(),
        "data": {
          "posts": [
            { "id": 101, "title": "Hello World", "tags": ["welcome", "json"], "metadata": { "views": 1500, "shares": 42 } },
            { "id": 102, "title": "Random API", "tags": ["api", "data"], "metadata": { "views": 850, "shares": 12 } }
          ],
          "user": { "name": "Antigravity", "role": "Assistant", "active": true }
        }
      },
      {
        "userId": 1,
        "id": 2,
        "title": "quis ut nam facilis et officia qui",
        "completed": false,
        "tags": ["personal", "work"]
      }
    ];
    const randomSample = samples[Math.floor(Math.random() * samples.length)];
    setInput(JSON.stringify(randomSample, null, 2));
  };

  const toggleNode = (path: string) => {
    setExpandedNodes(prev => ({ ...prev, [path]: !prev[path] }));
  };

  const expandAll = () => {
    const newExpanded: TreeState = { 'JSON': true };
    const traverse = (data: any, path: string) => {
      if (typeof data === 'object' && data !== null) {
        newExpanded[path] = true;
        Object.keys(data).forEach(key => {
          traverse(data[key], `${path}.${key}`);
        });
      }
    };
    if (parsedData) traverse(parsedData, 'JSON');
    setExpandedNodes(newExpanded);
  };

  const collapseAll = () => {
    setExpandedNodes({ 'JSON': true });
  };

  const updateDataAtPath = (path: string[], newValue: any) => {
    if (!parsedData) return;
    const newData = JSON.parse(JSON.stringify(parsedData));
    if (path.length === 1 && path[0] === 'JSON') {
      setInput(JSON.stringify(newValue, null, 2));
      return;
    }
    let current = newData;
    for (let i = 1; i < path.length - 1; i++) {
      current = current[path[i]];
    }
    current[path[path.length - 1]] = newValue;
    setInput(JSON.stringify(newData, null, 2));
  };

  const handleTypeChange = (path: string[], oldVal: any, newType: string) => {
    let newVal = oldVal;
    if (newType === 'string') newVal = String(oldVal);
    else if (newType === 'number') newVal = Number(oldVal) || 0;
    else if (newType === 'boolean') newVal = Boolean(oldVal);
    else if (newType === 'null') newVal = null;
    else if (newType === 'array') newVal = [];
    else if (newType === 'object') newVal = {};
    updateDataAtPath(path, newVal);
  };

  // Helper to get data at path
  const getDataAtPath = (path: string[]) => {
    let current: any = parsedData;
    for (let i = 1; i < path.length; i++) {
      if (current && typeof current === 'object') {
        current = current[path[i]];
      } else {
        return null;
      }
    }
    return current;
  };

  const currentSelectionData = useMemo(() => getDataAtPath(selectedPath), [parsedData, selectedPath]);

  // Auto-expand parents when selectedPath changes (e.g., from table navigation)
  useEffect(() => {
    if (selectedPath.length > 1) {
      setExpandedNodes(prev => {
        const next = { ...prev };
        let currentPath = [];
        for (let i = 0; i < selectedPath.length - 1; i++) {
          currentPath.push(selectedPath[i]);
          next[currentPath.join('.')] = true;
        }
        return next;
       });
    }
  }, [selectedPath]);

  // Search filter helper
  const matchesSearch = (data: any, name: string, query: string): boolean => {
    if (!query) return true;
    const q = query.toLowerCase();
    if (name.toLowerCase().includes(q)) return true;
    if (typeof data !== 'object' && data !== null) {
      return String(data).toLowerCase().includes(q);
    }
    if (typeof data === 'object' && data !== null) {
      return Object.entries(data).some(([key, val]) => matchesSearch(val, key, query));
    }
    return false;
  };

  const depthColors = [
    '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#ef4444',
  ];

  const getDepthColor = (depth: number) => {
    return depthColors[depth % depthColors.length];
  };

  const getSortedEntries = (obj: any) => {
    if (typeof obj !== 'object' || obj === null) return [];
    const entries = Object.entries(obj);
    if (Array.isArray(obj)) return entries;

    return entries.sort((a, b) => {
      const aVal = a[1];
      const bVal = b[1];
      const aIsExpandable = typeof aVal === 'object' && aVal !== null && Object.keys(aVal).length > 0;
      const bIsExpandable = typeof bVal === 'object' && bVal !== null && Object.keys(bVal).length > 0;
      if (aIsExpandable && !bIsExpandable) return 1;
      if (!aIsExpandable && bIsExpandable) return -1;
      return 0;
    });
  };

  // Type Indicator Component
  const TypeIndicator: React.FC<{ color: string }> = ({ color }) => {
    return (
      <span className="type-indicator-box" style={{ backgroundColor: color }} />
    );
  };

  const ValueViewer: React.FC<{ value: any, searchQuery?: string }> = ({ value, searchQuery }) => {
    const wrap = (val: any) => searchQuery ? highlightMatch(String(val), searchQuery) : val;

    if (typeof value === 'string') {
      return <span className="syntax-string">"{wrap(value)}"</span>;
    }
    if (typeof value === 'number') {
      return <span className="syntax-number">{wrap(value)}</span>;
    }
    if (typeof value === 'boolean') {
      return <span className="syntax-boolean">{value ? 'true' : 'false'}</span>;
    }
    if (value === null) {
      return <span className="syntax-null">null</span>;
    }
    return <span>{JSON.stringify(value)}</span>;
  };

  // Tree Component
  const renderTree = (data: any, name: string, path: string[], level: number = 0) => {
    const fullPath = path.join('.');
    if (searchQuery && !matchesSearch(data, name, searchQuery)) {
      return null;
    }

    const isExpanded = searchQuery ? true : !!expandedNodes[fullPath];
    const isSelected = selectedPath.join('.') === fullPath;
    const isObject = typeof data === 'object' && data !== null;
    const hasChildren = isObject && Object.keys(data).length > 0;
    const nodeColor = getDepthColor(level);
    const childrenLineColor = getDepthColor(level + 1);

    return (
      <div key={fullPath} className="tree-node-container" >
        <div 
          className={`tree-node ${isSelected ? 'selected' : ''}`}
          onClick={() => setSelectedPath(path)}
        >
          <div className="tree-node-content">
            {hasChildren ? (
              <span className="toggle-icon" onClick={(e) => { e.stopPropagation(); toggleNode(fullPath); }}>
                {searchQuery ? <ChevronDown size={14} /> : (isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
              </span>
            ) : (
              <span className="toggle-spacer" />
            )}
            <TypeIndicator color={nodeColor} />
            <span className="node-name">
              {searchQuery ? highlightMatch(name, searchQuery) : name}
            </span>
            {isObject && (
              <span className="node-object-preview">{Array.isArray(data) ? '[]' : '{}'}</span>
            )}
            {!isObject && (
              <span className="node-value-preview">
                <span className="value-separator">: </span>
                <ValueViewer value={data} searchQuery={searchQuery} />
              </span>
            )}
          </div>
        </div>
        {isObject && isExpanded && (
          <div className="tree-children" style={{ borderLeftColor: childrenLineColor }}>
            {getSortedEntries(data).map(([key, value]) => renderTree(value, key, [...path, key], level + 1))}
          </div>
        )}
      </div>
    );
  };

  // Helper to highlight matching text
  const highlightMatch = (text: string, query: string) => {
    if (!query) return text;
    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return parts.map((part, i) => 
      part.toLowerCase() === query.toLowerCase() 
        ? <mark key={i} className="search-highlight">{part}</mark> 
        : part
    );
  };

  return (
    <div className="json-explorer-v3">
      <header className="app-header">
        <div className="header-left">
          <Logo className="h-8 w-fit cursor-pointer app-logo" />
          <h1 className="app-title" style={{ color: "var(--active-text)" }}>Ghaznix Tools</h1>
        </div>
        <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)} 
            className="icon-btn" 
            style={{ color: 'var(--text-secondary)' }}
            title="Toggle theme"
          >
            {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <div className="badge">Beta</div>
        </div>
      </header>

      <div className="tool-tabs">
        <button 
          className={`tab-btn ${activeTab === 'text' ? 'active' : ''}`}
          onClick={() => setActiveTab('text')}
        >
          <FileText size={16} /> Text
        </button>
        <button 
          className={`tab-btn ${activeTab === 'viewer' ? 'active' : ''}`}
          onClick={() => setActiveTab('viewer')}
        >
          <LayoutIcon size={16} /> Viewer
        </button>
        <button 
          className={`tab-btn ${activeTab === 'graph' ? 'active' : ''}`}
          onClick={() => setActiveTab('graph')}
        >
          <Network size={16} /> Graph
        </button>
        <button 
          className={`tab-btn ${activeTab === 'models' ? 'active' : ''}`}
          onClick={() => setActiveTab('models')}
        >
          <Code size={16} /> Models
        </button>

      </div>

      <div className="main-content-area">
        {activeTab === 'text' ? (
          <div className="text-editor-container">
            <div className="editor-toolbar">
              <button onClick={handleFormat} disabled={!parsedData} className="toolbar-btn">Format</button>
              <button onClick={handleMinify} disabled={!parsedData} className="toolbar-btn">Remove white space</button>
              <button onClick={handleRandom} className="toolbar-btn flex items-center gap-2">
                <RefreshCw size={14} /> Random
              </button>
              <button onClick={handleClear} className="toolbar-btn">Clear</button>
              <div className="divider" />
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(input);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }} 
                className="toolbar-btn"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            {error && <div className="editor-error-strip">{error}</div>}
            <div className="text-editor-scroll-area" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
                <MonacoEditor
                  height="100%"
                  language="json"
                  theme={isDarkMode ? "vs-dark" : "light"}
                  value={input}
                  onChange={(val) => setInput(val || '')}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    fontFamily: '"Courier New", Courier, monospace',
                    wordWrap: 'on',
                    automaticLayout: true,
                    padding: { top: 15, bottom: 15 },
                    scrollBeyondLastLine: false,
                  }}
                />
              </div>
            </div>
          </div>
        ) : activeTab === 'viewer' ? (
          <div className="viewer-split-pane" ref={containerRef}>
            <div className="tree-pane" style={{ width: `${splitPosition}%` }}>
              <div className="pane-header">
                <button onClick={expandAll} className="icon-btn" title="Expand All"><PlusSquare size={16} /></button>
                <button onClick={collapseAll} className="icon-btn" title="Collapse All"><MinusSquare size={16} /></button>
                <div className="search-box">
                  <Search size={14} />
                  <input 
                    type="text" 
                    style={{background: 'transparent', color: 'var(--text-primary)', width: '100%'}}
                    placeholder="Search values..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="search-box" style={{ position: 'relative' }}>
                  <Terminal size={14} />
                  <input 
                    type="text" 
                    style={{background: 'transparent', color: 'var(--text-primary)', width: '100%'}}
                    placeholder="JS lookup (e.g. users[0].name)" 
                    value={jsPathQuery} 
                    onChange={(e) => { setJsPathQuery(e.target.value); setShowSuggestions(true); setSelectedIndex(0); }}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    onKeyDown={(e) => {
                      if (!showSuggestions || filteredPaths.length === 0) return;
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setSelectedIndex(prev => Math.min(prev + 1, filteredPaths.length - 1));
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setSelectedIndex(prev => Math.max(prev - 1, 0));
                      } else if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSelectPath(filteredPaths[selectedIndex]);
                      } else if (e.key === 'Escape') {
                        setShowSuggestions(false);
                      }
                    }}
                  />
                  {showSuggestions && (
                    <div className="autocomplete-dropdown" style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, 
                      marginTop: '4px', padding: '4px 0', 
                      background: 'var(--bg-primary)', border: '1px solid var(--border-color)', 
                      borderRadius: '6px', maxHeight: '250px', overflowY: 'auto', textTransform: 'none',
                      zIndex: 50, boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)'
                    }}>
                      {filteredPaths.length === 0 ? (
                        <div style={{ padding: '8px 12px', color: 'var(--text-secondary)', fontSize: '12px' }}>No matches</div>
                      ) : (
                        filteredPaths.map((p, i) => {
                          const isSelected = i === selectedIndex;
                          let icon = ''; let color = '';
                          if (p.type === 'array') { icon = '[ ]'; color = 'var(--syntax-number)'; }
                          else if (p.type === 'object') { icon = '{ }'; color = 'var(--syntax-string)'; }
                          else if (p.type === 'string') { icon = '" "'; color = 'var(--syntax-string)'; }
                          else if (p.type === 'number') { icon = '#'; color = 'var(--syntax-number)'; }
                          else if (p.type === 'boolean') { icon = 'b'; color = 'var(--syntax-boolean)'; }
                          else if (p.type === 'null') { icon = 'ø'; color = 'var(--syntax-null)'; }
                          return (
                          <div 
                            key={i} 
                            style={{ 
                              padding: '6px 12px', fontSize: '13px', color: 'var(--text-primary)', 
                              cursor: 'pointer', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: '8px',
                              backgroundColor: isSelected ? 'var(--hover-bg)' : 'transparent'
                            }}
                            onMouseEnter={() => setSelectedIndex(i)}
                            onClick={() => handleSelectPath(p)}
                          >
                            <span style={{ minWidth: '28px', display: 'inline-block', textAlign: 'center', color, fontWeight: 'bold', fontSize: '11px', whiteSpace: 'nowrap' }}>{icon}</span>
                            <span>{getSubStringHighlight(p.pathString, jsPathQuery)}</span>
                          </div>
                        )})
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="tree-scroll-area">
                {parsedData ? renderTree(parsedData, 'JSON', ['JSON']) : <div className="empty-tree">No data to display</div>}
              </div>
            </div>
            
            <div 
              className={`split-resizer ${isDragging ? 'dragging' : ''}`}
              onMouseDown={startDrag}
            />
            
            <div className="grid-pane" style={{ width: `${100 - splitPosition}%` }}>
              <div className="pane-header">Properties</div>
              <div className="grid-content">
                <table className="props-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Value</th>
                      <th>Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {typeof currentSelectionData === 'object' && currentSelectionData !== null ? (
                      getSortedEntries(currentSelectionData).map(([key, val]) => {
                        const childPath = [...selectedPath, key];
                        const childPathStr = childPath.join('.');
                        const isEditingValue = editingPath === childPathStr && editingField === 'value';
                        const isEditingType = editingPath === childPathStr && editingField === 'type';
                        const isObjOrArr = typeof val === 'object' && val !== null;
                        
                        return (
                          <tr key={key} onClick={() => setSelectedPath(childPath)}>
                             <td className="prop-name">
                                <div className="prop-name-cell">
                                  <TypeIndicator color={getDepthColor(selectedPath.length)} />
                                  <span>{searchQuery ? highlightMatch(key, searchQuery) : key}</span>
                                  {isObjOrArr && (
                                    <span className="node-object-preview">{Array.isArray(val) ? '[]' : '{}'}</span>
                                  )}
                                </div>
                             </td>
                             <td className="prop-value" onClick={(e) => {
                               if (!isObjOrArr) { e.stopPropagation(); setEditingPath(childPathStr); setEditingField('value'); setEditValue(String(val)); }
                             }}>
                              {isEditingValue ? (
                                <input 
                                  autoFocus 
                                  type="text" 
                                  value={editValue} 
                                  onChange={(e) => setEditValue(e.target.value)} 
                                  onBlur={() => {
                                    setEditingPath(null); setEditingField(null);
                                    let finalVal: any = editValue;
                                    if (typeof val === 'number') finalVal = Number(editValue) || 0;
                                    if (typeof val === 'boolean') finalVal = editValue === 'true';
                                    updateDataAtPath(childPath, finalVal);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') e.currentTarget.blur();
                                  }}
                                  style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', outline: 'none', padding: '2px 4px', width: '100%', borderRadius: '4px' }}
                                />
                              ) : (isObjOrArr ? (Array.isArray(val) ? 'Array' : 'Object') : <ValueViewer value={val} searchQuery={searchQuery} />)}
                            </td>
                            <td className="prop-type" onClick={(e) => {
                              e.stopPropagation(); setEditingPath(childPathStr); setEditingField('type');
                            }}>
                              {isEditingType ? (
                                <select 
                                  autoFocus
                                  value={Array.isArray(val) ? 'array' : val === null ? 'null' : typeof val}
                                  onChange={(e) => {
                                    setEditingPath(null); setEditingField(null);
                                    handleTypeChange(childPath, val, e.target.value);
                                  }}
                                  onBlur={() => { setEditingPath(null); setEditingField(null); }}
                                  style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', outline: 'none', padding: '2px 4px', borderRadius: '4px' }}
                                >
                                  <option value="string">string</option>
                                  <option value="number">number</option>
                                  <option value="boolean">boolean</option>
                                  <option value="null">null</option>
                                  <option value="object">object</option>
                                  <option value="array">array</option>
                                </select>
                              ) : (Array.isArray(val) ? 'array' : val === null ? 'null' : typeof val)}
                            </td>
                          </tr>
                        );
                      })
                    ) : (() => {
                      const childPathStr = selectedPath.join('.');
                      const isEditingValue = editingPath === childPathStr && editingField === 'value';
                      const isEditingType = editingPath === childPathStr && editingField === 'type';
                      const val = currentSelectionData;
                      const isObjOrArr = typeof val === 'object' && val !== null;

                      return (
                        <tr>
                          <td className="prop-name">
                            <div className="prop-name-cell">
                              <TypeIndicator color={getDepthColor(selectedPath.length - 1)} />
                              <span>{searchQuery ? highlightMatch(selectedPath[selectedPath.length-1], searchQuery) : selectedPath[selectedPath.length-1]}</span>
                            </div>
                          </td>
                          <td className="prop-value" onClick={(e) => {
                             if (!isObjOrArr) { e.stopPropagation(); setEditingPath(childPathStr); setEditingField('value'); setEditValue(String(val)); }
                           }}>
                            {isEditingValue ? (
                              <input 
                                autoFocus 
                                type="text" 
                                value={editValue} 
                                onChange={(e) => setEditValue(e.target.value)} 
                                onBlur={() => {
                                  setEditingPath(null); setEditingField(null);
                                  let finalVal: any = editValue;
                                  if (typeof val === 'number') finalVal = Number(editValue) || 0;
                                  if (typeof val === 'boolean') finalVal = editValue === 'true';
                                  updateDataAtPath(selectedPath, finalVal);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') e.currentTarget.blur();
                                }}
                                style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', outline: 'none', padding: '2px 4px', width: '100%', borderRadius: '4px' }}
                              />
                            ) : <ValueViewer value={val} searchQuery={searchQuery} />}
                          </td>
                          <td className="prop-type" onClick={(e) => {
                            e.stopPropagation(); setEditingPath(childPathStr); setEditingField('type');
                          }}>
                            {isEditingType ? (
                              <select 
                                autoFocus
                                value={val === null ? 'null' : typeof val}
                                onChange={(e) => {
                                  setEditingPath(null); setEditingField(null);
                                  handleTypeChange(selectedPath, val, e.target.value);
                                }}
                                onBlur={() => { setEditingPath(null); setEditingField(null); }}
                                style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', outline: 'none', padding: '2px 4px', borderRadius: '4px' }}
                              >
                                <option value="string">string</option>
                                <option value="number">number</option>
                                <option value="boolean">boolean</option>
                                <option value="null">null</option>
                                <option value="object">object</option>
                                <option value="array">array</option>
                              </select>
                            ) : (val === null ? 'null' : typeof val)}
                          </td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : activeTab === 'models' ? (
          <div className="text-editor-container">
            <div className="editor-toolbar">
              <label className="text-sm font-medium text-gray-600 mr-2">Language:</label>
              <select 
                value={targetLanguage} 
                onChange={(e) => setTargetLanguage(e.target.value)}
                className="toolbar-btn bg-white border border-gray-200 outline-none"
              >
                <option value="typescript">TypeScript</option>
                <option value="python">Python</option>
                <option value="python-pydantic">Python (Pydantic)</option>
                <option value="go">Go</option>
                <option value="java">Java</option>
                <option value="csharp">C#</option>
                <option value="rust">Rust</option>
                <option value="swift">Swift</option>
                <option value="cplusplus">C++</option>
                <option value="ruby">Ruby</option>
                <option value="kotlin">Kotlin</option>
                <option value="dart">Dart</option>
                <option value="protobuf">Protobuf</option>
                <option value="graphql">GraphQL</option>
                <option value="schema">JSON Schema</option>
                <option value="mongoose">MongoDB (Mongoose)</option>
              </select>
              <button 
                onClick={generateModel} 
                disabled={!parsedData || isGenerating} 
                className="toolbar-btn flex items-center gap-3"
              >
                <RefreshCw size={14} className={isGenerating ? 'animate-spin' : ''} /> 
              </button>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(generatedModel);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }} 
                className="toolbar-btn"
                disabled={!generatedModel}
              >
                {copied ? 'Copied!' : 'Copy Code'}
              </button>
            </div>
            {modelError && <div className="editor-error-strip">{modelError}</div>}
            <div className="text-editor-scroll-area" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {!parsedData ? (
                 <div className="empty-tree" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>Please provide valid JSON in the text tab first.</div>
              ) : (
                 <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
                   <MonacoEditor
                    height="100%"
                    language={
                      targetLanguage.startsWith('typescript') ? 'typescript' : 
                      targetLanguage.startsWith('python') ? 'python' : 
                      targetLanguage.startsWith('mongoose') ? 'javascript' :
                      targetLanguage === 'protobuf' ? 'proto' :
                      targetLanguage === 'schema' ? 'json' :
                      targetLanguage === 'cplusplus' ? 'cpp' :
                      targetLanguage === 'graphql' ? 'graphql' :
                      targetLanguage
                    }
                    theme={isDarkMode ? "vs-dark" : "light"}
                    value={generatedModel}
                    onChange={(val) => setGeneratedModel(val || '')}
                    options={{
                      minimap: { enabled: false },
                      fontSize: 14,
                      fontFamily: '"Courier New", Courier, monospace',
                      wordWrap: 'on',
                      automaticLayout: true,
                      padding: { top: 15, bottom: 15 },
                      scrollBeyondLastLine: false,
                    }}
                  />
                 </div>
              )}
            </div>
          </div>
        ) : activeTab === 'graph' ? (
          <div style={{ width: '100%', height: '100%', background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column' }}>
            <div className="editor-toolbar" style={{ borderBottom: '1px solid var(--border-color)', justifyContent: 'space-between' }}>
               <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                 <button 
                   onClick={() => setLayoutDirection(prev => prev === 'LR' ? 'TB' : 'LR')} 
                   className="toolbar-btn flex items-center gap-2"
                   title="Toggle layout direction"
                 >
                   {layoutDirection === 'LR' ? <ArrowDown size={14} /> : <ArrowRight size={14} />}
                   {layoutDirection === 'LR' ? 'Vertical' : 'Horizontal'}
                 </button>
               </div>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              {!parsedData ? (
                 <div className="empty-tree" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>Please provide valid JSON in the text tab first.</div>
              ) : (
                 <ReactFlow 
                   nodes={nodes} 
                   edges={edges} 
                   nodeTypes={nodeTypes}
                   onNodeClick={(_, node) => {
                     if (node.data.path) setSelectedPath(node.data.path);
                   }}
                   fitView
                   attributionPosition="bottom-right"
                 >
                   <Background color="var(--border-color)" gap={16} />
                   <Controls style={{ background: 'var(--bg-secondary)', fill: 'var(--text-primary)', color: 'black' }} />
                 </ReactFlow>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <div className="status-bar">
        <div className="path-breadcrumbs">
          {selectedPath.map((part, i) => (
            <React.Fragment key={i}>
              <span className="path-part" onClick={() => setSelectedPath(selectedPath.slice(0, i + 1))}>
                {part}
              </span>
              {i < selectedPath.length - 1 && <ChevronRight size={12} className="breadcrumb-sep" />}
            </React.Fragment>
          ))}
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap');

        .json-explorer-v3 {
          display: flex;
          flex-direction: column;
          height: 100vh;
          width: 100vw;
          background: var(--bg-primary);
          font-family: 'Outfit', sans-serif;
          color: var(--text-primary);
          overflow: hidden;
        }

        .app-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 24px;
          background: var(--bg-primary);
          border-bottom: 1px solid var(--border-color);
          box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
          z-index: 10;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .app-logo {
          cursor: pointer;
          transition: transform 0.2s ease;
        }

        .app-logo:hover {
          transform: scale(1.05);
        }

        .app-title {
          font-size: 1.25rem;
          font-weight: 700;
          letter-spacing: -0.025em;
          color: var(--active-text);
          margin: 0;
        }

        .badge {
          font-size: 0.75rem;
          font-weight: 500;
          padding: 2px 8px;
          background: var(--selected-tree);
          color: var(--active-text);
          border-radius: 9999px;
        }

        .tool-tabs {
          display: flex;
          background: var(--bg-secondary);
          border-bottom: 1px solid var(--border-color);
          padding: 0 24px;
        }

        .tab-btn {
          padding: 12px 16px;
          border: none;
          background: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--text-secondary);
          position: relative;
          transition: all 0.2s;
        }

        .tab-btn:hover { color: var(--active-text); }
        .tab-btn.active { color: var(--active-text); }
        .tab-btn.active::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: var(--active-text);
        }

        .main-content-area {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .text-editor-container {
          display: flex;
          flex-direction: column;
          height: 100%;
        }

        .editor-toolbar {
          padding: 12px 24px;
          background: var(--bg-primary);
          border-bottom: 1px solid var(--border-color);
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .toolbar-btn {
          padding: 6px 14px;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 6px;
          font-size: 0.8125rem;
          font-weight: 500;
          color: var(--text-primary);
          cursor: pointer;
          transition: all 0.2s;
        }

        .toolbar-btn:hover:not(:disabled) { 
          background: var(--bg-secondary);
          border-color: var(--text-secondary);
        }

        .toolbar-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .text-editor-scroll-area {
          flex: 1;
          overflow: auto;
          background: var(--bg-primary);
        }

        .raw-json-textarea {
          min-height: 100%;
        }

        pre[class*="language-"] {
          background: transparent !important;
          margin: 0 !important;
          padding: 0 !important;
          border: none !important;
        }

        .editor-error-strip {
          background: var(--error-bg);
          color: var(--error-text);
          padding: 10px 24px;
          font-size: 0.75rem;
          font-weight: 500;
          border-bottom: 1px solid var(--error-bg);
        }

        .viewer-split-pane {
          display: flex;
          height: 100%;
        }

        .tree-pane {
          display: flex;
          flex-direction: column;
          background: var(--bg-primary);
        }

        .split-resizer {
          width: 4px;
          background: var(--border-color);
          cursor: col-resize;
          flex-shrink: 0;
          transition: background 0.2s;
        }

        .split-resizer:hover, .split-resizer.dragging {
          background: var(--active-text);
        }

        .grid-pane {
          display: flex;
          flex-direction: column;
          background: var(--bg-primary);
        }

        .pane-header {
          padding: 6px 16px;
          background: var(--bg-secondary);
          border-bottom: 1px solid var(--border-color);
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .icon-btn {
          background: none;
          border: none;
          color: var(--text-secondary);
          cursor: pointer;
          padding: 4px;
          display: flex;
          border-radius: 4px;
          transition: all 0.2s;
        }

        .icon-btn:hover {
          color: var(--active-text);
          background: var(--border-color);
        }

        .search-box {
          display: flex;
          align-items: center;
          gap: 8px;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          padding: 4px 12px;
          border-radius: 8px;
          flex: 1;
        }

        .search-box input {
          border: none;
          outline: none;
          font-size: 0.8125rem;
          width: 100%;
          color: var(--text-primary);
        }

        .tree-scroll-area {
          flex: 1;
          overflow: auto;
          padding: 16px;
        }

        .tree-children {
          margin-left: 8px;
          border-left: 1px solid var(--border-color);
          padding-left: 16px;
        }

        .tree-node-container {
          font-size: 0.875rem;
          margin-bottom: 2px;
        }

        .tree-node {
          cursor: pointer;
          white-space: nowrap;
          padding: 4px 8px;
          border-radius: 6px;
          transition: all 0.1s;
        }

        .tree-node:hover { background: var(--border-color); }
        .tree-node.selected { background: var(--selected-tree); color: var(--active-text); }

        .tree-node-content {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .type-indicator-box {
          width: 8px;
          height: 8px;
          border-radius: 9999px;
          flex-shrink: 0;
        }
        
        .node-name { font-weight: 500; }
        .node-object-preview { color: var(--text-secondary); font-size: 0.75rem; margin-left: 4px; }
        .syntax-string { color: var(--syntax-string); }
        .syntax-number { color: var(--syntax-number); }
        .syntax-boolean { color: var(--syntax-boolean); font-weight: 600; }
        .syntax-null { color: var(--text-secondary); font-style: italic; }

        .search-highlight {
          background: var(--highlight-bg);
          color: var(--highlight-text);
          padding: 0 1px;
          border-radius: 2px;
        }

        .grid-content {
          flex: 1;
          overflow: auto;
        }

        .props-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.875rem;
        }

        .props-table th {
          text-align: left;
           background: var(--bg-primary);
           border-bottom: 1px solid var(--border-color);
           padding: 12px 16px;
           color: var(--text-secondary);
           font-weight: 500;
           font-size: 0.75rem;
        }

        .props-table td {
          padding: 12px 16px;
          border-bottom: 1px solid var(--bg-secondary);
          cursor: pointer;
        }

        .props-table tr:hover td { background: var(--bg-secondary); }
        .prop-name { font-weight: 600; color: var(--active-text); }
        .prop-value { color: var(--text-primary); }
        .prop-type { color: var(--text-secondary); font-size: 0.75rem; }

        .status-bar {
          padding: 8px 24px;
          background: var(--bg-primary);
          border-top: 1px solid var(--border-color);
          font-size: 0.75rem;
          color: var(--text-secondary);
          display: flex;
          align-items: center;
        }

        .path-breadcrumbs {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .path-part {
          cursor: pointer;
          padding: 2px 6px;
          border-radius: 4px;
          transition: all 0.2s;
        }

        .path-part:hover { background: var(--border-color); color: var(--active-text); }

        @media (max-width: 768px) {
           .viewer-split-pane { flex-direction: column; }
           .tree-pane, .grid-pane { width: 100% !important; height: 50%; }
           .split-resizer { display: none; }
        }
      `}</style>
    </div>
  );
};

export default JSONExplorer;
