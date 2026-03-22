import React, { useState, useEffect, useMemo, useRef } from 'react';
import _Editor from 'react-simple-code-editor';
import _Prism from 'prismjs';
import 'prismjs/components/prism-json';
import 'prismjs/themes/prism.css';

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
  const [activeTab, setActiveTab] = useState<'text' | 'viewer'>('text');
  const [input, setInput] = useState('');
  const [parsedData, setParsedData] = useState<JsonValue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string[]>(['JSON']);
  const [expandedNodes, setExpandedNodes] = useState<TreeState>({ 'JSON': true });
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);

  // Drag to resize state
  const [splitPosition, setSplitPosition] = useState(40); // 40% initial split
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
      // Don't clear parsedData immediately so user can still see previous valid version if they want? 
      // No, for "exactly like" we should probably follow the input.
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

  const depthColors = [
    '#3b82f6', // Depth 0 (Blue)
    '#10b981', // Depth 1 (Emerald)
    '#8b5cf6', // Depth 2 (Violet)
    '#f59e0b', // Depth 3 (Amber)
    '#ec4899', // Depth 4 (Pink)
    '#06b6d4', // Depth 5 (Cyan)
    '#ef4444', // Depth 6 (Red)
  ];

  const getDepthColor = (depth: number) => {
    return depthColors[depth % depthColors.length];
  };

  const getSortedEntries = (obj: any) => {
    if (typeof obj !== 'object' || obj === null) return [];
    const entries = Object.entries(obj);
    if (Array.isArray(obj)) return entries; // Never sort array elements

    return entries.sort((a, b) => {
      const aVal = a[1];
      const bVal = b[1];
      const aIsExpandable = typeof aVal === 'object' && aVal !== null && Object.keys(aVal).length > 0;
      const bIsExpandable = typeof bVal === 'object' && bVal !== null && Object.keys(bVal).length > 0;
      
      if (aIsExpandable && !bIsExpandable) return 1; // Pull expandable down
      if (!aIsExpandable && bIsExpandable) return -1; // Push end nodes up
      return 0; // Keep original order for same type
    });
  };

  // Type Indicator Component
  const TypeIndicator: React.FC<{ color: string }> = ({ color }) => {
    return (
      <span className="type-indicator-box" style={{ backgroundColor: color }} />
    );
  };

  const ValueViewer: React.FC<{ value: any }> = ({ value }) => {
    if (typeof value === 'string') {
      return <span className="syntax-string">"{value}"</span>;
    }
    if (typeof value === 'number') {
      return <span className="syntax-number">{value}</span>;
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
    const isExpanded = expandedNodes[fullPath];
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
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
            ) : (
              <span className="toggle-spacer" />
            )}
            
            <TypeIndicator color={nodeColor} />
            
            <span className="node-name">{name}</span>
            {isObject && (
              <span className="node-object-preview">{Array.isArray(data) ? '[]' : '{}'}</span>
            )}
            {!isObject && (
              <span className="node-value-preview">
                <span className="value-separator">: </span>
                <ValueViewer value={data} />
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

  return (
    <div className="json-explorer-v2">
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
              <div className="pane-header">
                Properties
              </div>
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
                                  <span>{key}</span>
                                  {typeof val === 'object' && val !== null && (
                                    <span className="node-object-preview">{Array.isArray(val) ? '[]' : '{}'}</span>
                                  )}
                                </div>
                             </td>
                             <td className="prop-value">
                              {typeof val === 'object' && val !== null ? (Array.isArray(val) ? 'Array' : 'Object') : <ValueViewer value={val} />}
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
                            <span>{selectedPath[selectedPath.length-1]}</span>
                          </div>
                        </td>
                        <td className="prop-value"><ValueViewer value={currentSelectionData} /></td>
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
        .json-explorer-v2 {
          display: flex;
          flex-direction: column;
          height: 100vh;
          width: 100vw;
          background: #fff;
          font-family: Tahoma, Arial, sans-serif;
          color: #333;
          overflow: hidden;
        }

        .tool-tabs {
          display: flex;
          background: #f0f0f0;
          border-bottom: 1px solid #ccc;
          padding: 0 10px;
        }

        .tab-btn {
          padding: 8px 20px;
          border: 1px solid transparent;
          border-bottom: none;
          background: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: #555;
          margin-bottom: -1px;
        }

        .tab-btn.active {
          background: #fff;
          border-color: #ccc;
          color: #000;
          font-weight: bold;
        }

        .main-content-area {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        /* Text Editor */
        .text-editor-container {
          display: flex;
          flex-direction: column;
          height: 100%;
        }

        .editor-toolbar {
          padding: 8px;
          background: #f9f9f9;
          border-bottom: 1px solid #eee;
          display: flex;
          gap: 10px;
          align-items: center;
        }

        .toolbar-btn {
          padding: 4px 12px;
          background: #fff;
          border: 1px solid #ccc;
          border-radius: 3px;
          font-size: 12px;
          cursor: pointer;
        }

        .toolbar-btn:hover { background: #f0f0f0; }

        .text-editor-scroll-area {
          flex: 1;
          overflow: auto;
          background: #fff;
        }

        .raw-json-textarea {
          min-height: 100%;
        }

        /* Override Prism default background to blend smoothly */
        pre[class*="language-"] {
          background: transparent !important;
          margin: 0 !important;
          padding: 0 !important;
          border: none !important;
          box-shadow: none !important;
        }

        code[class*="language-"], pre[class*="language-"] {
          text-shadow: none !important;
          font-family: 'Courier New', Courier, monospace !important;
        }

        .editor-error-strip {
          background: #fee2e2;
          color: #b91c1c;
          padding: 8px 15px;
          font-size: 12px;
          border-bottom: 1px solid #fecaca;
        }

        /* Viewer Mode */
        .viewer-split-pane {
          display: flex;
          height: 100%;
        }

        .tree-pane {
          display: flex;
          flex-direction: column;
          background: #fff;
        }

        .split-resizer {
          width: 5px;
          background: #f0f0f0;
          border-left: 1px solid #ddd;
          border-right: 1px solid #ddd;
          cursor: col-resize;
          flex-shrink: 0;
          transition: background 0.2s;
        }

        .split-resizer:hover, .split-resizer.dragging {
          background: #3b82f6;
        }

        .grid-pane {
          display: flex;
          flex-direction: column;
          background: #fff;
        }

        .pane-header {
          padding: 8px;
          background: #f3f3f3;
          border-bottom: 1px solid #ddd;
          font-size: 12px;
          font-weight: bold;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .search-box {
          display: flex;
          align-items: center;
          gap: 5px;
          background: #fff;
          border: 1px solid #ccc;
          padding: 2px 8px;
          border-radius: 10px;
          flex: 1;
        }

        .search-box input {
          border: none;
          outline: none;
          font-size: 11px;
          width: 100%;
        }

        .tree-scroll-area {
          flex: 1;
          overflow: auto;
          padding: 10px;
        }

        .tree-children {
          margin-left: 6px;
          border-left: 1px dotted #ccc; /* Will be overridden by inline dynamic color */
          padding-left: 14px;
        }

        .tree-node-container {
          font-size: 12px;
          line-height: 20px;
        }

        .tree-node {
          cursor: pointer;
          white-space: nowrap;
          padding: 2px 5px;
          border-radius: 2px;
        }

        .tree-node:hover { background: #f0f7ff; }
        .tree-node.selected { background: #d9ebff; }

        .tree-node-content {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .type-indicator-box {
          width: 15px;
          height: 15px;
          border-radius: 2px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-size: 8px;
          font-weight: 800;
          flex-shrink: 0;
          font-family: monospace;
          line-height: 1;
        }
        
        .prop-name-cell {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .toggle-icon { width: 14px; display: inline-flex; }
        .toggle-spacer { width: 14px; }

        .node-icon { display: inline-flex; align-items: center; }
        .icon-bracket { font-weight: bold; color: #0056b3; font-family: monospace; }
        .icon-brace { font-weight: bold; color: #0056b3; font-family: monospace; }

        .text-blue { color: #0056b3; }
        .text-green { color: #2d8a39; }

        .node-name { color: #111; }
        .node-value-preview { margin-left: 6px; }
        .value-separator { color: #666; margin-right: 4px; }
        .node-object-preview { color: #888; font-weight: bold; margin-left: 6px; font-family: monospace; }

        .syntax-string { color: #059669; } /* Green */
        .syntax-number { color: #2563eb; } /* Blue */
        .syntax-boolean { color: #db2777; font-weight: bold; } /* Pink */
        .syntax-null { color: #888; font-style: italic; font-weight: bold; } /* Gray */

        /* Grid Table */
        .grid-content {
          flex: 1;
          overflow: auto;
        }

        .props-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }

        .props-table th {
          text-align: left;
           background: #f9f9f9;
           border-bottom: 1px solid #ddd;
           padding: 8px;
           color: #666;
        }

        .props-table td {
          padding: 6px 8px;
          border-bottom: 1px solid #eee;
          cursor: pointer;
        }

        .propts-table tr:hover td { background: #f0f7ff; }

        .prop-name { font-weight: bold; color: #333; }
        .prop-value { color: #555; }
        .prop-type { color: #888; font-size: 11px; }

        /* Status Bar */
        .status-bar {
          padding: 5px 15px;
          background: #f0f0f0;
          border-top: 1px solid #ccc;
          font-size: 11px;
          color: #666;
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
          padding: 2px 4px;
          border-radius: 3px;
        }

        .path-part:hover { background: #ddd; color: #000; }

        .breadcrumb-sep { color: #aaa; }

        @media (max-width: 768px) {
           .viewer-split-pane { flex-direction: column; }
           .tree-pane, .grid-pane { width: 100% !important; height: 50%; }
           .split-resizer { display: none; }
           .json-explorer-v2 { height: auto; min-height: 600px; }
        }
      `}</style>
    </div>
  );
};

export default JSONExplorer;
