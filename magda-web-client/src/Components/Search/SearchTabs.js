import "./SearchTabs.css";
import React from "react";

function SearchTabs(props) {
    return (
        <ul className="search-tabs nav col-sm-8 col-sm-offset-4">
            <li role="presentation" className="active">
                <a href="#all">All</a>
            </li>
            <li role="presentation">
                <a href="#data">Data</a>
            </li>
            <li role="presentation">
                <a href="#organisations">Organisations</a>
            </li>
        </ul>
    );
}

export default SearchTabs;
