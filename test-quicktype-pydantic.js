import { quicktype, InputData, jsonInputForTargetLanguage } from "quicktype-core";

async function run() {
  try {
    const inputData = new InputData();
    const jsonInput = jsonInputForTargetLanguage("python");
    await jsonInput.addSource({ name: "User", samples: ['{"name":"Antigravity", "age":3}'] });
    inputData.addInput(jsonInput);
    
    const { lines } = await quicktype({
      inputData,
      lang: "python",
      rendererOptions: {
        framework: "pydantic"
      }
    });
    console.log(lines.join("\n"));
  } catch (e) {
    console.log("Error:", e);
  }
}
run();
