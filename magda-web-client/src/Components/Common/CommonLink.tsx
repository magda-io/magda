import React, { FunctionComponent } from "react";
import { Link } from "react-router-dom";

type PropsType = {
    href: string;
    [key: string]: any;
};

const CommonLink: FunctionComponent<PropsType> = (props) => {
    if (typeof props.href !== "string") {
        throw new Error("href prop must be a string");
    }
    const { href, ...restProps } = props;
    const url = href.trim();
    if (url.indexOf("http") === 0) {
        return <a {...props} />;
    } else {
        const fullProps = {
            ...restProps,
            to: url
        };
        return <Link {...fullProps} />;
    }
};

export default CommonLink;
