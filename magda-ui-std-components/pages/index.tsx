import React from "react";
import dynamic from "next/dynamic";
import { NextContext } from "next";

const HeaderSSR = dynamic(() => import("../src/header"), {
    ssr: true
});
const HeaderNoSSR = dynamic(() => import("../src/header"), {
    ssr: false
});
const FooterSSR = dynamic(() => import("../src/footer"), {
    ssr: true
});
const FooterNoSSR = dynamic(() => import("../src/footer"), {
    ssr: false
});

type Props = {
    component: string;
    render: boolean;
};

class Home extends React.Component<Props> {
    static async getInitialProps(ctx: NextContext) {
        return {
            component: ctx.query.component,
            render: ctx.query.render === "true" ? true : false
        };
    }

    render() {
        if (this.props.component === "header") {
            // const Header = header(this.props.render);
            return this.props.render ? <HeaderSSR /> : <HeaderNoSSR />;
        }
        if (this.props.component === "footer") {
            return this.props.render ? <FooterSSR /> : <FooterNoSSR />;
        }
    }
}

export default Home;
