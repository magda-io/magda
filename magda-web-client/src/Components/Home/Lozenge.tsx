import React, { FunctionComponent } from "react";
import CommonLink from "Components/Common/CommonLink";

export type PropsType = {
    url?: string;
    text: string;
};

const Lozenge: FunctionComponent<PropsType> = (props) => {
    if (!props?.url || !props?.text) return null;
    return (
        <div className="homepage-lozenge">
            {/* `CommonLink` supports both site paths & external URLs */}
            <CommonLink to={props.url}>{props.text}</CommonLink>
        </div>
    );
};

export default Lozenge;
