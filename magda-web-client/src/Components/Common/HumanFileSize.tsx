import humanFileSize from "helpers/humanFileSize";
import React from "react";

interface PropsType {
    bytes: number;
    si?: boolean;
}

const HumanFileSize = (props: PropsType) => {
    let humanSize = humanFileSize(props.bytes, props.si);
    return <p>{humanSize}</p>;
};

export default HumanFileSize;
