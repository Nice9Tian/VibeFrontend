var VF = (function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	//#region src/expr.ts
	const NAME_START = /[^\x00-\x40\x5B-\x5E\x60\x7B-\x7F]/;
	const NAME_PATH = /^[^\x00-\x40\x5B-\x5E\x60\x7B-\x7F][^\x00-\x2F\x3A-\x40\x5B-\x5E\x60\x7B-\x7F]*(\.[^\x00-\x40\x5B-\x5E\x60\x7B-\x7F][^\x00-\x2F\x3A-\x40\x5B-\x5E\x60\x7B-\x7F]*)*/;
	const ASSIGNMENT = /^\s*([^\x00-\x40\x5B-\x5E\x60\x7B-\x7F][^\x00-\x2D\x2F\x3A-\x40\x5B-\x5E\x60\x7B-\x7F]*)\s*=(?!=)([\s\S]+)$/;
	function tokenize(source) {
		const tokens = [];
		let i = 0;
		while (i < source.length) {
			var _source;
			const ch = source[i];
			if (/\s/.test(ch)) i++;
			else if (ch === "(" || ch === ")") {
				tokens.push({
					type: "op",
					op: ch
				});
				i++;
			} else if (source.startsWith("==", i) || source.startsWith("!=", i)) {
				tokens.push({
					type: "op",
					op: source.slice(i, i + 2)
				});
				i += 2;
			} else if (ch === "'" || ch === "\"") {
				const end = source.indexOf(ch, i + 1);
				if (end < 0) throw new Error(`字符串缺少结束的引号：${source.slice(i)}`);
				tokens.push({
					type: "literal",
					value: source.slice(i + 1, end)
				});
				i = end + 1;
			} else if (/[0-9]/.test(ch) || ch === "-" && /[0-9]/.test((_source = source[i + 1]) !== null && _source !== void 0 ? _source : "")) {
				const match = /^-?[0-9]+(\.[0-9]+)?/.exec(source.slice(i));
				tokens.push({
					type: "literal",
					value: Number(match[0])
				});
				i += match[0].length;
			} else if (NAME_START.test(ch)) {
				const word = NAME_PATH.exec(source.slice(i))[0];
				if (word === "and" || word === "or" || word === "not") tokens.push({
					type: "op",
					op: word
				});
				else if (word === "true" || word === "false") tokens.push({
					type: "literal",
					value: word === "true"
				});
				else tokens.push({
					type: "path",
					path: word
				});
				i += word.length;
			} else throw new Error(`表达式中有无法识别的字符“${ch}”`);
		}
		return tokens;
	}
	function parseExpr(source) {
		const tokens = tokenize(String(source));
		let pos = 0;
		const peekOp = (op) => {
			const t = tokens[pos];
			return (t === null || t === void 0 ? void 0 : t.type) === "op" && t.op === op;
		};
		function parseOr() {
			let left = parseAnd();
			while (peekOp("or")) {
				pos++;
				left = {
					kind: "binary",
					op: "or",
					left,
					right: parseAnd()
				};
			}
			return left;
		}
		function parseAnd() {
			let left = parseNot();
			while (peekOp("and")) {
				pos++;
				left = {
					kind: "binary",
					op: "and",
					left,
					right: parseNot()
				};
			}
			return left;
		}
		function parseNot() {
			if (peekOp("not")) {
				pos++;
				return {
					kind: "not",
					operand: parseNot()
				};
			}
			return parseCompare();
		}
		function parseCompare() {
			const left = parsePrimary();
			if (peekOp("==") || peekOp("!=")) return {
				kind: "binary",
				op: tokens[pos++].op,
				left,
				right: parsePrimary()
			};
			return left;
		}
		function parsePrimary() {
			const t = tokens[pos++];
			if (!t) throw new Error("表达式不完整");
			if (t.type === "literal") return {
				kind: "literal",
				value: t.value
			};
			if (t.type === "path") return {
				kind: "path",
				path: t.path
			};
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
	function evalExpr(expr, resolve) {
		switch (expr.kind) {
			case "literal": return expr.value;
			case "path": return resolve(expr.path);
			case "not": return !evalExpr(expr.operand, resolve);
			case "binary": {
				if (expr.op === "and") return Boolean(evalExpr(expr.left, resolve)) && Boolean(evalExpr(expr.right, resolve));
				if (expr.op === "or") return Boolean(evalExpr(expr.left, resolve)) || Boolean(evalExpr(expr.right, resolve));
				const equal = evalExpr(expr.left, resolve) === evalExpr(expr.right, resolve);
				return expr.op === "==" ? equal : !equal;
			}
		}
	}
	/** 解析 `状态路径 = 表达式` 形式的赋值语句。 */
	function parseAssignment(source) {
		const match = ASSIGNMENT.exec(String(source));
		if (!match) throw new Error(`set 的写法应为“状态路径 = 表达式”：${source}`);
		return {
			target: match[1],
			value: parseExpr(match[2])
		};
	}
	//#endregion
	//#region src/model.ts
	/** 未转换的容器。 */
	const CONTAINER_DECL = {
		type: "Container",
		label: "容器",
		defaultSize: {
			width: 160,
			height: 80
		},
		children: true
	};
	/** 外部容器：工具里只是占位，导出后由业务把自己的控件放进来。 */
	const EXTERNAL_DECL = {
		type: "External",
		label: "外部容器",
		description: "工具里只是占位；导出后由业务把自己的控件（例如绘图区）放进来",
		defaultSize: {
			width: 240,
			height: 160
		},
		children: false
	};
	function isStateLeaf(def) {
		return typeof def === "object" && def !== null && typeof def.type === "string";
	}
	function findStateLeaf(logic, path) {
		let cursor = logic.state;
		for (const part of path.split(".")) {
			if (typeof cursor !== "object" || cursor === null || isStateLeaf(cursor)) return null;
			cursor = cursor[part];
		}
		return isStateLeaf(cursor) ? cursor : null;
	}
	/** 全部状态，按文件里的顺序。 */
	function allStateLeaves(logic) {
		const list = [];
		const walk = (defs, prefix) => {
			if (typeof defs !== "object" || defs === null) return;
			for (const key of Object.keys(defs)) {
				const def = defs[key];
				if (isStateLeaf(def)) list.push({
					path: prefix + key,
					leaf: def
				});
				else walk(def, `${prefix}${key}.`);
			}
		};
		walk(logic.state, "");
		return list;
	}
	function isBusinessState(leaf) {
		return leaf !== null && leaf.owner === "business";
	}
	/** 是业务事件就返回它的定义，否则返回 null。 */
	function businessEvent(logic, name) {
		const def = logic.events ? logic.events[name] : void 0;
		return def && !Array.isArray(def) && typeof def === "object" ? def : null;
	}
	/** 普通全局事件的步骤；不存在或者是业务事件时返回 null。 */
	function globalSteps(logic, name) {
		const def = logic.events ? logic.events[name] : void 0;
		return Array.isArray(def) ? def : null;
	}
	/** 按完整代号找条件：全局条件（run）或控件条件（saveButton.canSave）。 */
	function findCondition(logic, id) {
		var _logic$conditions, _logic$objects$id$sli, _logic$objects;
		const global = (_logic$conditions = logic.conditions) === null || _logic$conditions === void 0 ? void 0 : _logic$conditions[id];
		if (global) return global;
		const dot = id.indexOf(".");
		if (dot < 0) return null;
		return (_logic$objects$id$sli = (_logic$objects = logic.objects) === null || _logic$objects === void 0 || (_logic$objects = _logic$objects[id.slice(0, dot)]) === null || _logic$objects === void 0 || (_logic$objects = _logic$objects.conditions) === null || _logic$objects === void 0 ? void 0 : _logic$objects[id.slice(dot + 1)]) !== null && _logic$objects$id$sli !== void 0 ? _logic$objects$id$sli : null;
	}
	function allConditions(logic) {
		var _logic$conditions2, _logic$objects2;
		const list = [];
		const globals = (_logic$conditions2 = logic.conditions) !== null && _logic$conditions2 !== void 0 ? _logic$conditions2 : {};
		for (const id of Object.keys(globals)) list.push({
			id,
			def: globals[id]
		});
		const objects = (_logic$objects2 = logic.objects) !== null && _logic$objects2 !== void 0 ? _logic$objects2 : {};
		for (const objectId of Object.keys(objects)) {
			var _objects$objectId$con, _objects$objectId;
			const conditions = (_objects$objectId$con = (_objects$objectId = objects[objectId]) === null || _objects$objectId === void 0 ? void 0 : _objects$objectId.conditions) !== null && _objects$objectId$con !== void 0 ? _objects$objectId$con : {};
			for (const name of Object.keys(conditions)) list.push({
				id: `${objectId}.${name}`,
				def: conditions[name]
			});
		}
		return list;
	}
	function declFor(project, type) {
		var _project$components$g, _project$components$g2;
		if (type === "Container" || type === "Window") return CONTAINER_DECL;
		if (type === "External") return EXTERNAL_DECL;
		return (_project$components$g = (_project$components$g2 = project.components.get(type)) === null || _project$components$g2 === void 0 ? void 0 : _project$components$g2.decl) !== null && _project$components$g !== void 0 ? _project$components$g : null;
	}
	//#endregion
	//#region \0@oxc-project+runtime@0.153.0/helpers/esm/typeof.js
	function _typeof(o) {
		"@babel/helpers - typeof";
		return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o) {
			return typeof o;
		} : function(o) {
			return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o;
		}, _typeof(o);
	}
	//#endregion
	//#region \0@oxc-project+runtime@0.153.0/helpers/esm/toPrimitive.js
	function toPrimitive(t, r) {
		if ("object" != _typeof(t) || !t) return t;
		var e = t[Symbol.toPrimitive];
		if (void 0 !== e) {
			var i = e.call(t, r || "default");
			if ("object" != _typeof(i)) return i;
			throw new TypeError("@@toPrimitive must return a primitive value.");
		}
		return ("string" === r ? String : Number)(t);
	}
	//#endregion
	//#region \0@oxc-project+runtime@0.153.0/helpers/esm/toPropertyKey.js
	function toPropertyKey(t) {
		var i = toPrimitive(t, "string");
		return "symbol" == _typeof(i) ? i : i + "";
	}
	//#endregion
	//#region \0@oxc-project+runtime@0.153.0/helpers/esm/defineProperty.js
	function _defineProperty(e, r, t) {
		return (r = toPropertyKey(r)) in e ? Object.defineProperty(e, r, {
			value: t,
			enumerable: !0,
			configurable: !0,
			writable: !0
		}) : e[r] = t, e;
	}
	//#endregion
	//#region src/runtime.ts
	const MAX_EMIT_DEPTH = 20;
	/** 一次操作引出的业务事件最多连锁这么多个，防止模拟步骤互相触发停不下来。 */
	const MAX_BUSINESS_CHAIN = 50;
	function show(value) {
		return typeof value === "string" ? `'${value}'` : String(value);
	}
	function defaultFor(leaf) {
		var _leaf$values$, _leaf$values;
		if (leaf.initial !== void 0) return leaf.initial;
		if (leaf.type === "number") return 0;
		if (leaf.type === "boolean") return false;
		if (leaf.type === "enum") return (_leaf$values$ = (_leaf$values = leaf.values) === null || _leaf$values === void 0 ? void 0 : _leaf$values[0]) !== null && _leaf$values$ !== void 0 ? _leaf$values$ : "";
		return "";
	}
	var Runtime = class {
		constructor(project, hooks = {
			onChange() {},
			onLog() {}
		}) {
			_defineProperty(this, "project", void 0);
			_defineProperty(this, "hooks", void 0);
			_defineProperty(this, "state", /* @__PURE__ */ new Map());
			_defineProperty(this, "textConditions", /* @__PURE__ */ new Map());
			_defineProperty(this, "exprCache", /* @__PURE__ */ new Map());
			_defineProperty(this, "businessChain", 0);
			this.project = project;
			this.hooks = hooks;
			this.reset();
		}
		/** 把所有状态和文字条件恢复为初始值。 */
		reset() {
			this.state.clear();
			for (const { path, leaf } of allStateLeaves(this.project.logic)) this.state.set(path, defaultFor(leaf));
			this.textConditions.clear();
			for (const { id, def } of allConditions(this.project.logic)) if ((def === null || def === void 0 ? void 0 : def.type) === "text") this.textConditions.set(id, def.preview === true);
		}
		/** 换成新加载的项目；状态结构没变的部分保留当前值。 */
		adopt(project) {
			const oldState = new Map(this.state);
			const oldConditions = new Map(this.textConditions);
			this.project = project;
			this.exprCache.clear();
			this.reset();
			for (const [path, value] of oldState) {
				const leaf = findStateLeaf(project.logic, path);
				if (leaf && this.accepts(leaf, value)) this.state.set(path, value);
			}
			for (const [id, value] of oldConditions) if (this.textConditions.has(id)) this.textConditions.set(id, value);
		}
		/** 触发 app.start，预览开始时调用一次。 */
		start() {
			this.dispatch(null, "app.start");
		}
		parse(source) {
			const key = String(source);
			let expr = this.exprCache.get(key);
			if (!expr) {
				expr = parseExpr(key);
				this.exprCache.set(key, expr);
			}
			return expr;
		}
		resolve(path, state, stack) {
			var _this$textConditions$, _condition$expr;
			if (state.has(path)) return state.get(path);
			const condition = findCondition(this.project.logic, path);
			if (!condition) throw new Error(`未知的状态路径或条件代号“${path}”`);
			if (condition.type === "text") return (_this$textConditions$ = this.textConditions.get(path)) !== null && _this$textConditions$ !== void 0 ? _this$textConditions$ : false;
			if (stack.includes(path)) throw new Error(`条件循环引用：${[...stack, path].join(" → ")}`);
			return Boolean(evalExpr(this.parse((_condition$expr = condition.expr) !== null && _condition$expr !== void 0 ? _condition$expr : "false"), (p) => this.resolve(p, state, [...stack, path])));
		}
		evaluate(source, state = this.state) {
			return evalExpr(this.parse(source), (path) => this.resolve(path, state, []));
		}
		/** 预览工具条用：全部条件及其当前值。 */
		conditions() {
			return allConditions(this.project.logic).map(({ id, def }) => {
				var _def$text;
				let value = false;
				try {
					value = Boolean(this.resolve(id, this.state, []));
				} catch (_unused) {}
				return {
					id,
					text: (_def$text = def === null || def === void 0 ? void 0 : def.text) !== null && _def$text !== void 0 ? _def$text : "",
					kind: (def === null || def === void 0 ? void 0 : def.type) === "text" ? "text" : "symbol",
					value
				};
			});
		}
		stateSnapshot() {
			return [...this.state];
		}
		getState(path) {
			return this.state.get(path);
		}
		/** 某个节点当前应有的样子：静态默认值、scene.json 的值、逻辑计算值依次覆盖。 */
		view(id) {
			var _this$project$logic$o, _decl$props, _object$props;
			const node = this.project.scene.nodes[id];
			const decl = node ? declFor(this.project, node.type) : null;
			const object = (_this$project$logic$o = this.project.logic.objects) === null || _this$project$logic$o === void 0 ? void 0 : _this$project$logic$o[id];
			const props = {};
			const declared = (_decl$props = decl === null || decl === void 0 ? void 0 : decl.props) !== null && _decl$props !== void 0 ? _decl$props : {};
			for (const key of Object.keys(declared)) {
				const value = declared[key].default;
				if (value !== void 0) props[key] = value;
			}
			Object.assign(props, node === null || node === void 0 ? void 0 : node.props);
			let visible = true;
			const computed = (_object$props = object === null || object === void 0 ? void 0 : object.props) !== null && _object$props !== void 0 ? _object$props : {};
			for (const key of Object.keys(computed)) try {
				const value = this.evaluate(computed[key]);
				if (key === "visible") visible = Boolean(value);
				else props[key] = value;
			} catch (_unused2) {}
			if ((object === null || object === void 0 ? void 0 : object.bind) && this.state.has(object.bind)) props.value = this.state.get(object.bind);
			return {
				visible,
				enabled: props.enabled !== false,
				props
			};
		}
		toggleTextCondition(id) {
			var _this$textConditions$2;
			const next = !((_this$textConditions$2 = this.textConditions.get(id)) !== null && _this$textConditions$2 !== void 0 ? _this$textConditions$2 : false);
			this.textConditions.set(id, next);
			this.hooks.onLog({
				title: `条件 ${id}`,
				lines: [`手动切换：${next ? "否 → 是" : "是 → 否"}`]
			});
			this.hooks.onChange();
		}
		/** nodeId 为 null 表示全局事件。 */
		dispatch(nodeId, event, value) {
			var _logic$objects, _object$events;
			const { logic } = this.project;
			const object = nodeId ? (_logic$objects = logic.objects) === null || _logic$objects === void 0 ? void 0 : _logic$objects[nodeId] : void 0;
			const steps = nodeId ? object === null || object === void 0 || (_object$events = object.events) === null || _object$events === void 0 ? void 0 : _object$events[event] : globalSteps(logic, event);
			const bindTarget = nodeId && event === "change" && value !== void 0 ? object === null || object === void 0 ? void 0 : object.bind : void 0;
			if (!steps && !bindTarget) return;
			const title = nodeId ? `${nodeId}.${event}` : `全局事件 ${event}`;
			if (nodeId) {
				const view = this.view(nodeId);
				if (!view.visible || !view.enabled) {
					if (event !== "mouseenter" && event !== "mouseleave") this.hooks.onLog({
						title,
						lines: [`已忽略：控件${view.visible ? "不可用" : "不可见"}`]
					});
					return;
				}
			}
			this.runBatch(title, false, event === "window.click", (batch) => {
				if (bindTarget) this.assign(batch, bindTarget, value);
				if (steps) this.runSteps(steps, batch, 0);
			});
		}
		/** 执行一个业务事件的模拟步骤，就像业务没有接上时那样。 */
		simulate(name) {
			const def = businessEvent(this.project.logic, name);
			if (!def) return;
			this.runBatch(`业务事件 ${name}（模拟）`, true, false, (batch) => {
				if (def.simulate) this.runSteps(def.simulate, batch, 0);
			});
		}
		/**
		* 业务把自己管的状态写回界面。成功返回 null，否则返回原因。
		* 只能写标了 owner: business 的状态。
		*/
		setBusinessState(path, value) {
			const leaf = findStateLeaf(this.project.logic, path);
			if (!leaf) return `“${path}”不是状态路径`;
			if (!isBusinessState(leaf)) return `“${path}”是界面自己管的状态，业务不能写`;
			if (!this.accepts(leaf, value)) return `${path} 需要 ${this.expected(leaf)}，得到 ${show(value)}`;
			const before = this.state.get(path);
			if (before === value) return null;
			this.state.set(path, value);
			this.hooks.onLog({
				title: "业务写回状态",
				lines: [`${path}: ${show(before !== null && before !== void 0 ? before : null)} → ${show(value)}`]
			});
			this.hooks.onChange();
			return null;
		}
		/** 执行一批步骤，让结果一次生效，再处理这一批里 emit 的业务事件。 */
		runBatch(title, simulating, quietWhenEmpty, body) {
			const batch = {
				work: new Map(this.state),
				lines: [],
				pending: [],
				simulating
			};
			body(batch);
			let changed = false;
			for (const [path, next] of batch.work) {
				const before = this.state.get(path);
				if (before !== next) {
					batch.lines.push(`${path}: ${show(before !== null && before !== void 0 ? before : null)} → ${show(next)}`);
					changed = true;
				}
			}
			this.state = batch.work;
			if (batch.lines.length > 0 || !quietWhenEmpty) {
				if (batch.lines.length === 0) batch.lines.push("（没有状态变化）");
				this.hooks.onLog({
					title,
					lines: batch.lines
				});
			}
			if (changed) this.hooks.onChange();
			for (const name of batch.pending) this.raise(name);
		}
		raise(name) {
			var _this$hooks$raiseBusi, _this$hooks;
			if ((_this$hooks$raiseBusi = (_this$hooks = this.hooks).raiseBusiness) === null || _this$hooks$raiseBusi === void 0 ? void 0 : _this$hooks$raiseBusi.call(_this$hooks, name)) return;
			if (this.businessChain >= MAX_BUSINESS_CHAIN) {
				this.hooks.onLog({
					title: `业务事件 ${name}`,
					lines: [`错误：业务事件连锁超过 ${MAX_BUSINESS_CHAIN} 个，可能是模拟步骤互相触发`]
				});
				return;
			}
			this.businessChain++;
			try {
				this.simulate(name);
			} finally {
				this.businessChain--;
			}
		}
		runSteps(steps, batch, depth) {
			if (!Array.isArray(steps)) return;
			for (const step of steps) try {
				if ("set" in step) {
					const { target, value } = parseAssignment(step.set);
					this.assign(batch, target, evalExpr(value, (path) => this.resolve(path, batch.work, [])));
				} else if ("emit" in step) {
					const handler = globalSteps(this.project.logic, step.emit);
					if (businessEvent(this.project.logic, step.emit)) {
						batch.pending.push(step.emit);
						batch.lines.push(`业务事件 ${step.emit}：这批步骤生效后处理`);
					} else if (!handler) batch.lines.push(`错误：全局事件“${step.emit}”没有定义`);
					else if (batch.simulating) batch.lines.push(`错误：模拟步骤里不能触发普通全局事件“${step.emit}”`);
					else if (depth >= MAX_EMIT_DEPTH) batch.lines.push(`错误：全局事件嵌套超过 ${MAX_EMIT_DEPTH} 层，可能是互相触发`);
					else {
						batch.lines.push(`触发全局事件 ${step.emit}`);
						this.runSteps(handler, batch, depth + 1);
					}
				} else if ("if" in step) {
					const branch = this.evaluate(step.if, batch.work) ? step.then : step.else;
					if (branch) this.runSteps(branch, batch, depth);
				}
			} catch (e) {
				batch.lines.push(`错误：${e.message}`);
			}
		}
		accepts(leaf, value) {
			var _leaf$values2;
			if (leaf.type === "enum") return typeof value === "string" && ((_leaf$values2 = leaf.values) !== null && _leaf$values2 !== void 0 ? _leaf$values2 : []).includes(value);
			return typeof value === leaf.type;
		}
		expected(leaf) {
			var _leaf$values3;
			return leaf.type === "enum" ? `[${((_leaf$values3 = leaf.values) !== null && _leaf$values3 !== void 0 ? _leaf$values3 : []).join(", ")}] 之一` : leaf.type;
		}
		assign(batch, target, value) {
			const leaf = findStateLeaf(this.project.logic, target);
			if (!leaf) batch.lines.push(`错误：“${target}”不是状态路径`);
			else if (isBusinessState(leaf) !== batch.simulating) batch.lines.push(batch.simulating ? `错误：模拟步骤只能修改业务管的状态，“${target}”是界面自己管的` : `错误：状态“${target}”归业务管，只能在业务事件的模拟步骤里修改`);
			else if (!this.accepts(leaf, value)) batch.lines.push(`错误：${target} 需要 ${this.expected(leaf)}，得到 ${show(value)}`);
			else batch.work.set(target, value);
		}
	};
	//#endregion
	//#region src/export/dump.ts
	function sorted(entries) {
		const result = {};
		for (const [key, value] of entries.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)) result[key] = value;
		return result;
	}
	function dumpRuntime(runtime, scene) {
		const views = [];
		for (const id of Object.keys(scene.nodes)) {
			if (id === scene.root) continue;
			const view = runtime.view(id);
			const props = Object.keys(view.props).map((key) => [key, view.props[key]]);
			views.push([id, {
				enabled: view.enabled,
				props: sorted(props),
				visible: view.visible
			}]);
		}
		return JSON.stringify({
			state: sorted(runtime.stateSnapshot()),
			views: sorted(views)
		});
	}
	//#endregion
	//#region src/export/qt-runtime.ts
	let runtime;
	let scene;
	/** 等界面绑定层处理的业务事件 */
	let outgoing = [];
	function take() {
		const list = outgoing;
		outgoing = [];
		return list;
	}
	function init(json) {
		const data = JSON.parse(json);
		scene = data.scene;
		const components = /* @__PURE__ */ new Map();
		for (const type of Object.keys(data.components)) components.set(type, { decl: data.components[type] });
		runtime = new Runtime({
			scene: data.scene,
			logic: data.logic,
			components
		}, {
			onChange() {},
			onLog() {},
			raiseBusiness(name) {
				outgoing.push(name);
				return true;
			}
		});
	}
	function start() {
		runtime.start();
		return take();
	}
	/** control 为 null 表示全局事件。 */
	function dispatch(control, event, value) {
		runtime.dispatch(control, event, value === null ? void 0 : value);
		return take();
	}
	function simulate(name) {
		runtime.simulate(name);
		return take();
	}
	/** 业务把自己管的状态写回来。成功返回 null，否则返回原因。 */
	function setState(path, value) {
		return runtime.setBusinessState(path, value);
	}
	function getState(path) {
		const value = runtime.getState(path);
		return value === void 0 ? null : value;
	}
	/** 每个控件当前应有的样子：控件 ID → 可见、可用、属性。 */
	function views() {
		const result = {};
		for (const id of Object.keys(scene.nodes)) result[id] = runtime.view(id);
		return result;
	}
	function dump() {
		return dumpRuntime(runtime, scene);
	}
	//#endregion
	exports.dispatch = dispatch;
	exports.dump = dump;
	exports.getState = getState;
	exports.init = init;
	exports.setState = setState;
	exports.simulate = simulate;
	exports.start = start;
	exports.views = views;
	return exports;
})({});
