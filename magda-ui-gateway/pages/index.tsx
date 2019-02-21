import React from "react";
import Link from "next/link";

import getMicroFrontend from "../src/get-micro-frontend";

type Props = {
    headerText?: string;
    scripts: string;
};

const SOURCE_URL = "http://localhost:3001/?component=footer";
// const SOURCE_URL = "https://nationalmap.gov.au";
class Home extends React.Component<Props> {
    static async getInitialProps(ctx: any) {
        const { html } = await getMicroFrontend(SOURCE_URL);
        return {
            headerText: html
        };
    }
    onRefAdded = (element: HTMLDivElement) => {
        if (element) {
            const scripts = element.querySelectorAll("script");

            scripts.forEach(script => {
                const newScript = document.createElement("script");
                newScript.innerHTML = script.innerHTML;
                for (var i = script.attributes.length - 1; i >= 0; i--) {
                    newScript.setAttribute(
                        script.attributes[i].name,
                        script.attributes[i].value
                    );
                }

                script.parentNode.replaceChild(newScript, script);
                console.log(`replaced ${newScript.src}`);
            });
        }
    };

    render() {
        return (
            <div>
                <div
                    ref={this.onRefAdded}
                    dangerouslySetInnerHTML={{
                        __html: this.props.headerText
                    }}
                />
                <div>
                    <button onClick={() => alert("hello")}>hello</button>
                    body 2
                    <Link href="/otherpage">
                        <a>Go to other page</a>
                    </Link>
                </div>
            </div>
        );
    }
}

// if (typeof window !== "undefined") {
//     class Component extends HTMLElement {
//         connectedCallback() {
//             // this.attachShadow({ mode: "open" });
//             const html = this.innerHTML;
//             // this.innerHTML = "";
//             // this.shadowRoot.innerHTML = html;
//             // this.innerHTML = html;

//             const scriptsJson = this.attributes["scripts"].nodeValue;
//             console.log(scriptsJson);
//             const scripts = JSON.parse(scriptsJson);
//             scripts.forEach(script => {
//                 const scriptElement = document.createElement("script");
//                 Object.keys(script).forEach(attrKey => {
//                     scriptElement[attrKey] = script[attrKey];
//                 });
//                 // scriptElement.innerHTML = "alert('hello');";
//                 // this.shadowRoot.appendChild(scriptElement);
//                 this.appendChild(scriptElement);
//             });

//             // this.moveSlots();
//             // this.shadowRoot.appendChild(this);
//         }
//         moveSlots() {
//             let slots = this.querySelectorAll("slot");
//             Array.from(slots).forEach(slot => {
//                 // Move the slot's children back to their place in the light DOM.
//                 Array.from(slot.childNodes).forEach(el => {
//                     this.appendChild(el);
//                 });
//             });
//         }
//     }
//     customElements.define("x-heyo", Component);
// }

export default Home;
