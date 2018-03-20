import React from "react";
import { Route, Switch } from "react-router-dom";
import { Medium, Small } from "../../UI/Responsive";
import SearchBox from "../../Components/Search/SearchBox";

const SearchBoxSwitcher = props => {
    return (
        <div className={'searchBox-switcher ' + props.theme}>
            <Small><SearchBox location={props.location}/></Small>
            <Medium><SearchBox location={props.location}/></Medium>
        </div>
    );
};

export default SearchBoxSwitcher;
