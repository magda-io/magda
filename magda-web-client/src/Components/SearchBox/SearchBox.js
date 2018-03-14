import React from "react";
import { Route, Switch } from "react-router-dom";
import { Medium, Small } from "../../UI/Responsive";
import SearchBoxHome from "./SearchBoxHome";
import SearchBoxHomeMobile from "./SearchBoxHomeMobile";
import SearchBoxOthers from "./SearchBoxOthers";
import SearchBoxOthersMobile from "./SearchBoxOthersMobile";

const SearchBox = props => {
    return (
        <div>
            <Small>
                <Switch>
                    <Route exact path="/" component={SearchBoxHomeMobile} />
                    <Route path="/*" component={SearchBoxOthersMobile} />
                </Switch>
            </Small>
            <Medium>
                <Switch>
                    <Route exact path="/" component={SearchBoxHome} />
                    <Route path="/*" component={SearchBoxOthers} />
                </Switch>
            </Medium>
        </div>
    );
};

export default SearchBox;
