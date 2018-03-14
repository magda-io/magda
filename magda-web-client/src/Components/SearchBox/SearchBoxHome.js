import React from "react";
import { withRouter } from "react-router-dom";
import SearchBox from "../Search/SearchBox";

const SearchBoxHome = props => {
    return (
        <SearchBox
            location={props.location}
            theme={props.theme ? props.theme : "light"}
        />
    );
};

const SearchBoxHomeWithRouter = withRouter(({ location, theme }) => {
    return <SearchBoxHome location={location} theme={theme} />;
});

export default SearchBoxHomeWithRouter;
