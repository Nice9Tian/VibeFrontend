// 把逻辑运行层当前的样子写成一行 JSON：全部状态，以及每个控件应有的可见、可用和属性。
// 用例比较靠它：工具这边和导出的 Qt 程序那边各自输出，逐字相同才算一致，所以键一律排序。
import type { Value } from "../expr.ts";
import type { Scene } from "../model.ts";
import type { Runtime } from "../runtime.ts";

function sorted<T>(entries: Array<[string, T]>): Record<string, T> {
  const result: Record<string, T> = {};
  for (const [key, value] of entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) result[key] = value;
  return result;
}

function canonicalValue(val: Value): Value {
  if (val === null || typeof val !== "object") return val;
  if (Array.isArray(val)) return val.map(canonicalValue);
  const entries: Array<[string, Value]> = Object.keys(val).map((k) => [k, canonicalValue((val as Record<string, Value>)[k])]);
  return sorted(entries);
}

export function dumpRuntime(runtime: Runtime, scene: Scene): string {
  const views: Array<[string, unknown]> = [];
  for (const id of Object.keys(scene.nodes)) {
    if (id === scene.root) continue;
    const view = runtime.view(id);
    const props: Array<[string, Value]> = Object.keys(view.props).map((key) => [key, canonicalValue(view.props[key])]);
    const entry: Record<string, unknown> = {
      enabled: view.enabled,
      props: sorted(props),
      ...(view.stateImage ? { stateImage: view.stateImage } : {}),
      ...(view.visualState ? { visualState: view.visualState } : {}),
      visible: view.visible,
    };
    views.push([id, entry]);
  }
  const stateEntries: Array<[string, Value]> = runtime.stateSnapshot().map(([k, v]) => [k, canonicalValue(v)]);
  const rootNode = scene.nodes[scene.root];
  if (rootNode && ((rootNode.docks?.length ?? 0) > 0 || rootNode.dockLayout)) {
    const docks = canonicalValue(runtime.getDockLayout(scene.root) as unknown as Value);
    return JSON.stringify({ docks, state: sorted(stateEntries), views: sorted(views) });
  }
  return JSON.stringify({ state: sorted(stateEntries), views: sorted(views) });
}
