import React from "react";
import { Medium, Small } from "../../UI/Responsive";
import SearchBox from "../../Components/Search/SearchBox";
import "../../Components/Search/SearchBox.css";

const SearchBoxSwitcher = props => {
    return (
        <div className={"searchBox-switcher " + props.theme}>
            <Small>
                <div className="container-mobile">
                    <SearchBox
                        location={props.location}
                        isMobile={true}
                        isHome={props.theme === "home"}
                    />
                </div>
            </Small>
            <Medium>
                <SearchBox
                    location={props.location}
                    isMobile={false}
                    isHome={props.theme === "home"}
                />
            </Medium>
        </div>
    );
};

export default SearchBoxSwitcher;
