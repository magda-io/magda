import React, { FunctionComponent, useState, useEffect } from "react";
import {
    Link,
    Route,
    Switch,
    Redirect,
    withRouter,
    RouteComponentProps
} from "react-router-dom";
import Breadcrumbs from "Components/Common/Breadcrumbs";
import defined from "helpers/defined";
import DatasetPageDetails from "./View/DatasetPageDetails";
import DatasetPageSuggestForm from "./View/DatasetPageSuggestForm";
import { Small, Medium } from "Components/Common/Responsive";
import DescriptionBox from "Components/Common/DescriptionBox";
import "./DatasetPage.scss";
import TagsBox from "Components/Common/TagsBox";
import ContactPoint from "Components/Common/ContactPoint";
import QualityIndicator from "Components/Common/QualityIndicator";
import { ParsedDataset } from "helpers/record";
import queryString from "query-string";
import { config } from "config";
import SecClassification, {
    Sensitivity
} from "Components/Common/SecClassification";
import CommonLink from "Components/Common/CommonLink";
import CurrencyAlert from "./CurrencyAlert";
import DatasetEditButton from "./DatasetEditButton";
import DatasetBackToListButton from "./DatasetBackToListButton";
import DatasetLikeButtonOriginal from "../Dataset/DatasetLikeButton";
import {
    getPluginDatasetEditButton,
    getPluginDatasetLikeButton
} from "externalPluginComponents";
import ucwords from "ucwords";
import MagdaNamespacesConsumer from "Components/i18n/MagdaNamespacesConsumer";

const ExternalDatasetEditButton = getPluginDatasetEditButton();
const ExternalDatasetLikeButton = getPluginDatasetLikeButton();

const DatasetLikeButton = ExternalDatasetLikeButton
    ? ExternalDatasetLikeButton
    : DatasetLikeButtonOriginal;

interface PropsType extends RouteComponentProps {
    datasetId: string;
    dataset: ParsedDataset;
    hasEditPermissions: boolean;
    breadcrumbs: (JSX.Element | null)[];
    searchText: string;
    isAdmin: boolean;
}

const DatasetPage: FunctionComponent<PropsType> = (props) => {
    const [addMargin, setAddMargin] = useState<boolean>(false);

    const { dataset, breadcrumbs, hasEditPermissions, isAdmin } = props;

    const baseUrlDataset = `/dataset/${encodeURI(props.datasetId)}`;

    const publisherId = dataset?.publisher?.id ? dataset.publisher.id : null;

    const renderResult = (
        <MagdaNamespacesConsumer ns={["global"]}>
            {(translate) => {
                const appName = translate(["appName", ""]);
                return (
                    <div
                        itemScope
                        itemType="http://schema.org/Dataset"
                        className="record--dataset"
                    >
                        <Medium>
                            <Breadcrumbs breadcrumbs={breadcrumbs} />
                        </Medium>
                        {dataset.publishingState === "draft" ? (
                            <div className="au-page-alerts au-page-alerts--info">
                                <h3>Draft Dataset</h3>
                                <p>
                                    This dataset is a draft and has not been
                                    published yet. Once the dataset is approved,
                                    it will appear in your catalogue.
                                </p>
                            </div>
                        ) : null}

                        <CurrencyAlert dataset={dataset} />

                        <div className="row">
                            <div className="col-sm-8">
                                <h1 itemProp="name">{dataset?.title}</h1>
                                <div className="publisher-basic-info-row">
                                    <span
                                        itemProp="publisher"
                                        className="publisher"
                                        itemScope
                                        itemType="http://schema.org/Organization"
                                    >
                                        <Link
                                            to={`/organisations/${publisherId}`}
                                            itemProp="url"
                                        >
                                            <span itemProp="name">
                                                {dataset?.publisher?.name}
                                            </span>
                                        </Link>
                                    </span>

                                    {defined(dataset.issuedDate) && (
                                        <span className="created-date hidden-sm">
                                            <span className="separator hidden-sm">
                                                {" "}
                                                /{" "}
                                            </span>
                                            Created{" "}
                                            <span itemProp="dateCreated">
                                                {dataset.issuedDate}
                                            </span>
                                            &nbsp;
                                        </span>
                                    )}

                                    {defined(dataset.updatedDate) && (
                                        <span className="updated-date hidden-sm">
                                            <span className="separator hidden-sm">
                                                &nbsp;/&nbsp;
                                            </span>
                                            Updated{" "}
                                            <span itemProp="dateModified">
                                                {dataset.updatedDate}
                                            </span>
                                        </span>
                                    )}
                                    <div className="dataset-details-overview">
                                        <Small>
                                            <DescriptionBox
                                                content={dataset.description}
                                                truncateLength={200}
                                            />
                                        </Small>
                                        <Medium>
                                            <DescriptionBox
                                                content={dataset.description}
                                                truncateLength={500}
                                            />
                                        </Medium>
                                    </div>

                                    {!dataset?.distributions?.length &&
                                    dataset?.defaultLicense ? (
                                        <div className="dataset-license-box">
                                            <div className="description-heading">
                                                Licence:
                                            </div>
                                            <div>{dataset.defaultLicense}</div>
                                        </div>
                                    ) : null}

                                    {dataset.hasQuality ? (
                                        <div className="quality-rating-box">
                                            <QualityIndicator
                                                quality={
                                                    dataset.linkedDataRating
                                                }
                                            />
                                        </div>
                                    ) : null}
                                    {dataset.informationSecurity
                                        ?.classification && (
                                        <SecClassification
                                            secClass={
                                                dataset.informationSecurity
                                                    .classification
                                            }
                                        />
                                    )}
                                    {dataset.informationSecurity
                                        ?.disseminationLimits && (
                                        <Sensitivity
                                            sensitivityList={
                                                dataset.informationSecurity
                                                    .disseminationLimits
                                            }
                                        />
                                    )}

                                    {dataset.accrualPeriodicity ? (
                                        <div>
                                            <div
                                                className={
                                                    "description-heading"
                                                }
                                            >
                                                Updated:
                                            </div>
                                            {ucwords(
                                                dataset.accrualPeriodicity
                                            )}
                                        </div>
                                    ) : null}

                                    <TagsBox
                                        content={dataset.tags}
                                        title="Tags"
                                    />
                                    <TagsBox
                                        content={dataset.themes}
                                        title="Themes"
                                    />
                                    <ContactPoint
                                        contactPoint={dataset.contactPoint}
                                        landingPage={dataset.landingPage}
                                        source={dataset.source}
                                        sourceDetails={dataset.sourceDetails}
                                    />
                                    {defined(dataset.access?.location) && (
                                        <div>
                                            <div className="dataset-heading">
                                                File Location (outside {appName}
                                                ):
                                            </div>
                                            <div>{dataset.access.location}</div>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div
                                className={` col-sm-4 datatset-details-page-function-area ${
                                    addMargin ? "form-margin" : ""
                                }`}
                            >
                                <DatasetPageSuggestForm
                                    title={dataset.title}
                                    toggleMargin={setAddMargin}
                                    datasetId={dataset.identifier}
                                    contactPoint={dataset.contactPoint}
                                />
                                {isAdmin ? (
                                    <div className="download-history-report-button-form">
                                        <form
                                            method="post"
                                            target="__blank"
                                            action={`${
                                                config.openfaasBaseUrl
                                            }function/magda-function-history-report?recordId=${encodeURIComponent(
                                                dataset.identifier!
                                            )}`}
                                        >
                                            <input
                                                type="submit"
                                                className="au-btn au-btn--secondary download-history-report-button"
                                                value="Download History Report"
                                            />
                                        </form>
                                    </div>
                                ) : null}

                                {ExternalDatasetEditButton ? (
                                    <ExternalDatasetEditButton
                                        dataset={dataset}
                                    />
                                ) : (
                                    <DatasetEditButton
                                        dataset={dataset}
                                        hasEditPermissions={hasEditPermissions}
                                    />
                                )}

                                <DatasetBackToListButton
                                    dataset={dataset}
                                    hasEditPermissions={hasEditPermissions}
                                />

                                {config?.featureFlags?.datasetLikeButton ? (
                                    <DatasetLikeButton dataset={dataset} />
                                ) : null}
                            </div>
                        </div>
                        <div className="tab-content">
                            <Switch>
                                <Route
                                    path="/dataset/:datasetId/details"
                                    component={DatasetPageDetails}
                                />
                                <Redirect
                                    exact
                                    from="/dataset/:datasetId"
                                    to={{
                                        pathname: `${baseUrlDataset}/details`,
                                        search: `?q=${props.searchText}`
                                    }}
                                />
                                <Redirect
                                    exact
                                    from="/dataset/:datasetId/resource/*"
                                    to={{
                                        pathname: `${baseUrlDataset}/details`,
                                        search: `?q=${props.searchText}`
                                    }}
                                />
                            </Switch>
                        </div>
                    </div>
                );
            }}
        </MagdaNamespacesConsumer>
    );

    useEffect(() => {
        const params = queryString.parse(props.history.location.search);
        if (params.print === "true") {
            window.print();
        }
    }, [props.history.location.search]);

    return renderResult;
};

export default withRouter(DatasetPage as any) as any;
