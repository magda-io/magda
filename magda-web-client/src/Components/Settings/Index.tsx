import React, { FunctionComponent } from "react";
import { withRouter } from "react-router-dom";
import { Location } from "history";
import "./main.scss";
import SideNavigation from "./SideNavigation";

type PropsType = {
    location: Location;
};

const Index: FunctionComponent<PropsType> = (props) => {
    return (
        <div className="flex-main-container setting-page-main-container">
            <SideNavigation />
            <div className="main-content-container">
                {props.location.pathname}
            </div>
        </div>
    );
};

export default withRouter(Index);
