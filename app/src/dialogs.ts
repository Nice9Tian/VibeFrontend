// 填几项再确定的小对话框（拆子项目、新建项目、添加项目用）。Enter 确定、Esc 取消；
// 校验不过时在对话框里说哪里不对，不关掉。

export interface DialogField {
  key: string;
  label: string;
  value?: string;
  placeholder?: string;
  /** 输入框下面的小字说明 */
  hint?: string;
  /** 给了就是下拉框：值 → 显示的名字 */
  options?: Array<{ value: string; label: string }>;
}

export interface DialogOptions {
  title: string;
  /** 标题下面的一段说明 */
  message?: string;
  fields: DialogField[];
  ok: string;
  /** 返回一句话表示哪里不对（对话框不关），返回 null 表示可以 */
  validate?: (values: Record<string, string>) => string | null;
}

/** 开着的那个对话框的“取消”：再开一个时先把它按取消关掉（收回按键监听，等它的人拿到 null） */
let closeCurrent: (() => void) | null = null;

/** 弹出对话框，等用户确定（返回填的值）或取消（返回 null）。 */
export function askFields(options: DialogOptions): Promise<Record<string, string> | null> {
  closeCurrent?.();
  return new Promise((resolve) => {
    document.getElementById("vf-ask-dialog")?.remove();
    const backdrop = document.createElement("div");
    backdrop.id = "vf-ask-dialog";
    backdrop.className = "vf-modal-backdrop";
    const modal = document.createElement("div");
    modal.className = "vf-modal vf-ask";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", options.title);

    const header = document.createElement("div");
    header.className = "vf-modal-header";
    const title = document.createElement("strong");
    title.textContent = options.title;
    header.append(title);

    const body = document.createElement("div");
    body.className = "vf-ask-body";
    if (options.message) {
      const message = document.createElement("p");
      message.className = "vf-ask-message";
      message.textContent = options.message;
      body.append(message);
    }
    const inputs = new Map<string, HTMLInputElement | HTMLSelectElement>();
    for (const field of options.fields) {
      const row = document.createElement("label");
      row.className = "vf-ask-row";
      const name = document.createElement("span");
      name.className = "vf-ask-label";
      name.textContent = field.label;
      let input: HTMLInputElement | HTMLSelectElement;
      if (field.options) {
        const select = document.createElement("select");
        for (const option of field.options) select.append(new Option(option.label, option.value));
        if (field.value !== undefined) select.value = field.value;
        input = select;
      } else {
        const text = document.createElement("input");
        text.type = "text";
        text.spellcheck = false;
        text.value = field.value ?? "";
        text.placeholder = field.placeholder ?? "";
        input = text;
      }
      input.dataset.key = field.key;
      inputs.set(field.key, input);
      row.append(name, input);
      if (field.hint) {
        const hint = document.createElement("span");
        hint.className = "vf-ask-hint";
        hint.textContent = field.hint;
        row.append(hint);
      }
      body.append(row);
    }
    const error = document.createElement("div");
    error.className = "vf-ask-error";
    error.setAttribute("role", "alert");
    body.append(error);

    const footer = document.createElement("div");
    footer.className = "vf-modal-footer";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "取消";
    const ok = document.createElement("button");
    ok.type = "button";
    ok.className = "primary";
    ok.textContent = options.ok;
    footer.append(cancel, ok);

    modal.append(header, body, footer);
    backdrop.append(modal);
    document.body.append(backdrop);

    const values = () => Object.fromEntries([...inputs].map(([key, input]) => [key, input.value]));
    const finish = (result: Record<string, string> | null) => {
      if (closeCurrent === cancelCurrent) closeCurrent = null;
      backdrop.remove();
      document.removeEventListener("keydown", onKey, true);
      resolve(result);
    };
    const cancelCurrent = () => finish(null);
    closeCurrent = cancelCurrent;
    const submit = () => {
      const current = values();
      const problem = options.validate?.(current) ?? null;
      if (problem) {
        error.textContent = problem;
        return;
      }
      finish(current);
    };
    // 捕获阶段拦下来：编辑器的快捷键（Delete、Ctrl+Z 等）不该在填字时生效
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        finish(null);
      } else if (e.key === "Enter" && e.target instanceof HTMLButtonElement) {
        // 焦点在按钮上（Tab 切到“取消”）：回车就是按这个按钮
        e.stopPropagation();
      } else if (e.key === "Enter" && !e.isComposing) {
        e.preventDefault();
        e.stopPropagation();
        submit();
      } else {
        e.stopPropagation();
      }
    };
    document.addEventListener("keydown", onKey, true);
    cancel.addEventListener("click", () => finish(null));
    ok.addEventListener("click", submit);
    backdrop.addEventListener("pointerdown", (e) => {
      if (e.target === backdrop) finish(null);
    });
    const first = inputs.values().next().value;
    if (first) {
      first.focus();
      if (first instanceof HTMLInputElement) first.select();
    }
  });
}
