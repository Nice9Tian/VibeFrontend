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
	//#endregion
	//#region standard/Button/component.json
	var component_default$15 = {
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
	var component_default$14 = {
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
	var component_default$13 = {
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
	var component_default$12 = {
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
	var component_default$11 = {
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
			grid.style.rowGap = `${Math.max(4, schema.row_spacing)}px`;
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
					const head = document.createElement("div");
					head.className = "vf-std-dataform-head";
					const lbl = document.createElement("span");
					lbl.textContent = title;
					const num = document.createElement("span");
					num.className = "vf-std-dataform-val";
					num.dataset.vfFieldValue = name;
					head.append(lbl, num);
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
					cell.append(head, input);
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
			decl: component_default$15,
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
			decl: component_default$13,
			folder: "ComboBox",
			create: createComboBox,
			styleText: `.vf-std-combobox { box-sizing: border-box; width: 100%; height: 100%; padding: 0 8px; border: 1px solid var(--color-border, #cbd5e1); border-radius: 6px; background: var(--color-surface, #ffffff); color: var(--color-text, #1e293b); font: inherit; font-size: 13px; outline: none; cursor: pointer; }
.vf-std-combobox:focus { border-color: var(--color-primary, #2563eb); box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.18); }
.vf-std-combobox:disabled { opacity: 0.5; cursor: not-allowed; }`
		},
		{
			decl: component_default$14,
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
			decl: component_default$11,
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
			decl: component_default$5,
			folder: "Spacer",
			create: createSpacer,
			styleText: `.vf-std-spacer { width: 100%; height: 100%; pointer-events: none; }`
		},
		{
			decl: component_default$12,
			folder: "DataForm",
			create: createDataForm,
			styleText: `.vf-std-dataform { box-sizing: border-box; width: 100%; height: 100%; padding: 4px 6px; border: 1px solid var(--color-border, #cbd5e1); border-radius: 6px; background: var(--color-surface, #ffffff); color: var(--color-text, #1e293b); font-size: 11px; overflow: auto; }
.vf-std-dataform-empty { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--color-muted, #64748b); font-size: 12px; }
.vf-std-dataform-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: center; }
.vf-std-dataform-cell { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.vf-std-dataform-head { display: flex; justify-content: space-between; align-items: center; font-size: 11px; line-height: 1.1; }
.vf-std-dataform-val { color: var(--color-primary, #2563eb); font-variant-numeric: tabular-nums; font-weight: 500; }
.vf-std-dataform-slider { width: 100%; height: 12px; margin: 0; accent-color: var(--color-primary, #2563eb); }
.vf-std-dataform-row { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.vf-std-dataform-select { flex: 1; min-width: 0; height: 22px; padding: 0 4px; border: 1px solid var(--color-border, #cbd5e1); border-radius: 4px; background: var(--color-surface, #ffffff); color: var(--color-text, #1e293b); font-size: 11px; }
.vf-std-dataform-check { display: flex; align-items: center; gap: 6px; height: 20px; cursor: pointer; }
.vf-std-dataform-btn { height: 22px; padding: 0 6px; border: 1px solid var(--color-border, #cbd5e1); border-radius: 4px; background: var(--color-surface, #ffffff); color: var(--color-text, #1e293b); font-size: 11px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 4px; }
.vf-std-dataform-btn[data-active="true"] { border-color: var(--color-primary, #2563eb); box-shadow: 0 0 0 1px var(--color-primary, #2563eb); font-weight: 600; }
.vf-std-dataform-swatch-dot { width: 10px; height: 10px; border-radius: 50%; border: 1px solid rgba(148, 163, 184, 0.6); flex-shrink: 0; }
.vf-std-dataform-palette { display: flex; flex-direction: column; gap: 3px; }
.vf-std-dataform-swatches { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.vf-std-dataform-swatch-btn { width: 18px; height: 18px; padding: 0; border-radius: 3px; border: 1px solid var(--color-border, #cbd5e1); cursor: pointer; }
.vf-std-dataform-swatch-btn[data-active="true"] { border: 2px solid var(--color-primary, #2563eb); }
.vf-std-dataform-subwindow { display: flex; flex-direction: column; gap: 1px; padding: 3px 6px; border: 1px dashed var(--color-primary, #2563eb); border-radius: 4px; background: rgba(37, 99, 235, 0.08); font-size: 11px; line-height: 1.15; cursor: pointer; }
.vf-std-dataform-subwindow-head { display: flex; justify-content: space-between; align-items: center; font-weight: 600; color: var(--color-primary, #2563eb); }`
		}
	].map((item) => [item.decl.type, item]));
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
	* 统一获取一个画布节点的全部直接子节点 ID（按 docks → central → statusBar → children 顺序去重）。
	*/
	function childrenOfNode(n) {
		var _n$docks, _n$children;
		if (!n) return [];
		const list = [];
		const add = (cid) => {
			if (cid && !list.includes(cid)) list.push(cid);
		};
		for (const cid of (_n$docks = n.docks) !== null && _n$docks !== void 0 ? _n$docks : []) add(cid);
		add(n.central);
		add(n.statusBar);
		for (const cid of (_n$children = n.children) !== null && _n$children !== void 0 ? _n$children : []) add(cid);
		return list;
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
		return kind ? { kind } : null;
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
		return Boolean(node.menuBar || node.statusBar || node.central || node.docks && node.docks.length > 0);
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
	function dockHeightForWidth(scene, dock, availWidth, isVisible) {
		var _dock$size, _dock$size2, _dock$headerHeight, _ref8, _layout$columnGap2, _ref9, _layout$rowGap2, _dock$children;
		const baseH = prefHeight(dock);
		const layout = layoutOf(dock);
		if (!layout || !isWrapLayout(layout) || ((_dock$size = dock.size) === null || _dock$size === void 0 ? void 0 : _dock$size.fixedHeight) !== void 0 || ((_dock$size2 = dock.size) === null || _dock$size2 === void 0 ? void 0 : _dock$size2.vertical) === "fixed") return baseH;
		const hdrH = (_dock$headerHeight = dock.headerHeight) !== null && _dock$headerHeight !== void 0 ? _dock$headerHeight : 26;
		const [padTop, padRight, padBottom, padLeft] = paddingOf(layout);
		const colGap = (_ref8 = (_layout$columnGap2 = layout.columnGap) !== null && _layout$columnGap2 !== void 0 ? _layout$columnGap2 : layout.gap) !== null && _ref8 !== void 0 ? _ref8 : 0;
		const rowGap = (_ref9 = (_layout$rowGap2 = layout.rowGap) !== null && _layout$rowGap2 !== void 0 ? _layout$rowGap2 : layout.gap) !== null && _ref9 !== void 0 ? _ref9 : 0;
		const innerW = Math.max(0, availWidth - padLeft - padRight);
		const rows = computeFlowRows(scene, ((_dock$children = dock.children) !== null && _dock$children !== void 0 ? _dock$children : []).filter((cid) => Boolean(scene.nodes[cid]) && isVisible(cid)), innerW, colGap);
		if (rows.length === 0) return baseH;
		const rowsH = rows.reduce((sum, r) => sum + r.rowH, 0) + Math.max(0, rows.length - 1) * rowGap;
		return clampHeight(dock, Math.max(baseH, hdrH + padTop + rowsH + padBottom));
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
		const layoutSubtree = (parentId, parentBox) => {
			var _parent$children, _parent$headerHeight;
			const parent = scene.nodes[parentId];
			if (!parent) return;
			const children = ((_parent$children = parent.children) !== null && _parent$children !== void 0 ? _parent$children : []).filter((cid) => !boxes.has(cid) && Boolean(scene.nodes[cid]));
			if (children.length === 0) return;
			const headerOffset = parent.type === "Dock" ? (_parent$headerHeight = parent.headerHeight) !== null && _parent$headerHeight !== void 0 ? _parent$headerHeight : 26 : 0;
			const layout = layoutOf(parent);
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
				var _ref10, _layout$gap;
				const gap = (_ref10 = (_layout$gap = layout.gap) !== null && _layout$gap !== void 0 ? _layout$gap : layout.rowGap) !== null && _ref10 !== void 0 ? _ref10 : 0;
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
				var _ref11, _layout$columnGap3, _ref12, _layout$rowGap3;
				const colGap = (_ref11 = (_layout$columnGap3 = layout.columnGap) !== null && _layout$columnGap3 !== void 0 ? _layout$columnGap3 : layout.gap) !== null && _ref11 !== void 0 ? _ref11 : 0;
				const rowGap = (_ref12 = (_layout$rowGap3 = layout.rowGap) !== null && _layout$rowGap3 !== void 0 ? _layout$rowGap3 : layout.gap) !== null && _ref12 !== void 0 ? _ref12 : 0;
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
				var _ref13, _layout$gap2;
				const gap = (_ref13 = (_layout$gap2 = layout.gap) !== null && _layout$gap2 !== void 0 ? _layout$gap2 : layout.columnGap) !== null && _ref13 !== void 0 ? _ref13 : 0;
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
				var _layout$columns, _ref14, _layout$columnGap4, _ref15, _layout$rowGap4;
				const cols = Math.max(1, (_layout$columns = layout.columns) !== null && _layout$columns !== void 0 ? _layout$columns : 2);
				const colGap = (_ref14 = (_layout$columnGap4 = layout.columnGap) !== null && _layout$columnGap4 !== void 0 ? _layout$columnGap4 : layout.gap) !== null && _ref14 !== void 0 ? _ref14 : 0;
				const rowGap = (_ref15 = (_layout$rowGap4 = layout.rowGap) !== null && _layout$rowGap4 !== void 0 ? _layout$rowGap4 : layout.gap) !== null && _ref15 !== void 0 ? _ref15 : 0;
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
				var _ref16, _layout$columnGap5, _ref17, _layout$rowGap5, _layout$labelWidth;
				const colGap = (_ref16 = (_layout$columnGap5 = layout.columnGap) !== null && _layout$columnGap5 !== void 0 ? _layout$columnGap5 : layout.gap) !== null && _ref16 !== void 0 ? _ref16 : 8;
				const rowGap = (_ref17 = (_layout$rowGap5 = layout.rowGap) !== null && _layout$rowGap5 !== void 0 ? _layout$rowGap5 : layout.gap) !== null && _ref17 !== void 0 ? _ref17 : 8;
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
				var _ref18, _getProp, _parent$props, _ref19, _getProp2, _parent$props2;
				const activeIdx = Number((_ref18 = (_getProp = getProp(parentId, "currentIndex")) !== null && _getProp !== void 0 ? _getProp : (_parent$props = parent.props) === null || _parent$props === void 0 ? void 0 : _parent$props.currentIndex) !== null && _ref18 !== void 0 ? _ref18 : 0);
				const activePage = String((_ref19 = (_getProp2 = getProp(parentId, "currentPage")) !== null && _getProp2 !== void 0 ? _getProp2 : (_parent$props2 = parent.props) === null || _parent$props2 === void 0 ? void 0 : _parent$props2.currentPage) !== null && _ref19 !== void 0 ? _ref19 : "");
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
				var _winNode$menuBar$heig, _winNode$docks, _winNode$children;
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
				const midY = menuH;
				const midH = Math.max(0, H - menuH - statusH);
				const dockIds = (_winNode$docks = winNode.docks) !== null && _winNode$docks !== void 0 ? _winNode$docks : ((_winNode$children = winNode.children) !== null && _winNode$children !== void 0 ? _winNode$children : []).filter((cid) => {
					var _scene$nodes$cid;
					return ((_scene$nodes$cid = scene.nodes[cid]) === null || _scene$nodes$cid === void 0 ? void 0 : _scene$nodes$cid.type) === "Dock";
				});
				const byArea = {
					top: [],
					bottom: [],
					left: [],
					right: []
				};
				for (const did of dockIds) {
					var _d$dockArea;
					const d = scene.nodes[did];
					if (!d) continue;
					const area = (_d$dockArea = d.dockArea) !== null && _d$dockArea !== void 0 ? _d$dockArea : "left";
					if (isVisible(did)) byArea[area].push(did);
					else {
						const dBox = {
							x: 0,
							y: midY,
							width: prefWidth(d),
							height: prefHeight(d),
							absX: 0,
							absY: midY,
							visible: false,
							windowId: winId
						};
						boxes.set(did, dBox);
						layoutSubtree(did, dBox);
					}
				}
				let topH = 0;
				for (const did of byArea.top) {
					const d = scene.nodes[did];
					const dh = dockHeightForWidth(scene, d, W, isVisible);
					const dBox = {
						x: 0,
						y: midY + topH,
						width: W,
						height: dh,
						absX: 0,
						absY: midY + topH,
						visible: winVis,
						windowId: winId
					};
					boxes.set(did, dBox);
					layoutSubtree(did, dBox);
					topH += dh;
				}
				let bottomH = 0;
				for (const did of byArea.bottom) bottomH += dockHeightForWidth(scene, scene.nodes[did], W, isVisible);
				let bCurY = midY + midH - bottomH;
				for (const did of byArea.bottom) {
					const d = scene.nodes[did];
					const dh = dockHeightForWidth(scene, d, W, isVisible);
					const dBox = {
						x: 0,
						y: bCurY,
						width: W,
						height: dh,
						absX: 0,
						absY: bCurY,
						visible: winVis,
						windowId: winId
					};
					boxes.set(did, dBox);
					layoutSubtree(did, dBox);
					bCurY += dh;
				}
				const centerY = midY + topH;
				const centerH = Math.max(0, midH - topH - bottomH);
				let leftW = 0;
				for (const did of byArea.left) {
					const d = scene.nodes[did];
					const dw = prefWidth(d);
					const dBox = {
						x: leftW,
						y: centerY,
						width: dw,
						height: centerH,
						absX: leftW,
						absY: centerY,
						visible: winVis,
						windowId: winId
					};
					boxes.set(did, dBox);
					layoutSubtree(did, dBox);
					leftW += dw;
				}
				let rightW = 0;
				for (const did of byArea.right) rightW += prefWidth(scene.nodes[did]);
				let rCurX = W - rightW;
				for (const did of byArea.right) {
					const d = scene.nodes[did];
					const dw = prefWidth(d);
					const dBox = {
						x: rCurX,
						y: centerY,
						width: dw,
						height: centerH,
						absX: rCurX,
						absY: centerY,
						visible: winVis,
						windowId: winId
					};
					boxes.set(did, dBox);
					layoutSubtree(did, dBox);
					rCurX += dw;
				}
				const centralId = winNode.central;
				if (centralId && scene.nodes[centralId]) {
					const cx = leftW;
					const cy = centerY;
					const cBox = {
						x: cx,
						y: cy,
						width: Math.max(0, W - leftW - rightW),
						height: centerH,
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
			_defineProperty(this, "menuChecked", /* @__PURE__ */ new Map());
			_defineProperty(this, "clockMs", 0);
			_defineProperty(this, "actionSims", /* @__PURE__ */ new Map());
			_defineProperty(this, "runningActions", /* @__PURE__ */ new Set());
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
			}
			this.docks.clear();
			for (const [id, n] of Object.entries(this.project.scene.nodes)) {
				var _n$props3;
				if (n.type === "Dock") this.docks.set(id, ((_n$props3 = n.props) === null || _n$props3 === void 0 ? void 0 : _n$props3.visible) !== false);
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
		}
		/** 换成新加载的项目；状态结构没变的部分保留当前值。 */
		adopt(project) {
			const oldState = new Map(this.state);
			const oldConditions = new Map(this.textConditions);
			const oldWindows = new Map(this.windows);
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
			for (const [name, sim] of oldSims) this.actionSims.set(name, sim);
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
			this.hooks.onChange();
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
			this.hooks.onChange();
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
			var _this$project$logic$o2, _decl$props, _node$props, _object$props2;
			const menuItem = findMenuItem(this.project.scene, id);
			if (menuItem && !this.project.scene.nodes[id]) {
				var _this$project$logic$o, _this$menuChecked$get, _menuItem$checked, _object$props;
				const object = (_this$project$logic$o = this.project.logic.objects) === null || _this$project$logic$o === void 0 ? void 0 : _this$project$logic$o[id];
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
			const object = (_this$project$logic$o2 = this.project.logic.objects) === null || _this$project$logic$o2 === void 0 ? void 0 : _this$project$logic$o2[id];
			const props = {};
			const declared = (_decl$props = decl === null || decl === void 0 ? void 0 : decl.props) !== null && _decl$props !== void 0 ? _decl$props : {};
			for (const key of Object.keys(declared)) {
				const value = declared[key].default;
				if (value !== void 0) props[key] = cloneValue(value);
			}
			if ((node === null || node === void 0 ? void 0 : node.title) !== void 0 && (node.type === "Dock" || node.type === "Dialog")) props.title = node.title;
			if (node === null || node === void 0 ? void 0 : node.props) {
				for (const [k, v] of Object.entries(node.props)) if (k !== "visible") props[k] = cloneValue(v);
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
			var _logic$objects2, _object$events2;
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
			const object = nodeId ? (_logic$objects2 = logic.objects) === null || _logic$objects2 === void 0 ? void 0 : _logic$objects2[nodeId] : void 0;
			const steps = nodeId ? object === null || object === void 0 || (_object$events2 = object.events) === null || _object$events2 === void 0 ? void 0 : _object$events2[event] : globalSteps(logic, event);
			const bindTarget = nodeId && event === "change" && value !== void 0 ? object === null || object === void 0 ? void 0 : object.bind : void 0;
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
				const node = scene.nodes[nodeId];
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
			var _this$project$logic$o3, _dockObj$props, _batch$docks$get;
			const dockObj = (_this$project$logic$o3 = this.project.logic.objects) === null || _this$project$logic$o3 === void 0 ? void 0 : _this$project$logic$o3[dockId];
			const visExpr = dockObj === null || dockObj === void 0 || (_dockObj$props = dockObj.props) === null || _dockObj$props === void 0 ? void 0 : _dockObj$props.visible;
			if (typeof visExpr === "string" && findStateLeaf(this.project.logic, visExpr)) {
				const cur = Boolean(batch.work.get(visExpr));
				this.assign(batch, visExpr, !cur);
				return;
			}
			const cur = (_batch$docks$get = batch.docks.get(dockId)) !== null && _batch$docks$get !== void 0 ? _batch$docks$get : true;
			batch.docks.set(dockId, !cur);
			batch.lines.push(`停靠面板 ${dockId}: ${cur ? "显示 → 隐藏" : "隐藏 → 显示"}`);
		}
		/** 外部（如用户按 Esc 或点击窗口标题栏关闭按钮）关闭窗口时，将窗口开关同步回运行层。 */
		closeWindow(id) {
			const win = this.windows.get(id);
			if (!win || !win.open) return;
			this.runBatch(`关闭窗口 ${id}`, false, false, (batch) => {
				var _this$project$logic$o4;
				batch.windows.set(id, {
					open: false,
					modal: win.modal
				});
				batch.lines.push(`关闭窗口 ${id}`);
				const steps = (_this$project$logic$o4 = this.project.logic.objects) === null || _this$project$logic$o4 === void 0 || (_this$project$logic$o4 = _this$project$logic$o4[id]) === null || _this$project$logic$o4 === void 0 || (_this$project$logic$o4 = _this$project$logic$o4.events) === null || _this$project$logic$o4 === void 0 ? void 0 : _this$project$logic$o4["close"];
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
			this.hooks.onChange();
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
			if (batch.lines.length > 0 || !quietWhenEmpty) {
				if (batch.lines.length === 0) batch.lines.push("（没有状态变化）");
				this.hooks.onLog({
					title,
					lines: batch.lines
				});
			}
			if (changed) this.hooks.onChange();
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
					var _ref3;
					this.finishActionSuccess(name, (_ref3 = out) !== null && _ref3 !== void 0 ? _ref3 : null);
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
					var _ref4, _sim$errorMessage;
					this.finishActionError(name, (_ref4 = (_sim$errorMessage = sim.errorMessage) !== null && _sim$errorMessage !== void 0 ? _sim$errorMessage : def.mockError) !== null && _ref4 !== void 0 ? _ref4 : "模拟失败");
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
						var _ref5, _node$modal, _node$props2;
						const modal = spec.modal !== void 0 ? Boolean(spec.modal) : Boolean((_ref5 = (_node$modal = node.modal) !== null && _node$modal !== void 0 ? _node$modal : (_node$props2 = node.props) === null || _node$props2 === void 0 ? void 0 : _node$props2.modal) !== null && _ref5 !== void 0 ? _ref5 : node.type === "Dialog");
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
		const views = [];
		for (const id of Object.keys(scene.nodes)) {
			if (id === scene.root) continue;
			const view = runtime.view(id);
			const props = Object.keys(view.props).map((key) => [key, canonicalValue(view.props[key])]);
			views.push([id, {
				enabled: view.enabled,
				props: sorted(props),
				visible: view.visible
			}]);
		}
		const stateEntries = runtime.stateSnapshot().map(([k, v]) => [k, canonicalValue(v)]);
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
			}
		});
		const out = {};
		for (const [id, box] of boxes) out[id] = box;
		return out;
	}
	function dump() {
		return dumpRuntime(runtime, scene);
	}
	//#endregion
	exports.closeWindow = closeWindow;
	exports.computeLayout = computeLayout;
	exports.dispatch = dispatch;
	exports.dump = dump;
	exports.finishActionError = finishActionError;
	exports.finishActionSuccess = finishActionSuccess;
	exports.fireTimer = fireTimer;
	exports.getClock = getClock;
	exports.getState = getState;
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
