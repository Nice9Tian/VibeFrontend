// 界面绑定层。由工具生成，不要手改。
//
// 这个样板里的逻辑是手写的一小段，只为证明三件事：
//   1. 逻辑能在 Qt 自带的 JS 引擎里运行；
//   2. “界面自己管”的状态由这里直接改；
//   3. “业务管”的状态只在业务没有接上时由模拟步骤改。
// 正式的导出器会把原型里的 runtime.ts 编译后放在这里。
#include "LogicScript.h"

namespace vf {

const char *const kLogicScript = R"JS(
var state = {
    "layer.visible": true,     // 业务管
    "panel.expanded": false    // 界面自己管
};

// 控件事件 → 步骤。business 表示交给业务的事件，其余是界面自己的步骤。
var handlers = {
    "toggleButton.click": [ { business: "layerToggleVisible" } ],
    "expandButton.click": [ { toggle: "panel.expanded" } ]
};

// 业务没有接上时，用这些步骤模拟业务的反应。
var simulations = {
    "layerToggleVisible": [ { toggle: "layer.visible" } ]
};

function applyStep(step) {
    if (step.toggle) state[step.toggle] = !state[step.toggle];
    if (step.set) state[step.set] = step.value;
}

// 处理一次控件事件：执行界面自己的步骤，返回需要交给业务的事件名。
function dispatch(control, event) {
    var businessEvents = [];
    var steps = handlers[control + "." + event] || [];
    for (var i = 0; i < steps.length; i++) {
        if (steps[i].business) businessEvents.push(steps[i].business);
        else applyStep(steps[i]);
    }
    return businessEvents;
}

function simulate(businessEvent) {
    var steps = simulations[businessEvent] || [];
    for (var i = 0; i < steps.length; i++) applyStep(steps[i]);
}

function setState(path, value) { state[path] = value; }
function getState(path) { return state[path]; }

// 由状态算出各控件应有的属性。
function view() {
    return {
        "eyeLabel.text": state["layer.visible"] ? "图层：可见" : "图层：隐藏",
        "expandButton.text": state["panel.expanded"] ? "收起详情" : "展开详情",
        "detailPanel.visible": state["panel.expanded"]
    };
}

function dump() { return JSON.stringify(state); }
)JS";

} // namespace vf
