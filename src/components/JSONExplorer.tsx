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
          <svg version="1.1" id="Layer_1" className="h-8 w-fit cursor-pointer" xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="100%" viewBox="0 0 570 600" enableBackground="new 0 0 570 600" xmlSpace="preserve">
            <path fill="none" opacity="1.000000" stroke="none" d="
          M504.000000,0.999995 
            C526.316650,1.000000 548.633240,1.000000 571.000000,1.000000 
            C571.000000,173.354218 571.000000,345.708466 570.687744,518.294250 
            C568.099854,507.722443 565.868408,496.909546 563.539429,486.117676 
            C558.742065,463.888153 553.849915,441.679047 549.075317,419.444641 
            C543.366882,392.861450 537.733582,366.262115 532.080994,339.666962 
            C527.695435,319.033295 523.391541,298.382080 518.930054,277.764893 
            C516.704834,267.481567 514.208069,257.256989 511.585266,246.684662 
            C505.901428,245.894028 500.436829,245.644104 495.036560,244.916901 
            C472.588989,241.893967 450.395996,237.305817 429.214081,229.362701 
            C410.524811,222.354324 392.463745,213.658279 374.204315,205.529892 
            C371.508362,204.329742 369.535980,203.879684 367.024750,205.908646 
            C363.698364,208.596252 360.005341,210.830841 356.464264,213.251877 
            C339.285675,224.996841 322.143524,236.795990 304.880188,248.415054 
            C302.543243,249.987930 302.051819,251.151428 302.774017,253.987320 
            C310.507050,284.352966 317.986786,314.782990 325.597504,345.179962 
            C327.694305,353.554382 329.995758,361.877625 332.358643,370.811798 
            C338.190674,366.822723 343.369141,363.315826 348.511139,359.756195 
            C358.963531,352.520264 369.396240,345.255829 379.894287,338.415894 
            C380.294556,340.607330 380.633881,342.386780 380.981293,344.164612 
            C384.930450,364.374176 388.955872,384.569183 392.802002,404.798340 
            C395.017090,416.448792 396.942688,428.154297 398.622681,439.738525 
            C323.301941,421.960236 248.216675,421.775208 173.001083,437.413208 
            C175.167572,422.320435 177.271347,407.638916 179.520752,392.979706 
            C181.245285,381.740875 183.233353,370.542511 184.959122,359.303864 
            C186.934906,346.436920 188.689896,333.536072 190.653778,320.667206 
            C192.344559,309.587891 194.253922,298.541992 195.958755,287.464722 
            C198.264603,272.482483 200.432251,257.479034 202.725830,242.494888 
            C204.422409,231.411102 206.293930,220.353928 207.963898,209.266281 
            C210.173767,194.594055 212.195831,179.893448 214.425323,165.224304 
            C216.207611,153.497589 218.179169,141.799667 220.530945,130.059357 
            C286.090607,130.019608 351.186096,129.976669 416.281311,130.083862 
            C420.041260,130.090057 422.159912,128.951920 424.202850,125.755974 
            C444.047302,94.711517 464.118042,63.811825 484.043488,32.818920 
            C490.813568,22.288416 497.354401,11.610525 504.000000,0.999995 
          z"></path>
            <path fill="#aaaaaa" opacity="1.000000" stroke="none" d="
          M173.001022,437.834015 
            C248.216675,421.775208 323.301941,421.960236 398.963074,439.911438 
            C427.066193,447.674896 454.397156,455.520233 479.942657,468.090576 
            C499.420349,477.674988 518.507996,488.133667 537.270935,499.059082 
            C548.992432,505.884369 559.788574,514.298706 571.000000,522.000000 
            C571.000000,522.444458 571.000000,522.888916 570.636597,523.691040 
            C568.182556,525.037781 566.022583,525.903320 564.011658,527.033997 
            C526.837219,547.936768 489.665405,568.844177 452.535156,589.825195 
            C446.256592,593.372864 440.173431,597.266296 434.000000,601.000000 
            C433.250000,601.000000 432.500000,601.000000 431.203857,600.704895 
            C412.708435,588.506897 394.233215,577.715149 374.018707,569.869080 
            C347.041199,559.398132 319.078705,554.187317 290.364960,553.186646 
            C277.496307,552.738098 264.542694,554.104553 251.653717,555.016113 
            C234.435638,556.233704 217.652039,560.079956 201.348221,565.491577 
            C179.110504,572.872681 158.227478,583.263367 138.890930,596.579956 
            C135.803772,598.705933 133.279282,599.097229 129.953934,597.013000 
            C103.056694,580.154846 76.088127,563.410217 49.113613,546.675598 
            C33.101631,536.742004 17.039555,526.889160 1.000000,517.000000 
            C1.000000,517.000000 1.000000,516.500000 1.308950,516.106384 
            C16.832180,505.887573 31.706970,495.480530 47.333721,486.362213 
            C76.906754,469.106232 108.370926,456.071289 141.354813,446.778656 
            C151.906067,443.806030 162.452423,440.816040 173.001022,437.834015 
          z"></path>
            <path className="fill-[#444444] dark:fill-gray-100" opacity="1.000000" stroke="none" d="
          M173.001083,437.413208 
            C162.452423,440.816040 151.906067,443.806030 141.354813,446.778656 
            C108.370926,456.071289 76.906754,469.106232 47.333721,486.362213 
            C31.706970,495.480530 16.832180,505.887573 1.308950,515.856384 
            C1.000000,514.285645 1.000000,512.571289 1.315902,510.182861 
            C3.086838,500.720642 4.536326,491.931610 5.998080,483.144592 
            C8.838243,466.071564 11.681273,448.999023 14.530596,431.927521 
            C17.680014,413.058014 20.884396,394.197540 23.978243,375.318939 
            C26.804512,358.073090 29.450266,340.797607 32.293930,323.554688 
            C35.460732,304.352386 38.784023,285.175903 41.997066,265.981171 
            C45.156429,247.107071 48.254208,228.222702 51.395142,209.345535 
            C54.588806,190.151489 57.756386,170.952927 61.030277,151.772537 
            C62.272850,144.492813 63.780018,137.258240 65.425240,129.915558 
            C65.852791,129.760086 66.021690,129.692154 66.646919,129.638840 
            C115.097916,129.681610 163.092575,129.703583 211.087234,129.752731 
            C214.080521,129.755798 217.073563,129.971939 220.066711,130.088959 
            C218.179169,141.799667 216.207611,153.497589 214.425323,165.224304 
            C212.195831,179.893448 210.173767,194.594055 207.963898,209.266281 
            C206.293930,220.353928 204.422409,231.411102 202.725830,242.494888 
            C200.432251,257.479034 198.264603,272.482483 195.958755,287.464722 
            C194.253922,298.541992 192.344559,309.587891 190.653778,320.667206 
            C188.689896,333.536072 186.934906,346.436920 184.959122,359.303864 
            C183.233353,370.542511 181.245285,381.740875 179.520752,392.979706 
            C177.271347,407.638916 175.167572,422.320435 173.001083,437.413208 
          z"></path>
            <path fill="#aaaaaa" opacity="1.000000" stroke="none" d="
          M220.530960,130.059357 
            C217.073563,129.971939 214.080521,129.755798 211.087234,129.752731 
            C163.092575,129.703583 115.097916,129.681610 66.598808,129.447098 
            C66.094368,129.240738 65.980858,128.859436 66.026062,128.521423 
            C74.785393,118.217766 83.464981,108.221619 92.223633,98.295242 
            C100.557877,88.849861 109.022858,79.519730 117.343445,70.062462 
            C128.720093,57.131638 139.991776,44.108524 151.351532,31.162756 
            C160.200272,21.078594 169.114746,11.052114 178.000000,0.999998 
            C286.354218,1.000000 394.708466,1.000000 503.531342,0.999995 
            C497.354401,11.610525 490.813568,22.288416 484.043488,32.818920 
            C464.118042,63.811825 444.047302,94.711517 424.202850,125.755974 
            C422.159912,128.951920 420.041260,130.090057 416.281311,130.083862 
            C351.186096,129.976669 286.090607,130.019608 220.530960,130.059357 
          z"></path>
            <path className="fill-[#444444] dark:fill-gray-100" opacity="1.000000" stroke="none" d="
          M571.000000,521.625000 
            C559.788574,514.298706 548.992432,505.884369 537.270935,499.059082 
            C518.507996,488.133667 499.420349,477.674988 479.942657,468.090576 
            C454.397156,455.520233 427.066193,447.674896 399.338989,440.007935 
            C396.942688,428.154297 395.017090,416.448792 392.802002,404.798340 
            C388.955872,384.569183 384.930450,364.374176 380.981293,344.164612 
            C380.633881,342.386780 380.294556,340.607330 379.886047,338.106384 
            C381.203827,335.348694 382.173676,332.742889 384.047729,331.384735 
            C389.695099,327.292084 395.723633,323.729340 401.551392,319.881012 
            C438.320129,295.601196 475.074768,271.299988 511.834076,247.005859 
            C514.208069,257.256989 516.704834,267.481567 518.930054,277.764893 
            C523.391541,298.382080 527.695435,319.033295 532.080994,339.666962 
            C537.733582,366.262115 543.366882,392.861450 549.075317,419.444641 
            C553.849915,441.679047 558.742065,463.888153 563.539429,486.117676 
            C565.868408,496.909546 568.099854,507.722443 570.687744,518.762939 
            C571.000000,519.750000 571.000000,520.500000 571.000000,521.625000 
          z"></path>
            <path fill="none" opacity="1.000000" stroke="none" d="
          M177.531342,0.999998 
            C169.114746,11.052114 160.200272,21.078594 151.351532,31.162756 
            C139.991776,44.108524 128.720093,57.131638 117.343445,70.062462 
            C109.022858,79.519730 100.557877,88.849861 92.223633,98.295242 
            C83.464981,108.221619 74.785393,118.217766 65.810852,128.651398 
            C65.422493,129.413956 65.294540,129.708527 65.166580,130.003098 
            C63.780018,137.258240 62.272850,144.492813 61.030277,151.772537 
            C57.756386,170.952927 54.588806,190.151489 51.395142,209.345535 
            C48.254208,228.222702 45.156429,247.107071 41.997066,265.981171 
            C38.784023,285.175903 35.460732,304.352386 32.293930,323.554688 
            C29.450266,340.797607 26.804512,358.073090 23.978243,375.318939 
            C20.884396,394.197540 17.680014,413.058014 14.530596,431.927521 
            C11.681273,448.999023 8.838243,466.071564 5.998080,483.144592 
            C4.536326,491.931610 3.086838,500.720642 1.315902,509.754395 
            C1.000000,340.441559 1.000000,170.883118 1.000000,1.000000 
            C59.687160,1.000000 118.374924,1.000000 177.531342,0.999998 
          z"></path>
            <path fill="none" opacity="1.000000" stroke="none" d="
          M1.000000,517.468628 
            C17.039555,526.889160 33.101631,536.742004 49.113613,546.675598 
            C76.088127,563.410217 103.056694,580.154846 129.953934,597.013000 
            C133.279282,599.097229 135.803772,598.705933 138.890930,596.579956 
            C158.227478,583.263367 179.110504,572.872681 201.348221,565.491577 
            C217.652039,560.079956 234.435638,556.233704 251.653717,555.016113 
            C264.542694,554.104553 277.496307,552.738098 290.364960,553.186646 
            C319.078705,554.187317 347.041199,559.398132 374.018707,569.869080 
            C394.233215,577.715149 412.708435,588.506897 430.828857,600.704895 
            C287.788727,601.000000 144.577438,601.000000 1.000000,601.000000 
            C1.000000,573.313538 1.000000,545.625427 1.000000,517.468628 
          z"></path>
            <path fill="none" opacity="1.000000" stroke="none" d="
          M434.468658,601.000000 
            C440.173431,597.266296 446.256592,593.372864 452.535156,589.825195 
            C489.665405,568.844177 526.837219,547.936768 564.011658,527.033997 
            C566.022583,525.903320 568.182556,525.037781 570.636597,524.024414 
            C571.000000,549.614075 571.000000,575.228210 571.000000,601.000000 
            C525.645874,601.000000 480.291595,601.000000 434.468658,601.000000 
          z"></path>
            <path fill="#aaaaaa" opacity="1.000000" stroke="none" d="
          M511.585266,246.684662 
            C475.074768,271.299988 438.320129,295.601196 401.551392,319.881012 
            C395.723633,323.729340 389.695099,327.292084 384.047729,331.384735 
            C382.173676,332.742889 381.203827,335.348694 379.828827,337.693634 
            C369.396240,345.255829 358.963531,352.520264 348.511139,359.756195 
            C343.369141,363.315826 338.190674,366.822723 332.358643,370.811798 
            C329.995758,361.877625 327.694305,353.554382 325.597504,345.179962 
            C317.986786,314.782990 310.507050,284.352966 302.774017,253.987320 
            C302.051819,251.151428 302.543243,249.987930 304.880188,248.415054 
            C322.143524,236.795990 339.285675,224.996841 356.464264,213.251877 
            C360.005341,210.830841 363.698364,208.596252 367.024750,205.908646 
            C369.535980,203.879684 371.508362,204.329742 374.204315,205.529892 
            C392.463745,213.658279 410.524811,222.354324 429.214081,229.362701 
            C450.395996,237.305817 472.588989,241.893967 495.036560,244.916901 
            C500.436829,245.644104 505.901428,245.894028 511.585266,246.684662 
          z"></path>
            <path fill="#31B7C3" opacity="1.000000" stroke="none" d="
          M65.425247,129.915558 
            C65.294540,129.708527 65.422493,129.413956 65.765656,128.989410 
            C65.980858,128.859436 66.094368,129.240738 66.142479,129.432480 
            C66.021690,129.692154 65.852791,129.760086 65.425247,129.915558 
          z"></path>
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
