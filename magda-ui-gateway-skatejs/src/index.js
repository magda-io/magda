import Element, { html } from "@skatejs/element-lit-html";

export default class extends Element {
    static props = {
        name: String
    };
    render() {
        return html`Hey, <strong>${this.name}</strong>!`;
    }
}
