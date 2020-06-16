import React, { ComponentType } from "react";
import { connect, ConnectedProps } from "react-redux";
import { memoize } from "lodash";
import { Location } from "history";
import Header from "Components/Header/Header";
import SearchBoxSwitcher from "Components/Dataset/Search/SearchBoxSwitcher";
import AddDatasetProgressMeter, {
    ExternalProps as AddDatasetProgressMeterProps
} from "Components/Common/AddDatasetProgressMeter";

import "./withHeader.scss";

type InterfaceOptions = {
    includeSearchBox?: boolean;
    includeDatasetPageProgressMeter?: boolean;
    noContainerClass?: boolean;
};

const mapStateToProps = (state) => {
    const datasetIsFetching = state.record.datasetIsFetching;
    const distributionIsFetching = state.record.distributionIsFetching;
    const publishersAreFetching = state.publisher.isFetchingPublishers;
    const datasetSearchIsFetching = state.datasetSearch.isFetching;
    const publisherIsFetching = state.publisher.isFetchingPublisher;

    return {
        finishedFetching:
            !datasetIsFetching &&
            !publishersAreFetching &&
            !datasetSearchIsFetching &&
            !distributionIsFetching &&
            !publisherIsFetching
    };
};

const connector = connect(mapStateToProps);
type PropsFromRedux = ConnectedProps<typeof connector>;

type Props = {
    finishedFetching?: boolean;
    location?: Location;
};

const withHeader = <P extends {}>(
    WrappedComponent: ComponentType<P & Props>,
    {
        includeSearchBox,
        includeDatasetPageProgressMeter,
        noContainerClass
    }: InterfaceOptions = {},
    addDatasetProgressMeterProps: AddDatasetProgressMeterProps = {}
) => {
    type AllProps = P & Props & PropsFromRedux;

    const NewComponent: React.FunctionComponent<AllProps> = (
        props: AllProps
    ) => {
        return (
            <div className="other-page">
                <Header />

                {includeSearchBox && (
                    <SearchBoxSwitcher
                        location={props.location}
                        theme="none-home"
                    />
                )}

                {includeDatasetPageProgressMeter && (
                    <AddDatasetProgressMeter
                        {...addDatasetProgressMeterProps}
                    />
                )}

                <div
                    className={`${
                        noContainerClass ? "" : "container"
                    } app-container ${
                        props.finishedFetching ? "loaded" : "loading"
                    }`}
                    id="content"
                >
                    <WrappedComponent {...props} />
                </div>
            </div>
        );
    };

    return connector(
        //@ts-ignore
        NewComponent
    );
};

export default memoize(withHeader);
