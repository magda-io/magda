import React, { FunctionComponent } from "react";
import { Link } from "react-router-dom";

export type PropsType = {
    url?: string;
    text: string;
};

const Lozenge: FunctionComponent<PropsType> = (props) => {
    if (!props?.url || !props?.text) return null;
    return (
        <div className="homepage-lozenge">
            {<Link to={props.url || "/"}>{props.text}</Link>}
        </div>
    );
};

export default Lozenge;
