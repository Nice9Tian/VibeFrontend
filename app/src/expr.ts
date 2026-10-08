// 表达式：状态路径、条件代号、字符串、数字、true/false，以及 == != and or not 和括号。
// 由这里的解析器处理，不使用 eval。

export type Value = string | number | boolean | null;

export type Expr =
  | { kind: "literal"; value: Value }
  | { kind: "path"; path: string }
  | { kind: "not"; operand: Expr }
  | { kind: "binary"; op: "==" | "!=" | "and" | "or"; left: Expr; right: Expr };

type Token =
  | { type: "literal"; value: Value }
  | { type: "path"; path: string }
  | { type: "op"; op: "==" | "!=" | "and" | "or" | "not" | "(" | ")" };

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (ch === "(" || ch === ")") {
      tokens.push({ type: "op", op: ch });
      i++;
    } else if (source.startsWith("==", i) || source.startsWith("!=", i)) {
      tokens.push({ type: "op", op: source.slice(i, i + 2) as "==" | "!=" });
      i += 2;
    } else if (ch === "'" || ch === '"') {
      const end = source.indexOf(ch, i + 1);
      if (end < 0) throw new Error(`字符串缺少结束的引号：${source.slice(i)}`);
      tokens.push({ type: "literal", value: source.slice(i + 1, end) });
      i = end + 1;
    } else if (/[0-9]/.test(ch) || (ch === "-" && /[0-9]/.test(source[i + 1] ?? ""))) {
      const match = /^-?[0-9]+(\.[0-9]+)?/.exec(source.slice(i))!;
      tokens.push({ type: "literal", value: Number(match[0]) });
      i += match[0].length;
    } else if (/[\p{L}_]/u.test(ch)) {
      const match = /^[\p{L}_][\p{L}\p{N}_]*(\.[\p{L}_][\p{L}\p{N}_]*)*/u.exec(source.slice(i))!;
      const word = match[0];
      if (word === "and" || word === "or" || word === "not") tokens.push({ type: "op", op: word });
      else if (word === "true" || word === "false") tokens.push({ type: "literal", value: word === "true" });
      else tokens.push({ type: "path", path: word });
      i += word.length;
    } else {
      throw new Error(`表达式中有无法识别的字符“${ch}”`);
    }
  }
  return tokens;
}

export function parseExpr(source: string): Expr {
  const tokens = tokenize(String(source));
  let pos = 0;
  const peekOp = (op: string) => {
    const t = tokens[pos];
    return t?.type === "op" && t.op === op;
  };

  function parseOr(): Expr {
    let left = parseAnd();
    while (peekOp("or")) {
      pos++;
      left = { kind: "binary", op: "or", left, right: parseAnd() };
    }
    return left;
  }
  function parseAnd(): Expr {
    let left = parseNot();
    while (peekOp("and")) {
      pos++;
      left = { kind: "binary", op: "and", left, right: parseNot() };
    }
    return left;
  }
  function parseNot(): Expr {
    if (peekOp("not")) {
      pos++;
      return { kind: "not", operand: parseNot() };
    }
    return parseCompare();
  }
  function parseCompare(): Expr {
    const left = parsePrimary();
    if (peekOp("==") || peekOp("!=")) {
      const op = (tokens[pos++] as { op: "==" | "!=" }).op;
      return { kind: "binary", op, left, right: parsePrimary() };
    }
    return left;
  }
  function parsePrimary(): Expr {
    const t = tokens[pos++];
    if (!t) throw new Error("表达式不完整");
    if (t.type === "literal") return { kind: "literal", value: t.value };
    if (t.type === "path") return { kind: "path", path: t.path };
    if (t.op === "(") {
      const inner = parseOr();
      if (!peekOp(")")) throw new Error("缺少右括号");
      pos++;
      return inner;
    }
    throw new Error(`表达式中“${t.op}”的位置不对`);
  }

  const expr = parseOr();
  if (pos < tokens.length) throw new Error("表达式后面有多余的内容");
  return expr;
}

/** resolve 负责把路径（状态路径或条件代号）变成值；找不到时应抛出错误。 */
export function evalExpr(expr: Expr, resolve: (path: string) => Value): Value {
  switch (expr.kind) {
    case "literal":
      return expr.value;
    case "path":
      return resolve(expr.path);
    case "not":
      return !evalExpr(expr.operand, resolve);
    case "binary": {
      if (expr.op === "and") return Boolean(evalExpr(expr.left, resolve)) && Boolean(evalExpr(expr.right, resolve));
      if (expr.op === "or") return Boolean(evalExpr(expr.left, resolve)) || Boolean(evalExpr(expr.right, resolve));
      const equal = evalExpr(expr.left, resolve) === evalExpr(expr.right, resolve);
      return expr.op === "==" ? equal : !equal;
    }
  }
}

/** 表达式中出现的全部路径，用于检查名字是否存在。 */
export function pathsIn(expr: Expr): string[] {
  switch (expr.kind) {
    case "literal":
      return [];
    case "path":
      return [expr.path];
    case "not":
      return pathsIn(expr.operand);
    case "binary":
      return [...pathsIn(expr.left), ...pathsIn(expr.right)];
  }
}

/** 解析 `状态路径 = 表达式` 形式的赋值语句。 */
export function parseAssignment(source: string): { target: string; value: Expr } {
  const match = /^\s*([\p{L}_][\p{L}\p{N}_.]*)\s*=(?!=)([\s\S]+)$/u.exec(String(source));
  if (!match) throw new Error(`set 的写法应为“状态路径 = 表达式”：${source}`);
  return { target: match[1], value: parseExpr(match[2]) };
}
