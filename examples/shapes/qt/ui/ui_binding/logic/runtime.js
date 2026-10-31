var VF = (function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
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
	//#region \0@oxc-project+runtime@0.153.0/helpers/esm/objectSpread2.js
	function ownKeys(e, r) {
		var t = Object.keys(e);
		if (Object.getOwnPropertySymbols) {
			var o = Object.getOwnPropertySymbols(e);
			r && (o = o.filter(function(r) {
				return Object.getOwnPropertyDescriptor(e, r).enumerable;
			})), t.push.apply(t, o);
		}
		return t;
	}
	function _objectSpread2(e) {
		for (var r = 1; r < arguments.length; r++) {
			var t = null != arguments[r] ? arguments[r] : {};
			r % 2 ? ownKeys(Object(t), !0).forEach(function(r) {
				_defineProperty(e, r, t[r]);
			}) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function(r) {
				Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r));
			});
		}
		return e;
	}
	//#endregion
	//#region src/shapes.ts
	/** 形状：一个可以填色、描边、写字的图形。 */
	const SHAPE_DECL = {
		type: "Shape",
		label: "形状",
		description: "矩形、椭圆、菱形、星形、流程图图形等。可以填色、描边、在里面写字",
		defaultSize: {
			width: 120,
			height: 80
		},
		props: {
			shape: {
				type: "string",
				default: "rectangle",
				logic: true
			},
			fill: {
				type: "string",
				default: "#ffffff",
				logic: true
			},
			stroke: {
				type: "string",
				default: "#1f2430",
				logic: true
			},
			strokeWidth: {
				type: "number",
				default: 2,
				logic: true
			},
			strokeStyle: {
				type: "string",
				default: "solid",
				logic: true
			},
			radius: {
				type: "number",
				default: 0,
				logic: true
			},
			opacity: {
				type: "number",
				default: 1,
				logic: true
			},
			sides: {
				type: "number",
				default: 5,
				logic: true
			},
			points: {
				type: "number",
				default: 5,
				logic: true
			},
			ratio: {
				type: "number",
				default: .45,
				logic: true
			},
			text: {
				type: "string",
				default: "",
				logic: true
			},
			textColor: {
				type: "string",
				default: "#1f2430",
				logic: true
			},
			fontSize: {
				type: "number",
				default: 14,
				logic: true
			},
			fontWeight: {
				type: "string",
				default: "normal",
				logic: true
			},
			textAlign: {
				type: "string",
				default: "center",
				logic: true
			}
		},
		children: false
	};
	/** 线条：直线、折线或曲线，两端可以挂在别的节点上，跟着它们走。 */
	const LINE_DECL = {
		type: "Line",
		label: "线条",
		description: "直线、箭头、连接线。两端可以挂在形状或控件上，被挂的东西移动时线跟着走",
		defaultSize: {
			width: 160,
			height: 0
		},
		props: {
			x1: {
				type: "number",
				default: 0
			},
			y1: {
				type: "number",
				default: 0
			},
			x2: {
				type: "number",
				default: 160
			},
			y2: {
				type: "number",
				default: 0
			},
			startNode: {
				type: "string",
				default: ""
			},
			startSide: {
				type: "string",
				default: "auto"
			},
			endNode: {
				type: "string",
				default: ""
			},
			endSide: {
				type: "string",
				default: "auto"
			},
			startAt: {
				type: "string",
				default: ""
			},
			endAt: {
				type: "string",
				default: ""
			},
			bends: {
				type: "string",
				default: ""
			},
			route: {
				type: "string",
				default: "straight",
				logic: true
			},
			stroke: {
				type: "string",
				default: "#1f2430",
				logic: true
			},
			strokeWidth: {
				type: "number",
				default: 2,
				logic: true
			},
			strokeStyle: {
				type: "string",
				default: "solid",
				logic: true
			},
			startCap: {
				type: "string",
				default: "none",
				logic: true
			},
			endCap: {
				type: "string",
				default: "none",
				logic: true
			},
			opacity: {
				type: "number",
				default: 1,
				logic: true
			},
			label: {
				type: "string",
				default: "",
				logic: true
			},
			textColor: {
				type: "string",
				default: "#1f2430",
				logic: true
			},
			fontSize: {
				type: "number",
				default: 12,
				logic: true
			}
		},
		children: false
	};
	const SHAPE_KINDS = [
		{
			id: "rectangle",
			label: "矩形",
			group: "basic"
		},
		{
			id: "ellipse",
			label: "椭圆",
			group: "basic",
			textInset: [.15, .15]
		},
		{
			id: "diamond",
			label: "菱形",
			group: "basic",
			textInset: [.25, .25]
		},
		{
			id: "triangle",
			label: "三角形",
			group: "basic",
			textInset: [.25, .35]
		},
		{
			id: "triangleDown",
			label: "倒三角",
			group: "basic",
			textInset: [.25, .1]
		},
		{
			id: "polygon",
			label: "多边形",
			group: "basic",
			textInset: [.2, .2]
		},
		{
			id: "star",
			label: "星形",
			group: "basic",
			textInset: [.3, .3]
		},
		{
			id: "plus",
			label: "十字",
			group: "basic",
			textInset: [.33, .33]
		},
		{
			id: "arrowRight",
			label: "右箭头",
			group: "basic",
			textInset: [.05, .28]
		},
		{
			id: "arrowLeft",
			label: "左箭头",
			group: "basic",
			textInset: [.05, .28]
		},
		{
			id: "arrowBoth",
			label: "双向箭头",
			group: "basic",
			textInset: [.2, .28]
		},
		{
			id: "chevron",
			label: "折角箭头",
			group: "basic",
			textInset: [.2, .1]
		},
		{
			id: "speechBubble",
			label: "对话气泡",
			group: "basic",
			textInset: [.06, .08]
		},
		{
			id: "cloud",
			label: "云",
			group: "basic",
			textInset: [.18, .22]
		},
		{
			id: "hexagon",
			label: "六边形",
			group: "flowchart",
			textInset: [.2, .05]
		},
		{
			id: "parallelogram",
			label: "平行四边形",
			group: "flowchart",
			textInset: [.2, .05]
		},
		{
			id: "parallelogramLeft",
			label: "左倾平行四边形",
			group: "flowchart",
			textInset: [.2, .05]
		},
		{
			id: "trapezoid",
			label: "梯形",
			group: "flowchart",
			textInset: [.2, .05]
		},
		{
			id: "manualInput",
			label: "手动输入",
			group: "flowchart",
			textInset: [.05, .2]
		},
		{
			id: "cylinder",
			label: "圆柱（数据库）",
			group: "flowchart",
			textInset: [.05, .25]
		},
		{
			id: "cylinderHorizontal",
			label: "横向圆柱",
			group: "flowchart",
			textInset: [.2, .05]
		},
		{
			id: "document",
			label: "文档",
			group: "flowchart",
			textInset: [.05, .1]
		},
		{
			id: "multiDocument",
			label: "多文档",
			group: "flowchart",
			textInset: [.06, .15]
		},
		{
			id: "predefinedProcess",
			label: "预定义处理",
			group: "flowchart",
			textInset: [.14, .05]
		},
		{
			id: "internalStorage",
			label: "内部存储",
			group: "flowchart",
			textInset: [.18, .24]
		},
		{
			id: "file",
			label: "文件",
			group: "flowchart",
			textInset: [.06, .2]
		},
		{
			id: "or",
			label: "或",
			group: "flowchart",
			textInset: [.2, .2]
		},
		{
			id: "summingJunction",
			label: "求和",
			group: "flowchart",
			textInset: [.2, .2]
		},
		{
			id: "text",
			label: "文字",
			group: "basic",
			textInset: [0, 0]
		}
	];
	function shapeKind(id) {
		var _SHAPE_KINDS$find;
		return (_SHAPE_KINDS$find = SHAPE_KINDS.find((kind) => kind.id === id)) !== null && _SHAPE_KINDS$find !== void 0 ? _SHAPE_KINDS$find : SHAPE_KINDS[0];
	}
	const fmt = (n) => String(Math.round(n * 100) / 100);
	function polygonPath(points) {
		return points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${fmt(x)} ${fmt(y)}`).join(" ") + " Z";
	}
	function roundedRect(x, y, w, h, r) {
		const radius = Math.max(0, Math.min(r, w / 2, h / 2));
		if (radius === 0) return polygonPath([
			[x, y],
			[x + w, y],
			[x + w, y + h],
			[x, y + h]
		]);
		const R = fmt(radius);
		return [
			`M${fmt(x + radius)} ${fmt(y)}`,
			`H${fmt(x + w - radius)}`,
			`A${R} ${R} 0 0 1 ${fmt(x + w)} ${fmt(y + radius)}`,
			`V${fmt(y + h - radius)}`,
			`A${R} ${R} 0 0 1 ${fmt(x + w - radius)} ${fmt(y + h)}`,
			`H${fmt(x + radius)}`,
			`A${R} ${R} 0 0 1 ${fmt(x)} ${fmt(y + h - radius)}`,
			`V${fmt(y + radius)}`,
			`A${R} ${R} 0 0 1 ${fmt(x + radius)} ${fmt(y)}`,
			"Z"
		].join(" ");
	}
	function ellipsePath(cx, cy, rx, ry) {
		return `M${fmt(cx - rx)} ${fmt(cy)} A${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(cx + rx)} ${fmt(cy)} A${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(cx - rx)} ${fmt(cy)} Z`;
	}
	/** 正多边形和星形的顶点，内接于宽高给定的椭圆，第一个顶点朝上。 */
	function radialPoints(x, y, w, h, count, inner) {
		const points = [];
		const steps = inner === null ? count : count * 2;
		for (let i = 0; i < steps; i++) {
			const angle = -Math.PI / 2 + i * 2 * Math.PI / steps;
			const scale = inner !== null && i % 2 === 1 ? inner : 1;
			points.push([x + w / 2 + Math.cos(angle) * w * scale / 2, y + h / 2 + Math.sin(angle) * h * scale / 2]);
		}
		return points;
	}
	/** 云的轮廓，在 100×100 的格子里画好，再按实际大小缩放。 */
	const CLOUD = [
		[26, 86],
		[
			12,
			86,
			2,
			74,
			6,
			62
		],
		[
			0,
			50,
			10,
			37,
			24,
			39
		],
		[
			24,
			22,
			44,
			12,
			57,
			22
		],
		[
			66,
			8,
			88,
			12,
			90,
			32
		],
		[
			101,
			36,
			103,
			56,
			93,
			64
		],
		[
			100,
			79,
			86,
			89,
			74,
			86
		]
	];
	/**
	* 形状在 w×h 的方框里的轮廓。strokeWidth 用来往里缩半个线宽，描边就不会被方框切掉。
	* props 里用到 radius（矩形圆角）、sides（多边形边数）、points 和 ratio（星形的角数和内径比例）。
	*/
	function shapeGeometry(kind, w, h, strokeWidth, props) {
		const i = Math.max(0, strokeWidth) / 2;
		const x = i;
		const y = i;
		const W = Math.max(1, w - 2 * i);
		const H = Math.max(1, h - 2 * i);
		const num = (key, fallback) => typeof props[key] === "number" ? props[key] : fallback;
		const details = [];
		const P = (px, py) => [x + px, y + py];
		switch (kind) {
			case "text": return {
				body: "",
				details
			};
			case "ellipse": return {
				body: ellipsePath(x + W / 2, y + H / 2, W / 2, H / 2),
				details
			};
			case "diamond": return {
				body: polygonPath([
					P(W / 2, 0),
					P(W, H / 2),
					P(W / 2, H),
					P(0, H / 2)
				]),
				details
			};
			case "triangle": return {
				body: polygonPath([
					P(W / 2, 0),
					P(W, H),
					P(0, H)
				]),
				details
			};
			case "triangleDown": return {
				body: polygonPath([
					P(0, 0),
					P(W, 0),
					P(W / 2, H)
				]),
				details
			};
			case "polygon": return {
				body: polygonPath(radialPoints(x, y, W, H, Math.max(3, Math.min(60, Math.round(num("sides", 5)))), null)),
				details
			};
			case "star": return {
				body: polygonPath(radialPoints(x, y, W, H, Math.max(3, Math.min(60, Math.round(num("points", 5)))), Math.max(.05, Math.min(1, num("ratio", .45))))),
				details
			};
			case "plus": {
				const t = Math.min(W, H) / 3;
				const cx = W / 2;
				const cy = H / 2;
				return {
					body: polygonPath([
						P(cx - t / 2, 0),
						P(cx + t / 2, 0),
						P(cx + t / 2, cy - t / 2),
						P(W, cy - t / 2),
						P(W, cy + t / 2),
						P(cx + t / 2, cy + t / 2),
						P(cx + t / 2, H),
						P(cx - t / 2, H),
						P(cx - t / 2, cy + t / 2),
						P(0, cy + t / 2),
						P(0, cy - t / 2),
						P(cx - t / 2, cy - t / 2)
					]),
					details
				};
			}
			case "arrowRight":
			case "arrowLeft": {
				const head = Math.min(W * .45, H);
				const pts = [
					[0, H * .25],
					[W - head, H * .25],
					[W - head, 0],
					[W, H / 2],
					[W - head, H],
					[W - head, H * .75],
					[0, H * .75]
				];
				const flip = kind === "arrowLeft";
				return {
					body: polygonPath(pts.map(([px, py]) => P(flip ? W - px : px, py))),
					details
				};
			}
			case "arrowBoth": {
				const head = Math.min(W * .3, H);
				return {
					body: polygonPath([
						P(0, H / 2),
						P(head, 0),
						P(head, H * .25),
						P(W - head, H * .25),
						P(W - head, 0),
						P(W, H / 2),
						P(W - head, H),
						P(W - head, H * .75),
						P(head, H * .75),
						P(head, H)
					]),
					details
				};
			}
			case "chevron": {
				const d = Math.min(W / 3, H / 2);
				return {
					body: polygonPath([
						P(0, 0),
						P(W - d, 0),
						P(W, H / 2),
						P(W - d, H),
						P(0, H),
						P(d, H / 2)
					]),
					details
				};
			}
			case "speechBubble": {
				const bodyH = H * .8;
				const r = Math.min(12, W / 4, bodyH / 4);
				const tailX = Math.min(W * .2, W - r - 4);
				const R = fmt(r);
				return {
					body: [
						`M${fmt(x + r)} ${fmt(y)}`,
						`H${fmt(x + W - r)}`,
						`A${R} ${R} 0 0 1 ${fmt(x + W)} ${fmt(y + r)}`,
						`V${fmt(y + bodyH - r)}`,
						`A${R} ${R} 0 0 1 ${fmt(x + W - r)} ${fmt(y + bodyH)}`,
						`H${fmt(x + tailX + W * .12)}`,
						`L${fmt(x + tailX)} ${fmt(y + H)}`,
						`L${fmt(x + tailX + W * .02)} ${fmt(y + bodyH)}`,
						`H${fmt(x + r)}`,
						`A${R} ${R} 0 0 1 ${fmt(x)} ${fmt(y + bodyH - r)}`,
						`V${fmt(y + r)}`,
						`A${R} ${R} 0 0 1 ${fmt(x + r)} ${fmt(y)}`,
						"Z"
					].join(" "),
					details
				};
			}
			case "cloud": {
				const sx = W / 100;
				const sy = H / 100;
				return {
					body: CLOUD.map((seg, index) => {
						if (index === 0) return `M${fmt(x + seg[0] * sx)} ${fmt(y + seg[1] * sy)}`;
						const c = seg;
						return `C${fmt(x + c[0] * sx)} ${fmt(y + c[1] * sy)} ${fmt(x + c[2] * sx)} ${fmt(y + c[3] * sy)} ${fmt(x + c[4] * sx)} ${fmt(y + c[5] * sy)}`;
					}).join(" ") + " Z",
					details
				};
			}
			case "hexagon": {
				const d = Math.min(W / 4, H / 2);
				return {
					body: polygonPath([
						P(d, 0),
						P(W - d, 0),
						P(W, H / 2),
						P(W - d, H),
						P(d, H),
						P(0, H / 2)
					]),
					details
				};
			}
			case "parallelogram":
			case "parallelogramLeft": {
				const s = Math.min(W * .25, H * .6);
				const pts = [
					[s, 0],
					[W, 0],
					[W - s, H],
					[0, H]
				];
				const flip = kind === "parallelogramLeft";
				return {
					body: polygonPath(pts.map(([px, py]) => P(flip ? W - px : px, py))),
					details
				};
			}
			case "trapezoid": {
				const s = Math.min(W * .2, H * .6);
				return {
					body: polygonPath([
						P(s, 0),
						P(W - s, 0),
						P(W, H),
						P(0, H)
					]),
					details
				};
			}
			case "manualInput": return {
				body: polygonPath([
					P(0, H * .25),
					P(W, 0),
					P(W, H),
					P(0, H)
				]),
				details
			};
			case "cylinder": {
				const rx = W / 2;
				const ry = Math.min(H * .15, W * .25);
				details.push(`M${fmt(x)} ${fmt(y + ry)} A${fmt(rx)} ${fmt(ry)} 0 0 0 ${fmt(x + W)} ${fmt(y + ry)}`);
				return {
					body: `M${fmt(x)} ${fmt(y + ry)} A${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(x + W)} ${fmt(y + ry)} V${fmt(y + H - ry)} A${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(x)} ${fmt(y + H - ry)} Z`,
					details
				};
			}
			case "cylinderHorizontal": {
				const ry = H / 2;
				const rx = Math.min(W * .15, H * .25);
				details.push(`M${fmt(x + W - rx)} ${fmt(y)} A${fmt(rx)} ${fmt(ry)} 0 0 0 ${fmt(x + W - rx)} ${fmt(y + H)}`);
				return {
					body: `M${fmt(x + rx)} ${fmt(y)} H${fmt(x + W - rx)} A${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(x + W - rx)} ${fmt(y + H)} H${fmt(x + rx)} A${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(x + rx)} ${fmt(y)} Z`,
					details
				};
			}
			case "document": {
				const a = H * .1;
				return {
					body: `M${fmt(x)} ${fmt(y)} H${fmt(x + W)} V${fmt(y + H - a)} Q${fmt(x + W * .75)} ${fmt(y + H - 3 * a)} ${fmt(x + W * .5)} ${fmt(y + H - a)} T${fmt(x)} ${fmt(y + H - a)} Z`,
					details
				};
			}
			case "multiDocument": {
				const o = Math.min(W, H) * .07;
				const a = H * .08;
				const fw = W - 2 * o;
				const top = y + 2 * o;
				details.push(`M${fmt(x + o)} ${fmt(top)} V${fmt(y + o)} H${fmt(x + W - o)} V${fmt(y + H - 2 * o - a)}`, `M${fmt(x + 2 * o)} ${fmt(y + o)} V${fmt(y)} H${fmt(x + W)} V${fmt(y + H - 3 * o - a)} H${fmt(x + W - o)}`);
				return {
					body: `M${fmt(x)} ${fmt(top)} H${fmt(x + fw)} V${fmt(y + H - a)} Q${fmt(x + fw * .75)} ${fmt(y + H - 3 * a)} ${fmt(x + fw * .5)} ${fmt(y + H - a)} T${fmt(x)} ${fmt(y + H - a)} Z`,
					details
				};
			}
			case "predefinedProcess": {
				const d = Math.min(W * .1, 16);
				details.push(`M${fmt(x + d)} ${fmt(y)} V${fmt(y + H)}`, `M${fmt(x + W - d)} ${fmt(y)} V${fmt(y + H)}`);
				return {
					body: roundedRect(x, y, W, H, 0),
					details
				};
			}
			case "internalStorage": {
				const dx = Math.min(W * .15, 20);
				const dy = Math.min(H * .2, 20);
				details.push(`M${fmt(x + dx)} ${fmt(y)} V${fmt(y + H)}`, `M${fmt(x)} ${fmt(y + dy)} H${fmt(x + W)}`);
				return {
					body: roundedRect(x, y, W, H, 0),
					details
				};
			}
			case "file": {
				const f = Math.min(W, H) * .22;
				details.push(`M${fmt(x + W - f)} ${fmt(y)} V${fmt(y + f)} H${fmt(x + W)}`);
				return {
					body: polygonPath([
						P(0, 0),
						P(W - f, 0),
						P(W, f),
						P(W, H),
						P(0, H)
					]),
					details
				};
			}
			case "or":
				details.push(`M${fmt(x + W / 2)} ${fmt(y)} V${fmt(y + H)}`, `M${fmt(x)} ${fmt(y + H / 2)} H${fmt(x + W)}`);
				return {
					body: ellipsePath(x + W / 2, y + H / 2, W / 2, H / 2),
					details
				};
			case "summingJunction": {
				const c = Math.SQRT1_2;
				const cx = x + W / 2;
				const cy = y + H / 2;
				const ax = W / 2 * c;
				const ay = H / 2 * c;
				details.push(`M${fmt(cx - ax)} ${fmt(cy - ay)} L${fmt(cx + ax)} ${fmt(cy + ay)}`, `M${fmt(cx + ax)} ${fmt(cy - ay)} L${fmt(cx - ax)} ${fmt(cy + ay)}`);
				return {
					body: ellipsePath(cx, cy, W / 2, H / 2),
					details
				};
			}
			default: return {
				body: roundedRect(x, y, W, H, num("radius", 0)),
				details
			};
		}
	}
	/** 形状里文字区域的位置（相对于形状的左上角）。 */
	function shapeTextBox(kind, w, h) {
		var _shapeKind$textInset;
		const [ix, iy] = (_shapeKind$textInset = shapeKind(kind).textInset) !== null && _shapeKind$textInset !== void 0 ? _shapeKind$textInset : [.06, .06];
		const padX = kind === "text" ? 0 : Math.max(6, w * ix);
		const padY = kind === "text" ? 0 : Math.max(4, h * iy);
		return {
			x: padX,
			y: padY,
			width: Math.max(0, w - 2 * padX),
			height: Math.max(0, h - 2 * padY)
		};
	}
	const SIDES = [
		"top",
		"right",
		"bottom",
		"left"
	];
	const SIDE_DIRECTION = {
		top: {
			x: 0,
			y: -1
		},
		right: {
			x: 1,
			y: 0
		},
		bottom: {
			x: 0,
			y: 1
		},
		left: {
			x: -1,
			y: 0
		}
	};
	function sideAnchor(rect, side) {
		if (side === "top") return {
			x: rect.x + rect.width / 2,
			y: rect.y
		};
		if (side === "bottom") return {
			x: rect.x + rect.width / 2,
			y: rect.y + rect.height
		};
		if (side === "left") return {
			x: rect.x,
			y: rect.y + rect.height / 2
		};
		return {
			x: rect.x + rect.width,
			y: rect.y + rect.height / 2
		};
	}
	/** 线挂在一个方框上、另一头在 toward 时，自动选哪一边：朝着另一头的那一边。 */
	function autoSide(rect, toward) {
		const dx = (toward.x - (rect.x + rect.width / 2)) / Math.max(1, rect.width);
		const dy = (toward.y - (rect.y + rect.height / 2)) / Math.max(1, rect.height);
		if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
		return dy >= 0 ? "bottom" : "top";
	}
	function dominantDirection(from, to) {
		const dx = to.x - from.x;
		const dy = to.y - from.y;
		if (Math.abs(dx) >= Math.abs(dy)) return {
			x: dx >= 0 ? 1 : -1,
			y: 0
		};
		return {
			x: 0,
			y: dy >= 0 ? 1 : -1
		};
	}
	function simplify(points) {
		const result = [];
		for (const p of points) {
			const last = result[result.length - 1];
			if (last && Math.abs(last.x - p.x) < .5 && Math.abs(last.y - p.y) < .5) continue;
			result.push(p);
		}
		for (let k = result.length - 2; k > 0; k--) {
			const a = result[k - 1];
			const b = result[k];
			const c = result[k + 1];
			if (Math.abs(a.x - b.x) < .5 && Math.abs(b.x - c.x) < .5 || Math.abs(a.y - b.y) < .5 && Math.abs(b.y - c.y) < .5) result.splice(k, 1);
		}
		return result;
	}
	/** 折线：只走水平和竖直的线段，从起点所在的那一边出去，从终点所在的那一边进来。 */
	function elbowPoints(start, end) {
		var _start$direction, _end$direction;
		const GAP = 20;
		const S = start.point;
		const E = end.point;
		const ds = (_start$direction = start.direction) !== null && _start$direction !== void 0 ? _start$direction : dominantDirection(S, E);
		const de = (_end$direction = end.direction) !== null && _end$direction !== void 0 ? _end$direction : dominantDirection(E, S);
		const P1 = {
			x: S.x + ds.x * GAP,
			y: S.y + ds.y * GAP
		};
		const P2 = {
			x: E.x + de.x * GAP,
			y: E.y + de.y * GAP
		};
		const startHorizontal = ds.y === 0;
		const endHorizontal = de.y === 0;
		let middle;
		if (startHorizontal && endHorizontal) {
			let mx = (S.x + E.x) / 2;
			if (ds.x > 0 && mx < P1.x || ds.x < 0 && mx > P1.x) mx = P1.x;
			if (de.x > 0 && mx < P2.x || de.x < 0 && mx > P2.x) mx = P2.x;
			middle = [{
				x: mx,
				y: S.y
			}, {
				x: mx,
				y: E.y
			}];
		} else if (!startHorizontal && !endHorizontal) {
			let my = (S.y + E.y) / 2;
			if (ds.y > 0 && my < P1.y || ds.y < 0 && my > P1.y) my = P1.y;
			if (de.y > 0 && my < P2.y || de.y < 0 && my > P2.y) my = P2.y;
			middle = [{
				x: S.x,
				y: my
			}, {
				x: E.x,
				y: my
			}];
		} else if (startHorizontal) {
			const direct = {
				x: E.x,
				y: S.y
			};
			middle = (direct.x - S.x) * ds.x >= GAP && (direct.y - E.y) * de.y >= GAP ? [direct] : [
				P1,
				{
					x: P1.x,
					y: P2.y
				},
				P2
			];
		} else {
			const direct = {
				x: S.x,
				y: E.y
			};
			middle = (direct.y - S.y) * ds.y >= GAP && (direct.x - E.x) * de.x >= GAP ? [direct] : [
				P1,
				{
					x: P2.x,
					y: P1.y
				},
				P2
			];
		}
		return simplify([
			S,
			...middle,
			E
		]);
	}
	/** 折线手动调整过的拐点，写在 props.bends 里：“x,y;x,y”，相对于线的父节点。 */
	function parseBends(text) {
		if (typeof text !== "string" || !text.trim()) return [];
		const points = [];
		for (const pair of text.split(";")) {
			const [x, y] = pair.split(",").map(Number);
			if (Number.isFinite(x) && Number.isFinite(y)) points.push({
				x,
				y
			});
		}
		return points;
	}
	/**
	* 用手动调整过的拐点走折线。两头可能已经移动过，所以先把挨着两头的那个拐点挪一下，
	* 让第一段和最后一段仍然是水平或竖直的；中间各段保持原样。
	*/
	function elbowWithBends(start, end, bends) {
		const S = start.point;
		const E = end.point;
		const inner = bends.map((p) => _objectSpread2({}, p));
		const align = (p, from, direction, preferHorizontal) => {
			if (direction ? direction.y === 0 : preferHorizontal) p.y = from.y;
			else p.x = from.x;
		};
		const first = inner[0];
		const last = inner[inner.length - 1];
		const nearlyHorizontal = (p, from) => Math.abs(p.y - from.y) <= Math.abs(p.x - from.x);
		if (inner.length === 1) inner[0] = (start.direction ? start.direction.y === 0 : nearlyHorizontal(first, S)) ? {
			x: E.x,
			y: S.y
		} : {
			x: S.x,
			y: E.y
		};
		else {
			align(first, S, start.direction, nearlyHorizontal(first, S));
			align(last, E, end.direction, nearlyHorizontal(last, E));
		}
		return simplify([
			S,
			...inner,
			E
		]);
	}
	function angleOf(from, to) {
		return Math.atan2(to.y - from.y, to.x - from.x);
	}
	/** 曲线通过一组拐点（waypoints = [S, ...bends, E]）：每一段是一条三次贝塞尔曲线，返回 [S, C1, C2, P1, C3, C4, P2, ...]。 */
	function curvedPoints(start, end, bends) {
		const S = start.point;
		const E = end.point;
		if (bends.length === 0) {
			var _start$direction2, _end$direction2;
			const distance = Math.hypot(E.x - S.x, E.y - S.y);
			const k = Math.max(30, distance * .4);
			const ds = (_start$direction2 = start.direction) !== null && _start$direction2 !== void 0 ? _start$direction2 : dominantDirection(S, E);
			const de = (_end$direction2 = end.direction) !== null && _end$direction2 !== void 0 ? _end$direction2 : dominantDirection(E, S);
			return [
				S,
				{
					x: S.x + ds.x * k,
					y: S.y + ds.y * k
				},
				{
					x: E.x + de.x * k,
					y: E.y + de.y * k
				},
				E
			];
		}
		const waypoints = [
			S,
			...bends,
			E
		];
		const tangents = waypoints.map((p, i) => {
			if (i === 0) {
				if (start.direction) return start.direction;
				const next = waypoints[1];
				const d = Math.hypot(next.x - p.x, next.y - p.y) || 1;
				return {
					x: (next.x - p.x) / d,
					y: (next.y - p.y) / d
				};
			}
			if (i === waypoints.length - 1) {
				if (end.direction) return {
					x: -end.direction.x,
					y: -end.direction.y
				};
				const prev = waypoints[i - 1];
				const d = Math.hypot(p.x - prev.x, p.y - prev.y) || 1;
				return {
					x: (p.x - prev.x) / d,
					y: (p.y - prev.y) / d
				};
			}
			const prev = waypoints[i - 1];
			const next = waypoints[i + 1];
			const d = Math.hypot(next.x - prev.x, next.y - prev.y) || 1;
			return {
				x: (next.x - prev.x) / d,
				y: (next.y - prev.y) / d
			};
		});
		const result = [S];
		for (let i = 0; i < waypoints.length - 1; i++) {
			const a = waypoints[i];
			const b = waypoints[i + 1];
			const dist = Math.hypot(b.x - a.x, b.y - a.y);
			const k = Math.max(12, dist * .35);
			const ta = tangents[i];
			const tb = tangents[i + 1];
			const c1 = {
				x: a.x + ta.x * k,
				y: a.y + ta.y * k
			};
			const c2 = {
				x: b.x - tb.x * k,
				y: b.y - tb.y * k
			};
			result.push(c1, c2, b);
		}
		return result;
	}
	/** 线的路径。route 为 straight、elbow 或 curved；都可以带手动调整过的拐点（绝对坐标）。 */
	function lineGeometry(route, start, end, bends = []) {
		const S = start.point;
		const E = end.point;
		if (route === "curved") {
			const pts = curvedPoints(start, end, bends);
			return {
				path: pathFromPoints("curved", pts),
				points: pts,
				startAngle: angleOf(pts[1], pts[0]),
				endAngle: angleOf(pts[pts.length - 2], pts[pts.length - 1])
			};
		}
		const points = route === "elbow" ? bends.length > 0 ? elbowWithBends(start, end, bends) : elbowPoints(start, end) : [
			S,
			...bends,
			E
		];
		const safe = points.length >= 2 ? points : [S, {
			x: S.x + 1,
			y: S.y
		}];
		return {
			path: safe.map((p, i) => `${i === 0 ? "M" : "L"}${fmt(p.x)} ${fmt(p.y)}`).join(" "),
			points: safe,
			startAngle: angleOf(safe[1], safe[0]),
			endAngle: angleOf(safe[safe.length - 2], safe[safe.length - 1])
		};
	}
	/** 端头有多长：线要在这里缩回去，免得线头从实心端头里戳出来。 */
	function capInset(cap, strokeWidth) {
		const size = 5 + strokeWidth * 2.5;
		if (cap === "triangle") return size * .85;
		if (cap === "circle") return size * .6;
		if (cap === "diamond") return size * 1.1;
		return 0;
	}
	/**
	* 端头的图形。point 是线的端点，angle 是线在这里的走向（指向外侧）。
	* 返回 filled 为真的要填色，否则只描边。
	*/
	function capShape(cap, point, angle, strokeWidth) {
		const size = 5 + strokeWidth * 2.5;
		const ux = Math.cos(angle);
		const uy = Math.sin(angle);
		const at = (along, across) => `${fmt(point.x - ux * along - uy * across)} ${fmt(point.y - uy * along + ux * across)}`;
		switch (cap) {
			case "arrow": return {
				path: `M${at(size, size * .6)} L${at(0, 0)} L${at(size, -size * .6)}`,
				filled: false
			};
			case "triangle": return {
				path: `M${at(0, 0)} L${at(size, size * .55)} L${at(size, -size * .55)} Z`,
				filled: true
			};
			case "circle": {
				const r = size * .35;
				const c = {
					x: point.x - ux * r,
					y: point.y - uy * r
				};
				return {
					path: ellipsePath(c.x, c.y, r, r),
					filled: true
				};
			}
			case "diamond": return {
				path: `M${at(0, 0)} L${at(size * .55, size * .4)} L${at(size * 1.1, 0)} L${at(size * .55, -size * .4)} Z`,
				filled: true
			};
			case "bar": return {
				path: `M${at(0, size * .6)} L${at(0, -size * .6)}`,
				filled: false
			};
			default: return null;
		}
	}
	/** 把线的一端沿着线往里缩 distance，给实心端头腾地方。只处理直线和折线的端点，曲线也近似用这一段的方向。 */
	function shortenEnd(points, fromStart, distance) {
		if (distance <= 0 || points.length < 2) return points;
		const copy = points.slice();
		const index = fromStart ? 0 : copy.length - 1;
		const neighbor = copy[fromStart ? 1 : copy.length - 2];
		const p = copy[index];
		const length = Math.hypot(p.x - neighbor.x, p.y - neighbor.y);
		if (length < 1) return points;
		const t = Math.min(distance, length - .5) / length;
		copy[index] = {
			x: p.x + (neighbor.x - p.x) * t,
			y: p.y + (neighbor.y - p.y) * t
		};
		return copy;
	}
	/** 曲线或折线的路径文字，按点重新拼。 */
	function pathFromPoints(route, points) {
		if (route === "curved" && points.length >= 4 && (points.length - 1) % 3 === 0) {
			let d = `M${fmt(points[0].x)} ${fmt(points[0].y)}`;
			for (let i = 1; i + 2 < points.length; i += 3) {
				const c1 = points[i];
				const c2 = points[i + 1];
				const p = points[i + 2];
				d += ` C${fmt(c1.x)} ${fmt(c1.y)} ${fmt(c2.x)} ${fmt(c2.y)} ${fmt(p.x)} ${fmt(p.y)}`;
			}
			return d;
		}
		return points.map((p, i) => `${i === 0 ? "M" : "L"}${fmt(p.x)} ${fmt(p.y)}`).join(" ");
	}
	function sideDirection(side) {
		return SIDE_DIRECTION[side];
	}
	function vecAngle(ux, uy, vx, vy) {
		const dot = ux * vx + uy * vy;
		const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
		if (len <= 0) return 0;
		const cos = Math.max(-1, Math.min(1, dot / len));
		const ang = Math.acos(cos);
		return ux * vy - uy * vx < 0 ? -ang : ang;
	}
	function linearizeSvgPath(d) {
		const tokens = d.match(/[MLHVCSQTAZmlhvcsqtaz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g);
		if (!tokens || tokens.length === 0) return [];
		const segs = [];
		const addSeg = (x0, y0, x1, y1) => {
			const len = Math.hypot(x1 - x0, y1 - y0);
			if (len > 1e-6) segs.push({
				a: {
					x: x0,
					y: y0
				},
				b: {
					x: x1,
					y: y1
				},
				len
			});
		};
		let idx = 0;
		let cmd = "M";
		let curX = 0;
		let curY = 0;
		let startX = 0;
		let startY = 0;
		let prevQx = 0;
		let prevQy = 0;
		let lastCmd = "";
		const hasNum = () => idx < tokens.length && !/^[A-Za-z]$/.test(tokens[idx]);
		const nextNum = () => idx < tokens.length ? Number(tokens[idx++]) : 0;
		while (idx < tokens.length) {
			if (/^[A-Za-z]$/.test(tokens[idx])) cmd = tokens[idx++];
			const upper = cmd.toUpperCase();
			if (upper === "M") {
				const x = nextNum();
				const y = nextNum();
				curX = startX = x;
				curY = startY = y;
				lastCmd = "M";
				cmd = "L";
				continue;
			}
			if (upper === "L") {
				const x = nextNum();
				const y = nextNum();
				addSeg(curX, curY, x, y);
				curX = x;
				curY = y;
				lastCmd = "L";
				continue;
			}
			if (upper === "H") {
				const x = nextNum();
				addSeg(curX, curY, x, curY);
				curX = x;
				lastCmd = "H";
				continue;
			}
			if (upper === "V") {
				const y = nextNum();
				addSeg(curX, curY, curX, y);
				curY = y;
				lastCmd = "V";
				continue;
			}
			if (upper === "Q") {
				const x1 = nextNum();
				const y1 = nextNum();
				const x = nextNum();
				const y = nextNum();
				const x0 = curX;
				const y0 = curY;
				const steps = 16;
				let px = x0;
				let py = y0;
				for (let s = 1; s <= steps; s++) {
					const t = s / steps;
					const mt = 1 - t;
					const nx = mt * mt * x0 + 2 * mt * t * x1 + t * t * x;
					const ny = mt * mt * y0 + 2 * mt * t * y1 + t * t * y;
					addSeg(px, py, nx, ny);
					px = nx;
					py = ny;
				}
				prevQx = x1;
				prevQy = y1;
				curX = x;
				curY = y;
				lastCmd = "Q";
				continue;
			}
			if (upper === "T") {
				const x = nextNum();
				const y = nextNum();
				const x1 = lastCmd === "Q" || lastCmd === "T" ? 2 * curX - prevQx : curX;
				const y1 = lastCmd === "Q" || lastCmd === "T" ? 2 * curY - prevQy : curY;
				const x0 = curX;
				const y0 = curY;
				const steps = 16;
				let px = x0;
				let py = y0;
				for (let s = 1; s <= steps; s++) {
					const t = s / steps;
					const mt = 1 - t;
					const nx = mt * mt * x0 + 2 * mt * t * x1 + t * t * x;
					const ny = mt * mt * y0 + 2 * mt * t * y1 + t * t * y;
					addSeg(px, py, nx, ny);
					px = nx;
					py = ny;
				}
				prevQx = x1;
				prevQy = y1;
				curX = x;
				curY = y;
				lastCmd = "T";
				continue;
			}
			if (upper === "C") {
				const x1 = nextNum();
				const y1 = nextNum();
				const x2 = nextNum();
				const y2 = nextNum();
				const x = nextNum();
				const y = nextNum();
				const x0 = curX;
				const y0 = curY;
				const steps = 20;
				let px = x0;
				let py = y0;
				for (let s = 1; s <= steps; s++) {
					const t = s / steps;
					const mt = 1 - t;
					const nx = mt * mt * mt * x0 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x;
					const ny = mt * mt * mt * y0 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y;
					addSeg(px, py, nx, ny);
					px = nx;
					py = ny;
				}
				curX = x;
				curY = y;
				lastCmd = "C";
				continue;
			}
			if (upper === "A") {
				let rx = Math.abs(nextNum());
				let ry = Math.abs(nextNum());
				const phi = nextNum() * Math.PI / 180;
				const largeArc = nextNum() !== 0;
				const sweep = nextNum() !== 0;
				const x = nextNum();
				const y = nextNum();
				const x1 = curX;
				const y1 = curY;
				if (Math.hypot(x - x1, y - y1) > 1e-6) {
					if (rx <= 1e-6 || ry <= 1e-6) addSeg(x1, y1, x, y);
					else {
						const cosPhi = Math.cos(phi);
						const sinPhi = Math.sin(phi);
						const dx2 = (x1 - x) / 2;
						const dy2 = (y1 - y) / 2;
						const x1p = cosPhi * dx2 + sinPhi * dy2;
						const y1p = -sinPhi * dx2 + cosPhi * dy2;
						const lambda = x1p * x1p / (rx * rx) + y1p * y1p / (ry * ry);
						if (lambda > 1) {
							const s = Math.sqrt(lambda);
							rx *= s;
							ry *= s;
						}
						const rx2 = rx * rx;
						const ry2 = ry * ry;
						const x1p2 = x1p * x1p;
						const y1p2 = y1p * y1p;
						const numVal = Math.max(0, rx2 * ry2 - rx2 * y1p2 - ry2 * x1p2);
						const denVal = rx2 * y1p2 + ry2 * x1p2;
						const factor = (largeArc === sweep ? -1 : 1) * (denVal > 0 ? Math.sqrt(numVal / denVal) : 0);
						const cxp = factor * (rx * y1p / ry);
						const cyp = factor * (-(ry * x1p) / rx);
						const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x) / 2;
						const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y) / 2;
						const theta1 = vecAngle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
						let dTheta = vecAngle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
						if (!sweep && dTheta > 0) dTheta -= Math.PI * 2;
						if (sweep && dTheta < 0) dTheta += Math.PI * 2;
						const steps = Math.max(16, Math.ceil(Math.abs(dTheta) / (Math.PI / 24)));
						let px = x1;
						let py = y1;
						for (let s = 1; s <= steps; s++) {
							const ang = theta1 + dTheta * s / steps;
							const nx = s === steps ? x : cx + cosPhi * rx * Math.cos(ang) - sinPhi * ry * Math.sin(ang);
							const ny = s === steps ? y : cy + sinPhi * rx * Math.cos(ang) + cosPhi * ry * Math.sin(ang);
							addSeg(px, py, nx, ny);
							px = nx;
							py = ny;
						}
					}
				}
				curX = x;
				curY = y;
				lastCmd = "A";
				continue;
			}
			if (upper === "Z") {
				addSeg(curX, curY, startX, startY);
				curX = startX;
				curY = startY;
				lastCmd = "Z";
				continue;
			}
			if (hasNum()) nextNum();
		}
		return segs;
	}
	function pointAtSegLength(segs, targetDist) {
		if (segs.length === 0) return {
			x: 0,
			y: 0
		};
		if (targetDist <= 0) return _objectSpread2({}, segs[0].a);
		let acc = 0;
		for (const seg of segs) {
			if (acc + seg.len >= targetDist) {
				const t = seg.len > 0 ? (targetDist - acc) / seg.len : 0;
				return {
					x: seg.a.x + (seg.b.x - seg.a.x) * t,
					y: seg.a.y + (seg.b.y - seg.a.y) * t
				};
			}
			acc += seg.len;
		}
		return _objectSpread2({}, segs[segs.length - 1].b);
	}
	/** 按弧长均匀采样 SVG 路径上的点（不依赖浏览器 DOM）。 */
	function sampleSvgPath(d, count) {
		const segs = linearizeSvgPath(d);
		if (segs.length === 0) return [];
		const total = segs.reduce((sum, s) => sum + s.len, 0);
		const n = count !== null && count !== void 0 ? count : Math.max(32, Math.min(800, Math.round(total / 2)));
		const points = [];
		for (let i = 0; i < n; i++) points.push(pointAtSegLength(segs, total * i / n));
		return points;
	}
	/** 计算 SVG 路径弧长中点坐标（不依赖浏览器 DOM）。 */
	function svgPathMidpoint(d, fallback) {
		const segs = linearizeSvgPath(d);
		if (segs.length === 0) return fallback;
		const total = segs.reduce((sum, s) => sum + s.len, 0);
		if (total <= 0) return fallback;
		return pointAtSegLength(segs, total / 2);
	}
	//#endregion
	//#region standard/Button/component.json
	var component_default$16 = {
		type: "Button",
		label: "按钮",
		description: "标准按钮，支持图标、主次样式与可勾选状态",
		defaultSize: {
			"width": 100,
			"height": 32
		},
		entry: "index.js",
		style: "style.css",
		props: {
			"text": {
				"type": "string",
				"default": "按钮",
				"logic": true
			},
			"icon": {
				"type": "string",
				"default": "",
				"logic": true
			},
			"variant": {
				"type": "string",
				"default": "secondary",
				"logic": true
			},
			"checkable": {
				"type": "boolean",
				"default": false
			},
			"checked": {
				"type": "boolean",
				"default": false,
				"logic": true
			},
			"enabled": {
				"type": "boolean",
				"default": true,
				"logic": true
			}
		},
		events: ["toggle"],
		children: false,
		qt: {
			"widget": "QPushButton",
			"props": {
				"text": "text",
				"icon": "vfIcon",
				"variant": "vfVariant",
				"checkable": "checkable",
				"checked": "checked"
			},
			"events": { "toggle": {
				"signal": "toggled",
				"type": "boolean"
			} }
		}
	};
	//#endregion
	//#region standard/CheckBox/component.json
	var component_default$15 = {
		type: "CheckBox",
		label: "复选框",
		description: "复选框，支持文字和双向绑定布尔状态",
		defaultSize: {
			"width": 140,
			"height": 28
		},
		entry: "index.js",
		style: "style.css",
		props: {
			"text": {
				"type": "string",
				"default": "选项",
				"logic": true
			},
			"value": {
				"type": "boolean",
				"default": false,
				"logic": true
			},
			"enabled": {
				"type": "boolean",
				"default": true,
				"logic": true
			}
		},
		bind: "boolean",
		events: ["change"],
		children: false,
		qt: {
			"widget": "QCheckBox",
			"props": {
				"text": "text",
				"value": "checked"
			},
			"events": { "change": {
				"signal": "toggled",
				"type": "boolean"
			} }
		}
	};
	//#endregion
	//#region standard/ComboBox/component.json
	var component_default$14 = {
		type: "ComboBox",
		label: "下拉框",
		description: "下拉选择框，options 用逗号分隔各选项，支持双向绑定字符串状态",
		defaultSize: {
			"width": 160,
			"height": 32
		},
		entry: "index.js",
		style: "style.css",
		props: {
			"options": {
				"type": "string",
				"default": "",
				"logic": true
			},
			"value": {
				"type": "string",
				"default": "",
				"logic": true
			},
			"enabled": {
				"type": "boolean",
				"default": true,
				"logic": true
			}
		},
		bind: "string",
		events: ["change"],
		children: false,
		qt: {
			"widget": "QComboBox",
			"props": {
				"options": "vfOptions",
				"value": "currentText"
			},
			"events": { "change": {
				"signal": "currentTextChanged",
				"type": "string"
			} }
		}
	};
	//#endregion
	//#region standard/DataForm/component.json
	var component_default$13 = {
		type: "DataForm",
		label: "数据生成表单",
		description: "由结构化数据（各字段名、类型、范围、行列、显示条件）动态生成控件网格并向外发出修改事件",
		defaultSize: {
			"width": 220,
			"height": 180
		},
		entry: "index.js",
		style: "style.css",
		props: {
			"schema": {
				"type": "object",
				"default": {},
				"logic": true
			},
			"values": {
				"type": "object",
				"default": {},
				"logic": true
			},
			"emptyText": {
				"type": "string",
				"default": "当前工具无可调选项"
			},
			"enabled": {
				"type": "boolean",
				"default": true,
				"logic": true
			}
		},
		events: ["change"],
		children: false,
		qt: {
			"widget": "QFrame",
			"props": {
				"schema": "vfSchema",
				"values": "vfValues",
				"emptyText": "vfEmptyText"
			},
			"events": { "change": {
				"signal": "fieldChanged",
				"type": "string"
			} }
		}
	};
	//#endregion
	//#region standard/DialogButtonBox/component.json
	var component_default$12 = {
		type: "DialogButtonBox",
		label: "对话框按钮组",
		description: "对话框底部的标准确认与取消按钮组",
		defaultSize: {
			"width": 220,
			"height": 32
		},
		entry: "index.js",
		style: "style.css",
		props: {
			"buttons": {
				"type": "string",
				"default": "OK,Cancel",
				"logic": true
			},
			"okText": {
				"type": "string",
				"default": "OK",
				"logic": true
			},
			"cancelText": {
				"type": "string",
				"default": "Cancel",
				"logic": true
			},
			"enabled": {
				"type": "boolean",
				"default": true,
				"logic": true
			}
		},
		events: ["accept", "reject"],
		children: false,
		qt: {
			"widget": "QDialogButtonBox",
			"props": {
				"buttons": "vfButtons",
				"okText": "vfOkText",
				"cancelText": "vfCancelText"
			},
			"events": {
				"accept": { "signal": "accepted" },
				"reject": { "signal": "rejected" }
			}
		}
	};
	//#endregion
	//#region standard/FloatBox/component.json
	var component_default$11 = {
		type: "FloatBox",
		label: "浮动嵌入框",
		description: "可在嵌入布局与窗口内浮动面板之间切换的标准容器",
		defaultSize: {
			"width": 220,
			"height": 120
		},
		entry: "index.js",
		style: "style.css",
		props: {
			"title": {
				"type": "string",
				"default": "浮动嵌入框",
				"logic": true
			},
			"floating": {
				"type": "boolean",
				"default": false,
				"logic": true
			},
			"floatX": {
				"type": "number",
				"default": 60,
				"logic": true
			},
			"floatY": {
				"type": "number",
				"default": 80,
				"logic": true
			},
			"floatWidth": {
				"type": "number",
				"default": 220,
				"logic": true
			},
			"floatHeight": {
				"type": "number",
				"default": 120,
				"logic": true
			},
			"headerHeight": {
				"type": "number",
				"default": 24
			},
			"enabled": {
				"type": "boolean",
				"default": true,
				"logic": true
			}
		},
		events: [
			"toggle",
			"change",
			"move"
		],
		children: true,
		qt: {
			"widget": "QFrame",
			"props": {
				"title": "vfTitle",
				"floating": "vfFloating",
				"floatX": "vfFloatX",
				"floatY": "vfFloatY",
				"floatWidth": "vfFloatWidth",
				"floatHeight": "vfFloatHeight"
			},
			"events": {
				"toggle": {
					"signal": "toggled",
					"type": "boolean"
				},
				"change": {
					"signal": "toggled",
					"type": "boolean"
				}
			}
		}
	};
	//#endregion
	//#region standard/Label/component.json
	var component_default$10 = {
		type: "Label",
		label: "文字",
		description: "一行或多行文字，tone 可选 normal、title、muted、error、accent",
		defaultSize: {
			"width": 160,
			"height": 24
		},
		entry: "index.js",
		style: "style.css",
		props: {
			"text": {
				"type": "string",
				"default": "",
				"logic": true
			},
			"tone": {
				"type": "string",
				"default": "normal",
				"logic": true
			},
			"align": {
				"type": "string",
				"default": "left"
			}
		},
		children: false,
		qt: {
			"widget": "QLabel",
			"props": {
				"text": "text",
				"tone": "vfTone",
				"align": "vfAlign"
			},
			"set": { "wordWrap": true }
		}
	};
	//#endregion
	//#region standard/List/component.json
	var component_default$9 = {
		type: "List",
		label: "列表",
		description: "行列表，绑定数组状态 items，支持选中行与拖动重排",
		defaultSize: {
			"width": 220,
			"height": 180
		},
		entry: "index.js",
		style: "style.css",
		props: {
			"items": {
				"type": "array",
				"default": [],
				"logic": true
			},
			"value": {
				"type": "number",
				"default": 0,
				"logic": true
			},
			"emptyText": {
				"type": "string",
				"default": "暂无内容"
			},
			"draggable": {
				"type": "boolean",
				"default": false
			},
			"mutedFrom": {
				"type": "number",
				"default": -1,
				"logic": true
			},
			"enabled": {
				"type": "boolean",
				"default": true,
				"logic": true
			}
		},
		bind: "number",
		events: [
			"change",
			"select",
			"reorder"
		],
		children: false,
		qt: {
			"widget": "QListWidget",
			"props": {
				"items": "vfItems",
				"value": "currentRow",
				"emptyText": "vfEmptyText",
				"draggable": "vfDraggable",
				"mutedFrom": "vfMutedFrom"
			},
			"events": {
				"change": {
					"signal": "currentRowChanged",
					"type": "number"
				},
				"select": {
					"signal": "currentRowChanged",
					"type": "number"
				},
				"reorder": {
					"signal": "itemReordered",
					"type": "string"
				}
			}
		}
	};
	//#endregion
	//#region standard/ScrollBar/component.json
	var component_default$8 = {
		type: "ScrollBar",
		label: "滚动条",
		description: "水平或垂直滚动条，支持范围、步长和双向绑定数字状态",
		defaultSize: {
			"width": 160,
			"height": 16
		},
		entry: "index.js",
		style: "style.css",
		props: {
			"min": {
				"type": "number",
				"default": 0
			},
			"max": {
				"type": "number",
				"default": 100
			},
			"step": {
				"type": "number",
				"default": 1
			},
			"pageStep": {
				"type": "number",
				"default": 10
			},
			"orientation": {
				"type": "string",
				"default": "horizontal"
			},
			"value": {
				"type": "number",
				"default": 0,
				"logic": true
			},
			"enabled": {
				"type": "boolean",
				"default": true,
				"logic": true
			}
		},
		bind: "number",
		events: ["change"],
		children: false,
		qt: {
			"widget": "QScrollBar",
			"props": {
				"min": "minimum",
				"max": "maximum",
				"step": "singleStep",
				"pageStep": "pageStep",
				"orientation": "vfOrientation",
				"value": "value"
			},
			"events": { "change": {
				"signal": "valueChanged",
				"type": "number"
			} }
		}
	};
	//#endregion
	//#region standard/Separator/component.json
	var component_default$7 = {
		type: "Separator",
		label: "分隔线",
		description: "水平或垂直分隔线，orientation 可选 horizontal、vertical",
		defaultSize: {
			"width": 200,
			"height": 8
		},
		entry: "index.js",
		style: "style.css",
		props: { "orientation": {
			"type": "string",
			"default": "horizontal"
		} },
		children: false,
		qt: {
			"widget": "QFrame",
			"props": { "orientation": "vfOrientation" },
			"set": {
				"frameShape": 4,
				"frameShadow": 48
			}
		}
	};
	//#endregion
	//#region standard/Slider/component.json
	var component_default$6 = {
		type: "Slider",
		label: "滑条",
		description: "数值滑条，支持最小最大值、步长、方向和双向绑定数字状态",
		defaultSize: {
			"width": 160,
			"height": 24
		},
		entry: "index.js",
		style: "style.css",
		props: {
			"min": {
				"type": "number",
				"default": 0,
				"logic": true
			},
			"max": {
				"type": "number",
				"default": 100,
				"logic": true
			},
			"step": {
				"type": "number",
				"default": 1
			},
			"orientation": {
				"type": "string",
				"default": "horizontal"
			},
			"value": {
				"type": "number",
				"default": 0,
				"logic": true
			},
			"enabled": {
				"type": "boolean",
				"default": true,
				"logic": true
			}
		},
		bind: "number",
		events: ["change"],
		children: false,
		qt: {
			"widget": "QSlider",
			"props": {
				"min": "minimum",
				"max": "maximum",
				"step": "singleStep",
				"orientation": "vfOrientation",
				"value": "value"
			},
			"events": { "change": {
				"signal": "valueChanged",
				"type": "number"
			} }
		}
	};
	//#endregion
	//#region standard/Spacer/component.json
	var component_default$5 = {
		type: "Spacer",
		label: "占位区",
		description: "排版中的弹性或固定空白占位区",
		defaultSize: {
			"width": 24,
			"height": 24
		},
		entry: "index.js",
		style: "style.css",
		props: { "orientation": {
			"type": "string",
			"default": "horizontal"
		} },
		children: false,
		qt: {
			"widget": "QWidget",
			"props": { "orientation": "vfOrientation" }
		}
	};
	//#endregion
	//#region standard/SpinBox/component.json
	var component_default$4 = {
		type: "SpinBox",
		label: "数字框",
		description: "数值输入框，支持最小最大值、步长、后缀和双向绑定数字状态",
		defaultSize: {
			"width": 120,
			"height": 32
		},
		entry: "index.js",
		style: "style.css",
		props: {
			"min": {
				"type": "number",
				"default": 0
			},
			"max": {
				"type": "number",
				"default": 9999
			},
			"step": {
				"type": "number",
				"default": 1
			},
			"suffix": {
				"type": "string",
				"default": ""
			},
			"value": {
				"type": "number",
				"default": 0,
				"logic": true
			},
			"enabled": {
				"type": "boolean",
				"default": true,
				"logic": true
			}
		},
		bind: "number",
		events: ["change"],
		children: false,
		qt: {
			"widget": "QSpinBox",
			"props": {
				"min": "minimum",
				"max": "maximum",
				"step": "singleStep",
				"suffix": "suffix",
				"value": "value"
			},
			"events": { "change": {
				"signal": "valueChanged",
				"type": "number"
			} }
		}
	};
	//#endregion
	//#region standard/TabBar/component.json
	var component_default$3 = {
		type: "TabBar",
		label: "页签栏",
		description: "页签切换栏，tabs 用逗号分隔各页签名，支持双向绑定当前页签序号",
		defaultSize: {
			"width": 220,
			"height": 28
		},
		entry: "index.js",
		style: "style.css",
		props: {
			"tabs": {
				"type": "string",
				"default": "Tab 1,Tab 2",
				"logic": true
			},
			"value": {
				"type": "number",
				"default": 0,
				"logic": true
			},
			"enabled": {
				"type": "boolean",
				"default": true,
				"logic": true
			}
		},
		bind: "number",
		events: ["change"],
		children: false,
		qt: {
			"widget": "QTabBar",
			"props": {
				"tabs": "vfTabs",
				"value": "currentIndex"
			},
			"events": { "change": {
				"signal": "currentChanged",
				"type": "number"
			} }
		}
	};
	//#endregion
	//#region standard/TextArea/component.json
	var component_default$2 = {
		type: "TextArea",
		label: "多行文本",
		description: "多行文本编辑框，支持占位提示、只读和双向绑定字符串状态",
		defaultSize: {
			"width": 220,
			"height": 100
		},
		entry: "index.js",
		style: "style.css",
		props: {
			"placeholder": {
				"type": "string",
				"default": "",
				"logic": true
			},
			"value": {
				"type": "string",
				"default": "",
				"logic": true
			},
			"readOnly": {
				"type": "boolean",
				"default": false,
				"logic": true
			},
			"enabled": {
				"type": "boolean",
				"default": true,
				"logic": true
			}
		},
		bind: "string",
		events: ["change"],
		children: false,
		qt: {
			"widget": "QPlainTextEdit",
			"props": {
				"placeholder": "placeholderText",
				"value": "plainText",
				"readOnly": "readOnly"
			},
			"events": { "change": {
				"signal": "textChanged",
				"type": "string"
			} }
		}
	};
	//#endregion
	//#region standard/TextInput/component.json
	var component_default$1 = {
		type: "TextInput",
		label: "输入框",
		description: "单行文本输入框，支持双向绑定字符串状态",
		defaultSize: {
			"width": 200,
			"height": 32
		},
		entry: "index.js",
		style: "style.css",
		props: {
			"placeholder": {
				"type": "string",
				"default": "",
				"logic": true
			},
			"value": {
				"type": "string",
				"default": "",
				"logic": true
			},
			"enabled": {
				"type": "boolean",
				"default": true,
				"logic": true
			}
		},
		bind: "string",
		events: ["change"],
		children: false,
		qt: {
			"widget": "QLineEdit",
			"props": {
				"placeholder": "placeholderText",
				"value": "text"
			},
			"events": { "change": {
				"signal": "textEdited",
				"type": "string"
			} }
		}
	};
	//#endregion
	//#region standard/Tree/component.json
	var component_default = {
		type: "Tree",
		label: "树",
		description: "层级树控件，支持分组展开折叠、勾选框、选中行与拖动重排",
		defaultSize: {
			"width": 220,
			"height": 180
		},
		entry: "index.js",
		style: "style.css",
		props: {
			"items": {
				"type": "array",
				"default": [],
				"logic": true
			},
			"value": {
				"type": "number",
				"default": 0,
				"logic": true
			},
			"checkable": {
				"type": "boolean",
				"default": true
			},
			"draggable": {
				"type": "boolean",
				"default": true
			},
			"emptyText": {
				"type": "string",
				"default": "暂无内容"
			},
			"enabled": {
				"type": "boolean",
				"default": true,
				"logic": true
			}
		},
		bind: "number",
		events: [
			"change",
			"select",
			"toggleCheck",
			"toggleCollapse",
			"reorder"
		],
		children: false,
		qt: {
			"widget": "QTreeWidget",
			"props": {
				"items": "vfItems",
				"value": "currentRow",
				"checkable": "vfCheckable",
				"draggable": "vfDraggable",
				"emptyText": "vfEmptyText"
			},
			"events": {
				"change": {
					"signal": "currentRowChanged",
					"type": "number"
				},
				"select": {
					"signal": "currentRowChanged",
					"type": "number"
				},
				"toggleCheck": {
					"signal": "itemCheckToggled",
					"type": "string"
				},
				"toggleCollapse": {
					"signal": "itemCollapseToggled",
					"type": "string"
				},
				"reorder": {
					"signal": "itemReordered",
					"type": "string"
				}
			}
		}
	};
	//#endregion
	//#region standard/index.ts
	const ICONS = {
		arrow: "<path d=\"M5 3l12 7-5 1.5L9.5 16 5 3z\" fill=\"currentColor\"/>",
		pen: "<path d=\"M14.5 2.5l3 3-9.5 9.5-3.5.5.5-3.5 9.5-9.5zm-8.5 11l-1 1\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"none\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>",
		brush: "<path d=\"M14.5 2.5l3 3-8.5 8.5c-1.5 1.5-3.5 2-5 1.5.5-1.5 0-3.5 1.5-5l8.5-8.5z\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"none\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>",
		eraser: "<path d=\"M11 4l6 6-7 7H5l-2-2 8-11zm-4 13h10\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"none\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>",
		fill: "<path d=\"M9 3l6 6-6 6-6-6 6-6zm7 9c1.2 1.5 2 2.7 2 3.8a2 2 0 1 1-4 0c0-1.1.8-2.3 2-3.8z\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"none\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>",
		bucket: "<path d=\"M9 3l6 6-6 6-6-6 6-6zm7 9c1.2 1.5 2 2.7 2 3.8a2 2 0 1 1-4 0c0-1.1.8-2.3 2-3.8z\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"none\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>",
		shape: "<rect x=\"3.5\" y=\"3.5\" width=\"8.5\" height=\"8.5\" rx=\"1\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"none\"/><circle cx=\"13\" cy=\"13\" r=\"4\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"none\"/>",
		move: "<path d=\"M10 3v14M3 10h14M10 3l-2.5 2.5M10 3l2.5 2.5M10 17l-2.5-2.5M10 17l2.5-2.5M3 10l2.5-2.5M3 10l2.5 2.5M17 10l-2.5-2.5M17 10l-2.5 2.5\" stroke=\"currentColor\" stroke-width=\"1.4\" fill=\"none\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>",
		lasso: "<path d=\"M10 4c4 0 6.5 2.2 6.5 5s-2.5 5-6.5 5c-1.8 0-3.3-.4-4.5-1.2M6 13a2 2 0 1 0 0 4 2 2 0 0 0 0-4z\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"none\" stroke-linecap=\"round\"/>",
		eyedropper: "<path d=\"M13.5 3.5l3 3-2 2-3-3 2-2zm-3 3l3 3-6.5 6.5H4v-3l6.5-6.5z\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"none\" stroke-linejoin=\"round\"/>",
		transfer: "<path d=\"M4 7h11m-3-3l3 3-3 3M16 13H5m3-3l-3 3 3 3\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"none\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>",
		remap: "<path d=\"M4 7h11m-3-3l3 3-3 3M16 13H5m3-3l-3 3 3 3\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"none\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>",
		connect: "<path d=\"M5 15c2-6 8-6 10-10M5 15a1.5 1.5 0 1 0 0 .1zm10-10a1.5 1.5 0 1 0 0 .1z\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"none\" stroke-linecap=\"round\"/>",
		hline: "<path d=\"M3 10h14M6 6v8m8-8v8\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"none\" stroke-linecap=\"round\"/>",
		vline: "<path d=\"M10 3v14M6 6h8m-8 8h8\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"none\" stroke-linecap=\"round\"/>",
		area: "<rect x=\"3.5\" y=\"4.5\" width=\"13\" height=\"11\" rx=\"1.5\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-dasharray=\"2.5 2\" fill=\"none\"/>",
		addline: "<path d=\"M4 14L14 4m-3 11h5m-2.5-2.5v5\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"none\" stroke-linecap=\"round\"/>",
		automap: "<path d=\"M10 3l2 4.5L16.5 9 12 11l-2 4.5L8 11 3.5 9 8 7.5 10 3z\" stroke=\"currentColor\" stroke-width=\"1.4\" fill=\"none\" stroke-linejoin=\"round\"/>",
		plus: "<path d=\"M10 4v12M4 10h12\" stroke=\"currentColor\" stroke-width=\"1.7\" fill=\"none\" stroke-linecap=\"round\"/>",
		add: "<path d=\"M10 4v12M4 10h12\" stroke=\"currentColor\" stroke-width=\"1.7\" fill=\"none\" stroke-linecap=\"round\"/>",
		minus: "<path d=\"M4 10h12\" stroke=\"currentColor\" stroke-width=\"1.7\" fill=\"none\" stroke-linecap=\"round\"/>",
		remove: "<path d=\"M4 10h12\" stroke=\"currentColor\" stroke-width=\"1.7\" fill=\"none\" stroke-linecap=\"round\"/>",
		duplicate: "<rect x=\"6.5\" y=\"6.5\" width=\"9\" height=\"9\" rx=\"1.2\" stroke=\"currentColor\" stroke-width=\"1.4\" fill=\"none\"/><path d=\"M4.5 12.5V5a1 1 0 0 1 1-1h7.5\" stroke=\"currentColor\" stroke-width=\"1.4\" fill=\"none\" stroke-linecap=\"round\"/>",
		folder: "<path d=\"M3 6a1.5 1.5 0 0 1 1.5-1.5h3.5l1.5 2h6A1.5 1.5 0 0 1 17 8v6.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5V6z\" stroke=\"currentColor\" stroke-width=\"1.4\" fill=\"none\" stroke-linejoin=\"round\"/>",
		eye: "<path d=\"M2.5 10s3-5 7.5-5 7.5 5 7.5 5-3 5-7.5 5-7.5-5-7.5-5z\" stroke=\"currentColor\" stroke-width=\"1.4\" fill=\"none\"/><circle cx=\"10\" cy=\"10\" r=\"2.2\" stroke=\"currentColor\" stroke-width=\"1.4\" fill=\"none\"/>",
		lock: "<rect x=\"4.5\" y=\"9\" width=\"11\" height=\"7.5\" rx=\"1.5\" stroke=\"currentColor\" stroke-width=\"1.4\" fill=\"none\"/><path d=\"M7 9V6.5a3 3 0 0 1 6 0V9\" stroke=\"currentColor\" stroke-width=\"1.4\" fill=\"none\"/>",
		unselect: "<rect x=\"4\" y=\"4\" width=\"12\" height=\"12\" rx=\"1.5\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-dasharray=\"2.5 2\" fill=\"none\"/><path d=\"M7 7l6 6M13 7l-6 6\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linecap=\"round\"/>",
		to_layer: "<path d=\"M4 13l6 3 6-3M4 9l6 3 6-3M10 3v6m-2.5-2L10 9.5 12.5 7\" stroke=\"currentColor\" stroke-width=\"1.4\" fill=\"none\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>",
		float: "<rect x=\"3.5\" y=\"4.5\" width=\"13\" height=\"11\" rx=\"1.5\" stroke=\"currentColor\" stroke-width=\"1.4\" fill=\"none\"/><path d=\"M11 4.5v4.5h5.5\" stroke=\"currentColor\" stroke-width=\"1.4\" fill=\"none\"/>",
		play: "<path d=\"M6 4.5l10 5.5-10 5.5V4.5z\" fill=\"currentColor\"/>",
		pause: "<path d=\"M6.5 4.5h2.5v11H6.5zm4.5 0h2.5v11H11z\" fill=\"currentColor\"/>",
		prev: "<path d=\"M5.5 5v10M14.5 5l-7 5 7 5V5z\" stroke=\"currentColor\" stroke-width=\"1.4\" fill=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>",
		next: "<path d=\"M14.5 5v10M5.5 5l7 5-7 5V5z\" stroke=\"currentColor\" stroke-width=\"1.4\" fill=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>",
		loop: "<path d=\"M14 6l2 2-2 2M6 14l-2-2 2-2M4 10V8a2 2 0 0 1 2-2h10m0 4v2a2 2 0 0 1-2 2H4\" stroke=\"currentColor\" stroke-width=\"1.4\" fill=\"none\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>",
		onion: "<circle cx=\"8.5\" cy=\"10\" r=\"4.5\" stroke=\"currentColor\" stroke-width=\"1.4\" fill=\"none\"/><circle cx=\"11.5\" cy=\"10\" r=\"4.5\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-dasharray=\"2 1.5\" fill=\"none\"/>",
		clear: "<path d=\"M5 5l10 10M15 5L5 15\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"none\" stroke-linecap=\"round\"/>",
		hold: "<path d=\"M5 5v10m4-10v10m3-5h4m-2-2v4\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"none\" stroke-linecap=\"round\"/>"
	};
	const createLabel = (el, { props }) => {
		const label = document.createElement("div");
		label.className = "vf-std-label";
		el.append(label);
		const update = (next) => {
			var _next$text, _next$tone, _next$align;
			label.textContent = String((_next$text = next.text) !== null && _next$text !== void 0 ? _next$text : "");
			label.dataset.tone = String((_next$tone = next.tone) !== null && _next$tone !== void 0 ? _next$tone : "normal");
			label.dataset.align = String((_next$align = next.align) !== null && _next$align !== void 0 ? _next$align : "left");
		};
		update(props);
		return {
			update,
			destroy: () => label.remove()
		};
	};
	const createButton = (el, { props, emit }) => {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "vf-std-button";
		let current = props;
		button.addEventListener("click", () => {
			if (current.enabled === false) return;
			if (current.checkable) emit("toggle", !current.checked);
		});
		el.append(button);
		const update = (next) => {
			var _next$icon, _next$text2, _next$variant;
			current = next;
			const iconName = String((_next$icon = next.icon) !== null && _next$icon !== void 0 ? _next$icon : "").trim();
			const text = String((_next$text2 = next.text) !== null && _next$text2 !== void 0 ? _next$text2 : "");
			if (iconName && ICONS[iconName]) {
				const svg = `<svg viewBox="0 0 20 20" width="14" height="14" style="flex-shrink:0;display:block">${ICONS[iconName]}</svg>`;
				const span = text ? `<span style="overflow:hidden;text-overflow:ellipsis">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</span>` : "";
				button.innerHTML = svg + span;
				button.dataset.hasIcon = "true";
			} else {
				button.textContent = text;
				delete button.dataset.hasIcon;
			}
			button.dataset.variant = String((_next$variant = next.variant) !== null && _next$variant !== void 0 ? _next$variant : "secondary");
			button.dataset.checked = String(Boolean(next.checked));
			button.disabled = next.enabled === false;
		};
		update(props);
		return {
			update,
			destroy: () => button.remove()
		};
	};
	const createTextInput = (el, { props, emit }) => {
		const input = document.createElement("input");
		input.type = "text";
		input.className = "vf-std-input";
		input.addEventListener("input", () => emit("change", input.value));
		el.append(input);
		const update = (next) => {
			var _next$placeholder, _next$value;
			input.placeholder = String((_next$placeholder = next.placeholder) !== null && _next$placeholder !== void 0 ? _next$placeholder : "");
			input.disabled = next.enabled === false;
			const value = String((_next$value = next.value) !== null && _next$value !== void 0 ? _next$value : "");
			if (input.value !== value) input.value = value;
		};
		update(props);
		return {
			update,
			destroy: () => input.remove()
		};
	};
	const createTextArea = (el, { props, emit }) => {
		const area = document.createElement("textarea");
		area.className = "vf-std-textarea";
		area.addEventListener("input", () => emit("change", area.value));
		el.append(area);
		const update = (next) => {
			var _next$placeholder2, _next$value2;
			area.placeholder = String((_next$placeholder2 = next.placeholder) !== null && _next$placeholder2 !== void 0 ? _next$placeholder2 : "");
			area.readOnly = Boolean(next.readOnly);
			area.disabled = next.enabled === false;
			const value = String((_next$value2 = next.value) !== null && _next$value2 !== void 0 ? _next$value2 : "");
			if (area.value !== value) area.value = value;
		};
		update(props);
		return {
			update,
			destroy: () => area.remove()
		};
	};
	const createSpinBox = (el, { props, emit }) => {
		const wrap = document.createElement("div");
		wrap.className = "vf-std-spinbox";
		const input = document.createElement("input");
		input.type = "number";
		input.className = "vf-std-spinbox-input";
		const suffix = document.createElement("span");
		suffix.className = "vf-std-spinbox-suffix";
		wrap.append(input, suffix);
		el.append(wrap);
		let min = 0;
		let max = 9999;
		const clamp = (n) => Math.max(min, Math.min(max, n));
		input.addEventListener("input", () => {
			const n = Number(input.value);
			if (Number.isFinite(n)) {
				const clamped = clamp(n);
				if (input.value !== String(clamped)) input.value = String(clamped);
				emit("change", clamped);
			}
		});
		const update = (next) => {
			var _next$min, _next$max, _next$step, _next$value3, _next$suffix;
			min = Number((_next$min = next.min) !== null && _next$min !== void 0 ? _next$min : 0);
			max = Number((_next$max = next.max) !== null && _next$max !== void 0 ? _next$max : 9999);
			input.min = String(min);
			input.max = String(max);
			input.step = String((_next$step = next.step) !== null && _next$step !== void 0 ? _next$step : 1);
			input.disabled = next.enabled === false;
			const raw = Number((_next$value3 = next.value) !== null && _next$value3 !== void 0 ? _next$value3 : 0);
			const val = String(Number.isFinite(raw) ? clamp(raw) : min);
			if (input.value !== val) input.value = val;
			const sfx = String((_next$suffix = next.suffix) !== null && _next$suffix !== void 0 ? _next$suffix : "");
			suffix.textContent = sfx;
			suffix.hidden = !sfx;
		};
		update(props);
		return {
			update,
			destroy: () => wrap.remove()
		};
	};
	const createSlider = (el, { props, emit }) => {
		const wrap = document.createElement("div");
		wrap.className = "vf-std-slider";
		const input = document.createElement("input");
		input.type = "range";
		input.className = "vf-std-slider-input";
		wrap.append(input);
		el.append(wrap);
		input.addEventListener("input", () => emit("change", Number(input.value)));
		const update = (next) => {
			var _next$min2, _next$max2, _next$step2, _next$value4, _next$orientation;
			const min = Number((_next$min2 = next.min) !== null && _next$min2 !== void 0 ? _next$min2 : 0);
			const max = Number((_next$max2 = next.max) !== null && _next$max2 !== void 0 ? _next$max2 : 100);
			const step = Number((_next$step2 = next.step) !== null && _next$step2 !== void 0 ? _next$step2 : 1);
			const val = Number((_next$value4 = next.value) !== null && _next$value4 !== void 0 ? _next$value4 : 0);
			input.min = String(min);
			input.max = String(max);
			input.step = String(step > 0 ? step : 1);
			if (Number(input.value) !== val) input.value = String(val);
			input.disabled = next.enabled === false;
			wrap.dataset.orientation = String((_next$orientation = next.orientation) !== null && _next$orientation !== void 0 ? _next$orientation : "horizontal");
		};
		update(props);
		return {
			update,
			destroy: () => wrap.remove()
		};
	};
	const createScrollBar = (el, { props, emit }) => {
		const track = document.createElement("div");
		track.className = "vf-std-scrollbar";
		const thumb = document.createElement("div");
		thumb.className = "vf-std-scrollbar-thumb";
		track.append(thumb);
		el.append(track);
		let current = props;
		const update = (next) => {
			var _next$min3, _next$max3, _next$pageStep, _next$value5;
			current = next;
			const min = Number((_next$min3 = next.min) !== null && _next$min3 !== void 0 ? _next$min3 : 0);
			const max = Math.max(min, Number((_next$max3 = next.max) !== null && _next$max3 !== void 0 ? _next$max3 : 100));
			const page = Math.max(1, Number((_next$pageStep = next.pageStep) !== null && _next$pageStep !== void 0 ? _next$pageStep : 10));
			const val = Math.min(max, Math.max(min, Number((_next$value5 = next.value) !== null && _next$value5 !== void 0 ? _next$value5 : 0)));
			const range = Math.max(1, max - min);
			const ratio = Math.min(.85, Math.max(.15, page / (range + page)));
			const posRatio = max > min ? (val - min) / (max - min) : 0;
			const vertical = next.orientation === "vertical";
			track.dataset.orientation = vertical ? "vertical" : "horizontal";
			track.dataset.disabled = String(next.enabled === false);
			if (vertical) {
				thumb.style.left = "1px";
				thumb.style.right = "1px";
				thumb.style.width = "auto";
				thumb.style.height = `${ratio * 100}%`;
				thumb.style.top = `${(1 - ratio) * posRatio * 100}%`;
			} else {
				thumb.style.top = "1px";
				thumb.style.bottom = "1px";
				thumb.style.height = "auto";
				thumb.style.width = `${ratio * 100}%`;
				thumb.style.left = `${(1 - ratio) * posRatio * 100}%`;
			}
		};
		track.addEventListener("mousedown", (ev) => {
			var _current$min, _current$max, _current$step;
			if (current.enabled === false) return;
			const rect = track.getBoundingClientRect();
			const min = Number((_current$min = current.min) !== null && _current$min !== void 0 ? _current$min : 0);
			const max = Math.max(min, Number((_current$max = current.max) !== null && _current$max !== void 0 ? _current$max : 100));
			const step = Math.max(1, Number((_current$step = current.step) !== null && _current$step !== void 0 ? _current$step : 1));
			const frac = current.orientation === "vertical" ? (ev.clientY - rect.top) / Math.max(1, rect.height) : (ev.clientX - rect.left) / Math.max(1, rect.width);
			emit("change", Math.min(max, Math.max(min, Math.round((min + Math.min(1, Math.max(0, frac)) * (max - min)) / step) * step)));
		});
		update(props);
		return {
			update,
			destroy: () => track.remove()
		};
	};
	const createComboBox = (el, { props, emit }) => {
		const select = document.createElement("select");
		select.className = "vf-std-combobox";
		let lastOptions = "";
		select.addEventListener("change", () => emit("change", select.value));
		el.append(select);
		const update = (next) => {
			var _next$options, _next$value6;
			const rawOptions = Array.isArray(next.options) ? next.options.map(String).join(",") : String((_next$options = next.options) !== null && _next$options !== void 0 ? _next$options : "");
			if (rawOptions !== lastOptions) {
				lastOptions = rawOptions;
				select.replaceChildren();
				for (const item of rawOptions.split(",").map((s) => s.trim()).filter(Boolean)) {
					const opt = document.createElement("option");
					opt.value = item;
					opt.textContent = item;
					select.append(opt);
				}
			}
			select.disabled = next.enabled === false;
			const val = String((_next$value6 = next.value) !== null && _next$value6 !== void 0 ? _next$value6 : "");
			if (val && select.value !== val) select.value = val;
		};
		update(props);
		return {
			update,
			destroy: () => select.remove()
		};
	};
	const createCheckBox = (el, { props, emit }) => {
		const label = document.createElement("label");
		label.className = "vf-std-checkbox";
		const box = document.createElement("input");
		box.type = "checkbox";
		const text = document.createElement("span");
		label.append(box, text);
		el.append(label);
		box.addEventListener("change", () => emit("change", box.checked));
		const update = (next) => {
			var _next$text3;
			box.checked = Boolean(next.value);
			box.disabled = next.enabled === false;
			text.textContent = String((_next$text3 = next.text) !== null && _next$text3 !== void 0 ? _next$text3 : "");
			label.dataset.disabled = String(next.enabled === false);
		};
		update(props);
		return {
			update,
			destroy: () => label.remove()
		};
	};
	const createTabBar = (el, { props, emit }) => {
		const bar = document.createElement("div");
		bar.className = "vf-std-tabbar";
		el.append(bar);
		const parseTabs = (raw) => {
			if (Array.isArray(raw)) return raw.map((it, i) => {
				var _ref, _ref2, _it$label;
				return typeof it === "object" && it !== null && !Array.isArray(it) ? String((_ref = (_ref2 = (_it$label = it.label) !== null && _it$label !== void 0 ? _it$label : it.title) !== null && _ref2 !== void 0 ? _ref2 : it.name) !== null && _ref !== void 0 ? _ref : i) : String(it);
			});
			return String(raw !== null && raw !== void 0 ? raw : "").split(",").map((s) => s.trim()).filter(Boolean);
		};
		const update = (next) => {
			var _next$tabs, _next$value7;
			bar.replaceChildren();
			const tabs = parseTabs((_next$tabs = next.tabs) !== null && _next$tabs !== void 0 ? _next$tabs : "");
			const cur = Number((_next$value7 = next.value) !== null && _next$value7 !== void 0 ? _next$value7 : 0);
			const disabled = next.enabled === false;
			tabs.forEach((label, idx) => {
				const btn = document.createElement("button");
				btn.type = "button";
				btn.dataset.vfTab = String(idx);
				btn.className = "vf-std-tabbar-tab" + (idx === cur ? " active" : "");
				btn.textContent = label;
				btn.disabled = disabled;
				btn.addEventListener("click", () => {
					if (disabled) return;
					if (idx !== cur) emit("change", idx);
				});
				bar.append(btn);
			});
		};
		update(props);
		return {
			update,
			destroy: () => bar.remove()
		};
	};
	const createList = (el, { props, emit }) => {
		const container = document.createElement("div");
		container.className = "vf-std-list";
		el.append(container);
		let dragFrom = -1;
		const itemLabel = (item) => {
			if (item && typeof item === "object" && !Array.isArray(item)) {
				var _ref3, _ref4, _ref5, _ref6, _item$name;
				return String((_ref3 = (_ref4 = (_ref5 = (_ref6 = (_item$name = item.name) !== null && _item$name !== void 0 ? _item$name : item.label) !== null && _ref6 !== void 0 ? _ref6 : item.title) !== null && _ref5 !== void 0 ? _ref5 : item.text) !== null && _ref4 !== void 0 ? _ref4 : item.id) !== null && _ref3 !== void 0 ? _ref3 : "");
			}
			return String(item !== null && item !== void 0 ? item : "");
		};
		const update = (next) => {
			container.replaceChildren();
			const disabled = next.enabled === false;
			container.dataset.disabled = String(disabled);
			const items = Array.isArray(next.items) ? next.items : [];
			const selected = typeof next.value === "number" ? next.value : 0;
			const draggable = Boolean(next.draggable);
			const mutedFrom = typeof next.mutedFrom === "number" ? next.mutedFrom : -1;
			if (items.length === 0) {
				var _next$emptyText;
				const empty = document.createElement("div");
				empty.className = "vf-std-list-empty";
				empty.textContent = String((_next$emptyText = next.emptyText) !== null && _next$emptyText !== void 0 ? _next$emptyText : "暂无内容");
				container.append(empty);
				return;
			}
			items.forEach((item, index) => {
				const isObj = item !== null && typeof item === "object" && !Array.isArray(item);
				const muted = isObj && Boolean(item.muted) || mutedFrom >= 0 && index >= mutedFrom;
				const row = document.createElement("div");
				row.dataset.vfRow = String(index);
				row.className = "vf-std-list-row" + (index === selected ? " selected" : "") + (muted ? " muted" : "");
				const text = document.createElement("span");
				text.className = "vf-std-list-text";
				text.textContent = itemLabel(item);
				row.append(text);
				if (isObj && item.badge !== void 0 && item.badge !== "") {
					const badge = document.createElement("span");
					badge.className = "vf-std-list-badge";
					badge.textContent = String(item.badge);
					row.append(badge);
				}
				row.addEventListener("click", () => {
					if (disabled) return;
					emit("select", index);
					if (index !== selected) emit("change", index);
				});
				if (draggable) {
					row.draggable = true;
					row.addEventListener("dragstart", (ev) => {
						dragFrom = index;
						if (ev.dataTransfer) {
							ev.dataTransfer.effectAllowed = "move";
							ev.dataTransfer.setData("text/plain", String(index));
						}
					});
					row.addEventListener("dragover", (ev) => {
						ev.preventDefault();
						if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
					});
					row.addEventListener("drop", (ev) => {
						var _ev$dataTransfer$getD, _ev$dataTransfer;
						ev.preventDefault();
						if (disabled) return;
						const from = dragFrom >= 0 ? dragFrom : Number((_ev$dataTransfer$getD = (_ev$dataTransfer = ev.dataTransfer) === null || _ev$dataTransfer === void 0 ? void 0 : _ev$dataTransfer.getData("text/plain")) !== null && _ev$dataTransfer$getD !== void 0 ? _ev$dataTransfer$getD : -1);
						dragFrom = -1;
						if (from >= 0 && from !== index) emit("reorder", {
							from,
							to: index
						});
					});
				}
				container.append(row);
			});
		};
		update(props);
		return {
			update,
			destroy: () => container.remove()
		};
	};
	function normalizeTreeItems(rawItems) {
		if (!Array.isArray(rawItems)) return [];
		const flat = [];
		const walk = (list, depthOffset) => {
			for (let i = 0; i < list.length; i++) {
				var _ref7, _item$id, _ref8, _ref9, _item$label, _item$kind;
				const item = list[i];
				if (typeof item !== "object" || item === null || Array.isArray(item)) {
					flat.push({
						index: flat.length,
						id: String(flat.length),
						label: String(item !== null && item !== void 0 ? item : ""),
						kind: "",
						isGroup: false,
						depth: depthOffset,
						collapsed: false,
						checked: true
					});
					continue;
				}
				const children = Array.isArray(item.children) ? item.children : [];
				const depth = typeof item.depth === "number" ? item.depth : depthOffset;
				const idx = flat.length;
				flat.push({
					index: idx,
					id: String((_ref7 = (_item$id = item.id) !== null && _item$id !== void 0 ? _item$id : item.name) !== null && _ref7 !== void 0 ? _ref7 : idx),
					label: String((_ref8 = (_ref9 = (_item$label = item.label) !== null && _item$label !== void 0 ? _item$label : item.name) !== null && _ref9 !== void 0 ? _ref9 : item.text) !== null && _ref8 !== void 0 ? _ref8 : idx),
					kind: String((_item$kind = item.kind) !== null && _item$kind !== void 0 ? _item$kind : ""),
					isGroup: Boolean(item.isGroup || children.length > 0),
					depth,
					collapsed: Boolean(item.collapsed),
					checked: item.checked !== void 0 ? Boolean(item.checked) : item.visible !== void 0 ? Boolean(item.visible) : true
				});
				if (children.length > 0) walk(children, depth + 1);
			}
		};
		walk(rawItems, 0);
		return flat;
	}
	const createTree = (el, { props, emit }) => {
		const container = document.createElement("div");
		container.className = "vf-std-tree";
		el.append(container);
		let dragFrom = -1;
		const update = (next) => {
			var _next$items, _next$selectedIndex;
			container.replaceChildren();
			const disabled = next.enabled === false;
			container.dataset.disabled = String(disabled);
			const rows = normalizeTreeItems((_next$items = next.items) !== null && _next$items !== void 0 ? _next$items : []);
			const selected = typeof next.value === "number" ? next.value : Number((_next$selectedIndex = next.selectedIndex) !== null && _next$selectedIndex !== void 0 ? _next$selectedIndex : 0);
			const checkable = next.checkable !== false;
			const draggable = next.draggable !== false;
			if (rows.length === 0) {
				var _next$emptyText2;
				const empty = document.createElement("div");
				empty.className = "vf-std-tree-empty";
				empty.textContent = String((_next$emptyText2 = next.emptyText) !== null && _next$emptyText2 !== void 0 ? _next$emptyText2 : "暂无内容");
				container.append(empty);
				return;
			}
			let collapsedDepth = null;
			for (const r of rows) {
				if (collapsedDepth !== null) {
					if (r.depth > collapsedDepth) continue;
					collapsedDepth = null;
				}
				if (r.isGroup && r.collapsed) collapsedDepth = r.depth;
				const row = document.createElement("div");
				row.dataset.vfRow = String(r.index);
				row.dataset.vfItemId = r.id;
				row.className = "vf-std-tree-row" + (r.index === selected ? " selected" : "") + (!r.checked ? " unchecked" : "");
				row.style.paddingLeft = `${6 + r.depth * 14}px`;
				const caret = document.createElement("span");
				caret.className = "vf-std-tree-caret";
				if (r.isGroup) {
					caret.dataset.vfAction = "collapse";
					caret.textContent = r.collapsed ? "▸" : "▾";
					caret.addEventListener("click", (ev) => {
						ev.stopPropagation();
						if (disabled) return;
						emit("toggleCollapse", {
							index: r.index,
							id: r.id,
							collapsed: !r.collapsed
						});
					});
				}
				row.append(caret);
				if (checkable) {
					const chk = document.createElement("input");
					chk.type = "checkbox";
					chk.dataset.vfAction = "check";
					chk.className = "vf-std-tree-check";
					chk.checked = r.checked;
					chk.addEventListener("click", (ev) => ev.stopPropagation());
					chk.addEventListener("change", (ev) => {
						ev.stopPropagation();
						if (disabled) return;
						emit("toggleCheck", {
							index: r.index,
							id: r.id,
							checked: chk.checked
						});
					});
					row.append(chk);
				}
				const label = document.createElement("span");
				label.className = "vf-std-tree-text" + (r.isGroup ? " group" : "");
				label.textContent = r.label;
				row.append(label);
				if (r.kind) {
					const badge = document.createElement("span");
					badge.className = "vf-std-tree-badge";
					badge.textContent = r.kind;
					row.append(badge);
				}
				row.addEventListener("click", () => {
					if (disabled) return;
					emit("select", r.index);
					if (r.index !== selected) emit("change", r.index);
				});
				if (draggable) {
					row.draggable = true;
					row.addEventListener("dragstart", (ev) => {
						dragFrom = r.index;
						if (ev.dataTransfer) {
							ev.dataTransfer.effectAllowed = "move";
							ev.dataTransfer.setData("text/plain", String(r.index));
						}
					});
					row.addEventListener("dragover", (ev) => {
						ev.preventDefault();
						if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
					});
					row.addEventListener("drop", (ev) => {
						var _ev$dataTransfer$getD2, _ev$dataTransfer2;
						ev.preventDefault();
						if (disabled) return;
						const from = dragFrom >= 0 ? dragFrom : Number((_ev$dataTransfer$getD2 = (_ev$dataTransfer2 = ev.dataTransfer) === null || _ev$dataTransfer2 === void 0 ? void 0 : _ev$dataTransfer2.getData("text/plain")) !== null && _ev$dataTransfer$getD2 !== void 0 ? _ev$dataTransfer$getD2 : -1);
						dragFrom = -1;
						if (from >= 0 && from !== r.index) emit("reorder", {
							from,
							to: r.index
						});
					});
				}
				container.append(row);
			}
		};
		update(props);
		return {
			update,
			destroy: () => container.remove()
		};
	};
	const createDialogButtonBox = (el, { props, emit }) => {
		const bar = document.createElement("div");
		bar.className = "vf-std-buttonbox";
		el.append(bar);
		const parseButtons = (raw) => {
			if (Array.isArray(raw)) return raw.map(String);
			return String(raw !== null && raw !== void 0 ? raw : "OK,Cancel").split(",").map((s) => s.trim()).filter(Boolean);
		};
		const update = (next) => {
			var _next$buttons;
			bar.replaceChildren();
			const list = parseButtons((_next$buttons = next.buttons) !== null && _next$buttons !== void 0 ? _next$buttons : "OK,Cancel");
			const disabled = next.enabled === false;
			for (const role of list) {
				const isAccept = /^(ok|accept|yes|apply|create|save|confirm)$/i.test(role);
				const isReject = /^(cancel|reject|no|close)$/i.test(role);
				const text = isAccept && next.okText && next.okText !== "OK" ? String(next.okText) : isReject && next.cancelText && next.cancelText !== "Cancel" ? String(next.cancelText) : role;
				const btn = document.createElement("button");
				btn.type = "button";
				btn.dataset.vfRole = isAccept ? "accept" : isReject ? "reject" : role.toLowerCase();
				btn.className = "vf-std-buttonbox-btn" + (isAccept ? " primary" : "");
				btn.textContent = text;
				btn.disabled = disabled;
				btn.addEventListener("click", () => {
					if (disabled) return;
					if (isAccept) emit("accept");
					else if (isReject) emit("reject");
				});
				bar.append(btn);
			}
		};
		update(props);
		return {
			update,
			destroy: () => bar.remove()
		};
	};
	const createSeparator = (el, { props }) => {
		const line = document.createElement("div");
		line.className = "vf-std-separator";
		el.append(line);
		const update = (next) => {
			var _next$orientation2;
			line.dataset.orientation = String((_next$orientation2 = next.orientation) !== null && _next$orientation2 !== void 0 ? _next$orientation2 : "horizontal");
		};
		update(props);
		return {
			update,
			destroy: () => line.remove()
		};
	};
	const createFloatBox = (el, { props, emit, mode }) => {
		const root = document.createElement("div");
		root.className = "vf-std-floatbox";
		const header = document.createElement("div");
		header.className = "vf-std-floatbox-header";
		const title = document.createElement("span");
		title.className = "vf-std-floatbox-title";
		const toggleBtn = document.createElement("button");
		toggleBtn.type = "button";
		toggleBtn.className = "vf-std-floatbox-toggle";
		header.append(title, toggleBtn);
		const body = document.createElement("div");
		body.className = "vf-std-floatbox-body";
		root.append(header, body);
		el.append(root);
		let current = props;
		toggleBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			if (current.enabled === false) return;
			const next = !Boolean(current.floating);
			emit("toggle", next);
			emit("change", next);
		});
		header.addEventListener("pointerdown", (e) => {
			var _current$floatX, _current$floatY;
			if (mode !== "preview" || current.enabled === false || !Boolean(current.floating)) return;
			if (e.button !== 0 || e.target === toggleBtn) return;
			e.stopPropagation();
			const win = (root.ownerDocument || document).defaultView || window;
			const frameEl = win.frameElement;
			const outerWin = frameEl && frameEl.ownerDocument ? frameEl.ownerDocument.defaultView : null;
			const toLocalPoint = (pe, fromOuter = false) => {
				if (Boolean(outerWin && frameEl && (fromOuter || pe.view === outerWin)) && frameEl) {
					const fRect = frameEl.getBoundingClientRect();
					const scaleX = fRect.width > 0 && frameEl.offsetWidth > 0 ? fRect.width / frameEl.offsetWidth : 1;
					const scaleY = fRect.height > 0 && frameEl.offsetHeight > 0 ? fRect.height / frameEl.offsetHeight : 1;
					return {
						x: (pe.clientX - fRect.left) / scaleX,
						y: (pe.clientY - fRect.top) / scaleY
					};
				}
				const rect = root.getBoundingClientRect();
				const zoom = rect.width > 0 && root.offsetWidth > 0 ? rect.width / root.offsetWidth : 1;
				return {
					x: pe.clientX / zoom,
					y: pe.clientY / zoom
				};
			};
			const startPt = toLocalPoint(e, false);
			const baseX = Number((_current$floatX = current.floatX) !== null && _current$floatX !== void 0 ? _current$floatX : 60);
			const baseY = Number((_current$floatY = current.floatY) !== null && _current$floatY !== void 0 ? _current$floatY : 80);
			const onMove = (me, fromOuter = false) => {
				const curPt = toLocalPoint(me, fromOuter);
				const dx = Math.round(curPt.x - startPt.x);
				const dy = Math.round(curPt.y - startPt.y);
				emit("move", {
					x: Math.max(0, baseX + dx),
					y: Math.max(0, baseY + dy)
				});
			};
			const onInnerMove = (me) => onMove(me, false);
			const onOuterMove = (me) => onMove(me, true);
			const onUp = () => {
				win.removeEventListener("pointermove", onInnerMove);
				win.removeEventListener("pointerup", onUp);
				if (outerWin && outerWin !== win) {
					outerWin.removeEventListener("pointermove", onOuterMove);
					outerWin.removeEventListener("pointerup", onUp);
				}
			};
			win.addEventListener("pointermove", onInnerMove);
			win.addEventListener("pointerup", onUp);
			if (outerWin && outerWin !== win) {
				outerWin.addEventListener("pointermove", onOuterMove);
				outerWin.addEventListener("pointerup", onUp);
			}
		});
		const update = (next) => {
			var _next$headerHeight, _next$title;
			current = next;
			const floating = Boolean(next.floating);
			const hdrH = Number((_next$headerHeight = next.headerHeight) !== null && _next$headerHeight !== void 0 ? _next$headerHeight : 24);
			header.style.height = `${hdrH}px`;
			root.dataset.floating = String(floating);
			root.dataset.disabled = String(next.enabled === false);
			title.textContent = String((_next$title = next.title) !== null && _next$title !== void 0 ? _next$title : "浮动嵌入框");
			toggleBtn.textContent = floating ? "嵌入" : "浮动";
			toggleBtn.title = floating ? "嵌入回原布局" : "脱离布局浮动";
			toggleBtn.disabled = next.enabled === false;
		};
		update(props);
		return {
			update,
			destroy: () => root.remove()
		};
	};
	const createSpacer = (el) => {
		const spacer = document.createElement("div");
		spacer.className = "vf-std-spacer";
		el.append(spacer);
		return {
			update() {},
			destroy: () => spacer.remove()
		};
	};
	function parseDataFormSchema(raw) {
		let target = raw;
		if (typeof target === "string") try {
			target = JSON.parse(target);
		} catch (_unused) {
			return {
				row_spacing: 8,
				column_spacing: 6,
				controls: []
			};
		}
		if (Array.isArray(target)) return {
			row_spacing: 8,
			column_spacing: 6,
			controls: target
		};
		if (typeof target === "object" && target !== null) {
			var _obj$row_spacing, _obj$column_spacing;
			const obj = target;
			return {
				row_spacing: Number((_obj$row_spacing = obj.row_spacing) !== null && _obj$row_spacing !== void 0 ? _obj$row_spacing : 8),
				column_spacing: Number((_obj$column_spacing = obj.column_spacing) !== null && _obj$column_spacing !== void 0 ? _obj$column_spacing : 6),
				controls: Array.isArray(obj.controls) ? obj.controls : []
			};
		}
		return {
			row_spacing: 8,
			column_spacing: 6,
			controls: []
		};
	}
	function parseDataFormValues(raw) {
		if (typeof raw === "string") try {
			const parsed = JSON.parse(raw);
			return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : {};
		} catch (_unused2) {
			return {};
		}
		if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) return raw;
		return {};
	}
	function isCheckValueOn(val) {
		if (typeof val === "boolean") return val;
		if (typeof val === "number") return val !== 0;
		if (typeof val === "string") {
			const s = val.trim().toLowerCase();
			return s === "on" || s === "true" || s === "1" || s === "yes";
		}
		return false;
	}
	function evalStringVisibleWhen(expr, valMap) {
		const s = String(expr !== null && expr !== void 0 ? expr : "").trim();
		if (!s) return true;
		if (s.includes("||")) return s.split("||").some((p) => evalStringVisibleWhen(p, valMap));
		if (s.includes("&&")) return s.split("&&").every((p) => evalStringVisibleWhen(p, valMap));
		const neIdx = s.indexOf("!=");
		if (neIdx > 0) {
			var _valMap$key;
			const key = s.slice(0, neIdx).trim();
			const rhs = s.slice(neIdx + 2).trim().replace(/^['"]|['"]$/g, "");
			return String((_valMap$key = valMap[key]) !== null && _valMap$key !== void 0 ? _valMap$key : "") !== rhs;
		}
		const eqIdx = s.indexOf("==");
		if (eqIdx > 0) {
			var _valMap$key2;
			const key = s.slice(0, eqIdx).trim();
			const rhs = s.slice(eqIdx + 2).trim().replace(/^['"]|['"]$/g, "");
			return String((_valMap$key2 = valMap[key]) !== null && _valMap$key2 !== void 0 ? _valMap$key2 : "") === rhs;
		}
		if (s.startsWith("!")) return !isCheckValueOn(valMap[s.slice(1).trim()]);
		return isCheckValueOn(valMap[s]);
	}
	function isDataFormControlVisible(ctrl, valMap) {
		var _ref10, _ref11, _cond$name;
		const cond = ctrl.visible_when;
		if (!cond) return true;
		if (typeof cond === "string") return evalStringVisibleWhen(cond, valMap);
		if (typeof cond !== "object") return true;
		const target = String((_ref10 = (_ref11 = (_cond$name = cond.name) !== null && _cond$name !== void 0 ? _cond$name : cond.control) !== null && _ref11 !== void 0 ? _ref11 : cond.field) !== null && _ref10 !== void 0 ? _ref10 : "");
		if (!target) return true;
		const actual = valMap[target];
		if (Array.isArray(cond.values)) return cond.values.some((v) => String(v) === String(actual));
		if (cond.value !== void 0) return String(actual) === String(cond.value);
		if (cond.equals !== void 0) return String(actual) === String(cond.equals);
		if (cond.not_equals !== void 0) return String(actual) !== String(cond.not_equals);
		if (Array.isArray(cond.in)) return cond.in.some((v) => String(v) === String(actual));
		return true;
	}
	function resolveColorHex(raw) {
		var _map$s;
		const s = String(raw !== null && raw !== void 0 ? raw : "").trim().toLowerCase();
		if (s.startsWith("#") && (s.length === 4 || s.length === 7)) return s;
		return (_map$s = {
			black: "#1e1e1e",
			blue: "#2563eb",
			green: "#16a34a",
			red: "#dc2626",
			white: "#f8fafc",
			yellow: "#eab308"
		}[s]) !== null && _map$s !== void 0 ? _map$s : "#4a90d9";
	}
	const createDataForm = (el, { props, emit }) => {
		const root = document.createElement("div");
		root.className = "vf-std-dataform";
		el.append(root);
		let localOverrides = {};
		let lastSchemaKey = "";
		let entries = [];
		let currentProps = props;
		const computeValMap = (schema, next) => {
			var _next$values;
			const extValues = parseDataFormValues((_next$values = next.values) !== null && _next$values !== void 0 ? _next$values : "{}");
			const valMap = {};
			for (const c of schema.controls) {
				var _c$name, _c$value;
				if (!c || typeof c !== "object") continue;
				const name = String((_c$name = c.name) !== null && _c$name !== void 0 ? _c$name : "");
				if (!name) continue;
				if (extValues[name] !== void 0) valMap[name] = extValues[name];
				else if (localOverrides[name] !== void 0) valMap[name] = localOverrides[name];
				else if (valMap[name] === void 0) valMap[name] = (_c$value = c.value) !== null && _c$value !== void 0 ? _c$value : null;
			}
			for (const [k, v] of Object.entries(extValues)) if (valMap[k] === void 0) valMap[k] = v;
			return valMap;
		};
		const syncAll = (schema, next) => {
			const valMap = computeValMap(schema, next);
			const formEnabled = next.enabled !== false;
			for (const entry of entries) entry.sync(valMap, formEnabled);
		};
		const emitField = (c, val) => {
			var _c$name2, _c$hook, _c$type, _currentProps$schema;
			const name = String((_c$name2 = c.name) !== null && _c$name2 !== void 0 ? _c$name2 : "");
			localOverrides[name] = val;
			emit("change", {
				name,
				value: val,
				hook: String((_c$hook = c.hook) !== null && _c$hook !== void 0 ? _c$hook : ""),
				type: String((_c$type = c.type) !== null && _c$type !== void 0 ? _c$type : "")
			});
			const schema = parseDataFormSchema((_currentProps$schema = currentProps.schema) !== null && _currentProps$schema !== void 0 ? _currentProps$schema : []);
			syncAll(schema, currentProps);
		};
		const buildDom = (schema, next) => {
			root.replaceChildren();
			entries = [];
			if (schema.controls.length === 0) {
				var _next$emptyText3;
				const empty = document.createElement("div");
				empty.className = "vf-std-dataform-empty";
				empty.textContent = String((_next$emptyText3 = next.emptyText) !== null && _next$emptyText3 !== void 0 ? _next$emptyText3 : "当前工具无可调选项");
				root.append(empty);
				return;
			}
			let maxCol = 1;
			const rowCounts = /* @__PURE__ */ new Map();
			for (const c of schema.controls) {
				var _c$row, _rowCounts$get, _ref12, _ref13, _c$end_column;
				if (!c || typeof c !== "object") continue;
				const r = Number((_c$row = c.row) !== null && _c$row !== void 0 ? _c$row : 0);
				rowCounts.set(r, ((_rowCounts$get = rowCounts.get(r)) !== null && _rowCounts$get !== void 0 ? _rowCounts$get : 0) + 1);
				const ec = Number((_ref12 = (_ref13 = (_c$end_column = c.end_column) !== null && _c$end_column !== void 0 ? _c$end_column : c.start_column) !== null && _ref13 !== void 0 ? _ref13 : c.column) !== null && _ref12 !== void 0 ? _ref12 : 1);
				if (ec > maxCol) maxCol = ec;
			}
			const colCount = Math.max(2, maxCol + 1);
			const grid = document.createElement("div");
			grid.className = "vf-std-dataform-grid";
			grid.style.gridTemplateColumns = `repeat(${colCount}, minmax(0, 1fr))`;
			grid.style.rowGap = `${Math.min(2, Math.max(1, schema.row_spacing))}px`;
			grid.style.columnGap = `${Math.max(4, schema.column_spacing)}px`;
			for (const c of schema.controls) {
				var _c$state$color, _c$name3, _c$title, _c$type2, _c$row2, _ref14, _c$start_column, _ref15, _ref16, _c$end_column2, _rowCounts$get2;
				if (!c || typeof c !== "object") continue;
				const stateStr = typeof c.state === "string" ? c.state : "normal";
				const stateColor = typeof c.state === "object" && c.state !== null && !Array.isArray(c.state) ? String((_c$state$color = c.state.color) !== null && _c$state$color !== void 0 ? _c$state$color : "") : "";
				const name = String((_c$name3 = c.name) !== null && _c$name3 !== void 0 ? _c$name3 : "");
				const title = String((_c$title = c.title) !== null && _c$title !== void 0 ? _c$title : name);
				const type = String((_c$type2 = c.type) !== null && _c$type2 !== void 0 ? _c$type2 : "button");
				const rawRow = Number((_c$row2 = c.row) !== null && _c$row2 !== void 0 ? _c$row2 : 0);
				const row = rawRow + 1;
				const startCol = Number((_ref14 = (_c$start_column = c.start_column) !== null && _c$start_column !== void 0 ? _c$start_column : c.column) !== null && _ref14 !== void 0 ? _ref14 : 0) + 1;
				let endCol = Number((_ref15 = (_ref16 = (_c$end_column2 = c.end_column) !== null && _c$end_column2 !== void 0 ? _c$end_column2 : c.start_column) !== null && _ref16 !== void 0 ? _ref16 : c.column) !== null && _ref15 !== void 0 ? _ref15 : 1) + 2;
				if (((_rowCounts$get2 = rowCounts.get(rawRow)) !== null && _rowCounts$get2 !== void 0 ? _rowCounts$get2 : 0) === 1 && startCol === 1 && endCol >= 3) endCol = colCount + 1;
				const cell = document.createElement("div");
				cell.className = "vf-std-dataform-cell";
				cell.dataset.vfField = name;
				if (c.value !== void 0 && c.type === "button") cell.dataset.vfFieldValueOption = String(c.value);
				cell.style.gridRow = String(row);
				cell.style.gridColumn = `${startCol} / ${Math.max(startCol + 1, endCol)}`;
				let syncControl = () => {};
				if (type === "slider") {
					var _c$min, _c$max;
					const rowBox = document.createElement("div");
					rowBox.className = "vf-std-dataform-row";
					const lbl = document.createElement("span");
					lbl.textContent = title;
					const num = document.createElement("span");
					num.className = "vf-std-dataform-val";
					num.dataset.vfFieldValue = name;
					const input = document.createElement("input");
					input.type = "range";
					input.className = "vf-std-dataform-slider";
					input.min = String((_c$min = c.min) !== null && _c$min !== void 0 ? _c$min : 0);
					input.max = String((_c$max = c.max) !== null && _c$max !== void 0 ? _c$max : 100);
					input.addEventListener("input", () => {
						num.textContent = input.value;
						emitField(c, Number(input.value));
					});
					input.addEventListener("change", () => {
						num.textContent = input.value;
						emitField(c, Number(input.value));
					});
					rowBox.append(lbl, input, num);
					cell.append(rowBox);
					syncControl = (val, disabled) => {
						var _ref17;
						const v = String((_ref17 = val !== null && val !== void 0 ? val : c.min) !== null && _ref17 !== void 0 ? _ref17 : 0);
						num.textContent = v;
						if (document.activeElement !== input && input.value !== v) input.value = v;
						input.disabled = disabled;
					};
				} else if (type === "list" || type === "select") {
					const rowBox = document.createElement("div");
					rowBox.className = "vf-std-dataform-row";
					const lbl = document.createElement("span");
					lbl.textContent = title;
					const sel = document.createElement("select");
					sel.className = "vf-std-dataform-select";
					const opts = Array.isArray(c.options) ? c.options : [];
					for (const opt of opts) {
						var _ref18, _ref19, _optMap$value, _ref20, _ref21, _optMap$title;
						const optMap = typeof opt === "object" && opt !== null && !Array.isArray(opt) ? opt : null;
						const optVal = optMap ? String((_ref18 = (_ref19 = (_optMap$value = optMap.value) !== null && _optMap$value !== void 0 ? _optMap$value : optMap.title) !== null && _ref19 !== void 0 ? _ref19 : optMap.label) !== null && _ref18 !== void 0 ? _ref18 : "") : String(opt);
						const optTitle = optMap ? String((_ref20 = (_ref21 = (_optMap$title = optMap.title) !== null && _optMap$title !== void 0 ? _optMap$title : optMap.label) !== null && _ref21 !== void 0 ? _ref21 : optMap.value) !== null && _ref20 !== void 0 ? _ref20 : "") : String(opt);
						const o = document.createElement("option");
						o.value = optVal;
						o.textContent = optTitle;
						sel.append(o);
					}
					sel.addEventListener("change", () => emitField(c, sel.value));
					rowBox.append(lbl, sel);
					cell.append(rowBox);
					syncControl = (val, disabled) => {
						sel.disabled = disabled;
						const v = String(val !== null && val !== void 0 ? val : "");
						if (v && sel.value !== v) sel.value = v;
					};
				} else if (type === "check" || type === "checkbox") {
					const lbl = document.createElement("label");
					lbl.className = "vf-std-dataform-check";
					const chk = document.createElement("input");
					chk.type = "checkbox";
					const usesOnOff = typeof c.value === "string" && (c.value.toLowerCase() === "on" || c.value.toLowerCase() === "off");
					chk.addEventListener("change", () => {
						emitField(c, usesOnOff ? chk.checked ? "on" : "off" : chk.checked);
					});
					const span = document.createElement("span");
					span.textContent = title;
					lbl.append(chk, span);
					cell.append(lbl);
					syncControl = (val, disabled) => {
						chk.checked = isCheckValueOn(val);
						chk.disabled = disabled;
					};
				} else if (type === "color" || type === "palette") {
					const palBox = document.createElement("div");
					palBox.className = "vf-std-dataform-palette";
					const rowBox = document.createElement("div");
					rowBox.className = "vf-std-dataform-row";
					const lbl = document.createElement("span");
					lbl.textContent = title;
					const sw = document.createElement("input");
					sw.type = "color";
					sw.addEventListener("change", () => emitField(c, sw.value));
					rowBox.append(lbl, sw);
					palBox.append(rowBox);
					const swatches = Array.isArray(c.swatches) ? [...c.swatches.map(String)] : type === "palette" ? [
						"black",
						"blue",
						"green",
						"#dc2626"
					] : [];
					const swatchRow = document.createElement("div");
					swatchRow.className = "vf-std-dataform-swatches";
					const renderSwatches = (activeVal, disabled) => {
						swatchRow.replaceChildren();
						for (const sc of swatches) {
							const sb = document.createElement("button");
							sb.type = "button";
							sb.className = "vf-std-dataform-swatch-btn";
							sb.dataset.vfSwatch = sc;
							sb.dataset.active = String(String(activeVal) === sc);
							sb.style.background = resolveColorHex(sc);
							sb.title = sc;
							sb.disabled = disabled;
							sb.addEventListener("click", () => emitField(c, sc));
							swatchRow.append(sb);
						}
					};
					if (swatches.length > 0) palBox.append(swatchRow);
					cell.append(palBox);
					syncControl = (val, disabled) => {
						sw.disabled = disabled;
						sw.value = resolveColorHex(val);
						if (swatches.length > 0) renderSwatches(val, disabled);
					};
				} else if (type === "subwindow") {
					const sub = document.createElement("div");
					sub.className = "vf-std-dataform-subwindow";
					sub.dataset.vfSubwindow = name;
					const head = document.createElement("div");
					head.className = "vf-std-dataform-subwindow-head";
					const lbl = document.createElement("span");
					lbl.textContent = `${title} (SubControlFrame)`;
					const status = document.createElement("span");
					status.textContent = "Embedded";
					head.append(lbl, status);
					sub.append(head);
					sub.addEventListener("click", () => {
						emitField(c, c.value !== void 0 && c.value !== "" ? c.value : "embedded");
					});
					cell.append(sub);
					syncControl = (val) => {
						if (val !== void 0 && val !== null && val !== "") status.textContent = String(val);
					};
				} else {
					const btn = document.createElement("button");
					btn.type = "button";
					btn.className = "vf-std-dataform-btn";
					if (c.value !== void 0 && c.value !== "") btn.dataset.vfBtnValue = String(c.value);
					if (stateColor) {
						const dot = document.createElement("span");
						dot.className = "vf-std-dataform-swatch-dot";
						dot.style.background = resolveColorHex(stateColor);
						btn.append(dot);
					}
					const textSpan = document.createElement("span");
					textSpan.textContent = title;
					btn.append(textSpan);
					btn.addEventListener("click", () => {
						const emitVal = c.value !== void 0 && c.value !== "" && c.value !== null ? c.value : true;
						emitField(c, emitVal);
					});
					cell.append(btn);
					syncControl = (val, disabled) => {
						btn.disabled = disabled;
						const isActive = c.value !== void 0 && c.value !== "" && String(val) === String(c.value);
						btn.dataset.active = String(isActive);
					};
				}
				grid.append(cell);
				entries.push({
					spec: c,
					name,
					stateStr,
					cell,
					sync: (valMap, formEnabled) => {
						const visible = stateStr !== "hidden" && isDataFormControlVisible(c, valMap);
						cell.style.display = visible ? "" : "none";
						cell.hidden = !visible;
						const disabled = !formEnabled || stateStr === "disabled";
						syncControl(valMap[name], disabled);
					}
				});
			}
			root.append(grid);
		};
		const update = (next) => {
			var _next$schema, _next$emptyText4;
			currentProps = next;
			const schema = parseDataFormSchema((_next$schema = next.schema) !== null && _next$schema !== void 0 ? _next$schema : []);
			const schemaKey = JSON.stringify({
				row_spacing: schema.row_spacing,
				column_spacing: schema.column_spacing,
				controls: schema.controls,
				emptyText: (_next$emptyText4 = next.emptyText) !== null && _next$emptyText4 !== void 0 ? _next$emptyText4 : ""
			});
			if (schemaKey !== lastSchemaKey) {
				localOverrides = {};
				lastSchemaKey = schemaKey;
				buildDom(schema, next);
			}
			syncAll(schema, next);
		};
		update(props);
		return {
			update,
			destroy: () => root.remove()
		};
	};
	const STANDARD_COMPONENTS = new Map([
		{
			decl: component_default$10,
			folder: "Label",
			create: createLabel,
			styleText: `.vf-std-label { display: flex; align-items: center; width: 100%; height: 100%; color: var(--color-text, #1e293b); font-size: 13px; line-height: 1.4; overflow: hidden; text-overflow: ellipsis; overflow-wrap: anywhere; }
.vf-std-label[data-align="center"] { justify-content: center; text-align: center; }
.vf-std-label[data-align="right"] { justify-content: flex-end; text-align: right; }
.vf-std-label[data-tone="title"] { font-size: 15px; font-weight: 600; color: var(--color-heading, #0f172a); }
.vf-std-label[data-tone="muted"] { color: var(--color-muted, #64748b); font-size: 12px; }
.vf-std-label[data-tone="error"] { color: var(--color-error, #dc2626); }
.vf-std-label[data-tone="accent"] { color: var(--color-primary, #2563eb); font-weight: 500; }`
		},
		{
			decl: component_default$16,
			folder: "Button",
			create: createButton,
			styleText: `.vf-std-button { width: 100%; height: 100%; padding: 0 6px; border: 1px solid var(--color-border, #cbd5e1); border-radius: 6px; background: var(--color-surface, #ffffff); color: var(--color-text, #1e293b); font: inherit; font-size: 12px; font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 4px; transition: background 0.12s, border-color 0.12s, box-shadow 0.12s, transform 0.06s; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vf-std-button[data-has-icon="true"] { padding: 0 4px; gap: 3px; }
.vf-std-button[data-variant="primary"], .vf-std-button[data-checked="true"] { border-color: var(--color-primary, #2563eb); background: var(--color-primary, #2563eb); color: #ffffff; }
.vf-std-button[data-variant="danger"] { border-color: #ef4444; background: #fef2f2; color: #dc2626; }
.vf-std-button:hover:not(:disabled) { border-color: var(--color-primary, #2563eb); box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.18); }
.vf-std-button:active:not(:disabled) { transform: scale(0.98); }
.vf-std-button:disabled { opacity: 0.45; cursor: not-allowed; }`
		},
		{
			decl: component_default$1,
			folder: "TextInput",
			create: createTextInput,
			styleText: `.vf-std-input { box-sizing: border-box; width: 100%; height: 100%; padding: 0 10px; border: 1px solid var(--color-border, #cbd5e1); border-radius: 6px; background: var(--color-surface, #ffffff); color: var(--color-text, #1e293b); font: inherit; font-size: 13px; outline: none; }
.vf-std-input:focus { border-color: var(--color-primary, #2563eb); box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.18); }
.vf-std-input:disabled { opacity: 0.5; background: #f8fafc; }`
		},
		{
			decl: component_default$2,
			folder: "TextArea",
			create: createTextArea,
			styleText: `.vf-std-textarea { box-sizing: border-box; width: 100%; height: 100%; padding: 6px 8px; border: 1px solid var(--color-border, #cbd5e1); border-radius: 6px; background: var(--color-surface, #ffffff); color: var(--color-text, #1e293b); font: inherit; font-size: 12px; line-height: 1.4; resize: none; outline: none; }
.vf-std-textarea:focus { border-color: var(--color-primary, #2563eb); box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.18); }
.vf-std-textarea:disabled { opacity: 0.5; }`
		},
		{
			decl: component_default$4,
			folder: "SpinBox",
			create: createSpinBox,
			styleText: `.vf-std-spinbox { box-sizing: border-box; display: flex; align-items: center; width: 100%; height: 100%; padding: 0 8px; border: 1px solid var(--color-border, #cbd5e1); border-radius: 6px; background: var(--color-surface, #ffffff); color: var(--color-text, #1e293b); }
.vf-std-spinbox:focus-within { border-color: var(--color-primary, #2563eb); box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.18); }
.vf-std-spinbox-input { flex: 1; min-width: 0; height: 100%; border: none; background: transparent; color: inherit; font: inherit; font-size: 13px; outline: none; }
.vf-std-spinbox-suffix { margin-left: 4px; color: var(--color-muted, #64748b); font-size: 12px; white-space: nowrap; }`
		},
		{
			decl: component_default$6,
			folder: "Slider",
			create: createSlider,
			styleText: `.vf-std-slider { box-sizing: border-box; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }
.vf-std-slider-input { width: 100%; margin: 0; accent-color: var(--color-primary, #2563eb); cursor: pointer; }
.vf-std-slider[data-orientation="vertical"] .vf-std-slider-input { writing-mode: vertical-lr; width: auto; height: 100%; }`
		},
		{
			decl: component_default$8,
			folder: "ScrollBar",
			create: createScrollBar,
			styleText: `.vf-std-scrollbar { box-sizing: border-box; position: relative; width: 100%; height: 100%; border: 1px solid var(--color-border, #cbd5e1); border-radius: 4px; background: var(--color-surface, #f1f5f9); overflow: hidden; cursor: pointer; user-select: none; }
.vf-std-scrollbar-thumb { position: absolute; border-radius: 3px; background: var(--color-muted, #94a3b8); }
.vf-std-scrollbar[data-disabled="true"] { opacity: 0.5; pointer-events: none; }`
		},
		{
			decl: component_default$14,
			folder: "ComboBox",
			create: createComboBox,
			styleText: `.vf-std-combobox { box-sizing: border-box; width: 100%; height: 100%; padding: 0 8px; border: 1px solid var(--color-border, #cbd5e1); border-radius: 6px; background: var(--color-surface, #ffffff); color: var(--color-text, #1e293b); font: inherit; font-size: 13px; outline: none; cursor: pointer; }
.vf-std-combobox:focus { border-color: var(--color-primary, #2563eb); box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.18); }
.vf-std-combobox:disabled { opacity: 0.5; cursor: not-allowed; }`
		},
		{
			decl: component_default$15,
			folder: "CheckBox",
			create: createCheckBox,
			styleText: `.vf-std-checkbox { display: flex; align-items: center; gap: 8px; width: 100%; height: 100%; color: var(--color-text, #1e293b); font-size: 13px; cursor: pointer; user-select: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vf-std-checkbox input { width: 15px; height: 15px; margin: 0; accent-color: var(--color-primary, #2563eb); cursor: inherit; }
.vf-std-checkbox[data-disabled="true"] { opacity: 0.5; cursor: not-allowed; }`
		},
		{
			decl: component_default$3,
			folder: "TabBar",
			create: createTabBar,
			styleText: `.vf-std-tabbar { box-sizing: border-box; display: flex; align-items: stretch; gap: 2px; width: 100%; height: 100%; padding: 2px 2px 0 2px; border-bottom: 1px solid var(--color-border, #cbd5e1); overflow: hidden; }
.vf-std-tabbar-tab { flex: 1 1 0; min-width: 0; height: 100%; padding: 0 4px; border: 1px solid var(--color-border, #cbd5e1); border-bottom: none; border-radius: 5px 5px 0 0; background: transparent; color: var(--color-muted, #64748b); font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vf-std-tabbar-tab.active { background: var(--color-primary, #2563eb); border-color: var(--color-primary, #60a5fa); color: #ffffff; font-weight: 600; }`
		},
		{
			decl: component_default$9,
			folder: "List",
			create: createList,
			styleText: `.vf-std-list { box-sizing: border-box; display: flex; flex-direction: column; gap: 1px; width: 100%; height: 100%; padding: 3px; border: 1px solid var(--color-border, #cbd5e1); border-radius: 6px; background: var(--color-surface, #ffffff); overflow-y: auto; }
.vf-std-list[data-disabled="true"] { opacity: 0.5; pointer-events: none; }
.vf-std-list-empty { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--color-muted, #64748b); font-size: 12px; }
.vf-std-list-row { display: flex; align-items: center; gap: 6px; min-height: 20px; padding: 0 6px; border-radius: 4px; color: var(--color-text, #1e293b); font-size: 12px; cursor: pointer; user-select: none; }
.vf-std-list-row:hover { background: rgba(148, 163, 184, 0.15); }
.vf-std-list-row.selected { background: var(--color-primary, #2563eb); color: #ffffff; font-weight: 600; }
.vf-std-list-row.muted { opacity: 0.45; }
.vf-std-list-check { font-size: 12px; color: #94a3b8; cursor: pointer; }
.vf-std-list-check.on { color: var(--color-primary, #2563eb); }
.vf-std-list-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vf-std-list-badge { padding: 1px 4px; border-radius: 3px; background: rgba(148, 163, 184, 0.2); color: inherit; font-size: 10px; }`
		},
		{
			decl: component_default,
			folder: "Tree",
			create: createTree,
			styleText: `.vf-std-tree { box-sizing: border-box; display: flex; flex-direction: column; gap: 2px; width: 100%; height: 100%; padding: 4px; border: 1px solid var(--color-border, #cbd5e1); border-radius: 6px; background: var(--color-surface, #ffffff); overflow-y: auto; user-select: none; }
.vf-std-tree[data-disabled="true"] { opacity: 0.5; pointer-events: none; }
.vf-std-tree-empty { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--color-muted, #64748b); font-size: 12px; }
.vf-std-tree-row { display: flex; align-items: center; gap: 5px; min-height: 24px; padding-right: 6px; border-radius: 4px; color: var(--color-text, #1e293b); font-size: 12px; cursor: pointer; }
.vf-std-tree-row.selected { background: var(--color-primary, #2563eb); color: #ffffff; }
.vf-std-tree-row.unchecked .vf-std-tree-text { opacity: 0.55; }
.vf-std-tree-caret { width: 14px; height: 14px; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; flex-shrink: 0; }
.vf-std-tree-check { width: 13px; height: 13px; margin: 0; accent-color: var(--color-primary, #2563eb); cursor: pointer; flex-shrink: 0; }
.vf-std-tree-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vf-std-tree-text.group { font-weight: 600; }
.vf-std-tree-badge { padding: 1px 4px; border-radius: 3px; background: rgba(148, 163, 184, 0.2); font-size: 10px; flex-shrink: 0; }`
		},
		{
			decl: component_default$12,
			folder: "DialogButtonBox",
			create: createDialogButtonBox,
			styleText: `.vf-std-buttonbox { box-sizing: border-box; display: flex; align-items: center; justify-content: flex-end; gap: 8px; width: 100%; height: 100%; }
.vf-std-buttonbox-btn { min-width: 72px; height: 28px; padding: 0 12px; border: 1px solid var(--color-border, #cbd5e1); border-radius: 5px; background: var(--color-surface, #ffffff); color: var(--color-text, #1e293b); font: inherit; font-size: 12px; cursor: pointer; }
.vf-std-buttonbox-btn.primary { border-color: var(--color-primary, #2563eb); background: var(--color-primary, #2563eb); color: #ffffff; font-weight: 500; }`
		},
		{
			decl: component_default$7,
			folder: "Separator",
			create: createSeparator,
			styleText: `.vf-std-separator { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }
.vf-std-separator::after { content: ""; display: block; width: 100%; height: 1px; background: var(--color-border, #e2e8f0); }
.vf-std-separator[data-orientation="vertical"]::after { width: 1px; height: 100%; }`
		},
		{
			decl: component_default$11,
			folder: "FloatBox",
			create: createFloatBox,
			styleText: `.vf-std-floatbox { box-sizing: border-box; display: flex; flex-direction: column; width: 100%; height: 100%; border: 1px solid var(--color-border, #cbd5e1); border-radius: 6px; background: var(--color-surface, #ffffff); pointer-events: none; overflow: hidden; }
.vf-std-floatbox[data-floating="true"] { border-color: var(--color-primary, #2563eb); box-shadow: 0 12px 28px rgba(15, 23, 42, 0.35); }
.vf-std-floatbox-header { box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 0 8px; height: 24px; background: rgba(148, 163, 184, 0.14); border-bottom: 1px solid var(--color-border, #cbd5e1); color: var(--color-text, #1e293b); font-size: 12px; font-weight: 600; user-select: none; pointer-events: auto; cursor: grab; }
.vf-std-floatbox-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vf-std-floatbox-toggle { padding: 1px 6px; border: 1px solid var(--color-border, #cbd5e1); border-radius: 4px; background: var(--color-surface, #ffffff); color: var(--color-text, #1e293b); font-size: 11px; line-height: 1.3; cursor: pointer; }
.vf-std-floatbox-toggle:hover:not(:disabled) { border-color: var(--color-primary, #2563eb); color: var(--color-primary, #2563eb); }
.vf-std-floatbox-body { flex: 1; min-height: 0; pointer-events: none; }`
		},
		{
			decl: component_default$5,
			folder: "Spacer",
			create: createSpacer,
			styleText: `.vf-std-spacer { width: 100%; height: 100%; pointer-events: none; }`
		},
		{
			decl: component_default$13,
			folder: "DataForm",
			create: createDataForm,
			styleText: `.vf-std-dataform { box-sizing: border-box; width: 100%; height: 100%; padding: 2px 4px; border: 1px solid var(--color-border, #cbd5e1); border-radius: 6px; background: var(--color-surface, #ffffff); color: var(--color-text, #1e293b); font-size: 11px; overflow: auto; }
.vf-std-dataform-empty { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--color-muted, #64748b); font-size: 12px; }
.vf-std-dataform-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: center; }
.vf-std-dataform-cell { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.vf-std-dataform-head { display: flex; justify-content: space-between; align-items: center; font-size: 11px; line-height: 1.1; }
.vf-std-dataform-val { color: var(--color-primary, #2563eb); font-variant-numeric: tabular-nums; font-weight: 500; }
.vf-std-dataform-slider { flex: 1; min-width: 0; height: 12px; margin: 0; accent-color: var(--color-primary, #2563eb); }
.vf-std-dataform-row { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.vf-std-dataform-select { flex: 1; min-width: 0; height: 22px; padding: 0 4px; border: 1px solid var(--color-border, #cbd5e1); border-radius: 4px; background: var(--color-surface, #ffffff); color: var(--color-text, #1e293b); font-size: 11px; }
.vf-std-dataform-check { display: flex; align-items: center; gap: 6px; height: 20px; cursor: pointer; }
.vf-std-dataform-btn { height: 19px; padding: 0 6px; border: 1px solid var(--color-border, #cbd5e1); border-radius: 4px; background: var(--color-surface, #ffffff); color: var(--color-text, #1e293b); font-size: 11px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 4px; }
.vf-std-dataform-btn[data-active="true"] { border-color: var(--color-primary, #2563eb); box-shadow: 0 0 0 1px var(--color-primary, #2563eb); font-weight: 600; }
.vf-std-dataform-swatch-dot { width: 10px; height: 10px; border-radius: 50%; border: 1px solid rgba(148, 163, 184, 0.6); flex-shrink: 0; }
.vf-std-dataform-palette { display: flex; flex-direction: column; gap: 3px; }
.vf-std-dataform-swatches { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.vf-std-dataform-swatch-btn { width: 18px; height: 18px; padding: 0; border-radius: 3px; border: 1px solid var(--color-border, #cbd5e1); cursor: pointer; }
.vf-std-dataform-swatch-btn[data-active="true"] { border: 2px solid var(--color-primary, #2563eb); }
.vf-std-dataform-subwindow { display: flex; flex-direction: column; gap: 1px; padding: 1px 6px; border: 1px dashed var(--color-primary, #2563eb); border-radius: 4px; background: rgba(37, 99, 235, 0.08); font-size: 11px; line-height: 1.15; cursor: pointer; }
.vf-std-dataform-subwindow-head { display: flex; justify-content: space-between; align-items: center; font-weight: 600; color: var(--color-primary, #2563eb); }`
		}
	].map((item) => [item.decl.type, item]));
	//#endregion
	//#region src/dock.ts
	const DOCK_AREAS = [
		"top",
		"bottom",
		"left",
		"right"
	];
	function isDockArea(val) {
		return val === "left" || val === "right" || val === "top" || val === "bottom";
	}
	function defaultSplitOrientation(area) {
		return area === "left" || area === "right" ? "vertical" : "horizontal";
	}
	function cloneDockLayout(layout) {
		var _layout$areas$top, _layout$areas$top2, _layout$areas$top$gro, _layout$areas$top3, _layout$areas$bottom, _layout$areas$bottom2, _layout$areas$bottom$, _layout$areas$bottom3, _layout$areas$left, _layout$areas$left2, _layout$areas$left$gr, _layout$areas$left3, _layout$areas$right, _layout$areas$right2, _layout$areas$right$g, _layout$areas$right3, _layout$floating;
		return {
			areas: {
				top: _objectSpread2(_objectSpread2(_objectSpread2({}, ((_layout$areas$top = layout.areas.top) === null || _layout$areas$top === void 0 ? void 0 : _layout$areas$top.size) !== void 0 ? { size: layout.areas.top.size } : {}), ((_layout$areas$top2 = layout.areas.top) === null || _layout$areas$top2 === void 0 ? void 0 : _layout$areas$top2.splitOrientation) ? { splitOrientation: layout.areas.top.splitOrientation } : {}), {}, { groups: ((_layout$areas$top$gro = (_layout$areas$top3 = layout.areas.top) === null || _layout$areas$top3 === void 0 ? void 0 : _layout$areas$top3.groups) !== null && _layout$areas$top$gro !== void 0 ? _layout$areas$top$gro : []).map((g) => _objectSpread2(_objectSpread2({ tabs: [...g.tabs] }, g.active ? { active: g.active } : {}), g.size !== void 0 ? { size: g.size } : {})) }),
				bottom: _objectSpread2(_objectSpread2(_objectSpread2({}, ((_layout$areas$bottom = layout.areas.bottom) === null || _layout$areas$bottom === void 0 ? void 0 : _layout$areas$bottom.size) !== void 0 ? { size: layout.areas.bottom.size } : {}), ((_layout$areas$bottom2 = layout.areas.bottom) === null || _layout$areas$bottom2 === void 0 ? void 0 : _layout$areas$bottom2.splitOrientation) ? { splitOrientation: layout.areas.bottom.splitOrientation } : {}), {}, { groups: ((_layout$areas$bottom$ = (_layout$areas$bottom3 = layout.areas.bottom) === null || _layout$areas$bottom3 === void 0 ? void 0 : _layout$areas$bottom3.groups) !== null && _layout$areas$bottom$ !== void 0 ? _layout$areas$bottom$ : []).map((g) => _objectSpread2(_objectSpread2({ tabs: [...g.tabs] }, g.active ? { active: g.active } : {}), g.size !== void 0 ? { size: g.size } : {})) }),
				left: _objectSpread2(_objectSpread2(_objectSpread2({}, ((_layout$areas$left = layout.areas.left) === null || _layout$areas$left === void 0 ? void 0 : _layout$areas$left.size) !== void 0 ? { size: layout.areas.left.size } : {}), ((_layout$areas$left2 = layout.areas.left) === null || _layout$areas$left2 === void 0 ? void 0 : _layout$areas$left2.splitOrientation) ? { splitOrientation: layout.areas.left.splitOrientation } : {}), {}, { groups: ((_layout$areas$left$gr = (_layout$areas$left3 = layout.areas.left) === null || _layout$areas$left3 === void 0 ? void 0 : _layout$areas$left3.groups) !== null && _layout$areas$left$gr !== void 0 ? _layout$areas$left$gr : []).map((g) => _objectSpread2(_objectSpread2({ tabs: [...g.tabs] }, g.active ? { active: g.active } : {}), g.size !== void 0 ? { size: g.size } : {})) }),
				right: _objectSpread2(_objectSpread2(_objectSpread2({}, ((_layout$areas$right = layout.areas.right) === null || _layout$areas$right === void 0 ? void 0 : _layout$areas$right.size) !== void 0 ? { size: layout.areas.right.size } : {}), ((_layout$areas$right2 = layout.areas.right) === null || _layout$areas$right2 === void 0 ? void 0 : _layout$areas$right2.splitOrientation) ? { splitOrientation: layout.areas.right.splitOrientation } : {}), {}, { groups: ((_layout$areas$right$g = (_layout$areas$right3 = layout.areas.right) === null || _layout$areas$right3 === void 0 ? void 0 : _layout$areas$right3.groups) !== null && _layout$areas$right$g !== void 0 ? _layout$areas$right$g : []).map((g) => _objectSpread2(_objectSpread2({ tabs: [...g.tabs] }, g.active ? { active: g.active } : {}), g.size !== void 0 ? { size: g.size } : {})) })
			},
			floating: ((_layout$floating = layout.floating) !== null && _layout$floating !== void 0 ? _layout$floating : []).map((f) => _objectSpread2({}, f))
		};
	}
	/** 提取 DockLayoutSpec 中引用的全部停靠面板 ID（保持出现顺序且去重）。 */
	function dockIdsOfLayout(layout) {
		var _layout$floating2;
		if (!layout) return [];
		const list = [];
		const add = (id) => {
			if (id && !list.includes(id)) list.push(id);
		};
		for (const area of DOCK_AREAS) {
			var _layout$areas$area$gr, _layout$areas;
			for (const g of (_layout$areas$area$gr = (_layout$areas = layout.areas) === null || _layout$areas === void 0 || (_layout$areas = _layout$areas[area]) === null || _layout$areas === void 0 ? void 0 : _layout$areas.groups) !== null && _layout$areas$area$gr !== void 0 ? _layout$areas$area$gr : []) {
				var _g$tabs;
				for (const tid of (_g$tabs = g.tabs) !== null && _g$tabs !== void 0 ? _g$tabs : []) add(tid);
			}
		}
		for (const f of (_layout$floating2 = layout.floating) !== null && _layout$floating2 !== void 0 ? _layout$floating2 : []) add(f.dockId);
		return list;
	}
	/** 收集主窗口下的所有有效 Dock 节点 ID。 */
	function windowDockIds(scene, winNode) {
		var _winNode$docks, _winNode$children;
		if (!winNode) return [];
		const raw = [
			...(_winNode$docks = winNode.docks) !== null && _winNode$docks !== void 0 ? _winNode$docks : [],
			...dockIdsOfLayout(winNode.dockLayout),
			...((_winNode$children = winNode.children) !== null && _winNode$children !== void 0 ? _winNode$children : []).filter((cid) => {
				var _scene$nodes$cid;
				return ((_scene$nodes$cid = scene.nodes[cid]) === null || _scene$nodes$cid === void 0 ? void 0 : _scene$nodes$cid.type) === "Dock";
			})
		];
		const out = [];
		for (const id of raw) {
			var _scene$nodes$id;
			if (((_scene$nodes$id = scene.nodes[id]) === null || _scene$nodes$id === void 0 ? void 0 : _scene$nodes$id.type) === "Dock" && !out.includes(id)) out.push(id);
		}
		return out;
	}
	/**
	* 将窗口节点上的 dockLayout（或回退自 docks + dockArea）归一化为完整的 DockLayoutSpec。
	*/
	function normalizeDockLayout(scene, winNode) {
		const validIds = windowDockIds(scene, winNode);
		const validSet = new Set(validIds);
		const seen = /* @__PURE__ */ new Set();
		const areas = {
			top: { groups: [] },
			bottom: { groups: [] },
			left: { groups: [] },
			right: { groups: [] }
		};
		const floating = [];
		const rawLayout = winNode === null || winNode === void 0 ? void 0 : winNode.dockLayout;
		if (rawLayout === null || rawLayout === void 0 ? void 0 : rawLayout.areas) for (const area of DOCK_AREAS) {
			var _rawArea$groups;
			const rawArea = rawLayout.areas[area];
			if (!rawArea) continue;
			if (typeof rawArea.size === "number" && Number.isFinite(rawArea.size) && rawArea.size > 0) areas[area].size = Math.round(rawArea.size);
			if (rawArea.splitOrientation === "horizontal" || rawArea.splitOrientation === "vertical") areas[area].splitOrientation = rawArea.splitOrientation;
			for (const rawGroup of (_rawArea$groups = rawArea.groups) !== null && _rawArea$groups !== void 0 ? _rawArea$groups : []) {
				var _rawGroup$tabs;
				const tabs = [];
				for (const tid of (_rawGroup$tabs = rawGroup.tabs) !== null && _rawGroup$tabs !== void 0 ? _rawGroup$tabs : []) if (validSet.has(tid) && !seen.has(tid)) {
					seen.add(tid);
					tabs.push(tid);
				}
				if (tabs.length === 0) continue;
				const group = {
					tabs,
					active: rawGroup.active && tabs.includes(rawGroup.active) ? rawGroup.active : tabs[0]
				};
				if (typeof rawGroup.size === "number" && Number.isFinite(rawGroup.size) && rawGroup.size > 0) group.size = Math.round(rawGroup.size);
				areas[area].groups.push(group);
			}
		}
		if (Array.isArray(rawLayout === null || rawLayout === void 0 ? void 0 : rawLayout.floating)) for (const rf of rawLayout.floating) {
			if (!rf || !validSet.has(rf.dockId) || seen.has(rf.dockId)) continue;
			seen.add(rf.dockId);
			const dNode = scene.nodes[rf.dockId];
			const fallbackArea = isDockArea(dNode.dockArea) ? dNode.dockArea : "left";
			floating.push({
				dockId: rf.dockId,
				lastArea: isDockArea(rf.lastArea) ? rf.lastArea : fallbackArea,
				x: Math.round(Number.isFinite(rf.x) ? rf.x : 80),
				y: Math.round(Number.isFinite(rf.y) ? rf.y : 90),
				width: Math.max(80, Math.round(Number.isFinite(rf.width) ? rf.width : prefWidth(dNode))),
				height: Math.max(60, Math.round(Number.isFinite(rf.height) ? rf.height : prefHeight(dNode)))
			});
		}
		for (const did of validIds) {
			if (seen.has(did)) continue;
			seen.add(did);
			const dNode = scene.nodes[did];
			areas[isDockArea(dNode.dockArea) ? dNode.dockArea : "left"].groups.push({
				tabs: [did],
				active: did
			});
		}
		const out = {
			areas,
			floating
		};
		for (const area of DOCK_AREAS) {
			const areaSpec = areas[area];
			if (areaSpec.groups.length === 0) {
				delete areaSpec.size;
				delete areaSpec.splitOrientation;
				continue;
			}
			if (areaSpec.size === void 0) {
				var _areaSpec$groups$0$ac;
				const firstId = (_areaSpec$groups$0$ac = areaSpec.groups[0].active) !== null && _areaSpec$groups$0$ac !== void 0 ? _areaSpec$groups$0$ac : areaSpec.groups[0].tabs[0];
				const firstNode = firstId ? scene.nodes[firstId] : void 0;
				if (firstNode) areaSpec.size = area === "left" || area === "right" ? prefWidth(firstNode) : prefHeight(firstNode);
			}
			if (areaSpec.groups.length === 1) {
				delete areaSpec.splitOrientation;
				delete areaSpec.groups[0].size;
			} else {
				var _areaSpec$splitOrient;
				const orient = (_areaSpec$splitOrient = areaSpec.splitOrientation) !== null && _areaSpec$splitOrient !== void 0 ? _areaSpec$splitOrient : defaultSplitOrientation(area);
				areaSpec.splitOrientation = orient;
				const refSpan = computeReferenceAreaSplitSpan(out, scene, winNode, area);
				const isPerpendicularSplit = orient === defaultSplitOrientation(area);
				const curSum = areaSpec.groups.reduce((acc, g) => {
					var _g$size;
					return acc + ((_g$size = g.size) !== null && _g$size !== void 0 ? _g$size : 0);
				}, 0);
				if (areaSpec.groups.some((g) => g.size === void 0) || isPerpendicularSplit && Math.abs(curSum - refSpan) > 1) {
					const distributed = distributeGroupAxisSizes(refSpan, areaSpec.groups.map((group) => {
						var _ref;
						const activeId = group.active && group.tabs.includes(group.active) ? group.active : group.tabs[0];
						return {
							group,
							activeDock: (_ref = activeId ? scene.nodes[activeId] : void 0) !== null && _ref !== void 0 ? _ref : {
								type: "Dock",
								width: 240,
								height: 280
							}
						};
					}), orient);
					for (let gi = 0; gi < areaSpec.groups.length; gi++) areaSpec.groups[gi].size = distributed[gi];
				}
				if (!isPerpendicularSplit) areaSpec.size = areaSpec.groups.reduce((acc, g) => {
					var _g$size2;
					return acc + ((_g$size2 = g.size) !== null && _g$size2 !== void 0 ? _g$size2 : 0);
				}, 0);
			}
		}
		return out;
	}
	function dockFindLocation(layout, dockId) {
		var _layout$floating3;
		for (const area of DOCK_AREAS) {
			var _layout$areas$area$gr3, _layout$areas$area;
			const groups = (_layout$areas$area$gr3 = (_layout$areas$area = layout.areas[area]) === null || _layout$areas$area === void 0 ? void 0 : _layout$areas$area.groups) !== null && _layout$areas$area$gr3 !== void 0 ? _layout$areas$area$gr3 : [];
			for (let gi = 0; gi < groups.length; gi++) {
				const g = groups[gi];
				const ti = g.tabs.indexOf(dockId);
				if (ti >= 0) return {
					kind: "area",
					area,
					groupIndex: gi,
					tabIndex: ti,
					group: g
				};
			}
		}
		const floating = (_layout$floating3 = layout.floating) !== null && _layout$floating3 !== void 0 ? _layout$floating3 : [];
		for (let fi = 0; fi < floating.length; fi++) if (floating[fi].dockId === dockId) return {
			kind: "floating",
			index: fi,
			item: floating[fi]
		};
		return null;
	}
	function detachDockFromLayout(layout, dockId) {
		const loc = dockFindLocation(layout, dockId);
		if (!loc) return {};
		if (loc.kind === "floating") {
			var _layout$floating4;
			const lastArea = loc.item.lastArea;
			layout.floating = ((_layout$floating4 = layout.floating) !== null && _layout$floating4 !== void 0 ? _layout$floating4 : []).filter((f) => f.dockId !== dockId);
			return { lastArea };
		}
		const areaSpec = layout.areas[loc.area];
		const group = areaSpec.groups[loc.groupIndex];
		group.tabs = group.tabs.filter((id) => id !== dockId);
		if (group.tabs.length === 0) {
			areaSpec.groups.splice(loc.groupIndex, 1);
			if (areaSpec.groups.length === 0) {
				delete areaSpec.size;
				delete areaSpec.splitOrientation;
			} else if (areaSpec.groups.length === 1) {
				delete areaSpec.splitOrientation;
				delete areaSpec.groups[0].size;
			}
		} else if (group.active === dockId || !group.active || !group.tabs.includes(group.active)) group.active = group.tabs[Math.min(loc.tabIndex, group.tabs.length - 1)];
		return { lastArea: loc.area };
	}
	/** 将 dockId 叠入 targetDockId 所在的页签组，并激活 dockId。 */
	function dockTabify(layout, scene, winNode, targetDockId, dockId) {
		var _winNode$width2, _winNode$height2, _winNode$width3, _winNode$height3;
		const next = normalizeDockLayout(scene, _objectSpread2(_objectSpread2({}, winNode), {}, {
			type: "Window",
			width: (_winNode$width2 = winNode === null || winNode === void 0 ? void 0 : winNode.width) !== null && _winNode$width2 !== void 0 ? _winNode$width2 : 1280,
			height: (_winNode$height2 = winNode === null || winNode === void 0 ? void 0 : winNode.height) !== null && _winNode$height2 !== void 0 ? _winNode$height2 : 800,
			dockLayout: cloneDockLayout(layout)
		}));
		if (targetDockId === dockId) return next;
		const targetLocBefore = dockFindLocation(next, targetDockId);
		if (!targetLocBefore) return next;
		if (targetLocBefore.kind === "floating") return dockTabify(dockRestore(next, scene, winNode, targetDockId), scene, winNode, targetDockId, dockId);
		detachDockFromLayout(next, dockId);
		const targetLoc = dockFindLocation(next, targetDockId);
		if (!targetLoc || targetLoc.kind !== "area") return next;
		if (!targetLoc.group.tabs.includes(dockId)) targetLoc.group.tabs.push(dockId);
		targetLoc.group.active = dockId;
		return normalizeDockLayout(scene, _objectSpread2(_objectSpread2({}, winNode), {}, {
			type: "Window",
			width: (_winNode$width3 = winNode === null || winNode === void 0 ? void 0 : winNode.width) !== null && _winNode$width3 !== void 0 ? _winNode$width3 : 1280,
			height: (_winNode$height3 = winNode === null || winNode === void 0 ? void 0 : winNode.height) !== null && _winNode$height3 !== void 0 ? _winNode$height3 : 800,
			dockLayout: next
		}));
	}
	/** 切换页签组内的当前激活页签。 */
	function dockActivateTab(layout, scene, winNode, dockId) {
		var _winNode$width4, _winNode$height4;
		const next = cloneDockLayout(layout);
		const loc = dockFindLocation(next, dockId);
		if (loc && loc.kind === "area") loc.group.active = dockId;
		return normalizeDockLayout(scene, _objectSpread2(_objectSpread2({}, winNode), {}, {
			type: "Window",
			width: (_winNode$width4 = winNode === null || winNode === void 0 ? void 0 : winNode.width) !== null && _winNode$width4 !== void 0 ? _winNode$width4 : 1280,
			height: (_winNode$height4 = winNode === null || winNode === void 0 ? void 0 : winNode.height) !== null && _winNode$height4 !== void 0 ? _winNode$height4 : 800,
			dockLayout: next
		}));
	}
	/** 将停靠面板拖出/切换为浮窗（或更新浮窗位置和尺寸）。 */
	function dockFloat(layout, scene, winNode, dockId, rect) {
		var _prevFloat$width, _prevFloat$height, _ref2, _rect$x, _ref3, _rect$y, _rect$width, _rect$height, _next$floating, _winNode$width5, _winNode$height5;
		const next = cloneDockLayout(layout);
		const dNode = scene.nodes[dockId];
		if (!dNode || dNode.type !== "Dock") return next;
		const existingLoc = dockFindLocation(next, dockId);
		const prevFloat = (existingLoc === null || existingLoc === void 0 ? void 0 : existingLoc.kind) === "floating" ? existingLoc.item : void 0;
		const { lastArea } = detachDockFromLayout(next, dockId);
		const resolvedArea = lastArea !== null && lastArea !== void 0 ? lastArea : isDockArea(dNode.dockArea) ? dNode.dockArea : "left";
		const defW = (_prevFloat$width = prevFloat === null || prevFloat === void 0 ? void 0 : prevFloat.width) !== null && _prevFloat$width !== void 0 ? _prevFloat$width : resolvedArea === "left" || resolvedArea === "right" ? prefWidth(dNode) : Math.min(480, prefWidth(dNode));
		const defH = (_prevFloat$height = prevFloat === null || prevFloat === void 0 ? void 0 : prevFloat.height) !== null && _prevFloat$height !== void 0 ? _prevFloat$height : resolvedArea === "top" || resolvedArea === "bottom" ? Math.max(120, prefHeight(dNode)) : Math.min(440, prefHeight(dNode));
		const item = {
			dockId,
			lastArea: resolvedArea,
			x: Math.round((_ref2 = (_rect$x = rect === null || rect === void 0 ? void 0 : rect.x) !== null && _rect$x !== void 0 ? _rect$x : prevFloat === null || prevFloat === void 0 ? void 0 : prevFloat.x) !== null && _ref2 !== void 0 ? _ref2 : 80),
			y: Math.round((_ref3 = (_rect$y = rect === null || rect === void 0 ? void 0 : rect.y) !== null && _rect$y !== void 0 ? _rect$y : prevFloat === null || prevFloat === void 0 ? void 0 : prevFloat.y) !== null && _ref3 !== void 0 ? _ref3 : 90),
			width: Math.max(80, Math.round((_rect$width = rect === null || rect === void 0 ? void 0 : rect.width) !== null && _rect$width !== void 0 ? _rect$width : defW)),
			height: Math.max(60, Math.round((_rect$height = rect === null || rect === void 0 ? void 0 : rect.height) !== null && _rect$height !== void 0 ? _rect$height : defH))
		};
		next.floating = [...(_next$floating = next.floating) !== null && _next$floating !== void 0 ? _next$floating : [], item];
		return normalizeDockLayout(scene, _objectSpread2(_objectSpread2({}, winNode), {}, {
			type: "Window",
			width: (_winNode$width5 = winNode === null || winNode === void 0 ? void 0 : winNode.width) !== null && _winNode$width5 !== void 0 ? _winNode$width5 : 1280,
			height: (_winNode$height5 = winNode === null || winNode === void 0 ? void 0 : winNode.height) !== null && _winNode$height5 !== void 0 ? _winNode$height5 : 800,
			dockLayout: next
		}));
	}
	/** 将浮窗恢复回原来的停靠区（或指定停靠区）。 */
	function dockRestore(layout, scene, winNode, dockId, targetArea) {
		var _ref4, _winNode$width6, _winNode$height6;
		const next = cloneDockLayout(layout);
		const dNode = scene.nodes[dockId];
		if (!dNode || dNode.type !== "Dock") return next;
		const { lastArea } = detachDockFromLayout(next, dockId);
		const area = (_ref4 = targetArea !== null && targetArea !== void 0 ? targetArea : lastArea) !== null && _ref4 !== void 0 ? _ref4 : isDockArea(dNode.dockArea) ? dNode.dockArea : "left";
		next.areas[area].groups.push({
			tabs: [dockId],
			active: dockId
		});
		if (next.areas[area].size === void 0) next.areas[area].size = area === "left" || area === "right" ? prefWidth(dNode) : prefHeight(dNode);
		return normalizeDockLayout(scene, _objectSpread2(_objectSpread2({}, winNode), {}, {
			type: "Window",
			width: (_winNode$width6 = winNode === null || winNode === void 0 ? void 0 : winNode.width) !== null && _winNode$width6 !== void 0 ? _winNode$width6 : 1280,
			height: (_winNode$height6 = winNode === null || winNode === void 0 ? void 0 : winNode.height) !== null && _winNode$height6 !== void 0 ? _winNode$height6 : 800,
			dockLayout: next
		}));
	}
	/** 将面板移动/吸附到指定停靠区。 */
	function dockMoveToArea(layout, scene, winNode, dockId, area, index) {
		var _winNode$width7, _winNode$height7;
		const next = cloneDockLayout(layout);
		const dNode = scene.nodes[dockId];
		if (!dNode || dNode.type !== "Dock") return next;
		detachDockFromLayout(next, dockId);
		const groups = next.areas[area].groups;
		const newGroup = {
			tabs: [dockId],
			active: dockId
		};
		if (index !== void 0 && index >= 0 && index <= groups.length) groups.splice(index, 0, newGroup);
		else groups.push(newGroup);
		if (next.areas[area].size === void 0) next.areas[area].size = area === "left" || area === "right" ? prefWidth(dNode) : prefHeight(dNode);
		return normalizeDockLayout(scene, _objectSpread2(_objectSpread2({}, winNode), {}, {
			type: "Window",
			width: (_winNode$width7 = winNode === null || winNode === void 0 ? void 0 : winNode.width) !== null && _winNode$width7 !== void 0 ? _winNode$width7 : 1280,
			height: (_winNode$height7 = winNode === null || winNode === void 0 ? void 0 : winNode.height) !== null && _winNode$height7 !== void 0 ? _winNode$height7 : 800,
			dockLayout: next
		}));
	}
	/** 将 dockId 与 targetDockId 在同一停靠区内并排放置（split）。 */
	function dockSplit(layout, scene, winNode, targetDockId, dockId, position = "after", orientation) {
		var _ref5, _winNode$width8, _winNode$height8;
		const next = cloneDockLayout(layout);
		if (targetDockId === dockId) return next;
		const targetLocBefore = dockFindLocation(next, targetDockId);
		if (!targetLocBefore || targetLocBefore.kind !== "area") return next;
		const area = targetLocBefore.area;
		detachDockFromLayout(next, dockId);
		const targetLoc = dockFindLocation(next, targetDockId);
		if (!targetLoc || targetLoc.kind !== "area") return dockMoveToArea(next, scene, winNode, dockId, area);
		const areaSpec = next.areas[area];
		areaSpec.splitOrientation = (_ref5 = orientation !== null && orientation !== void 0 ? orientation : areaSpec.splitOrientation) !== null && _ref5 !== void 0 ? _ref5 : defaultSplitOrientation(area);
		const insertIdx = position === "before" ? targetLoc.groupIndex : targetLoc.groupIndex + 1;
		areaSpec.groups.splice(insertIdx, 0, {
			tabs: [dockId],
			active: dockId
		});
		return normalizeDockLayout(scene, _objectSpread2(_objectSpread2({}, winNode), {}, {
			type: "Window",
			width: (_winNode$width8 = winNode === null || winNode === void 0 ? void 0 : winNode.width) !== null && _winNode$width8 !== void 0 ? _winNode$width8 : 1280,
			height: (_winNode$height8 = winNode === null || winNode === void 0 ? void 0 : winNode.height) !== null && _winNode$height8 !== void 0 ? _winNode$height8 : 800,
			dockLayout: next
		}));
	}
	/** 拖动停靠区与中央区之间的分隔条，调整停靠区厚度（宽度或高度）。 */
	function dockResizeArea(layout, scene, winNode, area, size) {
		var _areaSpec$splitOrient3, _winNode$width9, _winNode$height9;
		const next = cloneDockLayout(layout);
		const clamped = Math.max(area === "left" || area === "right" ? 80 : 48, Math.min(900, Math.round(size)));
		const areaSpec = next.areas[area];
		areaSpec.size = clamped;
		const orient = (_areaSpec$splitOrient3 = areaSpec.splitOrientation) !== null && _areaSpec$splitOrient3 !== void 0 ? _areaSpec$splitOrient3 : defaultSplitOrientation(area);
		if (areaSpec.groups.length >= 2 && orient !== defaultSplitOrientation(area)) {
			const scaled = distributeGroupAxisSizes(clamped, areaSpec.groups.map((group) => {
				var _ref6;
				const activeId = group.active && group.tabs.includes(group.active) ? group.active : group.tabs[0];
				return {
					group,
					activeDock: (_ref6 = activeId ? scene.nodes[activeId] : void 0) !== null && _ref6 !== void 0 ? _ref6 : {
						type: "Dock",
						width: 240,
						height: 280
					}
				};
			}), orient);
			areaSpec.groups.forEach((group, gi) => {
				group.size = scaled[gi];
			});
		}
		return normalizeDockLayout(scene, _objectSpread2(_objectSpread2({}, winNode), {}, {
			type: "Window",
			width: (_winNode$width9 = winNode === null || winNode === void 0 ? void 0 : winNode.width) !== null && _winNode$width9 !== void 0 ? _winNode$width9 : 1280,
			height: (_winNode$height9 = winNode === null || winNode === void 0 ? void 0 : winNode.height) !== null && _winNode$height9 !== void 0 ? _winNode$height9 : 800,
			dockLayout: next
		}));
	}
	function computeReferenceAreaSplitSpan(layout, scene, winNode, area) {
		var _winNode$menuBar$heig, _statusNode$height, _areaSpec$splitOrient4, _layout$areas$top$gro2, _layout$areas$top4, _layout$areas$bottom$2, _layout$areas$bottom4;
		const W = (winNode === null || winNode === void 0 ? void 0 : winNode.width) && winNode.width > 0 ? winNode.width : 1280;
		const H = (winNode === null || winNode === void 0 ? void 0 : winNode.height) && winNode.height > 0 ? winNode.height : 800;
		const menuH = (winNode === null || winNode === void 0 ? void 0 : winNode.menuBar) ? Math.max(0, Math.round((_winNode$menuBar$heig = winNode.menuBar.height) !== null && _winNode$menuBar$heig !== void 0 ? _winNode$menuBar$heig : 28)) : 0;
		const statusNode = (winNode === null || winNode === void 0 ? void 0 : winNode.statusBar) ? scene.nodes[winNode.statusBar] : void 0;
		const statusH = statusNode ? Math.round((_statusNode$height = statusNode.height) !== null && _statusNode$height !== void 0 ? _statusNode$height : 28) : 0;
		const midH = Math.max(0, H - menuH - statusH);
		const areaSpec = layout.areas[area];
		if (((_areaSpec$splitOrient4 = areaSpec === null || areaSpec === void 0 ? void 0 : areaSpec.splitOrientation) !== null && _areaSpec$splitOrient4 !== void 0 ? _areaSpec$splitOrient4 : defaultSplitOrientation(area)) === "horizontal") {
			var _areaSpec$groups$0$ac2, _areaSpec$groups$, _areaSpec$groups$2, _areaSpec$size;
			if (area === "top" || area === "bottom") return W;
			const firstId = (_areaSpec$groups$0$ac2 = areaSpec === null || areaSpec === void 0 || (_areaSpec$groups$ = areaSpec.groups[0]) === null || _areaSpec$groups$ === void 0 ? void 0 : _areaSpec$groups$.active) !== null && _areaSpec$groups$0$ac2 !== void 0 ? _areaSpec$groups$0$ac2 : areaSpec === null || areaSpec === void 0 || (_areaSpec$groups$2 = areaSpec.groups[0]) === null || _areaSpec$groups$2 === void 0 ? void 0 : _areaSpec$groups$2.tabs[0];
			const firstNode = firstId ? scene.nodes[firstId] : void 0;
			return Math.max(80, Math.round((_areaSpec$size = areaSpec === null || areaSpec === void 0 ? void 0 : areaSpec.size) !== null && _areaSpec$size !== void 0 ? _areaSpec$size : firstNode ? prefWidth(firstNode) : 240));
		}
		let topH = 0;
		if (((_layout$areas$top$gro2 = (_layout$areas$top4 = layout.areas.top) === null || _layout$areas$top4 === void 0 ? void 0 : _layout$areas$top4.groups.length) !== null && _layout$areas$top$gro2 !== void 0 ? _layout$areas$top$gro2 : 0) > 0) {
			var _layout$areas$top$gro3, _layout$areas$top$siz;
			const firstTopId = (_layout$areas$top$gro3 = layout.areas.top.groups[0].active) !== null && _layout$areas$top$gro3 !== void 0 ? _layout$areas$top$gro3 : layout.areas.top.groups[0].tabs[0];
			const firstTopNode = firstTopId ? scene.nodes[firstTopId] : void 0;
			topH = Math.max(40, Math.round((_layout$areas$top$siz = layout.areas.top.size) !== null && _layout$areas$top$siz !== void 0 ? _layout$areas$top$siz : firstTopNode ? prefHeight(firstTopNode) : 68));
		}
		let bottomH = 0;
		if (((_layout$areas$bottom$2 = (_layout$areas$bottom4 = layout.areas.bottom) === null || _layout$areas$bottom4 === void 0 ? void 0 : _layout$areas$bottom4.groups.length) !== null && _layout$areas$bottom$2 !== void 0 ? _layout$areas$bottom$2 : 0) > 0) {
			var _layout$areas$bottom$3, _layout$areas$bottom$4;
			const firstBotId = (_layout$areas$bottom$3 = layout.areas.bottom.groups[0].active) !== null && _layout$areas$bottom$3 !== void 0 ? _layout$areas$bottom$3 : layout.areas.bottom.groups[0].tabs[0];
			const firstBotNode = firstBotId ? scene.nodes[firstBotId] : void 0;
			bottomH = Math.max(40, Math.round((_layout$areas$bottom$4 = layout.areas.bottom.size) !== null && _layout$areas$bottom$4 !== void 0 ? _layout$areas$bottom$4 : firstBotNode ? prefHeight(firstBotNode) : 96));
		}
		if (area === "top") return topH || 68;
		if (area === "bottom") return bottomH || 96;
		return Math.max(80, midH - topH - bottomH);
	}
	/** 拖动同一停靠区内并排组之间的分隔条，仅在相邻的第 groupIndex 与第 groupIndex+1 组之间重新分配尺寸，保持其余组不变。 */
	function dockResizeSplit(layout, scene, winNode, area, groupIndex, size) {
		var _areaSpec$groups, _areaSpec$splitOrient5, _winNode$width12, _winNode$height12;
		const next = cloneDockLayout(layout);
		const areaSpec = next.areas[area];
		const groups = (_areaSpec$groups = areaSpec === null || areaSpec === void 0 ? void 0 : areaSpec.groups) !== null && _areaSpec$groups !== void 0 ? _areaSpec$groups : [];
		if (groupIndex < 0 || groupIndex >= groups.length) {
			var _winNode$width10, _winNode$height10;
			return normalizeDockLayout(scene, _objectSpread2(_objectSpread2({}, winNode), {}, {
				type: "Window",
				width: (_winNode$width10 = winNode === null || winNode === void 0 ? void 0 : winNode.width) !== null && _winNode$width10 !== void 0 ? _winNode$width10 : 1280,
				height: (_winNode$height10 = winNode === null || winNode === void 0 ? void 0 : winNode.height) !== null && _winNode$height10 !== void 0 ? _winNode$height10 : 800,
				dockLayout: next
			}));
		}
		const orient = (_areaSpec$splitOrient5 = areaSpec.splitOrientation) !== null && _areaSpec$splitOrient5 !== void 0 ? _areaSpec$splitOrient5 : defaultSplitOrientation(area);
		const minEach = orient === "horizontal" ? 60 : 48;
		if (groups.length === 1 || groupIndex === groups.length - 1) {
			var _winNode$width11, _winNode$height11;
			groups[groupIndex].size = Math.max(minEach, Math.round(size));
			return normalizeDockLayout(scene, _objectSpread2(_objectSpread2({}, winNode), {}, {
				type: "Window",
				width: (_winNode$width11 = winNode === null || winNode === void 0 ? void 0 : winNode.width) !== null && _winNode$width11 !== void 0 ? _winNode$width11 : 1280,
				height: (_winNode$height11 = winNode === null || winNode === void 0 ? void 0 : winNode.height) !== null && _winNode$height11 !== void 0 ? _winNode$height11 : 800,
				dockLayout: next
			}));
		}
		const curSizes = distributeGroupAxisSizes(computeReferenceAreaSplitSpan(next, scene, winNode, area), groups.map((group) => {
			var _ref7;
			const activeId = group.active && group.tabs.includes(group.active) ? group.active : group.tabs[0];
			return {
				group,
				activeDock: (_ref7 = activeId ? scene.nodes[activeId] : void 0) !== null && _ref7 !== void 0 ? _ref7 : {
					type: "Dock",
					width: 240,
					height: 280
				}
			};
		}), orient);
		const pairSum = Math.max(minEach * 2, curSizes[groupIndex] + curSizes[groupIndex + 1]);
		const newA = Math.max(minEach, Math.min(pairSum - minEach, Math.round(size)));
		const newB = Math.max(minEach, pairSum - newA);
		curSizes[groupIndex] = newA;
		curSizes[groupIndex + 1] = newB;
		for (let i = 0; i < groups.length; i++) groups[i].size = curSizes[i];
		return normalizeDockLayout(scene, _objectSpread2(_objectSpread2({}, winNode), {}, {
			type: "Window",
			width: (_winNode$width12 = winNode === null || winNode === void 0 ? void 0 : winNode.width) !== null && _winNode$width12 !== void 0 ? _winNode$width12 : 1280,
			height: (_winNode$height12 = winNode === null || winNode === void 0 ? void 0 : winNode.height) !== null && _winNode$height12 !== void 0 ? _winNode$height12 : 800,
			dockLayout: next
		}));
	}
	function distributeGroupAxisSizes(totalSpan, groups, axis) {
		const n = groups.length;
		if (n === 0) return [];
		if (n === 1) return [Math.max(0, totalSpan)];
		const minEach = axis === "horizontal" ? 60 : 48;
		const rawSizes = groups.map(({ group, activeDock }) => {
			if (group.size !== void 0 && group.size > 0) return group.size;
			return axis === "horizontal" ? prefWidth(activeDock) : prefHeight(activeDock);
		});
		const sumRaw = rawSizes.reduce((a, b) => a + b, 0) || 1;
		const out = [];
		let used = 0;
		for (let i = 0; i < n; i++) if (i === n - 1) out.push(Math.max(minEach, totalSpan - used));
		else {
			const maxAllow = Math.max(minEach, totalSpan - used - minEach * (n - 1 - i));
			const s = Math.max(minEach, Math.min(maxAllow, Math.round(totalSpan * rawSizes[i] / sumRaw)));
			out.push(s);
			used += s;
		}
		return out;
	}
	/** 窗口放不下全部停靠区时，给中央区留下的最小尺寸。 */
	const MIN_CENTER_WIDTH = 120;
	const MIN_CENTER_HEIGHT = 80;
	/**
	* 根据 DockLayoutSpec 计算主窗口所有停靠面板、中央区及分隔条的几何框。
	*/
	function computeDockWindowLayout(scene, winId, winNode, W, midY, midH, winVis, isVisible, dockLayoutOverride) {
		var _layout$floating5;
		const layout = dockLayoutOverride ? normalizeDockLayout(scene, _objectSpread2(_objectSpread2({}, winNode), {}, { dockLayout: dockLayoutOverride })) : normalizeDockLayout(scene, winNode);
		const dockBoxes = /* @__PURE__ */ new Map();
		const splitters = [];
		const activeTabByDock = /* @__PURE__ */ new Map();
		const resolveAreaVisibleGroups = (area) => {
			const areaSpec = layout.areas[area];
			const visGroups = [];
			areaSpec.groups.forEach((group, groupIndex) => {
				const visibleTabs = group.tabs.filter((tid) => scene.nodes[tid] && isVisible(tid));
				if (visibleTabs.length === 0) {
					for (const tid of group.tabs) {
						const d = scene.nodes[tid];
						if (!d) continue;
						dockBoxes.set(tid, {
							x: 0,
							y: midY,
							width: prefWidth(d),
							height: prefHeight(d),
							absX: 0,
							absY: midY,
							visible: false,
							windowId: winId
						});
						activeTabByDock.set(tid, {
							groupTabs: [],
							activeTab: tid,
							isFloating: false,
							area
						});
					}
					return;
				}
				const activeId = group.active && visibleTabs.includes(group.active) ? group.active : visibleTabs[0];
				const activeDock = scene.nodes[activeId];
				visGroups.push({
					group,
					groupIndex,
					visibleTabs,
					activeId,
					activeDock
				});
			});
			return visGroups;
		};
		const assignGroupBoxes = (area, groupEntry, gx, gy, gw, gh) => {
			for (const tid of groupEntry.group.tabs) {
				if (!scene.nodes[tid]) continue;
				const isActive = tid === groupEntry.activeId && isVisible(tid);
				dockBoxes.set(tid, {
					x: gx,
					y: gy,
					width: gw,
					height: gh,
					absX: gx,
					absY: gy,
					visible: winVis && isActive,
					windowId: winId
				});
				activeTabByDock.set(tid, {
					groupTabs: groupEntry.visibleTabs,
					activeTab: groupEntry.activeId,
					isFloating: false,
					area
				});
			}
		};
		const resolveEdgeHeights = (area, groups) => {
			var _layout$areas$area$sp;
			const orient = (_layout$areas$area$sp = layout.areas[area].splitOrientation) !== null && _layout$areas$area$sp !== void 0 ? _layout$areas$area$sp : "horizontal";
			if (orient === "horizontal") {
				var _layout$areas$area$si;
				const widths = distributeGroupAxisSizes(W, groups, "horizontal");
				const base = Math.max(40, Math.round((_layout$areas$area$si = layout.areas[area].size) !== null && _layout$areas$area$si !== void 0 ? _layout$areas$area$si : prefHeight(groups[0].activeDock)));
				const floor = Math.max(0, ...groups.map((g, idx) => dockMinHeightForWidth(scene, g.activeDock, widths[idx], isVisible)));
				return {
					orient,
					widths,
					heights: [Math.max(base, floor)],
					floors: [floor]
				};
			}
			const floors = groups.map((g) => dockMinHeightForWidth(scene, g.activeDock, W, isVisible));
			return {
				orient,
				widths: [],
				heights: groups.map((g, idx) => {
					var _ref8, _g$group$size;
					return Math.max(40, Math.round((_ref8 = (_g$group$size = g.group.size) !== null && _g$group$size !== void 0 ? _g$group$size : layout.areas[area].size) !== null && _ref8 !== void 0 ? _ref8 : prefHeight(g.activeDock)), floors[idx]);
				}),
				floors
			};
		};
		const topGroups = resolveAreaVisibleGroups("top");
		const bottomGroups = resolveAreaVisibleGroups("bottom");
		const topEdge = topGroups.length > 0 ? resolveEdgeHeights("top", topGroups) : null;
		const bottomEdge = bottomGroups.length > 0 ? resolveEdgeHeights("bottom", bottomGroups) : null;
		const edgeSum = (edge) => edge ? edge.heights.reduce((acc, h) => acc + h, 0) : 0;
		let edgeExcess = edgeSum(topEdge) + edgeSum(bottomEdge) - Math.max(0, midH - MIN_CENTER_HEIGHT);
		for (const edge of [bottomEdge, topEdge]) {
			if (!edge) continue;
			for (let i = edge.heights.length - 1; i >= 0 && edgeExcess > 0; i--) {
				const cut = Math.min(edgeExcess, Math.max(0, edge.heights[i] - Math.max(40, edge.floors[i])));
				edge.heights[i] -= cut;
				edgeExcess -= cut;
			}
		}
		let topH = 0;
		if (topEdge) {
			if (topEdge.orient === "horizontal") {
				topH = topEdge.heights[0];
				let curX = 0;
				topGroups.forEach((g, idx) => {
					const gw = topEdge.widths[idx];
					assignGroupBoxes("top", g, curX, midY, gw, topH);
					curX += gw;
					if (idx < topGroups.length - 1) splitters.push({
						kind: "split",
						area: "top",
						groupIndex: g.groupIndex,
						orientation: "vertical",
						x: curX - 3,
						y: midY,
						width: 6,
						height: topH,
						currentSize: gw
					});
				});
			} else {
				let curY = midY;
				topGroups.forEach((g, idx) => {
					const gh = topEdge.heights[idx];
					assignGroupBoxes("top", g, 0, curY, W, gh);
					curY += gh;
					topH += gh;
					if (idx < topGroups.length - 1) splitters.push({
						kind: "split",
						area: "top",
						groupIndex: g.groupIndex,
						orientation: "horizontal",
						x: 0,
						y: curY - 3,
						width: W,
						height: 6,
						currentSize: gh
					});
				});
			}
			splitters.push({
				kind: "area",
				area: "top",
				orientation: "horizontal",
				x: 0,
				y: midY + topH - 3,
				width: W,
				height: 6,
				currentSize: topH
			});
		}
		let bottomH = 0;
		if (bottomEdge) {
			if (bottomEdge.orient === "horizontal") {
				bottomH = bottomEdge.heights[0];
				const bY = midY + midH - bottomH;
				let curX = 0;
				bottomGroups.forEach((g, idx) => {
					const gw = bottomEdge.widths[idx];
					assignGroupBoxes("bottom", g, curX, bY, gw, bottomH);
					curX += gw;
					if (idx < bottomGroups.length - 1) splitters.push({
						kind: "split",
						area: "bottom",
						groupIndex: g.groupIndex,
						orientation: "vertical",
						x: curX - 3,
						y: bY,
						width: 6,
						height: bottomH,
						currentSize: gw
					});
				});
			} else {
				bottomH = edgeSum(bottomEdge);
				let curY = midY + midH - bottomH;
				bottomGroups.forEach((g, idx) => {
					const gh = bottomEdge.heights[idx];
					assignGroupBoxes("bottom", g, 0, curY, W, gh);
					curY += gh;
					if (idx < bottomGroups.length - 1) splitters.push({
						kind: "split",
						area: "bottom",
						groupIndex: g.groupIndex,
						orientation: "horizontal",
						x: 0,
						y: curY - 3,
						width: W,
						height: 6,
						currentSize: gh
					});
				});
			}
			splitters.push({
				kind: "area",
				area: "bottom",
				orientation: "horizontal",
				x: 0,
				y: midY + midH - bottomH - 3,
				width: W,
				height: 6,
				currentSize: bottomH
			});
		}
		const centerY = midY + topH;
		const centerH = Math.max(0, midH - topH - bottomH);
		const resolveSideWidths = (area, groups) => {
			var _layout$areas$area$sp2;
			if (((_layout$areas$area$sp2 = layout.areas[area].splitOrientation) !== null && _layout$areas$area$sp2 !== void 0 ? _layout$areas$area$sp2 : "vertical") === "vertical") {
				var _layout$areas$area$si2;
				return [Math.max(60, Math.round((_layout$areas$area$si2 = layout.areas[area].size) !== null && _layout$areas$area$si2 !== void 0 ? _layout$areas$area$si2 : prefWidth(groups[0].activeDock)))];
			}
			return groups.map((g) => {
				var _ref9, _g$group$size2;
				return Math.max(60, Math.round((_ref9 = (_g$group$size2 = g.group.size) !== null && _g$group$size2 !== void 0 ? _g$group$size2 : layout.areas[area].size) !== null && _ref9 !== void 0 ? _ref9 : prefWidth(g.activeDock)));
			});
		};
		const leftGroups = resolveAreaVisibleGroups("left");
		const rightGroups = resolveAreaVisibleGroups("right");
		const leftWidths = leftGroups.length > 0 ? resolveSideWidths("left", leftGroups) : [];
		const rightWidths = rightGroups.length > 0 ? resolveSideWidths("right", rightGroups) : [];
		const sumOf = (list) => list.reduce((acc, v) => acc + v, 0);
		let sideExcess = sumOf(leftWidths) + sumOf(rightWidths) - Math.max(0, W - MIN_CENTER_WIDTH);
		for (const list of [rightWidths, leftWidths]) for (let i = list.length - 1; i >= 0 && sideExcess > 0; i--) {
			const cut = Math.min(sideExcess, Math.max(0, list[i] - 60));
			list[i] -= cut;
			sideExcess -= cut;
		}
		let leftW = 0;
		if (leftGroups.length > 0) {
			var _layout$areas$left$sp;
			if (((_layout$areas$left$sp = layout.areas.left.splitOrientation) !== null && _layout$areas$left$sp !== void 0 ? _layout$areas$left$sp : "vertical") === "vertical") {
				leftW = leftWidths[0];
				const heights = distributeGroupAxisSizes(centerH, leftGroups, "vertical");
				let curY = centerY;
				leftGroups.forEach((g, idx) => {
					const gh = heights[idx];
					assignGroupBoxes("left", g, 0, curY, leftW, gh);
					curY += gh;
					if (idx < leftGroups.length - 1) splitters.push({
						kind: "split",
						area: "left",
						groupIndex: g.groupIndex,
						orientation: "horizontal",
						x: 0,
						y: curY - 3,
						width: leftW,
						height: 6,
						currentSize: gh
					});
				});
			} else leftGroups.forEach((g, idx) => {
				const gw = leftWidths[idx];
				assignGroupBoxes("left", g, leftW, centerY, gw, centerH);
				leftW += gw;
				if (idx < leftGroups.length - 1) splitters.push({
					kind: "split",
					area: "left",
					groupIndex: g.groupIndex,
					orientation: "vertical",
					x: leftW - 3,
					y: centerY,
					width: 6,
					height: centerH,
					currentSize: gw
				});
			});
			splitters.push({
				kind: "area",
				area: "left",
				orientation: "vertical",
				x: leftW - 3,
				y: centerY,
				width: 6,
				height: centerH,
				currentSize: leftW
			});
		}
		let rightW = 0;
		if (rightGroups.length > 0) {
			var _layout$areas$right$s;
			if (((_layout$areas$right$s = layout.areas.right.splitOrientation) !== null && _layout$areas$right$s !== void 0 ? _layout$areas$right$s : "vertical") === "vertical") {
				rightW = rightWidths[0];
				const rX = W - rightW;
				const heights = distributeGroupAxisSizes(centerH, rightGroups, "vertical");
				let curY = centerY;
				rightGroups.forEach((g, idx) => {
					const gh = heights[idx];
					assignGroupBoxes("right", g, rX, curY, rightW, gh);
					curY += gh;
					if (idx < rightGroups.length - 1) splitters.push({
						kind: "split",
						area: "right",
						groupIndex: g.groupIndex,
						orientation: "horizontal",
						x: rX,
						y: curY - 3,
						width: rightW,
						height: 6,
						currentSize: gh
					});
				});
			} else {
				rightW = sumOf(rightWidths);
				let rCurX = W - rightW;
				rightGroups.forEach((g, idx) => {
					const gw = rightWidths[idx];
					assignGroupBoxes("right", g, rCurX, centerY, gw, centerH);
					rCurX += gw;
					if (idx < rightGroups.length - 1) splitters.push({
						kind: "split",
						area: "right",
						groupIndex: g.groupIndex,
						orientation: "vertical",
						x: rCurX - 3,
						y: centerY,
						width: 6,
						height: centerH,
						currentSize: gw
					});
				});
			}
			splitters.push({
				kind: "area",
				area: "right",
				orientation: "vertical",
				x: W - rightW - 3,
				y: centerY,
				width: 6,
				height: centerH,
				currentSize: rightW
			});
		}
		for (const f of (_layout$floating5 = layout.floating) !== null && _layout$floating5 !== void 0 ? _layout$floating5 : []) {
			if (!scene.nodes[f.dockId]) continue;
			const vis = winVis && isVisible(f.dockId);
			dockBoxes.set(f.dockId, {
				x: f.x,
				y: f.y,
				width: f.width,
				height: f.height,
				absX: f.x,
				absY: f.y,
				visible: vis,
				windowId: winId
			});
			activeTabByDock.set(f.dockId, {
				groupTabs: vis ? [f.dockId] : [],
				activeTab: f.dockId,
				isFloating: true,
				area: f.lastArea
			});
		}
		return {
			dockBoxes,
			centralBox: {
				x: leftW,
				y: centerY,
				width: Math.max(0, W - leftW - rightW),
				height: centerH
			},
			splitters,
			activeTabByDock
		};
	}
	/**
	* 把排列描述换算成当前窗口尺寸下的实际尺寸：换行面板撑高、窗口放不下时收窄、并排比例随窗口缩放后，
	* 描述里的尺寸与实际不同。和 Qt 实测比较时用这一份；没有可见面板的组和停靠区不带尺寸。
	*/
	function effectiveDockLayout(layout, boxOf) {
		const out = cloneDockLayout(layout);
		for (const area of DOCK_AREAS) {
			var _areaSpec$splitOrient6;
			const areaSpec = out.areas[area];
			const orient = (_areaSpec$splitOrient6 = areaSpec.splitOrientation) !== null && _areaSpec$splitOrient6 !== void 0 ? _areaSpec$splitOrient6 : defaultSplitOrientation(area);
			const horizontalThickness = area === "left" || area === "right";
			const alongThickness = orient !== defaultSplitOrientation(area);
			const shown = [];
			for (const group of areaSpec.groups) {
				delete group.size;
				const shownTab = group.tabs.find((tid) => {
					var _boxOf;
					return (_boxOf = boxOf(tid)) === null || _boxOf === void 0 ? void 0 : _boxOf.visible;
				});
				if (shownTab) shown.push({
					group,
					shownTab,
					box: boxOf(shownTab)
				});
			}
			let thickness = 0;
			for (const { group, shownTab, box } of shown) {
				group.active = shownTab;
				const groupThickness = horizontalThickness ? box.width : box.height;
				thickness = alongThickness ? thickness + groupThickness : Math.max(thickness, groupThickness);
				if (shown.length >= 2) group.size = orient === "horizontal" ? box.width : box.height;
			}
			if (thickness > 0) areaSpec.size = thickness;
			else delete areaSpec.size;
		}
		return out;
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
	const DIALOG_DECL = {
		type: "Dialog",
		label: "对话框",
		description: "弹出窗口或模态对话框",
		defaultSize: {
			width: 420,
			height: 320
		},
		props: { title: {
			type: "string",
			default: "对话框",
			logic: true
		} },
		children: true
	};
	const DOCK_DECL = {
		type: "Dock",
		label: "停靠面板",
		description: "主窗口四侧的停靠面板，导出为 QDockWidget",
		defaultSize: {
			width: 240,
			height: 320
		},
		props: { title: {
			type: "string",
			default: "面板",
			logic: true
		} },
		children: true
	};
	const STACK_DECL = {
		type: "Stack",
		label: "层叠布局",
		description: "多个子页面叠在同一区域，按 currentIndex 或 currentPage 切换显示",
		defaultSize: {
			width: 320,
			height: 240
		},
		props: {
			currentIndex: {
				type: "number",
				default: 0,
				logic: true
			},
			currentPage: {
				type: "string",
				default: "",
				logic: true
			}
		},
		children: true
	};
	const LAYOUT_TYPE_KINDS = {
		VBox: "vbox",
		HBox: "hbox",
		Grid: "grid",
		Form: "form",
		Stack: "stack",
		Flow: "flow"
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
	/** 是业务事件（界面 → 业务）就返回它的定义，否则返回 null。 */
	function businessEvent(logic, name) {
		const def = logic.events ? logic.events[name] : void 0;
		return def && !Array.isArray(def) && typeof def === "object" && def.owner === "business" ? def : null;
	}
	/** 是请求事件（业务 → 界面）就返回它的定义，否则返回 null。 */
	function requestEvent(logic, name) {
		const def = logic.events ? logic.events[name] : void 0;
		return def && !Array.isArray(def) && typeof def === "object" && def.owner === "ui" ? def : null;
	}
	/** 普通全局事件的步骤；不存在或者是业务事件/请求事件时返回 null。 */
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
		var _ref, _project$components$g, _project$components$g2, _STANDARD_COMPONENTS$;
		if (type === "Stack") return STACK_DECL;
		if (type === "Dock") return DOCK_DECL;
		if (type === "Dialog") return DIALOG_DECL;
		if (type === "Container" || type === "Window" || type in LAYOUT_TYPE_KINDS) return CONTAINER_DECL;
		if (type === "External") return EXTERNAL_DECL;
		if (type === "Shape") return SHAPE_DECL;
		if (type === "Line") return LINE_DECL;
		return (_ref = (_project$components$g = (_project$components$g2 = project.components.get(type)) === null || _project$components$g2 === void 0 ? void 0 : _project$components$g2.decl) !== null && _project$components$g !== void 0 ? _project$components$g : (_STANDARD_COMPONENTS$ = STANDARD_COMPONENTS.get(type)) === null || _STANDARD_COMPONENTS$ === void 0 ? void 0 : _STANDARD_COMPONENTS$.decl) !== null && _ref !== void 0 ? _ref : null;
	}
	/**
	* 根据控件当前状态（不可用、按下、悬停、选中、正常）选出应显示的状态与对应的 SVG 文件名。
	* 如果某状态未单独指定 SVG 文件，则回退到 normal。
	*/
	function resolveStateImage(decl, state) {
		const si = decl === null || decl === void 0 ? void 0 : decl.stateImages;
		if (!si || typeof si.normal !== "string" || !si.normal) return null;
		let key = "normal";
		if (!state.enabled) key = "disabled";
		else if (state.pressed) key = "pressed";
		else if (state.hovered) key = "hover";
		else if (state.selected) key = "selected";
		const file = si[key] || (key === "pressed" && si.hover ? si.hover : si.normal);
		return {
			state: key,
			file
		};
	}
	/**
	* 统一获取一个画布节点的全部直接子节点 ID（按 docks / dockLayout → central → statusBar → children 顺序去重）。
	*/
	function childrenOfNode(n) {
		var _n$docks, _n$children;
		if (!n) return [];
		const list = [];
		const add = (cid) => {
			if (cid && !list.includes(cid)) list.push(cid);
		};
		for (const cid of (_n$docks = n.docks) !== null && _n$docks !== void 0 ? _n$docks : []) add(cid);
		for (const cid of dockIdsOfLayout(n.dockLayout)) add(cid);
		add(n.central);
		add(n.statusBar);
		for (const cid of (_n$children = n.children) !== null && _n$children !== void 0 ? _n$children : []) add(cid);
		return list;
	}
	/** 查找某个节点在画布树中的父节点 ID（含主窗口的 docks / dockLayout / central / statusBar 分区）。 */
	function parentOfNode(scene, id) {
		for (const [parentId, parent] of Object.entries(scene.nodes)) if (childrenOfNode(parent).includes(id)) return parentId;
		return null;
	}
	function walkMenuItems(items, cb) {
		if (!items) return;
		for (const item of items) {
			cb(item);
			if (item.items && item.items.length > 0) walkMenuItems(item.items, cb);
		}
	}
	function allWindowIds(scene) {
		var _scene$windows;
		const result = [];
		const add = (id) => {
			if (id && scene.nodes[id] && !result.includes(id)) result.push(id);
		};
		add(scene.root);
		for (const id of (_scene$windows = scene.windows) !== null && _scene$windows !== void 0 ? _scene$windows : []) add(id);
		for (const [id, n] of Object.entries(scene.nodes)) if (n.type === "Window" || n.type === "Dialog") add(id);
		return result;
	}
	function allMenuItems(scene) {
		const list = [];
		const seen = /* @__PURE__ */ new Set();
		const pushItem = (windowId, menuId, item) => {
			if (!item.id || item.kind === "separator" || seen.has(item.id)) return;
			seen.add(item.id);
			list.push({
				windowId,
				menuId,
				item
			});
		};
		for (const winId of allWindowIds(scene)) {
			var _scene$nodes$winId, _menuBar$menus;
			const menuBar = (_scene$nodes$winId = scene.nodes[winId]) === null || _scene$nodes$winId === void 0 ? void 0 : _scene$nodes$winId.menuBar;
			if (!menuBar) continue;
			for (const menu of (_menuBar$menus = menuBar.menus) !== null && _menuBar$menus !== void 0 ? _menuBar$menus : []) walkMenuItems(menu.items, (item) => pushItem(winId, menu.id, item));
		}
		for (const [nodeId, n] of Object.entries(scene.nodes)) {
			if (n.contextMenu) walkMenuItems(n.contextMenu, (item) => pushItem(scene.root, `context:${nodeId}`, item));
			if (n.popupMenu) walkMenuItems(n.popupMenu, (item) => pushItem(scene.root, `popup:${nodeId}`, item));
		}
		return list;
	}
	function findMenuItem(scene, id) {
		for (const entry of allMenuItems(scene)) if (entry.item.id === id) return entry.item;
		return null;
	}
	function layoutOf(node) {
		if (!node) return null;
		if (node.layout) return node.layout;
		const kind = LAYOUT_TYPE_KINDS[node.type];
		if (kind) return { kind };
		if (node.type === "FloatBox") return {
			kind: "vbox",
			padding: 8,
			gap: 6
		};
		return null;
	}
	function paddingOf(layout) {
		const p = layout === null || layout === void 0 ? void 0 : layout.padding;
		if (Array.isArray(p) && p.length === 4) return [
			p[0],
			p[1],
			p[2],
			p[3]
		];
		const v = typeof p === "number" ? p : 0;
		return [
			v,
			v,
			v,
			v
		];
	}
	function prefWidth(node) {
		var _ref2, _ref3, _node$size$fixedWidth, _node$size, _node$size2;
		return Math.round((_ref2 = (_ref3 = (_node$size$fixedWidth = (_node$size = node.size) === null || _node$size === void 0 ? void 0 : _node$size.fixedWidth) !== null && _node$size$fixedWidth !== void 0 ? _node$size$fixedWidth : (_node$size2 = node.size) === null || _node$size2 === void 0 ? void 0 : _node$size2.preferredWidth) !== null && _ref3 !== void 0 ? _ref3 : node.width) !== null && _ref2 !== void 0 ? _ref2 : 100);
	}
	function prefHeight(node) {
		var _ref4, _ref5, _node$size$fixedHeigh, _node$size3, _node$size4;
		return Math.round((_ref4 = (_ref5 = (_node$size$fixedHeigh = (_node$size3 = node.size) === null || _node$size3 === void 0 ? void 0 : _node$size3.fixedHeight) !== null && _node$size$fixedHeigh !== void 0 ? _node$size$fixedHeigh : (_node$size4 = node.size) === null || _node$size4 === void 0 ? void 0 : _node$size4.preferredHeight) !== null && _ref5 !== void 0 ? _ref5 : node.height) !== null && _ref4 !== void 0 ? _ref4 : 32);
	}
	function clampWidth(node, w) {
		var _node$size5, _node$size6, _node$size$minWidth, _node$size7, _node$size$maxWidth, _node$size8;
		if (((_node$size5 = node.size) === null || _node$size5 === void 0 ? void 0 : _node$size5.fixedWidth) !== void 0) return Math.round(node.size.fixedWidth);
		if (((_node$size6 = node.size) === null || _node$size6 === void 0 ? void 0 : _node$size6.horizontal) === "fixed") return prefWidth(node);
		const minW = (_node$size$minWidth = (_node$size7 = node.size) === null || _node$size7 === void 0 ? void 0 : _node$size7.minWidth) !== null && _node$size$minWidth !== void 0 ? _node$size$minWidth : 0;
		const maxW = (_node$size$maxWidth = (_node$size8 = node.size) === null || _node$size8 === void 0 ? void 0 : _node$size8.maxWidth) !== null && _node$size$maxWidth !== void 0 ? _node$size$maxWidth : Infinity;
		return Math.round(Math.max(minW, Math.min(maxW, w)));
	}
	function clampHeight(node, h) {
		var _node$size9, _node$size10, _node$size$minHeight, _node$size11, _node$size$maxHeight, _node$size12;
		if (((_node$size9 = node.size) === null || _node$size9 === void 0 ? void 0 : _node$size9.fixedHeight) !== void 0) return Math.round(node.size.fixedHeight);
		if (((_node$size10 = node.size) === null || _node$size10 === void 0 ? void 0 : _node$size10.vertical) === "fixed") return prefHeight(node);
		const minH = (_node$size$minHeight = (_node$size11 = node.size) === null || _node$size11 === void 0 ? void 0 : _node$size11.minHeight) !== null && _node$size$minHeight !== void 0 ? _node$size$minHeight : 0;
		const maxH = (_node$size$maxHeight = (_node$size12 = node.size) === null || _node$size12 === void 0 ? void 0 : _node$size12.maxHeight) !== null && _node$size$maxHeight !== void 0 ? _node$size$maxHeight : Infinity;
		return Math.round(Math.max(minH, Math.min(maxH, h)));
	}
	/** 按与 Qt qGeomCalc 相同的累积舍入与最小/最大夹紧重分配规则把 rem 按比例分给各项。 */
	function distributeStretch(rem, weights, mins, maxs) {
		const n = weights.length;
		const result = new Array(n).fill(0);
		const active = weights.map((w) => w > 0);
		let remaining = Math.max(0, rem);
		for (let pass = 0; pass < n; pass++) {
			const activeWeights = weights.map((w, i) => active[i] ? w : 0);
			const total = activeWeights.reduce((a, b) => a + b, 0);
			if (total <= 0) break;
			let acc = 0;
			const remSpace = Math.max(0, remaining);
			const tentative = activeWeights.map((w) => {
				if (w <= 0) return 0;
				const start = Math.round(acc * remSpace / total);
				acc += w;
				const end = Math.round(acc * remSpace / total);
				return Math.max(0, end - start);
			});
			let clampedAny = false;
			for (let i = 0; i < n; i++) {
				var _mins$i, _maxs$i;
				if (!active[i]) continue;
				const minV = (_mins$i = mins === null || mins === void 0 ? void 0 : mins[i]) !== null && _mins$i !== void 0 ? _mins$i : 0;
				const maxV = (_maxs$i = maxs === null || maxs === void 0 ? void 0 : maxs[i]) !== null && _maxs$i !== void 0 ? _maxs$i : Infinity;
				if (tentative[i] < minV || tentative[i] > maxV) {
					const clamped = Math.round(Math.max(minV, Math.min(maxV, tentative[i])));
					result[i] = clamped;
					active[i] = false;
					remaining -= clamped;
					clampedAny = true;
				}
			}
			if (!clampedAny) {
				for (let i = 0; i < n; i++) if (active[i]) result[i] = tentative[i];
				break;
			}
		}
		return result;
	}
	function isPartitionedWindow(node) {
		if (!node) return false;
		return Boolean(node.menuBar || node.statusBar || node.central || node.docks && node.docks.length > 0 || node.dockLayout);
	}
	function isWrapLayout(layout) {
		if (!layout) return false;
		return layout.kind === "flow" || layout.kind === "hbox" && Boolean(layout.wrap);
	}
	function computeFlowRows(scene, visChildren, innerW, colGap) {
		const rows = [];
		let curIds = [];
		let curUsedW = 0;
		let curMaxH = 0;
		for (const cid of visChildren) {
			const c = scene.nodes[cid];
			if (!c) continue;
			const cw = clampWidth(c, prefWidth(c));
			const ch = clampHeight(c, prefHeight(c));
			const neededW = curIds.length === 0 ? cw : curUsedW + colGap + cw;
			if (curIds.length > 0 && neededW > innerW) {
				rows.push({
					ids: curIds,
					rowH: curMaxH || 28
				});
				curIds = [cid];
				curUsedW = cw;
				curMaxH = ch;
			} else {
				curIds.push(cid);
				curUsedW = neededW;
				curMaxH = Math.max(curMaxH, ch);
			}
		}
		if (curIds.length > 0) rows.push({
			ids: curIds,
			rowH: curMaxH || 28
		});
		return rows;
	}
	function flowHeightForWidth(scene, node, availWidth, isVisible) {
		var _ref6, _layout$columnGap, _ref7, _layout$rowGap, _node$children;
		const layout = layoutOf(node);
		if (!layout || !isWrapLayout(layout)) return prefHeight(node);
		const [padTop, padRight, padBottom, padLeft] = paddingOf(layout);
		const colGap = (_ref6 = (_layout$columnGap = layout.columnGap) !== null && _layout$columnGap !== void 0 ? _layout$columnGap : layout.gap) !== null && _ref6 !== void 0 ? _ref6 : 0;
		const rowGap = (_ref7 = (_layout$rowGap = layout.rowGap) !== null && _layout$rowGap !== void 0 ? _layout$rowGap : layout.gap) !== null && _ref7 !== void 0 ? _ref7 : 0;
		const innerW = Math.max(0, availWidth - padLeft - padRight);
		const rows = computeFlowRows(scene, ((_node$children = node.children) !== null && _node$children !== void 0 ? _node$children : []).filter((cid) => Boolean(scene.nodes[cid]) && isVisible(cid)), innerW, colGap);
		if (rows.length === 0) return prefHeight(node);
		return clampHeight(node, padTop + (rows.reduce((sum, r) => sum + r.rowH, 0) + Math.max(0, rows.length - 1) * rowGap) + padBottom);
	}
	/**
	* 停靠面板按给定宽度放下内容所需的最小高度，用作顶部、底部停靠区的下限。
	* 只有换行布局的高度随宽度变化，才有内容下限；其他面板的高度完全由停靠排列决定，返回 0。
	* 设计高度不是下限：面板被移到别的停靠区后，厚度跟随该停靠区。
	*/
	function dockMinHeightForWidth(scene, dock, availWidth, isVisible) {
		var _dock$size, _dock$size2, _dock$headerHeight, _ref8, _layout$columnGap2, _ref9, _layout$rowGap2, _dock$children;
		const layout = layoutOf(dock);
		if (!layout || !isWrapLayout(layout) || ((_dock$size = dock.size) === null || _dock$size === void 0 ? void 0 : _dock$size.fixedHeight) !== void 0 || ((_dock$size2 = dock.size) === null || _dock$size2 === void 0 ? void 0 : _dock$size2.vertical) === "fixed") return 0;
		const hdrH = (_dock$headerHeight = dock.headerHeight) !== null && _dock$headerHeight !== void 0 ? _dock$headerHeight : 26;
		const [padTop, padRight, padBottom, padLeft] = paddingOf(layout);
		const colGap = (_ref8 = (_layout$columnGap2 = layout.columnGap) !== null && _layout$columnGap2 !== void 0 ? _layout$columnGap2 : layout.gap) !== null && _ref8 !== void 0 ? _ref8 : 0;
		const rowGap = (_ref9 = (_layout$rowGap2 = layout.rowGap) !== null && _layout$rowGap2 !== void 0 ? _layout$rowGap2 : layout.gap) !== null && _ref9 !== void 0 ? _ref9 : 0;
		const innerW = Math.max(0, availWidth - padLeft - padRight);
		const rows = computeFlowRows(scene, ((_dock$children = dock.children) !== null && _dock$children !== void 0 ? _dock$children : []).filter((cid) => Boolean(scene.nodes[cid]) && isVisible(cid)), innerW, colGap);
		if (rows.length === 0) return 0;
		const rowsH = rows.reduce((sum, r) => sum + r.rowH, 0) + Math.max(0, rows.length - 1) * rowGap;
		return clampHeight(dock, hdrH + padTop + rowsH + padBottom);
	}
	/**
	* 计算一个窗口（或全部窗口）内所有节点的位置和尺寸。
	* 规则与 Qt 的 QMainWindow + QDockWidget + QVBoxLayout/QHBoxLayout/QGridLayout/QFormLayout/QStackedLayout 完全一致。
	*/
	function computeSceneLayout(scene, options = {}) {
		var _options$isVisible, _options$getProp;
		const isVisible = (_options$isVisible = options.isVisible) !== null && _options$isVisible !== void 0 ? _options$isVisible : (() => true);
		const getProp = (_options$getProp = options.getProp) !== null && _options$getProp !== void 0 ? _options$getProp : ((id, prop) => {
			var _scene$nodes$id$props, _scene$nodes$id;
			return (_scene$nodes$id$props = (_scene$nodes$id = scene.nodes[id]) === null || _scene$nodes$id === void 0 || (_scene$nodes$id = _scene$nodes$id.props) === null || _scene$nodes$id === void 0 ? void 0 : _scene$nodes$id[prop]) !== null && _scene$nodes$id$props !== void 0 ? _scene$nodes$id$props : null;
		});
		const boxes = /* @__PURE__ */ new Map();
		const isFloatingFloatBox = (cid) => {
			var _ref10, _getProp, _c$props;
			const c = scene.nodes[cid];
			if (!c || c.type !== "FloatBox") return false;
			return Boolean((_ref10 = (_getProp = getProp(cid, "floating")) !== null && _getProp !== void 0 ? _getProp : (_c$props = c.props) === null || _c$props === void 0 ? void 0 : _c$props.floating) !== null && _ref10 !== void 0 ? _ref10 : false);
		};
		const layoutFloatingFloatBox = (cid, parentBox) => {
			var _ref11, _ref12, _getProp2, _c$props2, _ref13, _getProp3, _c$props3, _ref14, _getProp4, _c$props4, _ref15, _getProp5, _c$props5, _ref16, _getProp6, _c$props6;
			const c = scene.nodes[cid];
			const hdrH = Math.max(0, Number((_ref11 = (_ref12 = (_getProp2 = getProp(cid, "headerHeight")) !== null && _getProp2 !== void 0 ? _getProp2 : (_c$props2 = c.props) === null || _c$props2 === void 0 ? void 0 : _c$props2.headerHeight) !== null && _ref12 !== void 0 ? _ref12 : c.headerHeight) !== null && _ref11 !== void 0 ? _ref11 : 24));
			const fx = Math.round(Number((_ref13 = (_getProp3 = getProp(cid, "floatX")) !== null && _getProp3 !== void 0 ? _getProp3 : (_c$props3 = c.props) === null || _c$props3 === void 0 ? void 0 : _c$props3.floatX) !== null && _ref13 !== void 0 ? _ref13 : 60));
			const fy = Math.round(Number((_ref14 = (_getProp4 = getProp(cid, "floatY")) !== null && _getProp4 !== void 0 ? _getProp4 : (_c$props4 = c.props) === null || _c$props4 === void 0 ? void 0 : _c$props4.floatY) !== null && _ref14 !== void 0 ? _ref14 : 80));
			const fw = Math.max(80, Math.round(Number((_ref15 = (_getProp5 = getProp(cid, "floatWidth")) !== null && _getProp5 !== void 0 ? _getProp5 : (_c$props5 = c.props) === null || _c$props5 === void 0 ? void 0 : _c$props5.floatWidth) !== null && _ref15 !== void 0 ? _ref15 : prefWidth(c))));
			const fh = Math.max(hdrH + 20, Math.round(Number((_ref16 = (_getProp6 = getProp(cid, "floatHeight")) !== null && _getProp6 !== void 0 ? _getProp6 : (_c$props6 = c.props) === null || _c$props6 === void 0 ? void 0 : _c$props6.floatHeight) !== null && _ref16 !== void 0 ? _ref16 : prefHeight(c))));
			const winBox = boxes.get(parentBox.windowId);
			const winVis = winBox ? winBox.visible : parentBox.visible;
			const box = {
				x: fx - parentBox.absX,
				y: fy - parentBox.absY,
				width: fw,
				height: fh,
				absX: fx,
				absY: fy,
				visible: winVis && isVisible(cid),
				windowId: parentBox.windowId
			};
			boxes.set(cid, box);
			layoutSubtree(cid, box);
		};
		const layoutSubtree = (parentId, parentBox) => {
			var _parent$children, _parent$headerHeight, _ref17, _ref18, _getProp7, _parent$props;
			const parent = scene.nodes[parentId];
			if (!parent) return;
			const rawChildren = ((_parent$children = parent.children) !== null && _parent$children !== void 0 ? _parent$children : []).filter((cid) => !boxes.has(cid) && Boolean(scene.nodes[cid]));
			if (rawChildren.length === 0) return;
			const headerOffset = parent.type === "Dock" ? (_parent$headerHeight = parent.headerHeight) !== null && _parent$headerHeight !== void 0 ? _parent$headerHeight : 26 : parent.type === "FloatBox" ? Math.max(0, Number((_ref17 = (_ref18 = (_getProp7 = getProp(parentId, "headerHeight")) !== null && _getProp7 !== void 0 ? _getProp7 : (_parent$props = parent.props) === null || _parent$props === void 0 ? void 0 : _parent$props.headerHeight) !== null && _ref18 !== void 0 ? _ref18 : parent.headerHeight) !== null && _ref17 !== void 0 ? _ref17 : 24)) : 0;
			const layout = layoutOf(parent);
			const children = [];
			for (const cid of rawChildren) if (isFloatingFloatBox(cid)) layoutFloatingFloatBox(cid, parentBox);
			else children.push(cid);
			if (children.length === 0) return;
			if (!layout) {
				for (const cid of children) {
					var _c$x, _c$y;
					const c = scene.nodes[cid];
					const cx = Math.round((_c$x = c.x) !== null && _c$x !== void 0 ? _c$x : 0);
					const cy = Math.round(((_c$y = c.y) !== null && _c$y !== void 0 ? _c$y : 0) + headerOffset);
					const box = {
						x: cx,
						y: cy,
						width: Math.round(c.width),
						height: Math.round(c.height),
						absX: parentBox.absX + cx,
						absY: parentBox.absY + cy,
						visible: parentBox.visible && isVisible(cid),
						windowId: parentBox.windowId
					};
					boxes.set(cid, box);
					layoutSubtree(cid, box);
				}
				return;
			}
			const [padTop, padRight, padBottom, padLeft] = paddingOf(layout);
			const innerX = padLeft;
			const innerY = headerOffset + padTop;
			const innerW = Math.max(0, parentBox.width - padLeft - padRight);
			const innerH = Math.max(0, parentBox.height - headerOffset - padTop - padBottom);
			if (layout.kind === "vbox") {
				var _ref19, _layout$gap;
				const gap = (_ref19 = (_layout$gap = layout.gap) !== null && _layout$gap !== void 0 ? _layout$gap : layout.rowGap) !== null && _ref19 !== void 0 ? _ref19 : 0;
				const visChildren = [];
				for (const cid of children) if (isVisible(cid)) visChildren.push(cid);
				else {
					const c = scene.nodes[cid];
					const box = {
						x: innerX,
						y: innerY,
						width: clampWidth(c, innerW),
						height: prefHeight(c),
						absX: parentBox.absX + innerX,
						absY: parentBox.absY + innerY,
						visible: false,
						windowId: parentBox.windowId
					};
					boxes.set(cid, box);
					layoutSubtree(cid, box);
				}
				const stretches = visChildren.map((cid) => {
					var _c$size$stretch, _c$size, _c$size2;
					const c = scene.nodes[cid];
					return (_c$size$stretch = (_c$size = c.size) === null || _c$size === void 0 ? void 0 : _c$size.stretch) !== null && _c$size$stretch !== void 0 ? _c$size$stretch : ((_c$size2 = c.size) === null || _c$size2 === void 0 ? void 0 : _c$size2.vertical) === "expanding" ? 1 : 0;
				});
				const baseHeights = visChildren.map((cid, i) => {
					var _c$size3, _c$size4;
					if (stretches[i] > 0) return 0;
					const c = scene.nodes[cid];
					if (isWrapLayout(layoutOf(c)) && ((_c$size3 = c.size) === null || _c$size3 === void 0 ? void 0 : _c$size3.fixedHeight) === void 0 && ((_c$size4 = c.size) === null || _c$size4 === void 0 ? void 0 : _c$size4.vertical) !== "fixed") return flowHeightForWidth(scene, c, clampWidth(c, innerW), isVisible);
					return clampHeight(c, prefHeight(c));
				});
				const mins = visChildren.map((cid) => {
					var _size$minHeight, _size;
					return Math.round((_size$minHeight = (_size = scene.nodes[cid].size) === null || _size === void 0 ? void 0 : _size.minHeight) !== null && _size$minHeight !== void 0 ? _size$minHeight : 0);
				});
				const maxs = visChildren.map((cid) => {
					var _size2;
					const m = (_size2 = scene.nodes[cid].size) === null || _size2 === void 0 ? void 0 : _size2.maxHeight;
					return m !== void 0 ? Math.round(m) : Infinity;
				});
				const fixedSum = baseHeights.reduce((a, b) => a + b, 0);
				const totalGap = Math.max(0, visChildren.length - 1) * gap;
				const extraH = distributeStretch(Math.max(0, innerH - fixedSum - totalGap), stretches, mins, maxs);
				let curY = innerY;
				visChildren.forEach((cid, i) => {
					const c = scene.nodes[cid];
					const ch = stretches[i] > 0 ? clampHeight(c, extraH[i]) : baseHeights[i];
					const cw = clampWidth(c, innerW);
					const box = {
						x: innerX,
						y: curY,
						width: cw,
						height: ch,
						absX: parentBox.absX + innerX,
						absY: parentBox.absY + curY,
						visible: parentBox.visible,
						windowId: parentBox.windowId
					};
					boxes.set(cid, box);
					layoutSubtree(cid, box);
					curY += ch + gap;
				});
				return;
			}
			if (isWrapLayout(layout)) {
				var _ref20, _layout$columnGap3, _ref21, _layout$rowGap3;
				const colGap = (_ref20 = (_layout$columnGap3 = layout.columnGap) !== null && _layout$columnGap3 !== void 0 ? _layout$columnGap3 : layout.gap) !== null && _ref20 !== void 0 ? _ref20 : 0;
				const rowGap = (_ref21 = (_layout$rowGap3 = layout.rowGap) !== null && _layout$rowGap3 !== void 0 ? _layout$rowGap3 : layout.gap) !== null && _ref21 !== void 0 ? _ref21 : 0;
				const visChildren = [];
				for (const cid of children) if (isVisible(cid)) visChildren.push(cid);
				else {
					const c = scene.nodes[cid];
					const box = {
						x: innerX,
						y: innerY,
						width: prefWidth(c),
						height: prefHeight(c),
						absX: parentBox.absX + innerX,
						absY: parentBox.absY + innerY,
						visible: false,
						windowId: parentBox.windowId
					};
					boxes.set(cid, box);
					layoutSubtree(cid, box);
				}
				const rows = computeFlowRows(scene, visChildren, innerW, colGap);
				let curY = innerY;
				for (const row of rows) {
					const stretches = row.ids.map((cid) => {
						var _c$size$stretch2, _c$size5, _c$size6;
						const c = scene.nodes[cid];
						return (_c$size$stretch2 = (_c$size5 = c.size) === null || _c$size5 === void 0 ? void 0 : _c$size5.stretch) !== null && _c$size$stretch2 !== void 0 ? _c$size$stretch2 : ((_c$size6 = c.size) === null || _c$size6 === void 0 ? void 0 : _c$size6.horizontal) === "expanding" ? 1 : 0;
					});
					const baseWidths = row.ids.map((cid, i) => stretches[i] > 0 ? 0 : clampWidth(scene.nodes[cid], prefWidth(scene.nodes[cid])));
					const mins = row.ids.map((cid) => {
						var _size$minWidth, _size3;
						return Math.round((_size$minWidth = (_size3 = scene.nodes[cid].size) === null || _size3 === void 0 ? void 0 : _size3.minWidth) !== null && _size$minWidth !== void 0 ? _size$minWidth : prefWidth(scene.nodes[cid]));
					});
					const maxs = row.ids.map((cid) => {
						var _size4;
						const m = (_size4 = scene.nodes[cid].size) === null || _size4 === void 0 ? void 0 : _size4.maxWidth;
						return m !== void 0 ? Math.round(m) : Infinity;
					});
					const fixedSum = baseWidths.reduce((a, b) => a + b, 0);
					const totalGap = Math.max(0, row.ids.length - 1) * colGap;
					const extraW = distributeStretch(Math.max(0, innerW - fixedSum - totalGap), stretches, mins, maxs);
					let curX = innerX;
					row.ids.forEach((cid, i) => {
						const c = scene.nodes[cid];
						const cw = stretches[i] > 0 ? clampWidth(c, extraW[i]) : baseWidths[i];
						const ch = clampHeight(c, row.rowH);
						const box = {
							x: curX,
							y: curY,
							width: cw,
							height: ch,
							absX: parentBox.absX + curX,
							absY: parentBox.absY + curY,
							visible: parentBox.visible,
							windowId: parentBox.windowId
						};
						boxes.set(cid, box);
						layoutSubtree(cid, box);
						curX += cw + colGap;
					});
					curY += row.rowH + rowGap;
				}
				return;
			}
			if (layout.kind === "hbox") {
				var _ref22, _layout$gap2;
				const gap = (_ref22 = (_layout$gap2 = layout.gap) !== null && _layout$gap2 !== void 0 ? _layout$gap2 : layout.columnGap) !== null && _ref22 !== void 0 ? _ref22 : 0;
				const visChildren = [];
				for (const cid of children) if (isVisible(cid)) visChildren.push(cid);
				else {
					const c = scene.nodes[cid];
					const box = {
						x: innerX,
						y: innerY,
						width: prefWidth(c),
						height: clampHeight(c, innerH),
						absX: parentBox.absX + innerX,
						absY: parentBox.absY + innerY,
						visible: false,
						windowId: parentBox.windowId
					};
					boxes.set(cid, box);
					layoutSubtree(cid, box);
				}
				const stretches = visChildren.map((cid) => {
					var _c$size$stretch3, _c$size7, _c$size8;
					const c = scene.nodes[cid];
					return (_c$size$stretch3 = (_c$size7 = c.size) === null || _c$size7 === void 0 ? void 0 : _c$size7.stretch) !== null && _c$size$stretch3 !== void 0 ? _c$size$stretch3 : ((_c$size8 = c.size) === null || _c$size8 === void 0 ? void 0 : _c$size8.horizontal) === "expanding" ? 1 : 0;
				});
				const baseWidths = visChildren.map((cid, i) => stretches[i] > 0 ? 0 : clampWidth(scene.nodes[cid], prefWidth(scene.nodes[cid])));
				const mins = visChildren.map((cid) => {
					var _size$minWidth2, _size5;
					return Math.round((_size$minWidth2 = (_size5 = scene.nodes[cid].size) === null || _size5 === void 0 ? void 0 : _size5.minWidth) !== null && _size$minWidth2 !== void 0 ? _size$minWidth2 : 0);
				});
				const maxs = visChildren.map((cid) => {
					var _size6;
					const m = (_size6 = scene.nodes[cid].size) === null || _size6 === void 0 ? void 0 : _size6.maxWidth;
					return m !== void 0 ? Math.round(m) : Infinity;
				});
				const fixedSum = baseWidths.reduce((a, b) => a + b, 0);
				const totalGap = Math.max(0, visChildren.length - 1) * gap;
				const extraW = distributeStretch(Math.max(0, innerW - fixedSum - totalGap), stretches, mins, maxs);
				let curX = innerX;
				visChildren.forEach((cid, i) => {
					const c = scene.nodes[cid];
					const cw = stretches[i] > 0 ? clampWidth(c, extraW[i]) : baseWidths[i];
					const ch = clampHeight(c, innerH);
					const box = {
						x: curX,
						y: innerY,
						width: cw,
						height: ch,
						absX: parentBox.absX + curX,
						absY: parentBox.absY + innerY,
						visible: parentBox.visible,
						windowId: parentBox.windowId
					};
					boxes.set(cid, box);
					layoutSubtree(cid, box);
					curX += cw + gap;
				});
				return;
			}
			if (layout.kind === "grid") {
				var _layout$columns, _ref23, _layout$columnGap4, _ref24, _layout$rowGap4;
				const cols = Math.max(1, (_layout$columns = layout.columns) !== null && _layout$columns !== void 0 ? _layout$columns : 2);
				const colGap = (_ref23 = (_layout$columnGap4 = layout.columnGap) !== null && _layout$columnGap4 !== void 0 ? _layout$columnGap4 : layout.gap) !== null && _ref23 !== void 0 ? _ref23 : 0;
				const rowGap = (_ref24 = (_layout$rowGap4 = layout.rowGap) !== null && _layout$rowGap4 !== void 0 ? _layout$rowGap4 : layout.gap) !== null && _ref24 !== void 0 ? _ref24 : 0;
				const items = [];
				let autoIndex = 0;
				for (const cid of children) {
					var _c$row, _c$column, _c$rowSpan, _c$columnSpan;
					const c = scene.nodes[cid];
					const vis = isVisible(cid);
					const row = (_c$row = c.row) !== null && _c$row !== void 0 ? _c$row : Math.floor(autoIndex / cols);
					const col = (_c$column = c.column) !== null && _c$column !== void 0 ? _c$column : autoIndex % cols;
					const rowSpan = Math.max(1, (_c$rowSpan = c.rowSpan) !== null && _c$rowSpan !== void 0 ? _c$rowSpan : 1);
					const colSpan = Math.max(1, Math.min(cols - col, (_c$columnSpan = c.columnSpan) !== null && _c$columnSpan !== void 0 ? _c$columnSpan : 1));
					items.push({
						id: cid,
						row,
						col,
						rowSpan,
						colSpan,
						vis
					});
					autoIndex++;
				}
				const numRows = Math.max(1, ...items.map((it) => it.row + it.rowSpan));
				const colStretches = Array.from({ length: cols }, (_, col) => {
					var _layout$columnStretch, _layout$columnStretch2;
					return (_layout$columnStretch = (_layout$columnStretch2 = layout.columnStretch) === null || _layout$columnStretch2 === void 0 ? void 0 : _layout$columnStretch2[col]) !== null && _layout$columnStretch !== void 0 ? _layout$columnStretch : 1;
				});
				const colBaseW = Array.from({ length: cols }, (_, col) => {
					if (colStretches[col] > 0) return 0;
					let maxW = 0;
					for (const it of items) if (it.col === col && it.colSpan === 1) maxW = Math.max(maxW, clampWidth(scene.nodes[it.id], prefWidth(scene.nodes[it.id])));
					return maxW || 60;
				});
				const colMins = Array.from({ length: cols }, (_, col) => {
					let minW = 0;
					for (const it of items) {
						var _size$minWidth3, _size7;
						if (it.col === col && it.colSpan === 1) minW = Math.max(minW, Math.round((_size$minWidth3 = (_size7 = scene.nodes[it.id].size) === null || _size7 === void 0 ? void 0 : _size7.minWidth) !== null && _size$minWidth3 !== void 0 ? _size$minWidth3 : 0));
					}
					return minW;
				});
				const colMaxs = Array.from({ length: cols }, (_, col) => {
					let maxW = Infinity;
					for (const it of items) {
						var _size8;
						const m = (_size8 = scene.nodes[it.id].size) === null || _size8 === void 0 ? void 0 : _size8.maxWidth;
						if (it.col === col && it.colSpan === 1 && m !== void 0) maxW = Math.min(maxW, Math.round(m));
					}
					return maxW;
				});
				const colExtraW = distributeStretch(Math.max(0, innerW - Math.max(0, cols - 1) * colGap - colBaseW.reduce((a, b) => a + b, 0)), colStretches, colMins, colMaxs);
				const colW = colBaseW.map((b, c) => colStretches[c] > 0 ? colExtraW[c] : b);
				const colX = [];
				let cx = innerX;
				for (let c = 0; c < cols; c++) {
					colX.push(cx);
					cx += colW[c] + colGap;
				}
				const rowStretches = Array.from({ length: numRows }, (_, row) => {
					var _layout$rowStretch$ro, _layout$rowStretch;
					return (_layout$rowStretch$ro = (_layout$rowStretch = layout.rowStretch) === null || _layout$rowStretch === void 0 ? void 0 : _layout$rowStretch[row]) !== null && _layout$rowStretch$ro !== void 0 ? _layout$rowStretch$ro : 0;
				});
				const rowBaseH = Array.from({ length: numRows }, (_, row) => {
					if (rowStretches[row] > 0) return 0;
					let maxH = 0;
					for (const it of items) if (it.row === row && it.rowSpan === 1) maxH = Math.max(maxH, clampHeight(scene.nodes[it.id], prefHeight(scene.nodes[it.id])));
					return maxH || 32;
				});
				const rowMins = Array.from({ length: numRows }, (_, row) => {
					let minH = 0;
					for (const it of items) {
						var _size$minHeight2, _size9;
						if (it.row === row && it.rowSpan === 1) minH = Math.max(minH, Math.round((_size$minHeight2 = (_size9 = scene.nodes[it.id].size) === null || _size9 === void 0 ? void 0 : _size9.minHeight) !== null && _size$minHeight2 !== void 0 ? _size$minHeight2 : 0));
					}
					return minH;
				});
				const rowMaxs = Array.from({ length: numRows }, (_, row) => {
					let maxH = Infinity;
					for (const it of items) {
						var _size10;
						const m = (_size10 = scene.nodes[it.id].size) === null || _size10 === void 0 ? void 0 : _size10.maxHeight;
						if (it.row === row && it.rowSpan === 1 && m !== void 0) maxH = Math.min(maxH, Math.round(m));
					}
					return maxH;
				});
				const rowExtraH = distributeStretch(Math.max(0, innerH - Math.max(0, numRows - 1) * rowGap - rowBaseH.reduce((a, b) => a + b, 0)), rowStretches, rowMins, rowMaxs);
				const rowH = rowBaseH.map((b, r) => rowStretches[r] > 0 ? rowExtraH[r] : b);
				const rowY = [];
				let cy = innerY;
				for (let r = 0; r < numRows; r++) {
					rowY.push(cy);
					cy += rowH[r] + rowGap;
				}
				for (const it of items) {
					var _colX$it$col, _rowY$it$row, _colW, _rowH;
					const c = scene.nodes[it.id];
					const x = (_colX$it$col = colX[it.col]) !== null && _colX$it$col !== void 0 ? _colX$it$col : innerX;
					const y = (_rowY$it$row = rowY[it.row]) !== null && _rowY$it$row !== void 0 ? _rowY$it$row : innerY;
					let spanW = 0;
					for (let k = 0; k < it.colSpan; k++) spanW += ((_colW = colW[it.col + k]) !== null && _colW !== void 0 ? _colW : 0) + (k > 0 ? colGap : 0);
					let spanH = 0;
					for (let k = 0; k < it.rowSpan; k++) spanH += ((_rowH = rowH[it.row + k]) !== null && _rowH !== void 0 ? _rowH : 0) + (k > 0 ? rowGap : 0);
					const box = {
						x,
						y,
						width: clampWidth(c, spanW),
						height: clampHeight(c, spanH),
						absX: parentBox.absX + x,
						absY: parentBox.absY + y,
						visible: parentBox.visible && it.vis,
						windowId: parentBox.windowId
					};
					boxes.set(it.id, box);
					layoutSubtree(it.id, box);
				}
				return;
			}
			if (layout.kind === "form") {
				var _ref25, _layout$columnGap5, _ref26, _layout$rowGap5, _layout$labelWidth;
				const colGap = (_ref25 = (_layout$columnGap5 = layout.columnGap) !== null && _layout$columnGap5 !== void 0 ? _layout$columnGap5 : layout.gap) !== null && _ref25 !== void 0 ? _ref25 : 8;
				const rowGap = (_ref26 = (_layout$rowGap5 = layout.rowGap) !== null && _layout$rowGap5 !== void 0 ? _layout$rowGap5 : layout.gap) !== null && _ref26 !== void 0 ? _ref26 : 8;
				const labelW = (_layout$labelWidth = layout.labelWidth) !== null && _layout$labelWidth !== void 0 ? _layout$labelWidth : 96;
				const fieldW = Math.max(0, innerW - labelW - colGap);
				let curY = innerY;
				for (let i = 0; i < children.length; i += 2) {
					const labelId = children[i];
					const fieldId = children[i + 1];
					const labelNode = labelId ? scene.nodes[labelId] : void 0;
					const fieldNode = fieldId ? scene.nodes[fieldId] : void 0;
					const rowVis = (labelId ? isVisible(labelId) : false) || (fieldId ? isVisible(fieldId) : false);
					const rowH = Math.max(labelNode ? prefHeight(labelNode) : 0, fieldNode ? prefHeight(fieldNode) : 0, 28);
					if (labelId && labelNode) {
						const box = {
							x: innerX,
							y: curY,
							width: labelW,
							height: rowH,
							absX: parentBox.absX + innerX,
							absY: parentBox.absY + curY,
							visible: parentBox.visible && isVisible(labelId),
							windowId: parentBox.windowId
						};
						boxes.set(labelId, box);
						layoutSubtree(labelId, box);
					}
					if (fieldId && fieldNode) {
						const fx = innerX + labelW + colGap;
						const fw = clampWidth(fieldNode, fieldW);
						const box = {
							x: fx,
							y: curY,
							width: fw,
							height: rowH,
							absX: parentBox.absX + fx,
							absY: parentBox.absY + curY,
							visible: parentBox.visible && isVisible(fieldId),
							windowId: parentBox.windowId
						};
						boxes.set(fieldId, box);
						layoutSubtree(fieldId, box);
					}
					if (rowVis) curY += rowH + rowGap;
				}
				return;
			}
			if (layout.kind === "stack") {
				var _ref27, _getProp8, _parent$props2, _ref28, _getProp9, _parent$props3;
				const activeIdx = Number((_ref27 = (_getProp8 = getProp(parentId, "currentIndex")) !== null && _getProp8 !== void 0 ? _getProp8 : (_parent$props2 = parent.props) === null || _parent$props2 === void 0 ? void 0 : _parent$props2.currentIndex) !== null && _ref27 !== void 0 ? _ref27 : 0);
				const activePage = String((_ref28 = (_getProp9 = getProp(parentId, "currentPage")) !== null && _getProp9 !== void 0 ? _getProp9 : (_parent$props3 = parent.props) === null || _parent$props3 === void 0 ? void 0 : _parent$props3.currentPage) !== null && _ref28 !== void 0 ? _ref28 : "");
				children.forEach((cid, idx) => {
					const active = activePage ? cid === activePage : idx === activeIdx;
					const box = {
						x: innerX,
						y: innerY,
						width: innerW,
						height: innerH,
						absX: parentBox.absX + innerX,
						absY: parentBox.absY + innerY,
						visible: parentBox.visible && active && isVisible(cid),
						windowId: parentBox.windowId
					};
					boxes.set(cid, box);
					layoutSubtree(cid, box);
				});
			}
		};
		for (const winId of allWindowIds(scene)) {
			const winNode = scene.nodes[winId];
			if (!winNode) continue;
			const W = winId === scene.root && options.rootSize ? options.rootSize.width : winNode.width;
			const H = winId === scene.root && options.rootSize ? options.rootSize.height : winNode.height;
			const winVis = isVisible(winId);
			const winBox = {
				x: 0,
				y: 0,
				width: W,
				height: H,
				absX: 0,
				absY: 0,
				visible: winVis,
				windowId: winId
			};
			boxes.set(winId, winBox);
			if (isPartitionedWindow(winNode)) {
				var _winNode$menuBar$heig, _options$getDockLayou;
				const menuH = winNode.menuBar ? (_winNode$menuBar$heig = winNode.menuBar.height) !== null && _winNode$menuBar$heig !== void 0 ? _winNode$menuBar$heig : 28 : 0;
				const statusId = winNode.statusBar;
				const statusNode = statusId ? scene.nodes[statusId] : void 0;
				const statusVis = Boolean(statusId && statusNode && isVisible(statusId));
				const statusH = statusNode ? statusVis ? prefHeight(statusNode) : 0 : 0;
				if (statusId && statusNode) {
					const sBox = {
						x: 0,
						y: H - (statusH || prefHeight(statusNode)),
						width: W,
						height: statusH || prefHeight(statusNode),
						absX: 0,
						absY: H - (statusH || prefHeight(statusNode)),
						visible: winVis && statusVis,
						windowId: winId
					};
					boxes.set(statusId, sBox);
					layoutSubtree(statusId, sBox);
				}
				const dockRes = computeDockWindowLayout(scene, winId, winNode, W, menuH, Math.max(0, H - menuH - statusH), winVis, isVisible, (_options$getDockLayou = options.getDockLayout) === null || _options$getDockLayou === void 0 ? void 0 : _options$getDockLayou.call(options, winId));
				for (const [did, dBox] of dockRes.dockBoxes) {
					boxes.set(did, dBox);
					layoutSubtree(did, dBox);
				}
				const centralId = winNode.central;
				if (centralId && scene.nodes[centralId]) {
					const { x: cx, y: cy, width: cw, height: ch } = dockRes.centralBox;
					const cBox = {
						x: cx,
						y: cy,
						width: cw,
						height: ch,
						absX: cx,
						absY: cy,
						visible: winVis && isVisible(centralId),
						windowId: winId
					};
					boxes.set(centralId, cBox);
					layoutSubtree(centralId, cBox);
				}
			}
			layoutSubtree(winId, winBox);
		}
		return boxes;
	}
	//#endregion
	//#region src/transform.ts
	/** 把角度规整到 (-180, 180] 的整数度数。 */
	function normalizeRotation(deg) {
		if (!Number.isFinite(deg)) return 0;
		let a = Math.round(deg) % 360;
		if (a > 180) a -= 360;
		if (a <= -180) a += 360;
		return a === 0 ? 0 : a;
	}
	/** 把点 p 绕 center 顺时针旋转 deg 度。 */
	function rotatePoint(p, center, deg) {
		if (!deg) return {
			x: p.x,
			y: p.y
		};
		const rad = deg * Math.PI / 180;
		const cos = Math.cos(rad);
		const sin = Math.sin(rad);
		const dx = p.x - center.x;
		const dy = p.y - center.y;
		return {
			x: center.x + dx * cos - dy * sin,
			y: center.y + dx * sin + dy * cos
		};
	}
	function parentOfInScene(scene, id) {
		return parentOfNode(scene, id);
	}
	/** 从节点自身往外到根窗口之前的祖先链 `[id, parentId, ...]`。 */
	function ancestorChainInScene(scene, id) {
		const chain = [];
		for (let cursor = id; cursor && cursor !== scene.root; cursor = parentOfInScene(scene, cursor)) {
			if (chain.includes(cursor)) break;
			chain.push(cursor);
		}
		return chain;
	}
	/** 节点在画布世界坐标系中的累计旋转角度（含祖先容器的旋转）。 */
	function worldRotationInScene(scene, id) {
		let total = 0;
		for (const curr of ancestorChainInScene(scene, id)) {
			var _scene$nodes$curr$rot, _scene$nodes$curr;
			total += (_scene$nodes$curr$rot = (_scene$nodes$curr = scene.nodes[curr]) === null || _scene$nodes$curr === void 0 ? void 0 : _scene$nodes$curr.rotation) !== null && _scene$nodes$curr$rot !== void 0 ? _scene$nodes$curr$rot : 0;
		}
		return normalizeRotation(total);
	}
	function needsSceneLayoutForChain(scene, chain) {
		for (const curr of chain) {
			if (!scene.nodes[curr]) continue;
			const parentId = parentOfInScene(scene, curr);
			if (!parentId && curr !== scene.root) return true;
			if (parentId) {
				const parent = scene.nodes[parentId];
				if (parent && (layoutOf(parent) !== null || isPartitionedWindow(parent) || parent.type === "Dock")) return true;
			}
		}
		return false;
	}
	function localBoxInParent(scene, curr, boxes) {
		var _n$x2, _n$y2;
		const n = scene.nodes[curr];
		if (!n) return {
			x: 0,
			y: 0,
			width: 0,
			height: 0
		};
		if (curr === scene.root) return {
			x: 0,
			y: 0,
			width: n.width,
			height: n.height
		};
		const parentId = parentOfInScene(scene, curr);
		if (!parentId) {
			var _n$x, _n$y;
			const box = boxes === null || boxes === void 0 ? void 0 : boxes.get(curr);
			const w = box ? box.width : n.width;
			const h = box ? box.height : n.height;
			const rootNode = scene.nodes[scene.root];
			return {
				x: (_n$x = n.x) !== null && _n$x !== void 0 ? _n$x : rootNode ? Math.round((rootNode.width - w) / 2) : 0,
				y: (_n$y = n.y) !== null && _n$y !== void 0 ? _n$y : rootNode ? Math.round((rootNode.height - h) / 2) : 0,
				width: w,
				height: h
			};
		}
		const parent = scene.nodes[parentId];
		if (Boolean(parent && (layoutOf(parent) !== null || isPartitionedWindow(parent) || parent.type === "Dock")) && boxes) {
			const box = boxes.get(curr);
			if (box) return {
				x: box.x,
				y: box.y,
				width: box.width,
				height: box.height
			};
		}
		return {
			x: (_n$x2 = n.x) !== null && _n$x2 !== void 0 ? _n$x2 : 0,
			y: (_n$y2 = n.y) !== null && _n$y2 !== void 0 ? _n$y2 : 0,
			width: n.width,
			height: n.height
		};
	}
	/** 把节点 id 内部局部坐标 `(0..width, 0..height)` 中的点转换到画布世界坐标。 */
	function nodeLocalToWorldInScene(scene, id, localPt, layoutBoxes) {
		let pt = {
			x: localPt.x,
			y: localPt.y
		};
		const chain = ancestorChainInScene(scene, id);
		const boxes = layoutBoxes !== null && layoutBoxes !== void 0 ? layoutBoxes : needsSceneLayoutForChain(scene, chain) ? computeSceneLayout(scene) : void 0;
		for (const curr of chain) {
			const n = scene.nodes[curr];
			if (!n) continue;
			const box = localBoxInParent(scene, curr, boxes);
			if (n.rotation) pt = rotatePoint(pt, {
				x: box.width / 2,
				y: box.height / 2
			}, n.rotation);
			pt = {
				x: pt.x + box.x,
				y: pt.y + box.y
			};
		}
		return pt;
	}
	/** 把画布世界坐标中的点转换到节点 id 内部未旋转局部坐标 `(0..width, 0..height)`。 */
	function worldToNodeLocalInScene(scene, id, worldPt, layoutBoxes) {
		let pt = {
			x: worldPt.x,
			y: worldPt.y
		};
		const chain = ancestorChainInScene(scene, id);
		const boxes = layoutBoxes !== null && layoutBoxes !== void 0 ? layoutBoxes : needsSceneLayoutForChain(scene, chain) ? computeSceneLayout(scene) : void 0;
		for (const curr of [...chain].reverse()) {
			const n = scene.nodes[curr];
			if (!n) continue;
			const box = localBoxInParent(scene, curr, boxes);
			pt = {
				x: pt.x - box.x,
				y: pt.y - box.y
			};
			if (n.rotation) pt = rotatePoint(pt, {
				x: box.width / 2,
				y: box.height / 2
			}, -n.rotation);
		}
		return pt;
	}
	//#endregion
	//#region src/expr.ts
	const NAME_START = /[^\x00-\x40\x5B-\x5E\x60\x7B-\x7F]/;
	const NAME_PATH = /^[^\x00-\x40\x5B-\x5E\x60\x7B-\x7F][^\x00-\x2F\x3A-\x40\x5B-\x5E\x60\x7B-\x7F]*(\.[^\x00-\x40\x5B-\x5E\x60\x7B-\x7F][^\x00-\x2F\x3A-\x40\x5B-\x5E\x60\x7B-\x7F]*)*/;
	const SIMPLE_ASSIGNMENT = /^\s*([^\x00-\x40\x5B-\x5E\x60\x7B-\x7F][^\x00-\x2D\x2F\x3A-\x40\x5B-\x5E\x60\x7B-\x7F]*)\s*=(?!=)([\s\S]+)$/;
	const INDEXED_ASSIGNMENT = /^\s*([^\x00-\x40\x5B-\x5E\x60\x7B-\x7F][^\x00-\x2D\x2F\x3A-\x40\x5B-\x5E\x60\x7B-\x7F]*)\s*\[\s*([^\]]+?)\s*\](?:\.([^\x00-\x40\x5B-\x5E\x60\x7B-\x7F][^\x00-\x2D\x2F\x3A-\x40\x5B-\x5E\x60\x7B-\x7F]*))?\s*=(?!=)([\s\S]+)$/;
	function canPrecedeUnaryMinus(prev) {
		if (!prev) return true;
		if (prev.type !== "op") return false;
		return prev.op !== ")" && prev.op !== "]";
	}
	function tokenize(source) {
		const tokens = [];
		let i = 0;
		while (i < source.length) {
			var _source, _tokens;
			const ch = source[i];
			if (/\s/.test(ch)) i++;
			else if (ch === "(" || ch === ")" || ch === "[" || ch === "]") {
				tokens.push({
					type: "op",
					op: ch
				});
				i++;
			} else if (source.startsWith("==", i) || source.startsWith("!=", i) || source.startsWith("<=", i) || source.startsWith(">=", i)) {
				tokens.push({
					type: "op",
					op: source.slice(i, i + 2)
				});
				i += 2;
			} else if (ch === "<" || ch === ">" || ch === "+" || ch === "?" || ch === ":") {
				tokens.push({
					type: "op",
					op: ch
				});
				i++;
			} else if (ch === "'" || ch === "\"") {
				const end = source.indexOf(ch, i + 1);
				if (end < 0) throw new Error(`字符串缺少结束的引号：${source.slice(i)}`);
				tokens.push({
					type: "literal",
					value: source.slice(i + 1, end)
				});
				i = end + 1;
			} else if (/[0-9]/.test(ch) || ch === "-" && /[0-9]/.test((_source = source[i + 1]) !== null && _source !== void 0 ? _source : "") && canPrecedeUnaryMinus(tokens[tokens.length - 1])) {
				const match = /^-?[0-9]+(\.[0-9]+)?/.exec(source.slice(i));
				tokens.push({
					type: "literal",
					value: Number(match[0])
				});
				i += match[0].length;
			} else if (ch === "-") {
				tokens.push({
					type: "op",
					op: "-"
				});
				i++;
			} else if (ch === "." && ((_tokens = tokens[tokens.length - 1]) === null || _tokens === void 0 ? void 0 : _tokens.type) === "op" && tokens[tokens.length - 1].op === "]") {
				const match = NAME_PATH.exec(source.slice(i + 1));
				if (!match) throw new Error(`下标后面的属性名不对：${source.slice(i)}`);
				tokens.push({
					type: "path",
					path: "." + match[0]
				});
				i += 1 + match[0].length;
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
		function parseTernary() {
			const cond = parseOr();
			if (peekOp("?")) {
				pos++;
				const thenExpr = parseTernary();
				if (!peekOp(":")) throw new Error("三目表达式缺少冒号“:”");
				pos++;
				return {
					kind: "ternary",
					cond,
					thenExpr,
					elseExpr: parseTernary()
				};
			}
			return cond;
		}
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
			const left = parseAdd();
			if (peekOp("==") || peekOp("!=") || peekOp("<") || peekOp("<=") || peekOp(">") || peekOp(">=")) return {
				kind: "binary",
				op: tokens[pos++].op,
				left,
				right: parseAdd()
			};
			return left;
		}
		function parseAdd() {
			let left = parsePostfix();
			while (peekOp("+") || peekOp("-")) left = {
				kind: "binary",
				op: tokens[pos++].op,
				left,
				right: parsePostfix()
			};
			return left;
		}
		function parsePostfix() {
			let expr = parsePrimary();
			while (peekOp("[")) {
				pos++;
				const index = parseTernary();
				if (!peekOp("]")) throw new Error("缺少右方括号");
				pos++;
				let tail = [];
				const next = tokens[pos];
				if ((next === null || next === void 0 ? void 0 : next.type) === "path" && next.path.startsWith(".")) {
					pos++;
					tail = next.path.slice(1).split(".");
				}
				expr = {
					kind: "index",
					object: expr,
					index,
					tail
				};
			}
			return expr;
		}
		function parsePrimary() {
			const t = tokens[pos++];
			if (!t) throw new Error("表达式不完整");
			if (t.type === "literal") return {
				kind: "literal",
				value: t.value
			};
			if (t.type === "path") {
				if (t.path.startsWith(".")) throw new Error(`表达式中“${t.path}”的位置不对`);
				return {
					kind: "path",
					path: t.path
				};
			}
			if (t.op === "(") {
				const inner = parseTernary();
				if (!peekOp(")")) throw new Error("缺少右括号");
				pos++;
				return inner;
			}
			throw new Error(`表达式中“${t.op}”的位置不对`);
		}
		const expr = parseTernary();
		if (pos < tokens.length) throw new Error("表达式后面有多余的内容");
		return expr;
	}
	function readTail(base, tail) {
		let cursor = base;
		for (const part of tail) {
			if (cursor === null || cursor === void 0) return null;
			if (Array.isArray(cursor)) {
				if (part === "length") cursor = cursor.length;
				else return null;
			} else if (typeof cursor === "object") {
				const next = cursor[part];
				cursor = next === void 0 ? null : next;
			} else if (typeof cursor === "string" && part === "length") cursor = cursor.length;
			else return null;
		}
		return cursor;
	}
	function sameValue(a, b) {
		if (a === b) return true;
		if (typeof a === "object" && a !== null && typeof b === "object" && b !== null) return JSON.stringify(a) === JSON.stringify(b);
		return false;
	}
	/** resolve 负责把路径（状态路径或条件代号）变成值；找不到时应抛出错误。 */
	function evalExpr(expr, resolve) {
		switch (expr.kind) {
			case "literal": return expr.value;
			case "path": return resolve(expr.path);
			case "index": {
				const container = evalExpr(expr.object, resolve);
				const idx = evalExpr(expr.index, resolve);
				if (Array.isArray(container)) {
					const n = Number(idx);
					return readTail(Number.isInteger(n) && n >= 0 && n < container.length ? container[n] : null, expr.tail);
				}
				if (typeof container === "object" && container !== null) {
					var _String;
					return readTail((_String = container[String(idx)]) !== null && _String !== void 0 ? _String : null, expr.tail);
				}
				return null;
			}
			case "not": return !evalExpr(expr.operand, resolve);
			case "binary": {
				if (expr.op === "and") return Boolean(evalExpr(expr.left, resolve)) && Boolean(evalExpr(expr.right, resolve));
				if (expr.op === "or") return Boolean(evalExpr(expr.left, resolve)) || Boolean(evalExpr(expr.right, resolve));
				const left = evalExpr(expr.left, resolve);
				const right = evalExpr(expr.right, resolve);
				if (expr.op === "==") return sameValue(left, right);
				if (expr.op === "!=") return !sameValue(left, right);
				if (expr.op === "+") {
					if (typeof left === "string" || typeof right === "string") return String(left !== null && left !== void 0 ? left : "") + String(right !== null && right !== void 0 ? right : "");
					return Number(left !== null && left !== void 0 ? left : 0) + Number(right !== null && right !== void 0 ? right : 0);
				}
				if (expr.op === "-") return Number(left !== null && left !== void 0 ? left : 0) - Number(right !== null && right !== void 0 ? right : 0);
				if (expr.op === "<") return Number(left !== null && left !== void 0 ? left : 0) < Number(right !== null && right !== void 0 ? right : 0);
				if (expr.op === "<=") return Number(left !== null && left !== void 0 ? left : 0) <= Number(right !== null && right !== void 0 ? right : 0);
				if (expr.op === ">") return Number(left !== null && left !== void 0 ? left : 0) > Number(right !== null && right !== void 0 ? right : 0);
				return Number(left !== null && left !== void 0 ? left : 0) >= Number(right !== null && right !== void 0 ? right : 0);
			}
			case "ternary": return evalExpr(expr.cond, resolve) ? evalExpr(expr.thenExpr, resolve) : evalExpr(expr.elseExpr, resolve);
		}
	}
	/** 解析 `状态路径 = 表达式` 或 `数组路径[下标].字段 = 表达式` 形式的赋值语句。 */
	function parseAssignment(source) {
		const indexed = INDEXED_ASSIGNMENT.exec(String(source));
		if (indexed) return {
			target: indexed[1],
			index: parseExpr(indexed[2]),
			field: indexed[3] || void 0,
			value: parseExpr(indexed[4])
		};
		const match = SIMPLE_ASSIGNMENT.exec(String(source));
		if (!match) throw new Error(`set 的写法应为“状态路径 = 表达式”：${source}`);
		return {
			target: match[1],
			value: parseExpr(match[2])
		};
	}
	//#endregion
	//#region \0@oxc-project+runtime@0.153.0/helpers/esm/asyncToGenerator.js
	function asyncGeneratorStep(n, t, e, r, o, a, c) {
		try {
			var i = n[a](c), u = i.value;
		} catch (n) {
			e(n);
			return;
		}
		i.done ? t(u) : Promise.resolve(u).then(r, o);
	}
	function _asyncToGenerator(n) {
		return function() {
			var t = this, e = arguments;
			return new Promise(function(r, o) {
				var a = n.apply(t, e);
				function _next(n) {
					asyncGeneratorStep(a, r, o, _next, _throw, "next", n);
				}
				function _throw(n) {
					asyncGeneratorStep(a, r, o, _next, _throw, "throw", n);
				}
				_next(void 0);
			});
		};
	}
	//#endregion
	//#region src/runtime.ts
	const SHADOWED_DOM_GLOBALS = [
		"window",
		"document",
		"globalThis",
		"self",
		"top",
		"parent",
		"frames",
		"HTMLElement",
		"SVGElement",
		"Element",
		"Node",
		"navigator",
		"location",
		"history",
		"localStorage",
		"sessionStorage",
		"indexedDB",
		"XMLHttpRequest",
		"fetch",
		"WebSocket",
		"Worker",
		"MutationObserver",
		"ResizeObserver",
		"IntersectionObserver",
		"customElements",
		"requestAnimationFrame",
		"cancelAnimationFrame"
	];
	const MAX_EMIT_DEPTH = 20;
	/** 一次操作引出的业务事件最多连锁这么多个，防止模拟步骤互相触发停不下来。 */
	const MAX_BUSINESS_CHAIN = 50;
	function cloneValue(value) {
		if (value === null || typeof value !== "object") return value;
		return JSON.parse(JSON.stringify(value));
	}
	function sameStateValue(a, b) {
		if (a === b) return true;
		if (a !== void 0 && b !== void 0 && typeof a === "object" && a !== null && typeof b === "object" && b !== null) return JSON.stringify(a) === JSON.stringify(b);
		return false;
	}
	function show(value) {
		if (typeof value === "string") return `'${value}'`;
		if (typeof value === "object" && value !== null) return JSON.stringify(value);
		return String(value);
	}
	function defaultFor(leaf) {
		var _leaf$values$, _leaf$values;
		if (leaf.initial !== void 0) return cloneValue(leaf.initial);
		const fallback = leaf.default;
		if (fallback !== void 0) return cloneValue(fallback);
		if (leaf.type === "number") return 0;
		if (leaf.type === "boolean") return false;
		if (leaf.type === "enum") return (_leaf$values$ = (_leaf$values = leaf.values) === null || _leaf$values === void 0 ? void 0 : _leaf$values[0]) !== null && _leaf$values$ !== void 0 ? _leaf$values$ : "";
		if (leaf.type === "array") return [];
		if (leaf.type === "object") return {};
		return "";
	}
	function readTailValue(base, tail) {
		let cursor = base;
		for (const part of tail) {
			if (cursor === null || cursor === void 0) return null;
			if (Array.isArray(cursor)) {
				if (part === "length") cursor = cursor.length;
				else return null;
			} else if (typeof cursor === "object") {
				const next = cursor[part];
				cursor = next === void 0 ? null : next;
			} else if (typeof cursor === "string" && part === "length") cursor = cursor.length;
			else return null;
		}
		return cursor;
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
			_defineProperty(this, "windows", /* @__PURE__ */ new Map());
			_defineProperty(this, "docks", /* @__PURE__ */ new Map());
			_defineProperty(this, "dockLayouts", /* @__PURE__ */ new Map());
			_defineProperty(this, "lastSceneDockLayouts", /* @__PURE__ */ new Map());
			_defineProperty(this, "floatBoxes", /* @__PURE__ */ new Map());
			_defineProperty(this, "lastSceneFloatBoxProps", /* @__PURE__ */ new Map());
			_defineProperty(this, "menuChecked", /* @__PURE__ */ new Map());
			_defineProperty(this, "clockMs", 0);
			_defineProperty(this, "actionSims", /* @__PURE__ */ new Map());
			_defineProperty(this, "runningActions", /* @__PURE__ */ new Set());
			_defineProperty(this, "hoveredControls", /* @__PURE__ */ new Set());
			_defineProperty(this, "pressedControls", /* @__PURE__ */ new Set());
			_defineProperty(this, "activePromises", /* @__PURE__ */ new Set());
			_defineProperty(this, "exprCache", /* @__PURE__ */ new Map());
			_defineProperty(this, "fnCache", /* @__PURE__ */ new Map());
			_defineProperty(this, "businessChain", 0);
			this.project = project;
			this.hooks = hooks;
			this.reset();
		}
		/** 把所有状态、窗口和文字条件恢复为初始值。 */
		reset() {
			var _this$project$logic$a;
			this.state.clear();
			for (const { path, leaf } of allStateLeaves(this.project.logic)) this.state.set(path, defaultFor(leaf));
			this.textConditions.clear();
			for (const { id, def } of allConditions(this.project.logic)) if ((def === null || def === void 0 ? void 0 : def.type) === "text") this.textConditions.set(id, def.preview === true);
			this.windows.clear();
			this.dockLayouts.clear();
			this.lastSceneDockLayouts.clear();
			for (const winId of allWindowIds(this.project.scene)) {
				var _ref, _n$initialOpen, _n$props, _ref2, _n$modal, _n$props2;
				const n = this.project.scene.nodes[winId];
				const isRoot = winId === this.project.scene.root;
				const open = isRoot ? true : Boolean((_ref = (_n$initialOpen = n === null || n === void 0 ? void 0 : n.initialOpen) !== null && _n$initialOpen !== void 0 ? _n$initialOpen : n === null || n === void 0 || (_n$props = n.props) === null || _n$props === void 0 ? void 0 : _n$props.open) !== null && _ref !== void 0 ? _ref : false);
				const modal = isRoot ? false : Boolean((_ref2 = (_n$modal = n === null || n === void 0 ? void 0 : n.modal) !== null && _n$modal !== void 0 ? _n$modal : n === null || n === void 0 || (_n$props2 = n.props) === null || _n$props2 === void 0 ? void 0 : _n$props2.modal) !== null && _ref2 !== void 0 ? _ref2 : (n === null || n === void 0 ? void 0 : n.type) === "Dialog");
				this.windows.set(winId, {
					open,
					modal
				});
				if (isPartitionedWindow(n)) {
					var _n$dockLayout;
					this.dockLayouts.set(winId, normalizeDockLayout(this.project.scene, n));
					this.lastSceneDockLayouts.set(winId, JSON.stringify((_n$dockLayout = n === null || n === void 0 ? void 0 : n.dockLayout) !== null && _n$dockLayout !== void 0 ? _n$dockLayout : null));
				}
			}
			this.docks.clear();
			this.floatBoxes.clear();
			this.lastSceneFloatBoxProps.clear();
			for (const [id, n] of Object.entries(this.project.scene.nodes)) {
				var _n$props3;
				if (n.type === "Dock") this.docks.set(id, ((_n$props3 = n.props) === null || _n$props3 === void 0 ? void 0 : _n$props3.visible) !== false);
				if (n.type === "FloatBox") {
					var _n$props$floating, _n$props4, _n$props5, _n$props6, _n$props7, _n$props8, _n$props9;
					this.floatBoxes.set(id, _objectSpread2(_objectSpread2(_objectSpread2(_objectSpread2({ floating: Boolean((_n$props$floating = (_n$props4 = n.props) === null || _n$props4 === void 0 ? void 0 : _n$props4.floating) !== null && _n$props$floating !== void 0 ? _n$props$floating : false) }, typeof ((_n$props5 = n.props) === null || _n$props5 === void 0 ? void 0 : _n$props5.floatX) === "number" ? { floatX: n.props.floatX } : {}), typeof ((_n$props6 = n.props) === null || _n$props6 === void 0 ? void 0 : _n$props6.floatY) === "number" ? { floatY: n.props.floatY } : {}), typeof ((_n$props7 = n.props) === null || _n$props7 === void 0 ? void 0 : _n$props7.floatWidth) === "number" ? { floatWidth: n.props.floatWidth } : {}), typeof ((_n$props8 = n.props) === null || _n$props8 === void 0 ? void 0 : _n$props8.floatHeight) === "number" ? { floatHeight: n.props.floatHeight } : {}));
					this.lastSceneFloatBoxProps.set(id, JSON.stringify((_n$props9 = n.props) !== null && _n$props9 !== void 0 ? _n$props9 : null));
				}
			}
			this.menuChecked.clear();
			for (const { item } of allMenuItems(this.project.scene)) if (item.checked !== void 0) this.menuChecked.set(item.id, Boolean(item.checked));
			this.clockMs = 0;
			for (const [name, def] of Object.entries((_this$project$logic$a = this.project.logic.actions) !== null && _this$project$logic$a !== void 0 ? _this$project$logic$a : {})) if (!this.actionSims.has(name)) this.actionSims.set(name, {
				mode: "real",
				delayMs: 0,
				result: def === null || def === void 0 ? void 0 : def.mockResult,
				errorMessage: def === null || def === void 0 ? void 0 : def.mockError
			});
			this.runningActions.clear();
			this.hoveredControls.clear();
			this.pressedControls.clear();
		}
		/** 换成新加载的项目；状态结构没变的部分保留当前值。 */
		adopt(project) {
			const prevSceneDockLayouts = new Map(this.lastSceneDockLayouts);
			const prevSceneFloatBoxProps = new Map(this.lastSceneFloatBoxProps);
			const oldState = new Map(this.state);
			const oldConditions = new Map(this.textConditions);
			const oldWindows = new Map(this.windows);
			const oldDocks = new Map(this.docks);
			const oldDockLayouts = new Map(this.dockLayouts);
			const oldFloatBoxes = new Map(this.floatBoxes);
			const oldSims = new Map(this.actionSims);
			this.project = project;
			this.exprCache.clear();
			this.fnCache.clear();
			this.reset();
			for (const [path, value] of oldState) {
				const leaf = findStateLeaf(project.logic, path);
				if (leaf && this.accepts(leaf, value)) this.state.set(path, cloneValue(value));
			}
			for (const [id, value] of oldConditions) if (this.textConditions.has(id)) this.textConditions.set(id, value);
			for (const [id, win] of oldWindows) if (this.windows.has(id)) this.windows.set(id, win);
			for (const [id, vis] of oldDocks) if (this.docks.has(id)) this.docks.set(id, vis);
			for (const [winId, layout] of oldDockLayouts) {
				var _prevSceneDockLayouts, _this$lastSceneDockLa;
				if (!this.dockLayouts.has(winId)) continue;
				if (((_prevSceneDockLayouts = prevSceneDockLayouts.get(winId)) !== null && _prevSceneDockLayouts !== void 0 ? _prevSceneDockLayouts : "null") === ((_this$lastSceneDockLa = this.lastSceneDockLayouts.get(winId)) !== null && _this$lastSceneDockLa !== void 0 ? _this$lastSceneDockLa : "null")) this.dockLayouts.set(winId, normalizeDockLayout(project.scene, _objectSpread2(_objectSpread2({}, project.scene.nodes[winId]), {}, { dockLayout: layout })));
			}
			for (const [id, fb] of oldFloatBoxes) if (this.floatBoxes.has(id)) {
				var _prevSceneFloatBoxPro, _this$lastSceneFloatB;
				if (((_prevSceneFloatBoxPro = prevSceneFloatBoxProps.get(id)) !== null && _prevSceneFloatBoxPro !== void 0 ? _prevSceneFloatBoxPro : "null") === ((_this$lastSceneFloatB = this.lastSceneFloatBoxProps.get(id)) !== null && _this$lastSceneFloatB !== void 0 ? _this$lastSceneFloatB : "null")) this.floatBoxes.set(id, _objectSpread2({}, fb));
			}
			for (const [name, sim] of oldSims) this.actionSims.set(name, sim);
			this.syncActiveTabsWithVisibility();
		}
		/** 触发 app.start，预览开始时调用一次。 */
		start() {
			this.dispatch(null, "app.start");
		}
		getDockLayout(winId = this.project.scene.root) {
			const existing = this.dockLayouts.get(winId);
			if (existing) return cloneDockLayout(existing);
			return normalizeDockLayout(this.project.scene, this.project.scene.nodes[winId]);
		}
		setDockLayout(layout, winId = this.project.scene.root) {
			var _winNode$dockLayout;
			const winNode = this.project.scene.nodes[winId];
			const normalized = normalizeDockLayout(this.project.scene, _objectSpread2(_objectSpread2({}, winNode !== null && winNode !== void 0 ? winNode : {
				type: "Window",
				width: 1280,
				height: 800
			}), {}, { dockLayout: layout }));
			this.dockLayouts.set(winId, normalized);
			this.lastSceneDockLayouts.set(winId, JSON.stringify((_winNode$dockLayout = winNode === null || winNode === void 0 ? void 0 : winNode.dockLayout) !== null && _winNode$dockLayout !== void 0 ? _winNode$dockLayout : null));
			this.notifyChanged();
		}
		dockTabify(targetDockId, dockId, winId = this.project.scene.root) {
			const next = dockTabify(this.getDockLayout(winId), this.project.scene, this.project.scene.nodes[winId], targetDockId, dockId);
			this.dockLayouts.set(winId, next);
			this.releaseDockedPointerStates();
			this.hooks.onLog({
				title: `停靠 ${dockId}`,
				lines: [`叠入页签组 ${targetDockId}`]
			});
			this.notifyChanged();
		}
		dockActivateTab(dockId, winId = this.project.scene.root) {
			const next = dockActivateTab(this.getDockLayout(winId), this.project.scene, this.project.scene.nodes[winId], dockId);
			this.dockLayouts.set(winId, next);
			this.releaseDockedPointerStates();
			this.hooks.onLog({
				title: `停靠 ${dockId}`,
				lines: [`切换激活页签 ${dockId}`]
			});
			this.notifyChanged();
		}
		dockFloat(dockId, rect, winId = this.project.scene.root) {
			const next = dockFloat(this.getDockLayout(winId), this.project.scene, this.project.scene.nodes[winId], dockId, rect);
			this.dockLayouts.set(winId, next);
			this.releaseDockedPointerStates();
			this.hooks.onLog({
				title: `停靠 ${dockId}`,
				lines: [`浮出为独立面板`]
			});
			this.notifyChanged();
		}
		dockRestore(dockId, targetArea, winId = this.project.scene.root) {
			const next = dockRestore(this.getDockLayout(winId), this.project.scene, this.project.scene.nodes[winId], dockId, targetArea);
			this.dockLayouts.set(winId, next);
			this.releaseDockedPointerStates();
			this.hooks.onLog({
				title: `停靠 ${dockId}`,
				lines: [`从浮窗恢复停靠`]
			});
			this.notifyChanged();
		}
		dockMoveToArea(dockId, area, index, winId = this.project.scene.root) {
			const next = dockMoveToArea(this.getDockLayout(winId), this.project.scene, this.project.scene.nodes[winId], dockId, area, index);
			this.dockLayouts.set(winId, next);
			this.releaseDockedPointerStates();
			this.hooks.onLog({
				title: `停靠 ${dockId}`,
				lines: [`吸附到停靠区 ${area}`]
			});
			this.notifyChanged();
		}
		dockSplit(targetDockId, dockId, position = "after", orientation, winId = this.project.scene.root) {
			const next = dockSplit(this.getDockLayout(winId), this.project.scene, this.project.scene.nodes[winId], targetDockId, dockId, position, orientation);
			this.dockLayouts.set(winId, next);
			this.releaseDockedPointerStates();
			this.hooks.onLog({
				title: `停靠 ${dockId}`,
				lines: [`与 ${targetDockId} 并排（${position}）`]
			});
			this.notifyChanged();
		}
		dockResizeArea(area, size, winId = this.project.scene.root) {
			const next = dockResizeArea(this.getDockLayout(winId), this.project.scene, this.project.scene.nodes[winId], area, size);
			this.dockLayouts.set(winId, next);
			this.releaseDockedPointerStates();
			this.hooks.onLog({
				title: `停靠区 ${area}`,
				lines: [`调整尺寸为 ${next.areas[area].size}px`]
			});
			this.notifyChanged();
		}
		dockResizeSplit(area, groupIndex, size, winId = this.project.scene.root) {
			const next = dockResizeSplit(this.getDockLayout(winId), this.project.scene, this.project.scene.nodes[winId], area, groupIndex, size);
			this.dockLayouts.set(winId, next);
			this.releaseDockedPointerStates();
			this.hooks.onLog({
				title: `停靠区 ${area}`,
				lines: [`调整并排组 #${groupIndex} 尺寸为 ${Math.round(size)}px`]
			});
			this.notifyChanged();
		}
		/** 当停靠面板显隐变化后，若某个页签组的当前 active 面板已隐藏，则自动切换到同组内仍可见的页签。 */
		syncActiveTabsWithVisibility() {
			let anyChanged = false;
			for (const [winId, layout] of this.dockLayouts) {
				let winChanged = false;
				const next = cloneDockLayout(layout);
				for (const area of [
					"top",
					"bottom",
					"left",
					"right"
				]) {
					var _next$areas$area$grou, _next$areas$area;
					for (const group of (_next$areas$area$grou = (_next$areas$area = next.areas[area]) === null || _next$areas$area === void 0 ? void 0 : _next$areas$area.groups) !== null && _next$areas$area$grou !== void 0 ? _next$areas$area$grou : []) {
						var _group$active;
						const activeId = (_group$active = group.active) !== null && _group$active !== void 0 ? _group$active : group.tabs[0];
						if (activeId && !this.view(activeId).visible) {
							const firstVisible = group.tabs.find((tid) => this.view(tid).visible);
							if (firstVisible && firstVisible !== group.active) {
								group.active = firstVisible;
								winChanged = true;
							}
						}
					}
				}
				if (winChanged) {
					this.dockLayouts.set(winId, next);
					anyChanged = true;
				}
			}
			return anyChanged;
		}
		dockSetVisible(dockId, visible) {
			if (!this.project.scene.nodes[dockId]) return;
			const winId = this.windowOf(dockId);
			if (visible) {
				const curLayout = this.getDockLayout(winId);
				this.dockLayouts.set(winId, dockActivateTab(curLayout, this.project.scene, this.project.scene.nodes[winId], dockId));
			}
			this.runBatch(`停靠面板 ${dockId}`, false, false, (batch) => {
				var _this$project$logic$o, _dockObj$props, _batch$docks$get;
				const dockObj = (_this$project$logic$o = this.project.logic.objects) === null || _this$project$logic$o === void 0 ? void 0 : _this$project$logic$o[dockId];
				const visExpr = dockObj === null || dockObj === void 0 || (_dockObj$props = dockObj.props) === null || _dockObj$props === void 0 ? void 0 : _dockObj$props.visible;
				if (typeof visExpr === "string" && findStateLeaf(this.project.logic, visExpr)) {
					this.assign(batch, visExpr, visible);
					return;
				}
				const cur = (_batch$docks$get = batch.docks.get(dockId)) !== null && _batch$docks$get !== void 0 ? _batch$docks$get : true;
				if (cur !== visible) {
					batch.docks.set(dockId, visible);
					batch.lines.push(`停靠面板 ${dockId}: ${cur ? "显示 → 隐藏" : "隐藏 → 显示"}`);
				}
			});
		}
		/** 统一的停靠指令入口（供测试步骤与 Qt 侧桥接调用）。 */
		dockOp(op, args = {}) {
			var _args$dock, _args$target;
			const dockId = String((_args$dock = args.dock) !== null && _args$dock !== void 0 ? _args$dock : "");
			const targetId = String((_args$target = args.target) !== null && _args$target !== void 0 ? _args$target : "");
			if (op === "tabify") this.dockTabify(targetId, dockId);
			else if (op === "tab" || op === "activateTab") this.dockActivateTab(dockId);
			else if (op === "float") this.dockFloat(dockId, _objectSpread2(_objectSpread2(_objectSpread2(_objectSpread2({}, typeof args.x === "number" ? { x: args.x } : {}), typeof args.y === "number" ? { y: args.y } : {}), typeof args.width === "number" ? { width: args.width } : {}), typeof args.height === "number" ? { height: args.height } : {}));
			else if (op === "restore") this.dockRestore(dockId, isDockArea(args.area) ? args.area : void 0);
			else if (op === "move") {
				if (isDockArea(args.area)) this.dockMoveToArea(dockId, args.area, typeof args.index === "number" ? args.index : void 0);
			} else if (op === "split") this.dockSplit(targetId, dockId, args.position === "before" ? "before" : "after", args.orientation === "horizontal" || args.orientation === "vertical" ? args.orientation : void 0);
			else if (op === "resize" || op === "resizeArea") {
				if (isDockArea(args.area)) {
					var _args$size;
					this.dockResizeArea(args.area, Number((_args$size = args.size) !== null && _args$size !== void 0 ? _args$size : 240));
				}
			} else if (op === "resizeSplit") {
				if (isDockArea(args.area)) {
					var _args$groupIndex, _args$size2;
					this.dockResizeSplit(args.area, Number((_args$groupIndex = args.groupIndex) !== null && _args$groupIndex !== void 0 ? _args$groupIndex : 0), Number((_args$size2 = args.size) !== null && _args$size2 !== void 0 ? _args$size2 : 200));
				}
			} else if (op === "close") this.dockSetVisible(dockId, false);
			else if (op === "open") this.dockSetVisible(dockId, true);
			else if (op === "toggle") this.dockSetVisible(dockId, !this.view(dockId).visible);
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
		resolve(path, state, stack, scope = {}) {
			var _this$textConditions$, _condition$expr;
			if (path in scope) return scope[path];
			for (const key of Object.keys(scope)) if (path.startsWith(key + ".")) return readTailValue(scope[key], path.slice(key.length + 1).split("."));
			if (state.has(path)) return state.get(path);
			if (path === "clock" || path === "clock.ms") return this.clockMs;
			if (path === "clock.sec") return Math.floor(this.clockMs / 1e3);
			const parts = path.split(".");
			for (let i = parts.length - 1; i >= 1; i--) {
				const prefix = parts.slice(0, i).join(".");
				if (state.has(prefix)) return readTailValue(state.get(prefix), parts.slice(i));
			}
			const condition = findCondition(this.project.logic, path);
			if (!condition) throw new Error(`未知的状态路径或条件代号“${path}”`);
			if (condition.type === "text") return (_this$textConditions$ = this.textConditions.get(path)) !== null && _this$textConditions$ !== void 0 ? _this$textConditions$ : false;
			if (stack.includes(path)) throw new Error(`条件循环引用：${[...stack, path].join(" → ")}`);
			return Boolean(evalExpr(this.parse((_condition$expr = condition.expr) !== null && _condition$expr !== void 0 ? _condition$expr : "false"), (p) => this.resolve(p, state, [...stack, path], scope)));
		}
		evaluate(source, state = this.state, scope = {}) {
			return evalExpr(this.parse(source), (path) => this.resolve(path, state, [], scope));
		}
		evaluateStructured(raw, state, scope) {
			if (raw === null || typeof raw === "boolean" || typeof raw === "number") return raw;
			if (typeof raw === "string") return this.evaluate(raw, state, scope);
			if (Array.isArray(raw)) return raw.map((item) => this.evaluateStructured(item, state, scope));
			const result = {};
			for (const [k, v] of Object.entries(raw)) result[k] = this.evaluateStructured(v, state, scope);
			return result;
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
		/** 预览工具条用：全部动作及其模拟设置。 */
		actions() {
			var _this$project$logic$a2;
			return Object.entries((_this$project$logic$a2 = this.project.logic.actions) !== null && _this$project$logic$a2 !== void 0 ? _this$project$logic$a2 : {}).map(([name, def]) => {
				var _def$text2;
				return {
					name,
					text: (_def$text2 = def === null || def === void 0 ? void 0 : def.text) !== null && _def$text2 !== void 0 ? _def$text2 : "",
					sim: this.getActionSimulation(name)
				};
			});
		}
		getActionSimulation(name) {
			var _this$project$logic$a3;
			const existing = this.actionSims.get(name);
			if (existing) return _objectSpread2({}, existing);
			const def = (_this$project$logic$a3 = this.project.logic.actions) === null || _this$project$logic$a3 === void 0 ? void 0 : _this$project$logic$a3[name];
			return {
				mode: "real",
				delayMs: 0,
				result: def === null || def === void 0 ? void 0 : def.mockResult,
				errorMessage: def === null || def === void 0 ? void 0 : def.mockError
			};
		}
		setActionSimulation(name, config) {
			const cur = this.getActionSimulation(name);
			this.actionSims.set(name, _objectSpread2(_objectSpread2({}, cur), config));
			this.notifyChanged();
		}
		isWindowOpen(id) {
			var _this$windows$get$ope, _this$windows$get;
			if (id === this.project.scene.root) return true;
			return (_this$windows$get$ope = (_this$windows$get = this.windows.get(id)) === null || _this$windows$get === void 0 ? void 0 : _this$windows$get.open) !== null && _this$windows$get$ope !== void 0 ? _this$windows$get$ope : false;
		}
		isWindowModal(id) {
			var _this$windows$get$mod, _this$windows$get2;
			return (_this$windows$get$mod = (_this$windows$get2 = this.windows.get(id)) === null || _this$windows$get2 === void 0 ? void 0 : _this$windows$get2.modal) !== null && _this$windows$get$mod !== void 0 ? _this$windows$get$mod : false;
		}
		activeModalWindow() {
			let active = null;
			for (const [id, win] of this.windows) if (id !== this.project.scene.root && win.open && win.modal) active = id;
			return active;
		}
		windowOf(nodeId) {
			for (const winId of allWindowIds(this.project.scene)) if (this.isInsideSubtree(winId, nodeId)) return winId;
			return this.project.scene.root;
		}
		isInsideSubtree(rootId, targetId) {
			if (rootId === targetId) return true;
			const n = this.project.scene.nodes[rootId];
			if (!n) return false;
			for (const cid of childrenOfNode(n)) if (this.isInsideSubtree(cid, targetId)) return true;
			return false;
		}
		getClock() {
			return this.clockMs;
		}
		setClock(ms) {
			const next = Math.max(0, Math.round(Number(ms) || 0));
			const prev = this.clockMs;
			this.clockMs = next;
			const tickSteps = globalSteps(this.project.logic, "clock.tick");
			this.runBatch(`预览时钟 ${prev}ms → ${next}ms`, false, false, (batch) => {
				if (batch.work.has("clock")) batch.work.set("clock", next);
				if (batch.work.has("clock.ms")) batch.work.set("clock.ms", next);
				batch.lines.push(`clock: ${prev}ms → ${next}ms`);
				if (tickSteps) this.runSteps(tickSteps, batch, 0, {
					value: next,
					$value: next,
					param: {
						ms: next,
						prevMs: prev,
						deltaMs: next - prev
					},
					$event: {
						ms: next,
						prevMs: prev,
						deltaMs: next - prev
					},
					ms: next,
					prevMs: prev,
					deltaMs: next - prev
				});
			});
			this.notifyChanged();
		}
		stateSnapshot() {
			return [...this.state].map(([k, v]) => [k, cloneValue(v)]);
		}
		getState(path) {
			const val = this.state.get(path);
			return val === void 0 ? void 0 : cloneValue(val);
		}
		/** 某个节点（或菜单项）当前应有的样子：静态默认值、scene.json 的值、逻辑计算值依次覆盖。 */
		view(id) {
			var _this$project$logic$o3, _decl$props, _node$props, _object$props2, _ref3, _props$selected;
			const menuItem = findMenuItem(this.project.scene, id);
			if (menuItem && !this.project.scene.nodes[id]) {
				var _this$project$logic$o2, _this$menuChecked$get, _menuItem$checked, _object$props;
				const object = (_this$project$logic$o2 = this.project.logic.objects) === null || _this$project$logic$o2 === void 0 ? void 0 : _this$project$logic$o2[id];
				const props = {
					text: menuItem.text,
					checked: menuItem.dock ? this.view(menuItem.dock).visible : (_this$menuChecked$get = this.menuChecked.get(id)) !== null && _this$menuChecked$get !== void 0 ? _this$menuChecked$get : Boolean((_menuItem$checked = menuItem.checked) !== null && _menuItem$checked !== void 0 ? _menuItem$checked : false),
					enabled: true
				};
				let visible = true;
				for (const [key, expr] of Object.entries((_object$props = object === null || object === void 0 ? void 0 : object.props) !== null && _object$props !== void 0 ? _object$props : {})) try {
					const val = this.evaluate(expr);
					if (key === "visible") visible = Boolean(val);
					else props[key] = val;
				} catch (_unused2) {}
				return {
					visible,
					enabled: props.enabled !== false,
					props
				};
			}
			const node = this.project.scene.nodes[id];
			const decl = node ? declFor(this.project, node.type) : null;
			const object = (_this$project$logic$o3 = this.project.logic.objects) === null || _this$project$logic$o3 === void 0 ? void 0 : _this$project$logic$o3[id];
			const props = {};
			const declared = (_decl$props = decl === null || decl === void 0 ? void 0 : decl.props) !== null && _decl$props !== void 0 ? _decl$props : {};
			for (const key of Object.keys(declared)) {
				const value = declared[key].default;
				if (value !== void 0) props[key] = cloneValue(value);
			}
			if ((node === null || node === void 0 ? void 0 : node.title) !== void 0 && (node.type === "Dock" || node.type === "Dialog" || node.type === "FloatBox")) props.title = node.title;
			if (node === null || node === void 0 ? void 0 : node.props) {
				for (const [k, v] of Object.entries(node.props)) if (k !== "visible") props[k] = cloneValue(v);
			}
			if ((node === null || node === void 0 ? void 0 : node.type) === "FloatBox" && this.floatBoxes.has(id)) {
				const fb = this.floatBoxes.get(id);
				props.floating = fb.floating;
				if (fb.floatX !== void 0) props.floatX = fb.floatX;
				if (fb.floatY !== void 0) props.floatY = fb.floatY;
				if (fb.floatWidth !== void 0) props.floatWidth = fb.floatWidth;
				if (fb.floatHeight !== void 0) props.floatHeight = fb.floatHeight;
			}
			let visible = true;
			if (this.windows.has(id) && id !== this.project.scene.root) visible = this.windows.get(id).open;
			else if ((node === null || node === void 0 ? void 0 : node.type) === "Dock" && this.docks.has(id)) visible = this.docks.get(id);
			else if ((node === null || node === void 0 || (_node$props = node.props) === null || _node$props === void 0 ? void 0 : _node$props.visible) !== void 0) visible = Boolean(node.props.visible);
			const computed = (_object$props2 = object === null || object === void 0 ? void 0 : object.props) !== null && _object$props2 !== void 0 ? _object$props2 : {};
			for (const key of Object.keys(computed)) try {
				const value = this.evaluate(computed[key]);
				if (key === "visible") visible = Boolean(value);
				else props[key] = cloneValue(value);
			} catch (_unused3) {}
			if ((object === null || object === void 0 ? void 0 : object.bind) && this.state.has(object.bind)) props.value = cloneValue(this.state.get(object.bind));
			if ((node === null || node === void 0 ? void 0 : node.type) === "SpinBox") {
				var _props$min, _props$max, _props$value;
				const min = Number((_props$min = props.min) !== null && _props$min !== void 0 ? _props$min : 0);
				const max = Number((_props$max = props.max) !== null && _props$max !== void 0 ? _props$max : 9999);
				const val = Number((_props$value = props.value) !== null && _props$value !== void 0 ? _props$value : 0);
				if (Number.isFinite(val)) props.value = Math.max(min, Math.min(max, val));
			}
			if (visible) for (const [parentId, parentNode] of Object.entries(this.project.scene.nodes)) {
				var _layoutOf, _parentNode$children;
				if (((_layoutOf = layoutOf(parentNode)) === null || _layoutOf === void 0 ? void 0 : _layoutOf.kind) === "stack" && ((_parentNode$children = parentNode.children) === null || _parentNode$children === void 0 ? void 0 : _parentNode$children.includes(id))) {
					var _pView$props$currentI, _pView$props$currentP;
					const pView = this.view(parentId);
					const activeIdx = Number((_pView$props$currentI = pView.props.currentIndex) !== null && _pView$props$currentI !== void 0 ? _pView$props$currentI : 0);
					const activePage = String((_pView$props$currentP = pView.props.currentPage) !== null && _pView$props$currentP !== void 0 ? _pView$props$currentP : "");
					const idx = parentNode.children.indexOf(id);
					if (!(activePage ? id === activePage : idx === activeIdx)) visible = false;
					break;
				}
			}
			const enabled = props.enabled !== false;
			const selected = Boolean((_ref3 = (_props$selected = props.selected) !== null && _props$selected !== void 0 ? _props$selected : props.checked) !== null && _ref3 !== void 0 ? _ref3 : props.variant === "primary");
			const resolvedState = resolveStateImage(decl, {
				enabled,
				pressed: this.pressedControls.has(id) || props.pressed === true,
				hovered: this.hoveredControls.has(id) || props.hovered === true,
				selected
			});
			return _objectSpread2({
				visible,
				enabled,
				props
			}, resolvedState ? {
				visualState: resolvedState.state,
				stateImage: resolvedState.file
			} : {});
		}
		/** 所有变更都从这里通知界面：先清掉已经不可能被鼠标碰到的控件的悬停和按下，view() 只读不改。 */
		notifyChanged() {
			for (const set of [this.hoveredControls, this.pressedControls]) for (const id of [...set]) if (!this.canTakePointer(id)) set.delete(id);
			this.hooks.onChange();
		}
		/** 叠页签组里显示的那个面板；激活页签已关闭时是组里第一个没关闭的。 */
		isShownDockTab(dockId) {
			const layout = this.dockLayouts.get(this.windowOf(dockId));
			const loc = layout ? dockFindLocation(layout, dockId) : null;
			if ((loc === null || loc === void 0 ? void 0 : loc.kind) !== "area") return true;
			const { active, tabs } = loc.group;
			return (active && tabs.includes(active) && this.view(active).visible ? active : tabs.find((tid) => this.view(tid).visible)) === dockId;
		}
		/** 控件此刻显示在界面上并且可用。view().visible 只看控件自己，这里还看所属窗口、容器和停靠页签。 */
		canTakePointer(id) {
			const scene = this.project.scene;
			if (!this.view(id).enabled) return false;
			for (let cur = id; cur && cur !== scene.root; cur = parentOfNode(scene, cur)) {
				const node = scene.nodes[cur];
				const curView = this.view(cur);
				if (!node || !curView.visible) return false;
				if (node.type === "Dock" && !this.isShownDockTab(cur)) return false;
				if (node.type === "FloatBox" && curView.props.floating) return true;
			}
			return true;
		}
		/** 面板重排后控件换了位置，不一定还在鼠标底下，而界面不一定收到移出事件，所以停靠面板里的悬停和按下一律清掉。 */
		releaseDockedPointerStates() {
			const scene = this.project.scene;
			for (const set of [this.hoveredControls, this.pressedControls]) for (const id of [...set]) for (let cur = id; cur; cur = parentOfNode(scene, cur)) {
				var _scene$nodes$cur;
				if (((_scene$nodes$cur = scene.nodes[cur]) === null || _scene$nodes$cur === void 0 ? void 0 : _scene$nodes$cur.type) === "Dock") {
					set.delete(id);
					break;
				}
			}
		}
		toggleTextCondition(id) {
			var _this$textConditions$2;
			const next = !((_this$textConditions$2 = this.textConditions.get(id)) !== null && _this$textConditions$2 !== void 0 ? _this$textConditions$2 : false);
			this.textConditions.set(id, next);
			this.hooks.onLog({
				title: `条件 ${id}`,
				lines: [`手动切换：${next ? "否 → 是" : "是 → 否"}`]
			});
			this.notifyChanged();
		}
		/** nodeId 为 null 表示全局事件。 */
		dispatch(nodeId, event, value) {
			var _logic$objects4, _object$events2;
			const { logic, scene } = this.project;
			if (nodeId !== null) {
				const modalWin = this.activeModalWindow();
				if (modalWin && !this.isInsideSubtree(modalWin, nodeId)) {
					if (event !== "mouseenter" && event !== "mouseleave") this.hooks.onLog({
						title: `${nodeId}.${event}`,
						lines: [`已忽略：模态窗口 ${modalWin} 正在打开`]
					});
					return;
				}
			}
			const menuItem = nodeId && !scene.nodes[nodeId] ? findMenuItem(scene, nodeId) : null;
			if (menuItem && nodeId) {
				var _logic$objects, _object$events;
				const object = (_logic$objects = logic.objects) === null || _logic$objects === void 0 ? void 0 : _logic$objects[nodeId];
				const steps = object === null || object === void 0 || (_object$events = object.events) === null || _object$events === void 0 ? void 0 : _object$events[event];
				if (!steps && event !== "click") return;
				const view = this.view(nodeId);
				if (!view.visible || !view.enabled) {
					this.hooks.onLog({
						title: `${nodeId}.${event}`,
						lines: [`已忽略：菜单项${view.visible ? "不可用" : "不可见"}`]
					});
					return;
				}
				this.runBatch(`${nodeId}.${event}`, false, false, (batch) => {
					let nextChecked = Boolean(view.props.checked);
					if (menuItem.group || menuItem.kind === "radio") {
						nextChecked = true;
						batch.menuChecked.set(nodeId, true);
						if (menuItem.group) {
							for (const { item } of allMenuItems(scene)) if (item.group === menuItem.group && item.id !== nodeId) batch.menuChecked.set(item.id, false);
						}
					} else if ((menuItem.checkable || menuItem.kind === "check") && !menuItem.dock) {
						nextChecked = !nextChecked;
						batch.menuChecked.set(nodeId, nextChecked);
					}
					if (steps) this.runSteps(steps, batch, 0, this.scopeForValue(value !== void 0 ? value : nextChecked));
					else if (menuItem.emit) this.runSteps([{ emit: menuItem.emit }], batch, 0, {});
					else if (menuItem.dock) this.toggleDockInBatch(batch, menuItem.dock);
				});
				return;
			}
			const node = nodeId ? scene.nodes[nodeId] : void 0;
			if (nodeId && (node === null || node === void 0 ? void 0 : node.type) === "FloatBox") {
				const view = this.view(nodeId);
				if (view.visible && view.enabled) {
					if (event === "toggle" || event === "change" && typeof value === "boolean") {
						var _this$floatBoxes$get;
						const cur = (_this$floatBoxes$get = this.floatBoxes.get(nodeId)) !== null && _this$floatBoxes$get !== void 0 ? _this$floatBoxes$get : { floating: Boolean(view.props.floating) };
						const nextFloat = typeof value === "boolean" ? value : !cur.floating;
						if (cur.floating !== nextFloat) {
							this.floatBoxes.set(nodeId, _objectSpread2(_objectSpread2({}, cur), {}, { floating: nextFloat }));
							this.hooks.onLog({
								title: `${nodeId}.${event}`,
								lines: [`浮动嵌入框 ${nodeId}: ${nextFloat ? "嵌入 → 浮动" : "浮动 → 嵌入"}`]
							});
							this.notifyChanged();
						}
					} else if (event === "move" && value && typeof value === "object" && !Array.isArray(value)) {
						var _this$floatBoxes$get2;
						const cur = (_this$floatBoxes$get2 = this.floatBoxes.get(nodeId)) !== null && _this$floatBoxes$get2 !== void 0 ? _this$floatBoxes$get2 : { floating: Boolean(view.props.floating) };
						const nx = typeof value.x === "number" ? Math.round(value.x) : cur.floatX;
						const ny = typeof value.y === "number" ? Math.round(value.y) : cur.floatY;
						const nw = typeof value.width === "number" ? Math.round(value.width) : cur.floatWidth;
						const nh = typeof value.height === "number" ? Math.round(value.height) : cur.floatHeight;
						this.floatBoxes.set(nodeId, _objectSpread2(_objectSpread2(_objectSpread2(_objectSpread2(_objectSpread2({}, cur), {}, { floating: true }, nx !== void 0 ? { floatX: nx } : {}), ny !== void 0 ? { floatY: ny } : {}), nw !== void 0 ? { floatWidth: nw } : {}), nh !== void 0 ? { floatHeight: nh } : {}));
						this.notifyChanged();
					}
				}
			}
			if (nodeId) {
				if (event === "mouseleave") {
					const wasHovered = this.hoveredControls.delete(nodeId);
					const wasPressed = this.pressedControls.delete(nodeId);
					if (wasHovered || wasPressed) this.notifyChanged();
				} else if (event === "mouseup") {
					if (this.pressedControls.delete(nodeId)) this.notifyChanged();
				} else if (event === "mouseenter" || event === "mousedown") {
					if (this.canTakePointer(nodeId)) {
						if (event === "mouseenter") this.hoveredControls.add(nodeId);
						else this.pressedControls.add(nodeId);
						this.notifyChanged();
					}
				} else if (event === "change" && (value === "pressed" || value === "released")) {
					const decl = node ? declFor(this.project, node.type) : null;
					if (decl === null || decl === void 0 ? void 0 : decl.stateImages) {
						var _logic$objects2, _logic$objects3;
						if (this.canTakePointer(nodeId)) {
							if (value === "pressed") this.pressedControls.add(nodeId);
							else this.pressedControls.delete(nodeId);
							this.notifyChanged();
						}
						if (!((_logic$objects2 = logic.objects) === null || _logic$objects2 === void 0 || (_logic$objects2 = _logic$objects2[nodeId]) === null || _logic$objects2 === void 0 ? void 0 : _logic$objects2.bind) && !((_logic$objects3 = logic.objects) === null || _logic$objects3 === void 0 || (_logic$objects3 = _logic$objects3[nodeId]) === null || _logic$objects3 === void 0 || (_logic$objects3 = _logic$objects3.events) === null || _logic$objects3 === void 0 ? void 0 : _logic$objects3.change)) return;
					}
				}
			}
			const object = nodeId ? (_logic$objects4 = logic.objects) === null || _logic$objects4 === void 0 ? void 0 : _logic$objects4[nodeId] : void 0;
			const steps = nodeId ? object === null || object === void 0 || (_object$events2 = object.events) === null || _object$events2 === void 0 ? void 0 : _object$events2[event] : globalSteps(logic, event);
			const bindTarget = nodeId && (event === "change" || (node === null || node === void 0 ? void 0 : node.type) === "FloatBox" && event === "toggle") && value !== void 0 ? object === null || object === void 0 ? void 0 : object.bind : void 0;
			if (!steps && !bindTarget) return;
			const title = nodeId ? `${nodeId}.${event}` : `全局事件 ${event}`;
			if (nodeId) {
				const winId = this.windowOf(nodeId);
				if (winId !== scene.root && !this.view(winId).visible) {
					if (event !== "mouseenter" && event !== "mouseleave") this.hooks.onLog({
						title,
						lines: [`已忽略：所属窗口 ${winId} 未打开`]
					});
					return;
				}
				const view = this.view(nodeId);
				if (!view.visible || !view.enabled) {
					if (event !== "mouseenter" && event !== "mouseleave") this.hooks.onLog({
						title,
						lines: [`已忽略：控件${view.visible ? "不可用" : "不可见"}`]
					});
					return;
				}
				if (((node === null || node === void 0 ? void 0 : node.type) === "SpinBox" || (node === null || node === void 0 ? void 0 : node.type) === "Slider" || (node === null || node === void 0 ? void 0 : node.type) === "ScrollBar") && event === "change" && typeof value === "number" && Number.isFinite(value)) {
					var _view$props$min, _view$props$max;
					const min = Number((_view$props$min = view.props.min) !== null && _view$props$min !== void 0 ? _view$props$min : 0);
					const max = Number((_view$props$max = view.props.max) !== null && _view$props$max !== void 0 ? _view$props$max : node.type === "SpinBox" ? 9999 : 100);
					value = Math.max(min, Math.min(max, value));
				} else if ((node === null || node === void 0 ? void 0 : node.type) === "ComboBox" && event === "change" && typeof value === "string") {
					var _view$props$options;
					if (!String((_view$props$options = view.props.options) !== null && _view$props$options !== void 0 ? _view$props$options : "").split(",").map((s) => s.trim()).filter(Boolean).includes(value)) return;
				} else if (((node === null || node === void 0 ? void 0 : node.type) === "List" || (node === null || node === void 0 ? void 0 : node.type) === "Tree") && (event === "change" || event === "select") && typeof value === "number") {
					const items = Array.isArray(view.props.items) ? view.props.items : [];
					if (!Number.isInteger(value) || value < 0 || value >= items.length) return;
				}
			}
			const scope = this.scopeForValue(value);
			this.runBatch(title, false, event === "window.click", (batch) => {
				if (bindTarget) this.assign(batch, bindTarget, value);
				if (steps) this.runSteps(steps, batch, 0, scope);
			});
		}
		scopeForValue(value) {
			if (value === void 0) return {};
			const scope = {
				value,
				$value: value,
				$event: value
			};
			if (typeof value === "object" && value !== null && !Array.isArray(value)) {
				scope.param = value;
				for (const [k, v] of Object.entries(value)) scope[k] = v;
			}
			return scope;
		}
		toggleDockInBatch(batch, dockId) {
			var _this$project$logic$o4, _dockObj$props2;
			const dockObj = (_this$project$logic$o4 = this.project.logic.objects) === null || _this$project$logic$o4 === void 0 ? void 0 : _this$project$logic$o4[dockId];
			const visExpr = dockObj === null || dockObj === void 0 || (_dockObj$props2 = dockObj.props) === null || _dockObj$props2 === void 0 ? void 0 : _dockObj$props2.visible;
			let nextVis = true;
			if (typeof visExpr === "string" && findStateLeaf(this.project.logic, visExpr)) {
				nextVis = !Boolean(batch.work.get(visExpr));
				this.assign(batch, visExpr, nextVis);
			} else {
				var _batch$docks$get2;
				const cur = (_batch$docks$get2 = batch.docks.get(dockId)) !== null && _batch$docks$get2 !== void 0 ? _batch$docks$get2 : true;
				nextVis = !cur;
				batch.docks.set(dockId, nextVis);
				batch.lines.push(`停靠面板 ${dockId}: ${cur ? "显示 → 隐藏" : "隐藏 → 显示"}`);
			}
			if (nextVis) {
				const winId = this.windowOf(dockId);
				const curLayout = this.getDockLayout(winId);
				this.dockLayouts.set(winId, dockActivateTab(curLayout, this.project.scene, this.project.scene.nodes[winId], dockId));
			}
		}
		/** 外部（如用户按 Esc 或点击窗口标题栏关闭按钮）关闭窗口时，将窗口开关同步回运行层。 */
		closeWindow(id) {
			const win = this.windows.get(id);
			if (!win || !win.open) return;
			this.runBatch(`关闭窗口 ${id}`, false, false, (batch) => {
				var _this$project$logic$o5;
				batch.windows.set(id, {
					open: false,
					modal: win.modal
				});
				batch.lines.push(`关闭窗口 ${id}`);
				const steps = (_this$project$logic$o5 = this.project.logic.objects) === null || _this$project$logic$o5 === void 0 || (_this$project$logic$o5 = _this$project$logic$o5[id]) === null || _this$project$logic$o5 === void 0 || (_this$project$logic$o5 = _this$project$logic$o5.events) === null || _this$project$logic$o5 === void 0 ? void 0 : _this$project$logic$o5["close"];
				if (steps) this.runSteps(steps, batch, 0, {});
			});
		}
		/** 等待所有正在执行的异步动作或延迟模拟完成。 */
		waitForIdle() {
			var _this = this;
			return _asyncToGenerator(function* () {
				while (_this.activePromises.size > 0) yield Promise.all([..._this.activePromises]);
			})();
		}
		/** 执行一个业务事件的模拟步骤，就像业务没有接上时那样。 */
		simulate(name, args = {}) {
			const def = businessEvent(this.project.logic, name);
			if (!def) return;
			const scope = _objectSpread2({ param: args }, args);
			this.runBatch(`业务事件 ${name}（模拟）`, true, false, (batch) => {
				if (def.simulate) this.runSteps(def.simulate, batch, 0, scope);
			});
		}
		/**
		* 业务触发请求事件（业务 → 界面）。成功返回 null，否则返回原因。
		*/
		request(name, args = {}) {
			var _def$params;
			const def = requestEvent(this.project.logic, name);
			if (!def) return `“${name}”不是请求事件`;
			for (const [paramName, paramType] of Object.entries((_def$params = def.params) !== null && _def$params !== void 0 ? _def$params : {})) {
				const v = args[paramName];
				if (v === void 0) return `请求事件 ${name} 缺少参数 ${paramName}`;
				if (typeof v !== paramType) return `请求事件 ${name} 的参数 ${paramName} 需要 ${paramType}，得到 ${show(v)}`;
			}
			const scope = _objectSpread2({ param: args }, args);
			this.runBatch(`请求事件 ${name}`, false, false, (batch) => {
				if (def.steps) this.runSteps(def.steps, batch, 0, scope);
			});
			return null;
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
			if (sameStateValue(before, value)) return null;
			this.state.set(path, cloneValue(value));
			this.hooks.onLog({
				title: "业务写回状态",
				lines: [`${path}: ${show(before !== null && before !== void 0 ? before : null)} → ${show(value)}`]
			});
			this.notifyChanged();
			return null;
		}
		/** 执行一批步骤，让结果一次生效，再处理这一批里 emit 的业务事件和 call 的动作。 */
		runBatch(title, simulating, quietWhenEmpty, body) {
			const work = /* @__PURE__ */ new Map();
			for (const [k, v] of this.state) work.set(k, cloneValue(v));
			const windows = /* @__PURE__ */ new Map();
			for (const [k, v] of this.windows) windows.set(k, _objectSpread2({}, v));
			const batch = {
				work,
				windows,
				docks: new Map(this.docks),
				menuChecked: new Map(this.menuChecked),
				lines: [],
				pending: [],
				calls: [],
				simulating
			};
			body(batch);
			let changed = false;
			for (const [path, next] of batch.work) {
				const before = this.state.get(path);
				if (!sameStateValue(before, next)) {
					batch.lines.push(`${path}: ${show(before !== null && before !== void 0 ? before : null)} → ${show(next)}`);
					changed = true;
				}
			}
			for (const [id, next] of batch.windows) {
				const before = this.windows.get(id);
				if (!before || before.open !== next.open || before.modal !== next.modal) changed = true;
			}
			for (const [id, next] of batch.docks) if (this.docks.get(id) !== next) changed = true;
			for (const [id, next] of batch.menuChecked) if (this.menuChecked.get(id) !== next) changed = true;
			this.state = batch.work;
			this.windows = batch.windows;
			this.docks = batch.docks;
			this.menuChecked = batch.menuChecked;
			if (this.syncActiveTabsWithVisibility()) changed = true;
			if (batch.lines.length > 0 || !quietWhenEmpty) {
				if (batch.lines.length === 0) batch.lines.push("（没有状态变化）");
				this.hooks.onLog({
					title,
					lines: batch.lines
				});
			}
			if (changed) this.notifyChanged();
			for (const item of batch.pending) this.raise(item.name, item.args);
			for (const call of batch.calls) this.executeAction(call.name, call.input);
		}
		raise(name, args) {
			var _this$hooks$raiseBusi, _this$hooks;
			if ((_this$hooks$raiseBusi = (_this$hooks = this.hooks).raiseBusiness) === null || _this$hooks$raiseBusi === void 0 ? void 0 : _this$hooks$raiseBusi.call(_this$hooks, name, args)) return;
			if (this.businessChain >= MAX_BUSINESS_CHAIN) {
				this.hooks.onLog({
					title: `业务事件 ${name}`,
					lines: [`错误：业务事件连锁超过 ${MAX_BUSINESS_CHAIN} 个，可能是模拟步骤互相触发`]
				});
				return;
			}
			this.businessChain++;
			try {
				this.simulate(name, args);
			} finally {
				this.businessChain--;
			}
		}
		finishActionSuccess(name, resultVal) {
			var _this$project$logic$a4, _def$mockResult;
			const def = (_this$project$logic$a4 = this.project.logic.actions) === null || _this$project$logic$a4 === void 0 ? void 0 : _this$project$logic$a4[name];
			if (!def) return;
			this.runningActions.delete(name);
			const scope = { result: resultVal === void 0 ? (_def$mockResult = def.mockResult) !== null && _def$mockResult !== void 0 ? _def$mockResult : null : resultVal };
			this.runBatch(`动作 ${name} 完成`, false, false, (batch) => {
				if (def.onSuccess) this.runSteps(def.onSuccess, batch, 0, scope);
			});
		}
		finishActionError(name, message) {
			var _this$project$logic$a5;
			const def = (_this$project$logic$a5 = this.project.logic.actions) === null || _this$project$logic$a5 === void 0 ? void 0 : _this$project$logic$a5[name];
			if (!def) return;
			this.runningActions.delete(name);
			const scope = {
				error: { message },
				"error.message": message
			};
			this.runBatch(`动作 ${name} 失败`, false, false, (batch) => {
				batch.lines.push(`失败：${message}`);
				if (def.onError) this.runSteps(def.onError, batch, 0, scope);
			});
		}
		runActionDefault(name, input) {
			var _this$project$logic$a6, _this$project$actionS;
			const def = (_this$project$logic$a6 = this.project.logic.actions) === null || _this$project$logic$a6 === void 0 ? void 0 : _this$project$logic$a6[name];
			if (!def) return;
			const sim = this.getActionSimulation(name);
			const source = (_this$project$actionS = this.project.actionSources) === null || _this$project$actionS === void 0 ? void 0 : _this$project$actionS[name];
			if (!source) {
				var _def$mockResult2;
				this.finishActionSuccess(name, sim.result !== void 0 ? sim.result : (_def$mockResult2 = def.mockResult) !== null && _def$mockResult2 !== void 0 ? _def$mockResult2 : null);
				return;
			}
			try {
				const out = this.compileFunction(`action:${name}`, source)(input, input);
				if (out && typeof out.then === "function") {
					this.runningActions.add(name);
					const cleanup = out.then((res) => this.finishActionSuccess(name, res !== null && res !== void 0 ? res : null), (err) => {
						var _message;
						return this.finishActionError(name, (_message = err === null || err === void 0 ? void 0 : err.message) !== null && _message !== void 0 ? _message : String(err));
					}).then(() => {
						this.activePromises.delete(cleanup);
					}, () => {
						this.activePromises.delete(cleanup);
					});
					this.activePromises.add(cleanup);
				} else {
					var _ref4;
					this.finishActionSuccess(name, (_ref4 = out) !== null && _ref4 !== void 0 ? _ref4 : null);
				}
			} catch (e) {
				this.finishActionError(name, e.message);
			}
		}
		executeAction(name, input) {
			var _this$project$logic$a7;
			const def = (_this$project$logic$a7 = this.project.logic.actions) === null || _this$project$logic$a7 === void 0 ? void 0 : _this$project$logic$a7[name];
			if (!def) {
				this.hooks.onLog({
					title: `动作 ${name}`,
					lines: [`错误：动作“${name}”没有定义`]
				});
				return;
			}
			if (this.runningActions.has(name)) {
				this.hooks.onLog({
					title: `动作 ${name}`,
					lines: ["已忽略：该动作正在进行中"]
				});
				return;
			}
			const sim = this.getActionSimulation(name);
			const runNow = () => {
				var _this$hooks$raiseActi, _this$hooks2;
				if (sim.mode === "error") {
					var _ref5, _sim$errorMessage;
					this.finishActionError(name, (_ref5 = (_sim$errorMessage = sim.errorMessage) !== null && _sim$errorMessage !== void 0 ? _sim$errorMessage : def.mockError) !== null && _ref5 !== void 0 ? _ref5 : "模拟失败");
					return;
				}
				if (sim.mode === "success") {
					var _def$mockResult3;
					this.finishActionSuccess(name, sim.result !== void 0 ? sim.result : (_def$mockResult3 = def.mockResult) !== null && _def$mockResult3 !== void 0 ? _def$mockResult3 : null);
					return;
				}
				if ((_this$hooks$raiseActi = (_this$hooks2 = this.hooks).raiseAction) === null || _this$hooks$raiseActi === void 0 ? void 0 : _this$hooks$raiseActi.call(_this$hooks2, name, input)) {
					this.runningActions.add(name);
					return;
				}
				this.runActionDefault(name, input);
			};
			if (sim.delayMs > 0 && typeof setTimeout === "function") {
				this.runningActions.add(name);
				this.hooks.onLog({
					title: `动作 ${name}`,
					lines: [`开始（延迟 ${sim.delayMs} ms）`]
				});
				const cleanup = new Promise((resolve) => {
					setTimeout(() => {
						try {
							runNow();
						} finally {
							resolve();
						}
					}, sim.delayMs);
				}).then(() => {
					this.activePromises.delete(cleanup);
				}, () => {
					this.activePromises.delete(cleanup);
				});
				this.activePromises.add(cleanup);
			} else runNow();
		}
		compileFunction(cacheKey, source) {
			let fn = this.fnCache.get(cacheKey);
			if (!fn) {
				const transformed = `"use strict";\n` + source.replace(/^\s*export\s+default\s+/m, "return ");
				let factory;
				try {
					factory = new Function(...SHADOWED_DOM_GLOBALS, transformed);
				} catch (err) {
					if (err instanceof SyntaxError && /\basync\b/.test(transformed)) {
						const downleveled = transformed.replace(/\breturn\s+async\s+function\s*([A-Za-z0-9_$]*)\s*\(([^)]*)\)\s*\{([\s\S]*)\}\s*$/, "return function $1($2) { return Promise.resolve().then(() => {$3}); }").replace(/\breturn\s+async\s*\(([^)]*)\)\s*=>\s*\{([\s\S]*)\}\s*$/, "return ($1) => Promise.resolve().then(() => {$2})").replace(/\breturn\s+async\s*\(([^)]*)\)\s*=>\s*([\s\S]*)$/, "return ($1) => Promise.resolve().then(() => ($2))").replace(/\bawait\s+/g, "");
						factory = new Function(...SHADOWED_DOM_GLOBALS, downleveled);
					} else throw err;
				}
				const exported = factory(...SHADOWED_DOM_GLOBALS.map(() => void 0));
				if (typeof exported !== "function") throw new Error(`函数文件没有导出一个函数`);
				fn = exported;
				this.fnCache.set(cacheKey, fn);
			}
			return fn;
		}
		buildStateObject(work) {
			const obj = { clock: this.clockMs };
			for (const [path, val] of work) {
				obj[path] = cloneValue(val);
				const parts = path.split(".");
				let cursor = obj;
				for (let i = 0; i < parts.length - 1; i++) {
					const part = parts[i];
					if (typeof cursor[part] !== "object" || cursor[part] === null || Array.isArray(cursor[part])) cursor[part] = {};
					cursor = cursor[part];
				}
				cursor[parts[parts.length - 1]] = cloneValue(val);
			}
			return obj;
		}
		applyFnResult(batch, result) {
			if (!result || typeof result !== "object" || Array.isArray(result)) return;
			const walk = (obj, prefix) => {
				for (const [k, v] of Object.entries(obj)) {
					const path = prefix ? `${prefix}.${k}` : k;
					if (findStateLeaf(this.project.logic, path)) this.assign(batch, path, v);
					else if (v && typeof v === "object" && !Array.isArray(v)) walk(v, path);
					else this.assign(batch, path, v);
				}
			};
			walk(result, "");
		}
		runSteps(steps, batch, depth, scope) {
			if (!Array.isArray(steps)) return;
			for (const step of steps) try {
				if ("set" in step) {
					const parsed = parseAssignment(step.set);
					const nextValue = evalExpr(parsed.value, (path) => this.resolve(path, batch.work, [], scope));
					if (parsed.index !== void 0) {
						const idx = Number(evalExpr(parsed.index, (path) => this.resolve(path, batch.work, [], scope)));
						this.assignIndexed(batch, parsed.target, idx, parsed.field, nextValue);
					} else this.assign(batch, parsed.target, nextValue);
				} else if ("push" in step) {
					var _value;
					const spec = typeof step.push === "string" ? {
						to: step.push,
						item: (_value = step.value) !== null && _value !== void 0 ? _value : null
					} : step.push;
					const itemVal = this.evaluateStructured(spec.item, batch.work, scope);
					const cur = batch.work.get(spec.to);
					const arr = Array.isArray(cur) ? cloneValue(cur) : [];
					if (spec.index !== void 0) {
						const idx = Math.max(0, Math.min(arr.length, Number(this.evaluate(spec.index, batch.work, scope))));
						arr.splice(idx, 0, itemVal);
					} else arr.push(itemVal);
					this.assign(batch, spec.to, arr);
				} else if ("remove" in step) {
					var _index;
					const spec = typeof step.remove === "string" ? {
						from: step.remove,
						index: (_index = step.index) !== null && _index !== void 0 ? _index : 0
					} : step.remove;
					const idx = Number(this.evaluate(spec.index, batch.work, scope));
					const cur = batch.work.get(spec.from);
					if (Array.isArray(cur)) {
						if (Number.isInteger(idx) && idx >= 0 && idx < cur.length) {
							const arr = cloneValue(cur);
							arr.splice(idx, 1);
							this.assign(batch, spec.from, arr);
						}
					} else this.assign(batch, spec.from, []);
				} else if ("move" in step) {
					var _from, _to;
					const spec = typeof step.move === "string" ? {
						in: step.move,
						from: (_from = step.from) !== null && _from !== void 0 ? _from : 0,
						to: (_to = step.to) !== null && _to !== void 0 ? _to : 0
					} : step.move;
					const fromIdx = Number(this.evaluate(spec.from, batch.work, scope));
					const toIdx = Number(this.evaluate(spec.to, batch.work, scope));
					const cur = batch.work.get(spec.in);
					if (Array.isArray(cur)) {
						if (Number.isInteger(fromIdx) && Number.isInteger(toIdx) && fromIdx >= 0 && fromIdx < cur.length && toIdx >= 0 && toIdx < cur.length) {
							const arr = cloneValue(cur);
							const [moved] = arr.splice(fromIdx, 1);
							arr.splice(toIdx, 0, moved);
							this.assign(batch, spec.in, arr);
						}
					} else this.assign(batch, spec.in, []);
				} else if ("fn" in step) {
					var _this$project$functio;
					const spec = typeof step.fn === "string" ? {
						name: step.fn,
						args: step.args
					} : step.fn;
					const source = (_this$project$functio = this.project.functions) === null || _this$project$functio === void 0 ? void 0 : _this$project$functio[spec.name];
					if (!source) batch.lines.push(`错误：找不到函数“${spec.name}”`);
					else {
						var _spec$args;
						const evalArgs = _objectSpread2({}, scope);
						for (const [k, v] of Object.entries((_spec$args = spec.args) !== null && _spec$args !== void 0 ? _spec$args : {})) evalArgs[k] = this.evaluateStructured(v, batch.work, scope);
						const result = this.compileFunction(`fn:${spec.name}`, source)(this.buildStateObject(batch.work), evalArgs);
						this.applyFnResult(batch, result);
					}
				} else if ("openWindow" in step) {
					const spec = typeof step.openWindow === "string" ? { id: step.openWindow } : step.openWindow;
					const node = this.project.scene.nodes[spec.id];
					if (!node) batch.lines.push(`错误：窗口“${spec.id}”不存在`);
					else {
						var _ref6, _node$modal, _node$props2;
						const modal = spec.modal !== void 0 ? Boolean(spec.modal) : Boolean((_ref6 = (_node$modal = node.modal) !== null && _node$modal !== void 0 ? _node$modal : (_node$props2 = node.props) === null || _node$props2 === void 0 ? void 0 : _node$props2.modal) !== null && _ref6 !== void 0 ? _ref6 : node.type === "Dialog");
						batch.windows.set(spec.id, {
							open: true,
							modal
						});
						batch.lines.push(`打开窗口 ${spec.id}${modal ? "（模态）" : ""}`);
					}
				} else if ("closeWindow" in step) {
					const id = step.closeWindow;
					const prev = batch.windows.get(id);
					if (!this.project.scene.nodes[id]) batch.lines.push(`错误：窗口“${id}”不存在`);
					else {
						var _prev$modal;
						batch.windows.set(id, {
							open: false,
							modal: (_prev$modal = prev === null || prev === void 0 ? void 0 : prev.modal) !== null && _prev$modal !== void 0 ? _prev$modal : true
						});
						batch.lines.push(`关闭窗口 ${id}`);
					}
				} else if ("call" in step) {
					var _this$project$logic$a8;
					const name = step.call;
					const def = (_this$project$logic$a8 = this.project.logic.actions) === null || _this$project$logic$a8 === void 0 ? void 0 : _this$project$logic$a8[name];
					if (!def) batch.lines.push(`错误：动作“${name}”没有在 actions 中定义`);
					else {
						var _def$input;
						const input = {};
						for (const [k, expr] of Object.entries((_def$input = def.input) !== null && _def$input !== void 0 ? _def$input : {})) input[k] = this.evaluate(expr, batch.work, scope);
						batch.calls.push({
							name,
							input
						});
						batch.lines.push(`调用动作 ${name}`);
					}
				} else if ("emit" in step) {
					var _spec$args2;
					const spec = typeof step.emit === "string" ? {
						name: step.emit,
						args: step.args
					} : step.emit;
					const evalArgs = {};
					for (const [k, v] of Object.entries((_spec$args2 = spec.args) !== null && _spec$args2 !== void 0 ? _spec$args2 : {})) evalArgs[k] = this.evaluateStructured(v, batch.work, scope);
					const handler = globalSteps(this.project.logic, spec.name);
					const reqDef = requestEvent(this.project.logic, spec.name);
					if (businessEvent(this.project.logic, spec.name)) {
						batch.pending.push({
							name: spec.name,
							args: evalArgs
						});
						batch.lines.push(`业务事件 ${spec.name}：这批步骤生效后处理`);
					} else if (reqDef) {
						if (depth >= MAX_EMIT_DEPTH) batch.lines.push(`错误：全局事件嵌套超过 ${MAX_EMIT_DEPTH} 层，可能是互相触发`);
						else {
							batch.lines.push(`触发请求事件 ${spec.name}`);
							this.runSteps(reqDef.steps, batch, depth + 1, _objectSpread2(_objectSpread2({}, scope), {}, { param: evalArgs }, evalArgs));
						}
					} else if (!handler) batch.lines.push(`错误：全局事件“${spec.name}”没有定义`);
					else if (batch.simulating) batch.lines.push(`错误：模拟步骤里不能触发普通全局事件“${spec.name}”`);
					else if (depth >= MAX_EMIT_DEPTH) batch.lines.push(`错误：全局事件嵌套超过 ${MAX_EMIT_DEPTH} 层，可能是互相触发`);
					else {
						batch.lines.push(`触发全局事件 ${spec.name}`);
						this.runSteps(handler, batch, depth + 1, _objectSpread2(_objectSpread2({}, scope), {}, { param: evalArgs }, evalArgs));
					}
				} else if ("if" in step) {
					const branch = this.evaluate(step.if, batch.work, scope) ? step.then : step.else;
					if (branch) this.runSteps(branch, batch, depth, scope);
				}
			} catch (e) {
				batch.lines.push(`错误：${e.message}`);
			}
		}
		accepts(leaf, value) {
			var _leaf$values2;
			if (leaf.type === "enum") return typeof value === "string" && ((_leaf$values2 = leaf.values) !== null && _leaf$values2 !== void 0 ? _leaf$values2 : []).includes(value);
			if (leaf.type === "array") return Array.isArray(value);
			if (leaf.type === "object") return typeof value === "object" && value !== null && !Array.isArray(value);
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
			else batch.work.set(target, cloneValue(value));
		}
		assignIndexed(batch, target, idx, field, value) {
			const leaf = findStateLeaf(this.project.logic, target);
			if (!leaf) {
				batch.lines.push(`错误：“${target}”不是状态路径`);
				return;
			}
			if (leaf.type !== "array") {
				batch.lines.push(`错误：“${target}”不是数组状态，不能按位置赋值`);
				return;
			}
			if (isBusinessState(leaf) !== batch.simulating) {
				batch.lines.push(batch.simulating ? `错误：模拟步骤只能修改业务管的状态，“${target}”是界面自己管的` : `错误：状态“${target}”归业务管，只能在业务事件的模拟步骤里修改`);
				return;
			}
			const cur = batch.work.get(target);
			if (!Array.isArray(cur) || !Number.isInteger(idx) || idx < 0 || idx >= cur.length) return;
			const nextArr = cloneValue(cur);
			if (field) {
				const item = nextArr[idx];
				if (item && typeof item === "object" && !Array.isArray(item)) nextArr[idx] = _objectSpread2(_objectSpread2({}, item), {}, { [field]: cloneValue(value) });
			} else nextArr[idx] = cloneValue(value);
			batch.work.set(target, nextArr);
		}
	};
	//#endregion
	//#region src/export/dump.ts
	function sorted(entries) {
		const result = {};
		for (const [key, value] of entries.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)) result[key] = value;
		return result;
	}
	function canonicalValue(val) {
		if (val === null || typeof val !== "object") return val;
		if (Array.isArray(val)) return val.map(canonicalValue);
		return sorted(Object.keys(val).map((k) => [k, canonicalValue(val[k])]));
	}
	function dumpRuntime(runtime, scene) {
		var _rootNode$docks$lengt, _rootNode$docks;
		const views = [];
		for (const id of Object.keys(scene.nodes)) {
			if (id === scene.root) continue;
			const view = runtime.view(id);
			const props = Object.keys(view.props).map((key) => [key, canonicalValue(view.props[key])]);
			const entry = _objectSpread2(_objectSpread2(_objectSpread2({
				enabled: view.enabled,
				props: sorted(props)
			}, view.stateImage ? { stateImage: view.stateImage } : {}), view.visualState ? { visualState: view.visualState } : {}), {}, { visible: view.visible });
			views.push([id, entry]);
		}
		const stateEntries = runtime.stateSnapshot().map(([k, v]) => [k, canonicalValue(v)]);
		const rootNode = scene.nodes[scene.root];
		if (rootNode && (((_rootNode$docks$lengt = (_rootNode$docks = rootNode.docks) === null || _rootNode$docks === void 0 ? void 0 : _rootNode$docks.length) !== null && _rootNode$docks$lengt !== void 0 ? _rootNode$docks$lengt : 0) > 0 || rootNode.dockLayout)) {
			const docks = canonicalValue(runtime.getDockLayout(scene.root));
			return JSON.stringify({
				docks,
				state: sorted(stateEntries),
				views: sorted(views)
			});
		}
		return JSON.stringify({
			state: sorted(stateEntries),
			views: sorted(views)
		});
	}
	//#endregion
	//#region src/export/qt-runtime.ts
	let runtime;
	let scene;
	/** 等界面绑定层处理的业务事件与动作请求 */
	let outgoing = [];
	let nextTimerId = 1;
	let pendingTimers = [];
	const timerCallbacks = /* @__PURE__ */ new Map();
	const g = Function("return this")();
	if (typeof g.setTimeout !== "function") {
		g.setTimeout = (cb, ms) => {
			const id = nextTimerId++;
			const delayMs = Math.max(0, Math.round(Number(ms !== null && ms !== void 0 ? ms : 0)));
			timerCallbacks.set(id, cb);
			pendingTimers.push({
				id,
				delayMs
			});
			return id;
		};
		g.clearTimeout = (id) => {
			if (id !== void 0) {
				timerCallbacks.delete(id);
				pendingTimers = pendingTimers.filter((t) => t.id !== id);
			}
		};
	}
	function take() {
		const list = outgoing;
		outgoing = [];
		return list;
	}
	function takePending() {
		return take();
	}
	function takeTimers() {
		const list = pendingTimers;
		pendingTimers = [];
		return list;
	}
	function fireTimer(id) {
		const cb = timerCallbacks.get(id);
		if (cb) {
			timerCallbacks.delete(id);
			cb();
		}
		return take();
	}
	function init(json) {
		const data = JSON.parse(json);
		scene = data.scene;
		outgoing = [];
		pendingTimers = [];
		timerCallbacks.clear();
		const components = /* @__PURE__ */ new Map();
		for (const type of Object.keys(data.components)) components.set(type, { decl: data.components[type] });
		runtime = new Runtime({
			scene: data.scene,
			logic: data.logic,
			components,
			functions: data.functions,
			actionSources: data.actionSources
		}, {
			onChange() {},
			onLog() {},
			raiseBusiness(name, args) {
				outgoing.push({
					kind: "event",
					name,
					args
				});
				return true;
			},
			raiseAction(name, input) {
				outgoing.push({
					kind: "action",
					name,
					args: input
				});
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
	function simulate(name, args) {
		runtime.simulate(name, args !== null && args !== void 0 ? args : {});
		return take();
	}
	function simulateAction(name, input) {
		runtime.runActionDefault(name, input !== null && input !== void 0 ? input : {});
		return take();
	}
	function finishActionSuccess(name, result) {
		runtime.finishActionSuccess(name, result === null ? void 0 : result);
		return take();
	}
	function finishActionError(name, message) {
		runtime.finishActionError(name, message);
		return take();
	}
	function request(name, args) {
		runtime.request(name, args !== null && args !== void 0 ? args : {});
		return take();
	}
	function closeWindow(id) {
		runtime.closeWindow(id);
		return take();
	}
	function setClock(ms) {
		runtime.setClock(ms);
		return take();
	}
	function getClock() {
		return runtime.getClock();
	}
	function setActionSim(name, mode, delayMs) {
		runtime.setActionSimulation(name, _objectSpread2({ mode }, delayMs !== void 0 && Number.isFinite(delayMs) ? { delayMs: Math.max(0, delayMs) } : {}));
	}
	/** 业务把自己管的状态写回来。成功返回 null，否则返回原因。 */
	function setState(path, value) {
		return runtime.setBusinessState(path, value);
	}
	function getState(path) {
		const value = runtime.getState(path);
		return value === void 0 ? null : value;
	}
	/** 每个控件（及菜单项）当前应有的样子：ID → 可见、可用、属性。 */
	function views() {
		const result = {};
		for (const id of Object.keys(scene.nodes)) result[id] = runtime.view(id);
		for (const { item } of allMenuItems(scene)) if (!result[item.id]) result[item.id] = runtime.view(item.id);
		return result;
	}
	function computeLayout(width, height) {
		const boxes = computeSceneLayout(scene, {
			rootSize: {
				width,
				height
			},
			isVisible: (id) => runtime.view(id).visible,
			getProp: (id, prop) => {
				var _runtime$view$props$p;
				return (_runtime$view$props$p = runtime.view(id).props[prop]) !== null && _runtime$view$props$p !== void 0 ? _runtime$view$props$p : null;
			},
			getDockLayout: (winId) => runtime.getDockLayout(winId)
		});
		const out = {};
		for (const [id, box] of boxes) out[id] = box;
		return out;
	}
	function dockLayout() {
		return JSON.stringify(runtime.getDockLayout(scene.root));
	}
	/** 当前窗口尺寸下应有的实际排列，check 用它和 Qt 实测比较。 */
	function effectiveDockLayoutAt(width, height) {
		const boxes = computeLayout(width, height);
		return JSON.stringify(effectiveDockLayout(runtime.getDockLayout(scene.root), (id) => boxes[id]));
	}
	function dockOp(op, argsJson) {
		let args = {};
		if (argsJson) try {
			args = JSON.parse(argsJson);
		} catch (_unused) {}
		runtime.dockOp(op, args);
		return take();
	}
	function dump() {
		return dumpRuntime(runtime, scene);
	}
	const num = (value, fallback) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
	const str = (value, fallback = "") => typeof value === "string" && value !== "" ? value : fallback;
	function paintColor(value, fallback) {
		const color = str(value, fallback);
		return color === "none" || color === "transparent" ? "none" : color;
	}
	const outlineCache = /* @__PURE__ */ new Map();
	function parseAt(value) {
		if (typeof value !== "string") return null;
		const [x, y] = value.split(",").map(Number);
		return Number.isFinite(x) && Number.isFinite(y) ? {
			x,
			y
		} : null;
	}
	function graphics(width, height) {
		let hasAny = false;
		for (const n of Object.values(scene.nodes)) if (n.type === "Shape" || n.type === "Line") {
			hasAny = true;
			break;
		}
		if (!hasAny) return {};
		const boxes = computeSceneLayout(scene, {
			rootSize: {
				width,
				height
			},
			isVisible: (id) => runtime.view(id).visible,
			getProp: (id, prop) => {
				var _runtime$view$props$p2;
				return (_runtime$view$props$p2 = runtime.view(id).props[prop]) !== null && _runtime$view$props$p2 !== void 0 ? _runtime$view$props$p2 : null;
			}
		});
		const absRect = (id) => {
			var _n$x, _n$y, _n$width, _n$height;
			const b = boxes.get(id);
			if (b) return {
				x: b.absX,
				y: b.absY,
				width: b.width,
				height: b.height
			};
			const n = scene.nodes[id];
			return {
				x: (_n$x = n === null || n === void 0 ? void 0 : n.x) !== null && _n$x !== void 0 ? _n$x : 0,
				y: (_n$y = n === null || n === void 0 ? void 0 : n.y) !== null && _n$y !== void 0 ? _n$y : 0,
				width: (_n$width = n === null || n === void 0 ? void 0 : n.width) !== null && _n$width !== void 0 ? _n$width : 0,
				height: (_n$height = n === null || n === void 0 ? void 0 : n.height) !== null && _n$height !== void 0 ? _n$height : 0
			};
		};
		const sceneParentOrigin = (id) => {
			const pId = parentOfNode(scene, id);
			if (!pId) return {
				x: 0,
				y: 0
			};
			const r = absRect(pId);
			return {
				x: r.x,
				y: r.y
			};
		};
		const qtParentOrigin = (id) => {
			var _pNode$headerHeight;
			const pId = parentOfNode(scene, id);
			if (!pId || pId === scene.root) return {
				x: 0,
				y: 0
			};
			const pNode = scene.nodes[pId];
			if (!pNode || pNode.type === "Window" || pNode.type === "Dialog") return {
				x: 0,
				y: 0
			};
			const r = absRect(pId);
			const hdr = pNode.type === "Dock" ? (_pNode$headerHeight = pNode.headerHeight) !== null && _pNode$headerHeight !== void 0 ? _pNode$headerHeight : 26 : 0;
			return {
				x: r.x,
				y: r.y + hdr
			};
		};
		const attachedTarget = (lineId, value) => {
			const target = typeof value === "string" ? value : "";
			const n = target ? scene.nodes[target] : void 0;
			return n && target !== lineId && n.type !== "Line" && target !== scene.root ? target : null;
		};
		const outlineOf = (id) => {
			const n = scene.nodes[id];
			if (!n) return [];
			const r = absRect(id);
			const props = runtime.view(id).props;
			const kind = str(props.shape, "rectangle");
			const isShape = n.type === "Shape" && kind !== "text";
			const stroke = props.stroke === "none" ? 0 : num(props.strokeWidth, 2);
			const key = isShape ? JSON.stringify([
				kind,
				r.width,
				r.height,
				stroke,
				props.radius,
				props.sides,
				props.points,
				props.ratio
			]) : `box|${r.width}|${r.height}`;
			const cached = outlineCache.get(key);
			if (cached) return cached;
			let pts;
			if (isShape) {
				const d = shapeGeometry(kind, r.width, r.height, stroke, props).body;
				pts = sampleSvgPath(d);
			} else pts = [
				{
					x: 0,
					y: 0
				},
				{
					x: r.width,
					y: 0
				},
				{
					x: r.width,
					y: r.height
				},
				{
					x: 0,
					y: r.height
				}
			];
			if (outlineCache.size > 500) outlineCache.clear();
			outlineCache.set(key, pts);
			return pts;
		};
		const worldOutlineOf = (id) => outlineOf(id).map((pt) => nodeLocalToWorldInScene(scene, id, pt, boxes));
		const nearestOnOutline = (id, p) => {
			const r = absRect(id);
			const pts = worldOutlineOf(id);
			let best = {
				point: {
					x: r.x,
					y: r.y
				},
				distance: Infinity
			};
			for (let i = 0; i < pts.length; i++) {
				const a = pts[i];
				const b = pts[(i + 1) % pts.length];
				const dx = b.x - a.x;
				const dy = b.y - a.y;
				const length2 = dx * dx + dy * dy;
				const t = length2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2)) : 0;
				const q = {
					x: a.x + dx * t,
					y: a.y + dy * t
				};
				const d = Math.hypot(q.x - p.x, q.y - p.y);
				if (d < best.distance) best = {
					point: q,
					distance: d
				};
			}
			return best;
		};
		const outlineRayHit = (id, direction) => {
			const r = absRect(id);
			const c = {
				x: r.x + r.width / 2,
				y: r.y + r.height / 2
			};
			const pts = worldOutlineOf(id);
			let best = null;
			let bestT = -1;
			for (let i = 0; i < pts.length; i++) {
				const a = pts[i];
				const b = pts[(i + 1) % pts.length];
				const ex = b.x - a.x;
				const ey = b.y - a.y;
				const denominator = direction.x * ey - direction.y * ex;
				if (Math.abs(denominator) < 1e-9) continue;
				const t = ((a.x - c.x) * ey - (a.y - c.y) * ex) / denominator;
				const u = ((a.x - c.x) * direction.y - (a.y - c.y) * direction.x) / denominator;
				if (t > 0 && u >= 0 && u <= 1 && t > bestT) {
					bestT = t;
					best = {
						x: c.x + direction.x * t,
						y: c.y + direction.y * t
					};
				}
			}
			return best;
		};
		const sideDirectionOf = (id, side) => {
			const dir = sideDirection(side);
			const rot = worldRotationInScene(scene, id);
			return rot ? rotatePoint(dir, {
				x: 0,
				y: 0
			}, rot) : dir;
		};
		const sideAnchorOf = (id, side) => {
			var _scene$nodes$id;
			const rotDir = sideDirectionOf(id, side);
			if (((_scene$nodes$id = scene.nodes[id]) === null || _scene$nodes$id === void 0 ? void 0 : _scene$nodes$id.type) === "Shape") {
				const hit = outlineRayHit(id, rotDir);
				if (hit) return hit;
			}
			const r = absRect(id);
			const localAnchor = sideAnchor({
				x: 0,
				y: 0,
				width: r.width,
				height: r.height
			}, side);
			return nodeLocalToWorldInScene(scene, id, localAnchor, boxes);
		};
		const resolveAttach = (id, sideValue, at, other) => {
			const rect = absRect(id);
			const localRect = {
				x: 0,
				y: 0,
				width: rect.width,
				height: rect.height
			};
			if (sideValue === "outline" && at) {
				const guess = nodeLocalToWorldInScene(scene, id, {
					x: at.x * rect.width,
					y: at.y * rect.height
				}, boxes);
				const point = nearestOnOutline(id, guess).point;
				const localSide = autoSide(localRect, worldToNodeLocalInScene(scene, id, point, boxes));
				return {
					point,
					direction: sideDirectionOf(id, localSide)
				};
			}
			const localOther = worldToNodeLocalInScene(scene, id, other, boxes);
			const side = SIDES.includes(sideValue) ? sideValue : autoSide(localRect, localOther);
			return {
				point: sideAnchorOf(id, side),
				direction: sideDirectionOf(id, side)
			};
		};
		const lineEndpoints = (id, props) => {
			const origin = sceneParentOrigin(id);
			const raw = (which) => which === "start" ? {
				x: origin.x + num(props.x1, 0),
				y: origin.y + num(props.y1, 0)
			} : {
				x: origin.x + num(props.x2, 160),
				y: origin.y + num(props.y2, 0)
			};
			const startTarget = attachedTarget(id, props.startNode);
			const endTarget = attachedTarget(id, props.endNode);
			const center = (target) => {
				const r = absRect(target);
				return {
					x: r.x + r.width / 2,
					y: r.y + r.height / 2
				};
			};
			const startRef = startTarget ? center(startTarget) : raw("start");
			const endRef = endTarget ? center(endTarget) : raw("end");
			const resolve = (which, target, other) => {
				if (!target) return {
					point: raw(which),
					direction: null
				};
				const sideValue = str(which === "start" ? props.startSide : props.endSide, "auto");
				return resolveAttach(target, sideValue, parseAt(which === "start" ? props.startAt : props.endAt), other);
			};
			return {
				start: resolve("start", startTarget, endRef),
				end: resolve("end", endTarget, startRef)
			};
		};
		const computeLineLayout = (id, props) => {
			var _props$route;
			const { start, end } = lineEndpoints(id, props);
			const origin = sceneParentOrigin(id);
			const bends = parseBends(props.bends).map((p) => ({
				x: p.x + origin.x,
				y: p.y + origin.y
			}));
			const geometry = lineGeometry((_props$route = props.route) !== null && _props$route !== void 0 ? _props$route : "straight", start, end, bends);
			const xs = geometry.points.map((p) => p.x);
			const ys = geometry.points.map((p) => p.y);
			const margin = 10 + num(props.strokeWidth, 2) * 3 + (str(props.label, "") ? num(props.fontSize, 12) : 0);
			const x = Math.min(...xs) - margin;
			const y = Math.min(...ys) - margin;
			return {
				start,
				end,
				geometry,
				bbox: {
					x,
					y,
					width: Math.max(...xs) + margin - x,
					height: Math.max(...ys) + margin - y
				}
			};
		};
		const out = {};
		for (const [id, n] of Object.entries(scene.nodes)) if (n.type === "Shape") {
			const box = absRect(id);
			const pOrigin = qtParentOrigin(id);
			const bx = box.x - pOrigin.x;
			const by = box.y - pOrigin.y;
			const bw = Math.round(box.width);
			const bh = Math.round(box.height);
			const props = runtime.view(id).props;
			const kind = str(props.shape, "rectangle");
			const fill = paintColor(props.fill, "#ffffff");
			const stroke = paintColor(props.stroke, "#1f2430");
			const strokeWidth = stroke === "none" ? 0 : Math.max(0, num(props.strokeWidth, 2));
			const strokeStyle = str(props.strokeStyle, "solid");
			const opacity = Math.max(0, Math.min(1, num(props.opacity, 1)));
			const rot = typeof n.rotation === "number" ? n.rotation : 0;
			const rad = rot * Math.PI / 180;
			const cosA = Math.abs(Math.cos(rad));
			const sinA = Math.abs(Math.sin(rad));
			const cx = bx + bw / 2;
			const cy = by + bh / 2;
			const aabbW = rot !== 0 ? Math.ceil(bw * cosA + bh * sinA) + 4 : bw;
			const aabbH = rot !== 0 ? Math.ceil(bw * sinA + bh * cosA) + 4 : bh;
			const aabbX = rot !== 0 ? Math.round(cx - aabbW / 2) : Math.round(bx);
			const aabbY = rot !== 0 ? Math.round(cy - aabbH / 2) : Math.round(by);
			const geom = shapeGeometry(kind, bw, bh, strokeWidth, props);
			const tbox = shapeTextBox(kind, bw, bh);
			out[id] = {
				kind: "shape",
				x: aabbX,
				y: aabbY,
				width: aabbW,
				height: aabbH,
				logicalX: Math.round(bx),
				logicalY: Math.round(by),
				logicalWidth: bw,
				logicalHeight: bh,
				centerX: cx - aabbX,
				centerY: cy - aabbY,
				rotation: rot,
				opacity,
				body: geom.body,
				details: geom.details,
				fill,
				stroke,
				strokeWidth,
				strokeStyle,
				text: typeof props.text === "string" ? props.text : "",
				textX: tbox.x,
				textY: tbox.y,
				textWidth: tbox.width,
				textHeight: tbox.height,
				textColor: str(props.textColor, "#1f2430"),
				fontSize: num(props.fontSize, 14),
				fontWeight: str(props.fontWeight, "normal"),
				textAlign: str(props.textAlign, "center")
			};
		} else if (n.type === "Line") {
			var _props$route2, _props$startCap, _props$endCap;
			const props = runtime.view(id).props;
			const layout = computeLineLayout(id, props);
			const pOrigin = qtParentOrigin(id);
			const left = Math.floor(layout.bbox.x);
			const top = Math.floor(layout.bbox.y);
			const w = Math.ceil(layout.bbox.x + layout.bbox.width) - left;
			const h = Math.ceil(layout.bbox.y + layout.bbox.height) - top;
			const stroke = paintColor(props.stroke, "#1f2430");
			const strokeWidth = Math.max(.5, num(props.strokeWidth, 2));
			const strokeStyle = str(props.strokeStyle, "solid");
			const opacity = Math.max(0, Math.min(1, num(props.opacity, 1)));
			const route = (_props$route2 = props.route) !== null && _props$route2 !== void 0 ? _props$route2 : "straight";
			let pts = layout.geometry.points;
			pts = shortenEnd(pts, true, capInset(props.startCap, strokeWidth));
			pts = shortenEnd(pts, false, capInset(props.endCap, strokeWidth));
			const mainPath = pathFromPoints(route, pts);
			const first = layout.geometry.points[0];
			const last = layout.geometry.points[layout.geometry.points.length - 1];
			const sCap = capShape((_props$startCap = props.startCap) !== null && _props$startCap !== void 0 ? _props$startCap : "none", first, layout.geometry.startAngle, strokeWidth);
			const eCap = capShape((_props$endCap = props.endCap) !== null && _props$endCap !== void 0 ? _props$endCap : "none", last, layout.geometry.endAngle, strokeWidth);
			const label = typeof props.label === "string" ? props.label : "";
			const fallbackMid = {
				x: (first.x + last.x) / 2,
				y: (first.y + last.y) / 2
			};
			const mid = label ? svgPathMidpoint(mainPath, fallbackMid) : fallbackMid;
			out[id] = {
				kind: "line",
				x: left - pOrigin.x,
				y: top - pOrigin.y,
				width: w,
				height: h,
				logicalX: left - pOrigin.x,
				logicalY: top - pOrigin.y,
				logicalWidth: w,
				logicalHeight: h,
				originX: left,
				originY: top,
				opacity,
				mainPath,
				hitPath: layout.geometry.path,
				stroke,
				strokeWidth,
				strokeStyle,
				startCapPath: sCap ? sCap.path : "",
				startCapFilled: sCap ? sCap.filled : false,
				endCapPath: eCap ? eCap.path : "",
				endCapFilled: eCap ? eCap.filled : false,
				label,
				labelX: mid.x - left,
				labelY: mid.y - top,
				textColor: str(props.textColor, "#1f2430"),
				fontSize: num(props.fontSize, 12)
			};
		}
		return out;
	}
	//#endregion
	exports.closeWindow = closeWindow;
	exports.computeLayout = computeLayout;
	exports.dispatch = dispatch;
	exports.dockLayout = dockLayout;
	exports.dockOp = dockOp;
	exports.dump = dump;
	exports.effectiveDockLayoutAt = effectiveDockLayoutAt;
	exports.finishActionError = finishActionError;
	exports.finishActionSuccess = finishActionSuccess;
	exports.fireTimer = fireTimer;
	exports.getClock = getClock;
	exports.getState = getState;
	exports.graphics = graphics;
	exports.init = init;
	exports.request = request;
	exports.setActionSim = setActionSim;
	exports.setClock = setClock;
	exports.setState = setState;
	exports.simulate = simulate;
	exports.simulateAction = simulateAction;
	exports.start = start;
	exports.takePending = takePending;
	exports.takeTimers = takeTimers;
	exports.views = views;
	return exports;
})({});
