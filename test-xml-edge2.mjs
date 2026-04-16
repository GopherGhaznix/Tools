import { json2xml } from 'xml-js';

const testCases = [
  [],
  { arr: [] },
  {}
];

for (const data of testCases) {
  try {
    const wrapJson = Array.isArray(data) ? { root: { item: data } } : { root: data };
    const res = json2xml(JSON.stringify(wrapJson), { compact: true, spaces: 2 });
    console.log("Success:", JSON.stringify(data), "\n" + res);
  } catch(e) {
    console.log("Failed:", JSON.stringify(data), " Error:", e.message);
  }
}
