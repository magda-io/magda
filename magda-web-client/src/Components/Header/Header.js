import React from "react";
import { Route, Switch } from "react-router-dom";
import { Medium, Small } from "../../UI/Responsive";
import HeaderHome from "./HeaderHome";
import HeaderHomeMobile from "./HeaderHomeMobile";
import HeaderOthers from "./HeaderOthers";
import HeaderOthersMobile from "./HeaderOthersMobile";

const Header = props => {
    return (
        <div>
            <Small>
                <Switch>
                    <Route exact path="/" component={HeaderHomeMobile} />
                    <Route path="/*" component={HeaderOthersMobile} />
                </Switch>
            </Small>
            <Medium>
                <Switch>
                    <Route exact path="/" component={HeaderHome} />
                    <Route path="/*" component={HeaderOthers} />
                </Switch>
            </Medium>
        </div>
    );
};

export default Header;
