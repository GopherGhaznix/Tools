import fs from 'fs';

let content = fs.readFileSync('src/components/JSONExplorer.tsx', 'utf8');

const replacements = {
  "import 'prismjs/themes/prism.css';": "import 'prismjs/themes/prism-tomorrow.css';",
  'theme="light"': 'theme="vs-dark"',
  '#ffffff': 'var(--bg-primary)',
  "'#fff'": "'var(--bg-primary)'",
  '"#fff"': '"var(--bg-primary)"',
  '#fafafa': 'var(--bg-secondary)',
  '#f9fafb': 'var(--bg-secondary)',
  '#f3f4f6': 'var(--border-color)',
  '#e5e7eb': 'var(--border-color)',
  '#d1d5db': 'var(--text-secondary)',
  '#9ca3af': 'var(--text-secondary)',
  '#6b7280': 'var(--text-secondary)',
  '#4b5563': 'var(--text-primary)',
  '#374151': 'var(--text-primary)',
  '#1f2937': 'var(--text-primary)',
  '#111827': 'var(--active-text)',
  '#e0e7ff': 'var(--selected-tree)',
  '#fff1f2': 'var(--error-bg)',
  '#ffe4e6': 'var(--error-bg)',
  '#e11d48': 'var(--error-text)',
  '#fde047': 'var(--highlight-bg)',
  '#000': 'var(--highlight-text)',
  '#059669': 'var(--syntax-string)',
  '#2563eb': 'var(--syntax-number)',
  '#db2777': 'var(--syntax-boolean)',
  "'#1e1e1e'": "'var(--bg-secondary)'",
  "'#2d2d2d'": "'var(--bg-tertiary)'"
};

for (const [key, val] of Object.entries(replacements)) {
  content = content.split(key).join(val);
}

fs.writeFileSync('src/components/JSONExplorer.tsx', content);
console.log('done');
