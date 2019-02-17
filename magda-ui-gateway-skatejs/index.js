require("@skatejs/ssr/register");
const render = require("@skatejs/ssr");

class Hello extends HTMLElement {
    connectedCallback() {
        const shadowRoot = this.attachShadow({ mode: "open" });
        shadowRoot.innerHTML =
            "<span>Hello, <x-yell><slot></slot></x-yell>!</span>";
    }
}
class Yell extends HTMLElement {
    connectedCallback() {
        Promise.resolve().then(() => {
            const shadowRoot = this.attachShadow({ mode: "open" });
            shadowRoot.innerHTML = "<strong><slot></slot></strong>";
        });
    }
}
customElements.define("x-hello", Hello);
customElements.define("x-yell", Yell);

const hello = new Hello();
hello.textContent = "World";

render(hello).then(console.log);
