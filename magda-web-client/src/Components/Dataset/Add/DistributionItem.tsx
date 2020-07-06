import React, { FunctionComponent } from "react";
import { Distribution, DistributionSource } from "./DatasetAddCommon";
import DatasetFile from "Components/Dataset/Add/DatasetFile";
import DatasetLinkItem from "Components/Dataset/Add/DatasetLinkItem";

type PropsType = {
    distribution: Distribution;
    idx?: number;
    className?: string;
    onDelete?: () => any;
    onChange?: (updater: (file: Distribution) => Distribution) => void;
};

const DistributionItem: FunctionComponent<PropsType> = (props) => {
    if (!props.distribution) {
        // --- props.distribution could be `undefined` due to some edge cases (seems related to render orders of parent component & child componet) of updating array in state
        // --- it will be safer to render empty element here.
        return null;
    }
    if (props.distribution.creationSource === DistributionSource.File) {
        return <DatasetFile {...props} />;
    } else {
        return <DatasetLinkItem {...props} />;
    }
};

export default DistributionItem;
