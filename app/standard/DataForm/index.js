// 由结构化数据生成的动态表单控件。
function parseSchema(raw) {
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return { row_spacing: 8, column_spacing: 6, controls: [] };
    }
  }
  if (Array.isArray(raw)) {
    return { row_spacing: 8, column_spacing: 6, controls: raw };
  }
  if (typeof raw === "object" && raw !== null) {
    return {
      row_spacing: Number(raw.row_spacing ?? 8),
      column_spacing: Number(raw.column_spacing ?? 6),
      controls: Array.isArray(raw.controls) ? raw.controls : [],
    };
  }
  return { row_spacing: 8, column_spacing: 6, controls: [] };
}

function parseValues(raw) {
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === "object" && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) return raw;
  return {};
}

function evalStringVisibleWhen(expr, valMap) {
  const s = String(expr ?? "").trim();
  if (!s) return true;
  if (s.includes("||")) return s.split("||").some((p) => evalStringVisibleWhen(p, valMap));
  if (s.includes("&&")) return s.split("&&").every((p) => evalStringVisibleWhen(p, valMap));
  const neIdx = s.indexOf("!=");
  if (neIdx > 0) {
    const key = s.slice(0, neIdx).trim();
    const rhs = s.slice(neIdx + 2).trim().replace(/^['"]|['"]$/g, "");
    return String(valMap[key] ?? "") !== rhs;
  }
  const eqIdx = s.indexOf("==");
  if (eqIdx > 0) {
    const key = s.slice(0, eqIdx).trim();
    const rhs = s.slice(eqIdx + 2).trim().replace(/^['"]|['"]$/g, "");
    return String(valMap[key] ?? "") === rhs;
  }
  if (s.startsWith("!")) return !valMap[s.slice(1).trim()];
  return Boolean(valMap[s]);
}

function isControlVisible(ctrl, valMap) {
  const cond = ctrl.visible_when;
  if (!cond) return true;
  if (typeof cond === "string") return evalStringVisibleWhen(cond, valMap);
  if (typeof cond !== "object") return true;
  const target = String(cond.control ?? "");
  if (!target) return true;
  const actual = valMap[target];
  if (cond.equals !== undefined) return actual === cond.equals;
  if (cond.not_equals !== undefined) return actual !== cond.not_equals;
  if (Array.isArray(cond.in)) return cond.in.includes(actual);
  return true;
}

export default function create(el, { props, emit }) {
  const root = document.createElement("div");
  root.className = "vf-std-dataform";
  el.append(root);
  let localOverrides = {};
  let lastSchemaKey = "";

  function update(next) {
    const schema = parseSchema(next.schema);
    const schemaKey = JSON.stringify(schema.controls.map((c) => `${c?.name}:${c?.type}`));
    if (schemaKey !== lastSchemaKey) {
      localOverrides = {};
      lastSchemaKey = schemaKey;
    }
    const extValues = parseValues(next.values);
    const valMap = {};
    for (const c of schema.controls) {
      if (!c || typeof c !== "object") continue;
      const name = String(c.name ?? "");
      if (!name) continue;
      if (extValues[name] !== undefined) valMap[name] = extValues[name];
      else if (localOverrides[name] !== undefined) valMap[name] = localOverrides[name];
      else valMap[name] = c.value;
    }

    root.replaceChildren();
    if (schema.controls.length === 0) {
      const empty = document.createElement("div");
      empty.className = "vf-std-dataform-empty";
      empty.textContent = String(next.emptyText ?? "当前工具无可调选项");
      root.append(empty);
      return;
    }

    const grid = document.createElement("div");
    grid.className = "vf-std-dataform-grid";
    grid.style.rowGap = `${Math.max(4, schema.row_spacing)}px`;
    grid.style.columnGap = `${Math.max(4, schema.column_spacing)}px`;

    const emitField = (c, val) => {
      const name = String(c.name ?? "");
      localOverrides[name] = val;
      emit("change", {
        name,
        value: val,
        hook: String(c.hook ?? ""),
        type: String(c.type ?? ""),
      });
      update(next);
    };

    for (const c of schema.controls) {
      if (!c || typeof c !== "object") continue;
      const stateStr = String(c.state ?? "normal");
      if (stateStr === "hidden" || !isControlVisible(c, valMap)) continue;
      const disabled = next.enabled === false || stateStr === "disabled";
      const name = String(c.name ?? "");
      const title = String(c.title ?? name);
      const type = String(c.type ?? "button");
      const val = valMap[name];
      const row = Number(c.row ?? 0) + 1;
      const startCol = Number(c.start_column ?? c.column ?? 0) + 1;
      const endCol = Number(c.end_column ?? c.start_column ?? c.column ?? 1) + 2;

      const cell = document.createElement("div");
      cell.className = "vf-std-dataform-cell";
      cell.dataset.vfField = name;
      cell.style.gridRow = String(row);
      cell.style.gridColumn = `${startCol} / ${Math.max(startCol + 1, endCol)}`;

      if (type === "slider") {
        const head = document.createElement("div");
        head.className = "vf-std-dataform-head";
        const lbl = document.createElement("span");
        lbl.textContent = title;
        const num = document.createElement("span");
        num.className = "vf-std-dataform-val";
        num.dataset.vfFieldValue = name;
        num.textContent = String(val ?? c.min ?? 0);
        head.append(lbl, num);

        const input = document.createElement("input");
        input.type = "range";
        input.className = "vf-std-dataform-slider";
        input.min = String(c.min ?? 0);
        input.max = String(c.max ?? 100);
        input.value = String(val ?? c.min ?? 0);
        input.disabled = disabled;
        input.addEventListener("input", () => {
          num.textContent = input.value;
        });
        input.addEventListener("change", () => {
          emitField(c, Number(input.value));
        });
        cell.append(head, input);
      } else if (type === "list" || type === "select") {
        const rowBox = document.createElement("div");
        rowBox.className = "vf-std-dataform-row";
        const lbl = document.createElement("span");
        lbl.textContent = title;
        const sel = document.createElement("select");
        sel.className = "vf-std-dataform-select";
        sel.disabled = disabled;
        const opts = Array.isArray(c.options) ? c.options : [];
        for (const opt of opts) {
          const o = document.createElement("option");
          o.value = String(opt);
          o.textContent = String(opt);
          if (String(opt) === String(val)) o.selected = true;
          sel.append(o);
        }
        sel.addEventListener("change", () => emitField(c, sel.value));
        rowBox.append(lbl, sel);
        cell.append(rowBox);
      } else if (type === "check" || type === "checkbox") {
        const lbl = document.createElement("label");
        lbl.className = "vf-std-dataform-check";
        const chk = document.createElement("input");
        chk.type = "checkbox";
        chk.checked = Boolean(val);
        chk.disabled = disabled;
        chk.addEventListener("change", () => emitField(c, chk.checked));
        const span = document.createElement("span");
        span.textContent = title;
        lbl.append(chk, span);
        cell.append(lbl);
      } else if (type === "color" || type === "palette") {
        const rowBox = document.createElement("div");
        rowBox.className = "vf-std-dataform-row";
        const lbl = document.createElement("span");
        lbl.textContent = title;
        const sw = document.createElement("input");
        sw.type = "color";
        sw.value = typeof val === "string" && val.startsWith("#") ? val : "#4a90d9";
        sw.disabled = disabled;
        sw.addEventListener("change", () => emitField(c, sw.value));
        rowBox.append(lbl, sw);
        cell.append(rowBox);
      } else {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "vf-std-dataform-btn";
        btn.disabled = disabled;
        btn.textContent = title;
        btn.addEventListener("click", () => emitField(c, true));
        cell.append(btn);
      }
      grid.append(cell);
    }
    root.append(grid);
  }
  update(props);

  return { update, destroy: () => root.remove() };
}
