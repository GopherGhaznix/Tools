import React, { useState, useEffect, useMemo, useRef } from 'react';
import _Editor from 'react-simple-code-editor';
import _Prism from 'prismjs';
import 'prismjs/components/prism-json';
import 'prismjs/themes/prism.css';
import Logo from './Logo';

// Fix for incorrect CJS/ESM interop in some Vite setups
const Editor = (_Editor as any).default || _Editor;
const Prism = (_Prism as any).default || _Prism;
import { 
  FileText, 
  Layout as LayoutIcon, 
  ChevronRight, 
  ChevronDown, 
  Search,
  MinusSquare,
  PlusSquare
} from 'lucide-react';

type JsonValue = string | number | boolean | null | { [key: string]: JsonValue } | JsonValue[];

interface TreeState {
  [path: string]: boolean;
}

const JSONExplorer: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'text' | 'viewer'>(() => (localStorage.getItem('json-explorer-tab') as any) || 'text');
  const [input, setInput] = useState(() => localStorage.getItem('json-explorer-input') || '');
  const [parsedData, setParsedData] = useState<JsonValue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string[]>(() => {
    const saved = localStorage.getItem('json-explorer-path');
    try { return saved ? JSON.parse(saved) : ['JSON']; } catch { return ['JSON']; }
  });
  const [expandedNodes, setExpandedNodes] = useState<TreeState>(() => {
    const saved = localStorage.getItem('json-explorer-expanded');
    try { return saved ? JSON.parse(saved) : { 'JSON': true }; } catch { return { 'JSON': true }; }
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);

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
  }, [activeTab, input, selectedPath, expandedNodes, splitPosition]);

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
          <h1 className="app-title" style={{ color: "#111827" }}>Ghaznix Tools</h1>
        </div>
        <div className="header-right">
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
      </div>

      <div className="main-content-area">
        {activeTab === 'text' ? (
          <div className="text-editor-container">
            <div className="editor-toolbar">
              <button onClick={handleFormat} disabled={!parsedData} className="toolbar-btn">Format</button>
              <button onClick={handleMinify} disabled={!parsedData} className="toolbar-btn">Remove white space</button>
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
            <div className="text-editor-scroll-area">
              <Editor
                value={input}
                onValueChange={(code: string) => setInput(code)}
                highlight={(code: string) => Prism.highlight(code, Prism.languages.json, 'json')}
                padding={15}
                className="raw-json-textarea"
                placeholder="Paste your JSON string here..."
                style={{
                  fontFamily: '"Courier New", Courier, monospace',
                  fontSize: 14,
                  minHeight: '100%',
                  outline: 'none',
                  backgroundColor: '#fff'
                }}
              />
            </div>
          </div>
        ) : (
          <div className="viewer-split-pane" ref={containerRef}>
            <div className="tree-pane" style={{ width: `${splitPosition}%` }}>
              <div className="pane-header">
                <button onClick={expandAll} className="icon-btn" title="Expand All"><PlusSquare size={16} /></button>
                <button onClick={collapseAll} className="icon-btn" title="Collapse All"><MinusSquare size={16} /></button>
                <div className="search-box">
                  <Search size={14} />
                  <input 
                    type="text" 
                    placeholder="Search..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
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
                        return (
                          <tr key={key} onClick={() => setSelectedPath(childPath)}>
                             <td className="prop-name">
                                <div className="prop-name-cell">
                                  <TypeIndicator color={getDepthColor(selectedPath.length)} />
                                  <span>{searchQuery ? highlightMatch(key, searchQuery) : key}</span>
                                  {typeof val === 'object' && val !== null && (
                                    <span className="node-object-preview">{Array.isArray(val) ? '[]' : '{}'}</span>
                                  )}
                                </div>
                             </td>
                             <td className="prop-value">
                              {typeof val === 'object' && val !== null ? (Array.isArray(val) ? 'Array' : 'Object') : <ValueViewer value={val} searchQuery={searchQuery} />}
                            </td>
                            <td className="prop-type">{Array.isArray(val) ? 'Array' : typeof val}</td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td className="prop-name">
                          <div className="prop-name-cell">
                            <TypeIndicator color={getDepthColor(selectedPath.length - 1)} />
                            <span>{searchQuery ? highlightMatch(selectedPath[selectedPath.length-1], searchQuery) : selectedPath[selectedPath.length-1]}</span>
                          </div>
                        </td>
                        <td className="prop-value"><ValueViewer value={currentSelectionData} searchQuery={searchQuery} /></td>
                        <td className="prop-type">{Array.isArray(currentSelectionData) ? 'Array' : typeof currentSelectionData}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
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
          background: #ffffff;
          font-family: 'Outfit', sans-serif;
          color: #1f2937;
          overflow: hidden;
        }

        .app-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 24px;
          background: #ffffff;
          border-bottom: 1px solid #f3f4f6;
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
          color: #111827;
          margin: 0;
        }

        .badge {
          font-size: 0.75rem;
          font-weight: 500;
          padding: 2px 8px;
          background: #e0e7ff;
          color: #111827;
          border-radius: 9999px;
        }

        .tool-tabs {
          display: flex;
          background: #f9fafb;
          border-bottom: 1px solid #e5e7eb;
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
          color: #6b7280;
          position: relative;
          transition: all 0.2s;
        }

        .tab-btn:hover { color: #111827; }
        .tab-btn.active { color: #111827; }
        .tab-btn.active::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: #111827;
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
          background: #ffffff;
          border-bottom: 1px solid #f3f4f6;
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .toolbar-btn {
          padding: 6px 14px;
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          font-size: 0.8125rem;
          font-weight: 500;
          color: #374151;
          cursor: pointer;
          transition: all 0.2s;
        }

        .toolbar-btn:hover:not(:disabled) { 
          background: #f9fafb;
          border-color: #d1d5db;
        }

        .toolbar-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .text-editor-scroll-area {
          flex: 1;
          overflow: auto;
          background: #ffffff;
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
          background: #fff1f2;
          color: #e11d48;
          padding: 10px 24px;
          font-size: 0.75rem;
          font-weight: 500;
          border-bottom: 1px solid #ffe4e6;
        }

        .viewer-split-pane {
          display: flex;
          height: 100%;
        }

        .tree-pane {
          display: flex;
          flex-direction: column;
          background: #ffffff;
        }

        .split-resizer {
          width: 4px;
          background: #f3f4f6;
          cursor: col-resize;
          flex-shrink: 0;
          transition: background 0.2s;
        }

        .split-resizer:hover, .split-resizer.dragging {
          background: #111827;
        }

        .grid-pane {
          display: flex;
          flex-direction: column;
          background: #ffffff;
        }

        .pane-header {
          padding: 6px 16px;
          background: #f9fafb;
          border-bottom: 1px solid #e5e7eb;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #6b7280;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .icon-btn {
          background: none;
          border: none;
          color: #9ca3af;
          cursor: pointer;
          padding: 4px;
          display: flex;
          border-radius: 4px;
          transition: all 0.2s;
        }

        .icon-btn:hover {
          color: #111827;
          background: #f3f4f6;
        }

        .search-box {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #ffffff;
          border: 1px solid #e5e7eb;
          padding: 4px 12px;
          border-radius: 8px;
          flex: 1;
        }

        .search-box input {
          border: none;
          outline: none;
          font-size: 0.8125rem;
          width: 100%;
          color: #374151;
        }

        .tree-scroll-area {
          flex: 1;
          overflow: auto;
          padding: 16px;
        }

        .tree-children {
          margin-left: 8px;
          border-left: 1px solid #f3f4f6;
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

        .tree-node:hover { background: #f3f4f6; }
        .tree-node.selected { background: #e0e7ff; color: #111827; }

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
        .node-object-preview { color: #9ca3af; font-size: 0.75rem; margin-left: 4px; }
        .syntax-string { color: #059669; }
        .syntax-number { color: #2563eb; }
        .syntax-boolean { color: #db2777; font-weight: 600; }
        .syntax-null { color: #9ca3af; font-style: italic; }

        .search-highlight {
          background: #fde047;
          color: #000;
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
           background: #ffffff;
           border-bottom: 1px solid #e5e7eb;
           padding: 12px 16px;
           color: #6b7280;
           font-weight: 500;
           font-size: 0.75rem;
        }

        .props-table td {
          padding: 12px 16px;
          border-bottom: 1px solid #f9fafb;
          cursor: pointer;
        }

        .props-table tr:hover td { background: #f9fafb; }
        .prop-name { font-weight: 600; color: #111827; }
        .prop-value { color: #4b5563; }
        .prop-type { color: #9ca3af; font-size: 0.75rem; }

        .status-bar {
          padding: 8px 24px;
          background: #ffffff;
          border-top: 1px solid #f3f4f6;
          font-size: 0.75rem;
          color: #6b7280;
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

        .path-part:hover { background: #f3f4f6; color: #111827; }

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
