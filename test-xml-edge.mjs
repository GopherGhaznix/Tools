import { json2xml } from 'xml-js';

const testCases = [
  { "123": "val" },
  { "a b": "val" },
  { "!@#": "val" },
  [ "a", "b" ],
  { arr: ["a", "b"] },
  null,
  "hello"
];

for (const data of testCases) {
  try {
    const wrapJson = Array.isArray(data) ? { root: { item: data } } : { root: data };
    const res = json2xml(JSON.stringify(wrapJson), { compact: true, spaces: 2 });
    console.log("Success:", JSON.stringify(data));
  } catch(e) {
    console.log("Failed:", JSON.stringify(data), " Error:", e.message);
  }
}
