import React from "react";
import { withRouter } from "react-router-dom";
import SearchBox from "../Search/SearchBox";
import "./SearchBoxHome.css";

const SearchBoxHome = props => {
    return (
        <div className="searchBox-region-home">
            <SearchBox
                location={props.location}
                theme={props.theme ? props.theme : "dark"}
            />
        </div>
    );
};

const SearchBoxHomeWithRouter = withRouter(({ location, theme }) => {
    return <SearchBoxHome location={location} theme={theme} />;
});

export default SearchBoxHomeWithRouter;
