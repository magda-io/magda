const inquirer = require("inquirer");
const isArray = require("lodash/isArray");

const ui = new inquirer.ui.BottomBar();
let timer = null;
let content = null;
let idx = 0;

function show(strOrArray) {
    content = strOrArray;
    idx = 0;
    if (timer) return;
    timer = setInterval(printContent, 300);
}

function stop() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
}

function printContent() {
    if (isArray(content)) {
        ui.updateBottomBar("\n\n" + String(content[idx++ % content.length]));
    } else {
        ui.updateBottomBar("\n\n" + String(content));
    }
}

module.exports = {
    show,
    stop
};
