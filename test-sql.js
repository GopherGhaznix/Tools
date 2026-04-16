const generateSQL = (data, rootTableName = 'GeneratedTable') => {
    let targetData = Array.isArray(data) ? data : [data];
    if (targetData.length === 0 || typeof targetData[0] !== 'object' || targetData[0] === null) {
      return '-- Root is not an object or array of objects';
    }

    const schemas = new Map();
    const inserts = [];
    
    let pkCounter = {};

    const getNextId = (table) => {
      if (!pkCounter[table]) pkCounter[table] = 1;
      return pkCounter[table]++;
    };

    const processObject = (obj, tableName, parentFkRow) => {
      if (!schemas.has(tableName)) {
        schemas.set(tableName, { cols: new Map([['id', 'INTEGER']]), fks: [] });
      }
      const schema = schemas.get(tableName);
      
      const rowId = getNextId(tableName);
      const rowVals = { id: rowId };
      
      if (parentFkRow) {
         schema.cols.set(parentFkRow.col, 'INTEGER');
         if (!schema.fks.some(fk => fk.col === parentFkRow.col)) {
           schema.fks.push({ col: parentFkRow.col, refTable: parentFkRow.refTable });
         }
         rowVals[parentFkRow.col] = parentFkRow.val;
      }

      for (const [key, val] of Object.entries(obj)) {
        const safeKey = key === 'id' ? 'original_id' : key;

        if (val === null || val === undefined) {
          if (!schema.cols.has(safeKey)) schema.cols.set(safeKey, 'TEXT');
          rowVals[safeKey] = null;
        } else if (typeof val === 'object' && !Array.isArray(val)) {
          const childTable = safeKey;
          const childId = processObject(val, childTable, undefined);
          const fkCol = `${safeKey}_id`;
          schema.cols.set(fkCol, 'INTEGER');
          if (!schema.fks.some(fk => fk.col === fkCol)) {
            schema.fks.push({ col: fkCol, refTable: childTable });
          }
          rowVals[fkCol] = childId;
        } else if (Array.isArray(val)) {
          if (val.length > 0 && typeof val[0] === 'object') {
             const childTable = safeKey;
             val.forEach(item => {
               processObject(item, childTable, { col: `${tableName}_id`, val: rowId, refTable: tableName });
             });
          } else {
             schema.cols.set(safeKey, 'JSONB');
             rowVals[safeKey] = JSON.stringify(val);
          }
        } else {
          let type = 'TEXT';
          if (typeof val === 'number') type = Number.isInteger(val) ? 'INTEGER' : 'FLOAT';
          else if (typeof val === 'boolean') type = 'BOOLEAN';
          
          if (!schema.cols.has(safeKey) || schema.cols.get(safeKey) === 'TEXT') {
            schema.cols.set(safeKey, type);
          }
          rowVals[safeKey] = val;
        }
      }
      
      inserts.push({ table: tableName, vals: rowVals });
      return rowId;
    };

    targetData.forEach(item => processObject(item, rootTableName));

    let createTables = '';
    let alterTables = '';
    
    const usedFkNames = new Set();

    schemas.forEach((schema, tableName) => {
      createTables += `CREATE TABLE "${tableName}" (\n`;
      const colDefs = [];
      schema.cols.forEach((type, col) => {
         if (col === 'id') colDefs.push(`  "${col}" ${type} PRIMARY KEY`);
         else colDefs.push(`  "${col}" ${type}`);
      });
      createTables += colDefs.join(',\n') + '\n);\n\n';
      
      schema.fks.forEach(fk => {
         let fkName = `fk_${tableName}_${fk.col}`;
         let counter = 1;
         while(usedFkNames.has(fkName)) {
           fkName = `fk_${tableName}_${fk.col}_${counter++}`;
         }
         usedFkNames.add(fkName);
         alterTables += `ALTER TABLE "${tableName}" ADD CONSTRAINT "${fkName}" FOREIGN KEY ("${fk.col}") REFERENCES "${fk.refTable}"("id");\n`;
      });
    });

    let insertStatements = '';
    inserts.forEach(ins => {
      const cols = Object.keys(ins.vals);
      const values = cols.map(c => {
         const v = ins.vals[c];
         if (v === null) return 'NULL';
         if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
         if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
         if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
         return v;
      });
      insertStatements += `INSERT INTO "${ins.table}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${values.join(', ')});\n`;
    });

    let result = createTables;
    if (alterTables) result += alterTables + '\n\n';
    result += insertStatements;
    
    return result;
};

const d = {
  "id": 1,
  "name": "Leanne Graham",
  "address": {
    "street": "Kulas Light"
  },
  "posts": [
    { "id": 101, "title": "Hello" }
  ]
};

console.log(generateSQL(d));
