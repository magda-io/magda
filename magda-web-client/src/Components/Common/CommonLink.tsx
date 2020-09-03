import React, { FunctionComponent } from "react";
import { Link } from "react-router-dom";
import { Location } from "history";

type PropsType = {
    href?: string;
    to?:
        | string
        | {
              pathname: string;
              search: string;
              hash: string;
              state: {
                  [key: string]: any;
              };
          }
        | ((location: Location) => Location);
    [key: string]: any;
};

/**
 * A component can be used as a safer replacement where <a> or <Link> is used.
 * It will render a <a> or <Link> depends on url type or whether it's a internal url (e.g. `/xxx`)
 * @param props
 */
const CommonLink: FunctionComponent<PropsType> = (props) => {
    const { href, to, ...restProps } = props;
    const urlPropVal = to ? to : href;

    if (!urlPropVal) {
        return <a {...props} />;
    }

    if (typeof urlPropVal !== "string") {
        return <Link to={urlPropVal} {...restProps} />;
    }

    const urlStr = urlPropVal.trim();
    const urlStrLowerCase = urlStr.toLowerCase();

    if (
        urlStrLowerCase.indexOf("http") === 0 ||
        urlStrLowerCase.indexOf("mailto:") === 0 ||
        // magda api should always be requested from `/`
        urlStrLowerCase.indexOf("/api/") === 0 ||
        // auth endpoints should be requested from `/` as well
        urlStrLowerCase.indexOf("/auth/") === 0
    ) {
        return <a href={urlStr} {...restProps} />;
    } else {
        return <Link to={urlStr} {...restProps} />;
    }
};

export default CommonLink;
