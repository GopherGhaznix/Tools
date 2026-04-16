import { json2xml } from 'xml-js';
const parsedData = [ { "id": 1 }, { "id": 2 }, "string inside array" ];
const wrapJson = { root: parsedData };
try {
  console.log(json2xml(JSON.stringify(wrapJson), { compact: true, spaces: 2 }));
} catch (e) {
  console.error("Error with array:", e.message);
}
