import React, { useContext, FunctionComponent } from "react";

import CollapseBoxContext from "./CollapseBoxContext";

type PropsType = {
    showWhenCollapse?: boolean;
    className?: string;
};

const CollapseItem: FunctionComponent<PropsType> = props => {
    const isOpen = useContext(CollapseBoxContext);
    const showWhenCollapse =
        typeof props.showWhenCollapse === "undefined" ? false : true;

    if ((!isOpen && !showWhenCollapse) || (isOpen && showWhenCollapse)) {
        return null;
    }
    return (
        <div
            className={`collapse-item ${
                props.className ? props.className : ""
            }`}
        >
            {props.children}
        </div>
    );
};

export default CollapseItem;
