import React from "react";
import { Medium, Small } from "../../UI/Responsive";
import SearchBox from "../../Components/Search/SearchBox";
import "../../Components/Search/SearchBox.css";

const SearchBoxSwitcher = props => {
    return (
        <div className={"searchBox-switcher " + props.theme}>
            <Small>
                <div className="container container-mobile">
                    <SearchBox location={props.location} isMobile={true} />
                </div>
            </Small>
            <Medium>
                <SearchBox location={props.location} isMobile={false} />
            </Medium>
        </div>
    );
};

export default SearchBoxSwitcher;
