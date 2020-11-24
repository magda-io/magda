import React, { FunctionComponent } from "react";
import { Link } from "react-router-dom";
import { Location } from "history";
import urijs from "urijs";
import { config, isBackendSameOrigin } from "config";
import removePathPrefix from "helpers/removePathPrefix";

const { uiBaseUrl, baseUrl, baseExternalUrl } = config;

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
 * If it's an internal url, it should NOT include any possible prefix path.
 * e.g. if Magda is served at `/magda/` and url is `/magda/api/v0/registry`, this component expects `/api/v0/registry` as input url.
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
        urlStrLowerCase.indexOf("mailto:") === 0
    ) {
        return <a href={urlStr} {...restProps} />;
    } else if (
        // before modify the code of this branch, be sure you've tested the following scenarios:
        // - gateway / backend apis amounted at non-root path (via [global.externalUrl](https://github.com/magda-io/magda/blob/master/deploy/helm/magda-core/README.md))
        // - ui is mounted at non-root path (via web-server.uiBaseUrl)
        // - UI only in cluster deployment
        // - UI only local test server
        urlStrLowerCase.match(/^(\/[^\/]*)*?\/(api|auth)\//)
    ) {
        // normalise url to format with no prefix path
        const urlWithNoPrefix = removePathPrefix(urlStr, uiBaseUrl);
        // for path `/api/*` or `/auth/*` we need to handle it differently when gateway is accessilbe at different baseUrl
        if (
            isBackendSameOrigin &&
            urijs(uiBaseUrl).segment().join("/") ===
                urijs(baseUrl).segment().join("/")
        ) {
            return <Link to={urlWithNoPrefix} {...restProps} />;
        } else {
            // as we might used `base` tag in html, we need to use absolute url here
            const targetUri = isBackendSameOrigin
                ? urijs(baseExternalUrl)
                : urijs(baseUrl);

            const inputUri = urijs(urlWithNoPrefix);

            const url = targetUri
                .segment(targetUri.segment().concat(inputUri.segment()))
                .search(inputUri.search())
                .hash(inputUri.hash())
                .toString();

            return <a href={url} {...restProps} />;
        }
    } else {
        return <Link to={urlStr} {...restProps} />;
    }
};

export default CommonLink;
