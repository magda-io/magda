import React from "react";
import { Medium, Small } from "Components/Common/Responsive";
import SearchBox from "./SearchBox";
import "./SearchBox.scss";

const SearchBoxSwitcher = (props) => {
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
