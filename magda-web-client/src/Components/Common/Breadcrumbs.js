import React from "react";
import { Link } from "react-router-dom";

export default class Breadcrumbs extends React.Component {
    render() {
        return (
            <nav className="au-breadcrumbs" aria-label="breadcrumb">
                <ul className="au-link-list au-link-list--inline">
                    <li>
                        <Link to="/#">Home</Link>
                    </li>
                    {this.props.breadcrumbs.map((b) => b)}
                </ul>
            </nav>
        );
    }
}
