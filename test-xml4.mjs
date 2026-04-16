import { json2xml } from 'xml-js';
const wrapJson = { root: { name: "John", age: 30 } };
console.log(json2xml(JSON.stringify(wrapJson), { compact: true, spaces: 2 }));
