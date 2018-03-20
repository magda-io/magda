import React from "react";
import { Medium, Small } from "../../UI/Responsive";
import SearchBox from "../../Components/Search/SearchBox";
import "../../Components/Search/SearchBox.css";

const SearchBoxSwitcher = props => {
    return (
        <div className={"searchBox-switcher " + props.theme}>
            <Small>
                <SearchBox location={props.location} />
            </Small>
            <Medium>
                <SearchBox location={props.location} />
            </Medium>
        </div>
    );
};

export default SearchBoxSwitcher;
