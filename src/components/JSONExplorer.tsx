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
    <div className="json-explorer-v3">
      <header className="app-header">
        <div className="header-left">
          <svg version="1.1" id="Layer_1" className="app-logo" xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" x="0px" y="0px" width="32px" height="32px" viewBox="0 0 570 600" enableBackground="new 0 0 570 600" xmlSpace="preserve">
            <path fill="#6366f1" opacity="1.000000" stroke="none" d="M504,0 C526.3,0 548.6,0 571,0 C571,173.3 571,345.7 570.6,518.2 C568,507.7 565.8,496.9 563.5,486.1 C558.7,463.8 553.8,441.6 549,419.4 C543.3,392.8 537.7,366.2 532,339.6 C527.6,319 523.3,298.3 518.9,277.7 C516.7,267.4 514.2,257.2 511.5,246.6 C505.9,245.8 500.4,245.6 495,244.9 C472.5,241.8 450.3,237.3 429.2,229.3 C410.5,222.3 392.4,213.6 374.2,205.5 C371.5,204.3 369.5,203.8 367,205.9 C363.6,208.5 360,210.8 356.4,213.2 C339.2,224.9 322.1,236.7 304.8,248.4 C302.5,249.9 302,251.1 302.7,253.9 C310.5,284.3 317.9,314.7 325.5,345.1 C327.6,353.5 329.9,361.8 332.3,370.8 C338.1,366.8 343.3,363.3 348.5,359.7 C358.9,352.5 369.3,345.2 379.8,338.4 C380.2,340.6 380.6,342.3 380.9,344.1 C384.9,364.3 388.9,384.5 392.8,404.7 C395,416.4 396.9,428.1 398.6,439.7 C323.3,421.9 248.2,421.7 173,437.4 C175.1,422.3 177.2,407.6 179.5,392.9 C181.2,381.7 183.2,370.5 184.9,359.3 C186.9,346.4 188.6,333.5 190.6,320.6 C192.3,309.5 194.2,298.5 195.9,287.4 C198.2,272.4 200.4,257.4 202.7,242.4 C204.4,231.4 206.2,220.3 207.9,209.2 C210.1,194.5 212.1,179.8 214.4,165.2 C216.2,153.4 218.1,141.7 220.5,130 C286,130 351.1,129.9 416.2,130 C420,130 422.1,128.9 424.2,125.7 C444,94.7 464.1,63.8 484,32.8 C490.8,22.2 497.3,11.6 504,0.9"></path>
            <path fill="#a5b4fc" opacity="1.000000" stroke="none" d="M173,437.8 C248.2,421.7 323.3,421.9 398.9,439.9 C427,447.6 454.3,455.5 479.9,468 C499.4,477.6 518.5,488.1 537.2,499 C548.9,505.8 559.7,514.2 571,522 C571,522.4 571,522.8 570.6,523.6 C568.1,525 566,525.9 564,527 C526.8,547.9 489.6,568.8 452.5,589.8 C446.2,593.3 440.1,597.2 434,601 C433.2,601 432.5,601 431.2,600.7 C412.7,588.5 394.2,577.7 374,569.8 C347,559.3 319,554.1 290.3,553.1 C277.4,552.7 264.5,554.1 251.6,555 C234.4,556.2 217.6,560 201.3,565.4 C179.1,572.8 158.2,583.2 138.8,596.5 C135.8,598.7 133.2,599 129.9,597 C103,580.1 76,563.4 49.1,546.6 C33.1,536.7 17,526.8 1,517 C1,517 1,516.5 1.3,516.1 C16.8,505.8 31.7,495.4 47.3,486.3 C76.9,469.1 108.3,456 141.3,446.7 C151.9,443.8 162.4,440.8 173,437.8"></path>
            <path fill="#4f46e5" opacity="1.000000" stroke="none" d="M173,437.4 C162.4,440.8 151.9,443.8 141.3,446.7 C108.3,456 76.9,469.1 47.3,486.3 C31.7,495.4 16.8,505.8 1.3,515.8 C1,514.2 1,512.5 1.3,510.1 C3,500.7 4.5,491.9 5.9,483.1 C8.8,466 11.6,448.9 14.5,431.9 C17.6,413 20.8,394.1 23.9,375.3 C26.8,358 29.4,340.7 32.2,323.5 C35.4,304.3 38.7,285.1 41.9,265.9 C45.1,247.1 48.2,228.2 51.3,209.3 C54.5,190.1 57.7,170.9 61,151.7 C62.2,144.4 63.7,137.2 65.4,129.9 C65.8,129.7 66,129.6 66.6,129.6 C115,129.6 163,129.7 211,129.7 C214,129.7 217,129.9 220,130 C218.1,141.7 216.2,153.4 214.4,165.2 C212.1,179.8 210.1,194.5 207.9,209.2 C206.2,220.3 204.4,231.4 202.7,242.4 C200.4,257.4 198.2,272.4 195.9,287.4 C194.2,298.5 192.3,309.5 190.6,320.6 C188.6,333.5 186.9,346.4 184.9,359.3 C183.2,370.5 181.2,381.7 179.5,392.9 C177.2,407.6 175.1,422.3 173,437.4"></path>
          </svg>
          <h1 className="app-title">Ghaznix Tools</h1>
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
          gap: 12px;
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
          color: #4338ca;
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

        .tab-btn:hover {
          color: #4f46e5;
        }

        .tab-btn.active {
          color: #4f46e5;
        }

        .tab-btn.active::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: #4f46e5;
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

        /* Viewer Mode */
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
          background: #4f46e5;
        }

        .grid-pane {
          display: flex;
          flex-direction: column;
          background: #ffffff;
        }

        .pane-header {
          padding: 12px 16px;
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
          color: #4f46e5;
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
        .tree-node.selected { background: #e0e7ff; color: #4338ca; }

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

        /* Grid Table */
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

        /* Status Bar */
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
