import React from "react";
import CommonLink from "./CommonLink";
import { config } from "../../config";

export default class Breadcrumbs extends React.Component {
    render() {
        return (
            <nav className="au-breadcrumbs" aria-label="breadcrumb">
                <ul className="au-link-list au-link-list--inline">
                    <li>
                        <CommonLink href={config.homePageUrl}>Home</CommonLink>
                    </li>
                    {this.props.breadcrumbs.map((b) => b)}
                </ul>
            </nav>
        );
    }
}
