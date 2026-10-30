import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Module, { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const loadModule = createRequire(import.meta.url);
const compiler = process.argv[2] ?? "glslangValidator";
const output = fs.mkdtempSync(path.join(os.tmpdir(), "ocean-shaders-"));
const programs = {
  evolve: ["fullscreenVertexShader", "evolveSpectrumShader"],
  transform: ["fullscreenVertexShader", "transformSpectrumShader"],
  unpack: ["fullscreenVertexShader", "unpackSpectrumShader"],
  filter: ["fullscreenVertexShader", "filterSpectrumShader"],
  foam: ["fullscreenVertexShader", "foamFragmentShader"],
  probe: ["fullscreenVertexShader", "probeFragmentShader"],
  glow: ["fullscreenVertexShader", "glowFragmentShader"],
  surface: ["surfaceVertexShader", "surfaceFragmentShader"],
  caustic: ["causticVertexShader", "causticFragmentShader"],
  causticBlur: ["fullscreenVertexShader", "causticBlurFragmentShader"],
  atmosphere: ["fullscreenVertexShader", "atmosphereFragmentShader"],
  cloud: ["fullscreenVertexShader", "cloudFragmentShader"],
  display: ["displayVertexShader", "displayFragmentShader"],
};
const shaderNames = [...new Set(Object.values(programs).flat())];
const component = path.join(root, "src/components/PondSurface.tsx");
const original = fs.readFileSync(component, "utf8");

function compile(module, filename) {
  let source = fs.readFileSync(filename, "utf8").replaceAll('"@/', `"${root}/src/`);
  source = source.replaceAll("import.meta.url", JSON.stringify(pathToFileURL(filename).href));
  if (filename === component) source += `\nmodule.exports.shaders = { ${shaderNames.join(", ")} };`;
  module._compile(ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, filename);
}

Module._extensions[".ts"] = compile;
Module._extensions[".tsx"] = compile;
const { shaders } = loadModule(component);
let uniformCount = 0;
for (const [program, [vertex, fragment]] of Object.entries(programs)) {
  const vertexFile = path.join(output, `${program}.vert`);
  const fragmentFile = path.join(output, `${program}.frag`);
  fs.writeFileSync(vertexFile, shaders[vertex]);
  fs.writeFileSync(fragmentFile, shaders[fragment]);
  let reflection;
  try {
    reflection = execFileSync(compiler, ["-l", "-q", vertexFile, fragmentFile], { encoding: "utf8" });
  } catch (error) {
    process.stderr.write(error.stdout ?? "");
    process.stderr.write(error.stderr ?? "");
    throw error;
  }
  const uniforms = new Set([...reflection.matchAll(/^(u_\w+)(?:\[\d+\])?:/gm)].map(match => match[1]));
  const requested = new RegExp(`getUniform\\(gl, ${program}Program, "(u_\\w+)(?:\\[\\d+\\])?"\\)`, "g");
  for (const match of original.matchAll(requested)) {
    if (!uniforms.has(match[1])) throw new Error(`${program}: inactive uniform ${match[1]}`);
    uniformCount += 1;
  }
  console.log(`PASS ${program}: compile, link, active uniforms`);
}
console.log(`Validated ${Object.keys(programs).length} programs and ${uniformCount} uniform bindings.`);
console.log(`Shader sources: ${output}`);
