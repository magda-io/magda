import React from "react";
import { Location } from "history";
import SearchPage from "./DatasetsSearchPage";

type Props = {
    location: Location;
};

export default function SearchPageDraftOnly(props: Props & any) {
    const newProps = {
        ...props,
        publishingState: "draft"
    };
    return <SearchPage {...newProps} />;
}
