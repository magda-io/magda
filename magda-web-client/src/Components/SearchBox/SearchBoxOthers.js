import React from "react";
import { withRouter } from "react-router-dom";
import SearchBox from "../Search/SearchBox";
import "./SearchBoxOthers.css";

const SearchBoxOthers = props => {
    return (
        <div className="searchBox-region-others">
            <SearchBox
                location={props.location}
                theme={props.theme ? props.theme : "dark"}
            />
        </div>
    );
};
const SearchBoxOthersWithRouter = withRouter(({ location, theme }) => {
    return <SearchBoxOthers location={location} theme={theme} />;
});

export default SearchBoxOthersWithRouter;
