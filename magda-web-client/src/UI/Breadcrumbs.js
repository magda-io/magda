import React from "react";

export default class Breadcrumbs extends React.Component {
    render() {
        return (
            <nav className="au-breadcrumbs" aria-label="breadcrumb">
                <ul className="au-link-list au-link-list--inline">
                    <li>
                        <a href="/#">Home</a>
                    </li>
                    {this.props.breadcrumbs.map(b => b)}
                </ul>
            </nav>
        );
    }
}
