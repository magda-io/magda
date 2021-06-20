import React, { ComponentType } from "react";
import { connect, ConnectedProps } from "react-redux";
import { RouteComponentProps } from "react-router-dom";
import { memoize } from "lodash";
import Header from "Components/Header/Header";
import SearchBoxSwitcher from "Components/Dataset/Search/SearchBoxSwitcher";
import AddDatasetProgressMeter, {
    ExternalProps as AddDatasetProgressMeterProps
} from "Components/Common/AddDatasetProgressMeter";
import { getPluginHeader, HeaderNavItem } from "externalPluginComponents";

import "./withHeader.scss";

type InterfaceOptions = {
    includeSearchBox?: boolean;
    includeDatasetPageProgressMeter?: boolean;
    noContainerClass?: boolean;
};

type PlainObject = {
    [key: string]: any;
};

const HeaderPlugin = getPluginHeader();

const mapStateToProps = (state) => {
    const datasetIsFetching = state?.record?.datasetIsFetching;
    const distributionIsFetching = state?.record?.distributionIsFetching;
    const publishersAreFetching = state?.publisher?.isFetchingPublishers;
    const datasetSearchIsFetching = state?.datasetSearch?.isFetching;
    const publisherIsFetching = state?.publisher?.isFetchingPublisher;
    const headerNavItems = state?.content?.headerNavigation;
    const isFetchingWhoAmI = state?.userManagement?.isFetchingWhoAmI;

    return {
        headerNavItems,
        finishedFetching:
            !isFetchingWhoAmI &&
            !datasetIsFetching &&
            !publishersAreFetching &&
            !datasetSearchIsFetching &&
            !distributionIsFetching &&
            !publisherIsFetching
    };
};

const connector = connect(mapStateToProps);
type PropsFromRedux = ConnectedProps<typeof connector>;

interface Props extends PlainObject, RouteComponentProps<any> {
    finishedFetching?: boolean;
}

type ExtraHeaderProps = {
    headerNavItems: HeaderNavItem[];
};

const withHeader = (
    WrappedComponent: ComponentType<any>,
    {
        includeSearchBox,
        includeDatasetPageProgressMeter,
        noContainerClass
    }: InterfaceOptions = {},
    addDatasetProgressMeterProps: AddDatasetProgressMeterProps = {}
) => {
    type AllProps = ExtraHeaderProps & Props & PropsFromRedux;

    const NewComponent: React.FunctionComponent<AllProps> = (
        allProps: AllProps
    ) => {
        const { headerNavItems, ...props } = allProps;
        return (
            <div className="other-page">
                {HeaderPlugin ? (
                    <HeaderPlugin headerNavItems={allProps.headerNavItems} />
                ) : (
                    <Header />
                )}

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
