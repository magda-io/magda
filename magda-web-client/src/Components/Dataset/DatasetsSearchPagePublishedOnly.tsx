import React from "react";
import { Location } from "history";
import SearchPage from "./DatasetsSearchPage";

type Props = {
    location: Location;
};

export default function SearchPagePublishedOnly(props: Props) {
    const newProps = {
        ...props,
        publishingState: "published"
    };
    return <SearchPage {...newProps} />;
}
