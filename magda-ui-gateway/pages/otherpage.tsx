import React from "react";
import Link from "next/link";

import getMicroFrontend from "../src/get-micro-frontend";

type Props = {
    html?: string;
    scripts: string;
};

const SOURCE_URL = "http://localhost:3001/?component=header";
// const SOURCE_URL = "https://nationalmap.gov.au";
class Home extends React.Component<Props> {
    static async getInitialProps(ctx: any) {
        try {
            const { html } = await getMicroFrontend(SOURCE_URL);
            return {
                html
            };
        } catch (e) {
            console.error(e);

            return {
                html: "fail"
            };
        }
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
                <div>
                    <button onClick={() => alert("hello")}>hello</button>
                    body 1
                    <Link href="/">
                        <a>Go to other page</a>
                    </Link>
                </div>
                <div
                    ref={this.onRefAdded}
                    dangerouslySetInnerHTML={{
                        __html: this.props.html
                    }}
                />
            </div>
        );
    }
}

export default Home;
