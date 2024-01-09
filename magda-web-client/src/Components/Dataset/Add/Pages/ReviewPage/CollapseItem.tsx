import React, { useContext, FunctionComponent } from "react";

import CollapseBoxContext from "./CollapseBoxContext";

type PropsType = {
    showWhenCollapse?: boolean;
    alwaysShow?: boolean;
    className?: string;
    children?: React.ReactNode;
};

const CollapseItem: FunctionComponent<PropsType> = (props) => {
    const isOpen = useContext(CollapseBoxContext);
    const alwaysShow =
        typeof props.alwaysShow === "undefined" ? false : props.alwaysShow;
    const showWhenCollapse =
        typeof props.showWhenCollapse === "undefined"
            ? false
            : props.showWhenCollapse;

    if (
        !alwaysShow &&
        ((!isOpen && !showWhenCollapse) || (isOpen && showWhenCollapse))
    ) {
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
