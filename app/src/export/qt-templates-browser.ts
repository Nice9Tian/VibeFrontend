import type { QtAssets } from "./qt.ts";

declare global {
  interface ImportMeta {
    glob: (pattern: string | string[], options: Record<string, unknown>) => Record<string, string>;
  }
}

const runtimeGlob = import.meta.glob("../../../examples/minimal/qt/ui/ui_binding/logic/runtime.js", {
  query: "?raw",
  import: "default",
  eager: true,
});

const generatedGlob = import.meta.glob(["../../qt-templates/generated/**/*", "../../qt-templates/generated/**/.*"], {
  query: "?raw",
  import: "default",
  eager: true,
});

const scaffoldGlob = import.meta.glob(["../../qt-templates/scaffold/**/*", "../../qt-templates/scaffold/**/.*"], {
  query: "?raw",
  import: "default",
  eager: true,
});

function stripPrefix(map: Record<string, string>, marker: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, content] of Object.entries(map)) {
    const normalized = key.replace(/\\/g, "/");
    const idx = normalized.indexOf(marker);
    if (idx >= 0) {
      out[normalized.slice(idx + marker.length)] = content.replace(/\r\n/g, "\n");
    }
  }
  return out;
}

export function getQtTemplates(): QtAssets {
  const runtimeRaw = Object.values(runtimeGlob)[0] ?? "";
  return {
    runtimeJs: runtimeRaw.replace(/\r\n/g, "\n"),
    generated: stripPrefix(generatedGlob, "qt-templates/generated/"),
    scaffold: stripPrefix(scaffoldGlob, "qt-templates/scaffold/"),
  };
}
