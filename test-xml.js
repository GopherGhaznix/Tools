const { json2xml } = require('xml-js');
const parsedData = [ { "id": 1 }, { "id": 2 } ];
const wrapJson = { root: parsedData };
try {
  console.log(json2xml(JSON.stringify(wrapJson), { compact: true, spaces: 2 }));
} catch (e) {
  console.error("Error with array:", e.message);
}

const parsedDataObj = { "id": 1, "test": "hello" };
const wrapJsonObj = { root: parsedDataObj };
try {
  console.log(json2xml(JSON.stringify(wrapJsonObj), { compact: true, spaces: 2 }));
} catch (e) {
  console.error("Error with object:", e.message);
}

