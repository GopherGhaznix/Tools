import { json2xml } from 'xml-js';
const obj = { "name": "foo", "items": [ { id: 1 }, { id: 2 } ] };
const wrapJson = { root: obj };
console.log(json2xml(JSON.stringify(wrapJson), { compact: true, spaces: 2 }));
