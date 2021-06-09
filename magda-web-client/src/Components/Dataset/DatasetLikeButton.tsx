import React from "react";
import { ParsedDataset } from "helpers/record";

type PropsType = {
    dataset: ParsedDataset;
};

const DatasetLikeButton: React.FunctionComponent<PropsType> = (props) => {
    // We output an place holder here only before we have our own statistics function
    // The existence of the component here provides an interface for pluging in external UI components for some clients when deployment
    return null;
};

export default DatasetLikeButton;
