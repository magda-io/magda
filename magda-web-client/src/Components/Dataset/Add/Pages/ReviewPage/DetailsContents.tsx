import React, { FunctionComponent } from "react";

import { State, SpatialCoverage } from "../../DatasetAddCommon";

import CollapseBox from "./CollapseBox";
import CollapseItem from "./CollapseItem";

import * as codelists from "constants/DatasetConstants";
import moment from "moment";
import DescriptionBox from "Components/Common/DescriptionBox";
import ValidationRequiredLabel from "../../ValidationRequiredLabel";
import { shouldValidate } from "../../ValidationManager";
import { RRule } from "rrule";
import { useAsync } from "react-async-hook";
import { getRegions } from "api-clients/SearchApis";

import "./DetailsContents.scss";

type PropsType = {
    stateData: State;
};

function useGetSpatialData(spatialCoverage: SpatialCoverage) {
    return useAsync(async () => {
        if (
            spatialCoverage?.spatialDataInputMethod === "bbox" &&
            spatialCoverage?.bbox?.length
        ) {
            return (
                <>
                    <div key={"bbox0"} className="row">
                        <div className="col-sm-6">
                            West Bounding Longitude:{" "}
                        </div>
                        <div className="col-sm-6">
                            {spatialCoverage?.bbox?.[0]
                                ? spatialCoverage.bbox[0]
                                : codelists.NO_VALUE_LABEL}
                        </div>
                    </div>
                    <div key={"bbox1"} className="row">
                        <div className="col-sm-6 field-name">
                            South Bounding Latitude:{" "}
                        </div>
                        <div className="col-sm-6">
                            {spatialCoverage?.bbox?.[0]
                                ? spatialCoverage.bbox[1]
                                : codelists.NO_VALUE_LABEL}
                        </div>
                    </div>
                    <div key={"bbox2"} className="row">
                        <div className="col-sm-6 field-name">
                            East Bounding Longitude:
                        </div>
                        <div className="col-sm-6">
                            {spatialCoverage?.bbox?.[0]
                                ? spatialCoverage.bbox[2]
                                : codelists.NO_VALUE_LABEL}
                        </div>
                    </div>
                    <div key={"bbox3"} className="row">
                        <div className="col-sm-6 field-name">
                            North Bounding Latitude:{" "}
                        </div>
                        <div className="col-sm-6">
                            {spatialCoverage?.bbox?.[0]
                                ? spatialCoverage.bbox[3]
                                : codelists.NO_VALUE_LABEL}
                        </div>
                    </div>
                </>
            );
        } else {
            const regionNames = await Promise.all(
                [
                    spatialCoverage?.lv1Id,
                    spatialCoverage?.lv2Id,
                    spatialCoverage?.lv3Id,
                    spatialCoverage?.lv4Id
                ].map(async (item, idx) => {
                    if (!item) {
                        return item;
                    }

                    let regionType;
                    switch (idx) {
                        case 0:
                            regionType = "COUNTRY";
                            break;
                        case 1:
                            regionType = "STE";
                            break;
                        case 2:
                            regionType = "SA4";
                            break;
                        case 3:
                            regionType = "SA3";
                            break;
                    }

                    try {
                        const regions = await getRegions({
                            type: regionType,
                            regionId: item
                        });
                        if (regions?.[0]?.regionName) {
                            return regions[0].regionName;
                        } else {
                            throw new Error(
                                `Cannot locate region ${regionType} Id: ${item}`
                            );
                        }
                    } catch (e) {
                        console.error(e);
                        return "Unavailable region name";
                    }
                })
            );

            return (
                <>
                    <div key={"country"} className="row">
                        <div className="col-sm-6 field-name">Country: </div>
                        <div className="col-sm-6">
                            {regionNames?.[0]
                                ? regionNames[0]
                                : codelists.NO_VALUE_LABEL}
                        </div>
                    </div>
                    <div key={"state"} className="row">
                        <div className="col-sm-6 field-name">State: </div>
                        <div className="col-sm-6">
                            {regionNames?.[1]
                                ? regionNames[1]
                                : codelists.NO_VALUE_LABEL}
                        </div>
                    </div>
                    <div key={"region"} className="row">
                        <div className="col-sm-6 field-name">
                            Region(ABS SA4):
                        </div>
                        <div className="col-sm-6">
                            {regionNames?.[2]
                                ? regionNames[2]
                                : codelists.NO_VALUE_LABEL}
                        </div>
                    </div>
                    <div key={"area"} className="row">
                        <div className="col-sm-6 field-name">
                            Area(ABS SA3):{" "}
                        </div>
                        <div className="col-sm-6">
                            {regionNames?.[3]
                                ? regionNames[3]
                                : codelists.NO_VALUE_LABEL}
                        </div>
                    </div>
                </>
            );
        }
    }, [
        spatialCoverage.lv1Id,
        spatialCoverage.lv2Id,
        spatialCoverage.lv3Id,
        spatialCoverage.lv4Id,
        spatialCoverage.lv5Id
    ]);
}

const DetailsContents: FunctionComponent<PropsType> = props => {
    const {
        dataset,
        currency,
        temporalCoverage,
        spatialCoverage
    } = props.stateData;

    const {
        loading: spatialDataLoading,
        error: spatialDataError,
        result: spatialDataResult
    } = useGetSpatialData(spatialCoverage);

    return (
        <CollapseBox
            heading="Details and contents"
            stepNum={1}
            className="dataset-details-and-contents"
        >
            <CollapseItem
                className="row"
                alwaysShow={shouldValidate("$.dataset.title")}
            >
                <div className="col-sm-3">
                    <div className="title-box single-line">
                        Dataset title
                        <ValidationRequiredLabel validationFieldPath="$.dataset.title" />
                        :
                    </div>
                </div>
                <div className="col-sm-9 content-box single-line">
                    {dataset?.title ? dataset.title : codelists.NO_VALUE_LABEL}
                </div>
            </CollapseItem>

            <CollapseItem
                className="row"
                alwaysShow={shouldValidate("$.dataset.languages")}
            >
                <div className="col-sm-3">
                    <div className="title-box single-line">
                        Dataset language
                        <ValidationRequiredLabel validationFieldPath="$.dataset.languages" />
                        :
                    </div>
                </div>
                <div className="col-sm-9 content-box single-line">
                    {dataset?.languages
                        ? dataset.languages
                              .map(item => codelists.languages[item])
                              .join("; ")
                        : codelists.NO_VALUE_LABEL}
                </div>
            </CollapseItem>

            <CollapseItem
                className="row"
                alwaysShow={shouldValidate("$.dataset.keywords")}
            >
                <div className="col-sm-3">
                    <div className="title-box single-line">
                        Dataset keywords
                        <ValidationRequiredLabel validationFieldPath="$.dataset.keywords" />
                        :
                    </div>
                </div>
                <div className="col-sm-9 content-box single-line">
                    {dataset?.keywords?.keywords
                        ? dataset.keywords.keywords.join(", ")
                        : codelists.NO_VALUE_LABEL}
                </div>
            </CollapseItem>

            <CollapseItem
                className="row"
                alwaysShow={shouldValidate("$.dataset.themes")}
            >
                <div className="col-sm-3">
                    <div className="title-box single-line">
                        Dataset themes
                        <ValidationRequiredLabel validationFieldPath="$.dataset.themes" />
                        :
                    </div>
                </div>
                <div className="col-sm-9 content-box single-line">
                    {dataset?.themes?.keywords
                        ? dataset.themes.keywords.join(", ")
                        : codelists.NO_VALUE_LABEL}
                </div>
            </CollapseItem>

            <CollapseItem
                className="row"
                alwaysShow={shouldValidate("$.dataset.description")}
            >
                <div className="col-sm-3">
                    <div className="title-box">
                        Dataset description
                        <ValidationRequiredLabel validationFieldPath="$.dataset.description" />
                        :
                    </div>
                </div>
                <DescriptionBox
                    className="col-sm-9 content-box description-content-box"
                    isAutoTruncate={false}
                    content={
                        dataset?.description
                            ? dataset.description
                            : codelists.NO_VALUE_LABEL
                    }
                />
            </CollapseItem>

            <CollapseItem
                className="row"
                alwaysShow={shouldValidate("$.currency.status")}
            >
                <div className="col-sm-3">
                    <div className="title-box single-line">
                        Dataset Status
                        <ValidationRequiredLabel validationFieldPath="$.currency.status" />
                        :
                    </div>
                </div>
                <div className="col-sm-9 content-box single-line">
                    {currency?.status
                        ? currency.status
                        : codelists.NO_VALUE_LABEL}
                </div>
            </CollapseItem>

            {currency?.status === "RETIRED" ? (
                <CollapseItem
                    className="row"
                    alwaysShow={shouldValidate("$.currency.retireReason")}
                >
                    <div className="col-sm-3">
                        <div className="title-box">
                            Why was this dataset retired
                            <ValidationRequiredLabel validationFieldPath="$.currency.retireReason" />
                            ?
                        </div>
                    </div>
                    <DescriptionBox
                        className="col-sm-9 content-box"
                        isAutoTruncate={false}
                        content={
                            currency?.retireReason
                                ? currency.retireReason
                                : codelists.NO_VALUE_LABEL
                        }
                    />
                </CollapseItem>
            ) : null}

            {currency?.status === "SUPERSEDED" ? (
                <CollapseItem
                    className="row"
                    alwaysShow={shouldValidate("$.currency.supersededBy")}
                >
                    <div className="col-sm-3">
                        <div className="title-box">
                            What dataset(s) has it been superseded by
                            <ValidationRequiredLabel validationFieldPath="$.currency.supersededBy" />
                            ?
                        </div>
                    </div>
                    <DescriptionBox
                        className="col-sm-9 content-box"
                        isAutoTruncate={false}
                        content={
                            currency?.supersededBy?.length
                                ? currency.supersededBy
                                      .map(item =>
                                          item?.name
                                              ? `- ${item.name}`
                                              : "- Unknown Name Dataset"
                                      )
                                      .join("\n")
                                : codelists.NO_VALUE_LABEL
                        }
                    />
                </CollapseItem>
            ) : null}

            <CollapseItem
                className="row"
                alwaysShow={shouldValidate("$.dataset.issued")}
            >
                <div className="col-sm-3">
                    <div className="title-box single-line">
                        Dataset created
                        <ValidationRequiredLabel validationFieldPath="$.dataset.issued" />
                        :
                    </div>
                </div>
                <div className="col-sm-9 content-box single-line">
                    {dataset?.issued
                        ? moment(dataset.issued).format("DD/MM/YYYY")
                        : codelists.NO_VALUE_LABEL}
                </div>
            </CollapseItem>

            <CollapseItem
                className="row"
                alwaysShow={shouldValidate("$.dataset.modified")}
            >
                <div className="col-sm-3">
                    <div className="title-box single-line">
                        Dataset Last Modified
                        <ValidationRequiredLabel validationFieldPath="$.dataset.modified" />
                        :
                    </div>
                </div>
                <div className="col-sm-9 content-box single-line">
                    {dataset?.modified
                        ? moment(dataset.modified).format("DD/MM/YYYY")
                        : codelists.NO_VALUE_LABEL}
                </div>
            </CollapseItem>

            <CollapseItem
                className="row"
                alwaysShow={shouldValidate("$.dataset.accrualPeriodicity")}
            >
                <div className="col-sm-3">
                    <div className="title-box">
                        Update frequency
                        <ValidationRequiredLabel validationFieldPath="$.dataset.accrualPeriodicity" />
                        :
                    </div>
                </div>
                <div className="col-sm-9 content-box single-line">
                    {dataset?.accrualPeriodicity === "custom"
                        ? dataset?.accrualPeriodicityRecurrenceRule
                            ? RRule.fromString(
                                  dataset?.accrualPeriodicityRecurrenceRule
                              ).toText()
                            : codelists.NO_VALUE_LABEL
                        : dataset?.accrualPeriodicity
                        ? dataset.accrualPeriodicity
                        : codelists.NO_VALUE_LABEL}
                </div>
            </CollapseItem>

            <CollapseItem
                className="row"
                alwaysShow={shouldValidate(
                    "$.temporalCoverage.intervals[0].start"
                )}
            >
                <div className="col-sm-3">
                    <div className="title-box single-line">
                        Temporal coverage
                        <ValidationRequiredLabel validationFieldPath="$.temporalCoverage.intervals[0].start" />
                        :
                    </div>
                </div>
                <DescriptionBox
                    className="col-sm-9 content-box"
                    isAutoTruncate={false}
                    content={
                        temporalCoverage?.intervals?.length
                            ? temporalCoverage.intervals
                                  .map(
                                      item =>
                                          `- *Start*: &nbsp;${
                                              item?.start
                                                  ? moment(item.start).format(
                                                        "DD/MM/YYYY"
                                                    )
                                                  : codelists.NO_VALUE_LABEL
                                          } &nbsp;&nbsp;*End*: &nbsp;${
                                              item?.start
                                                  ? moment(item.end).format(
                                                        "DD/MM/YYYY"
                                                    )
                                                  : codelists.NO_VALUE_LABEL
                                          }`
                                  )
                                  .join("\n")
                            : codelists.NO_VALUE_LABEL
                    }
                />
            </CollapseItem>

            <CollapseItem
                className="row spatial-data"
                alwaysShow={shouldValidate(
                    "$.spatialCoverage.spatialDataInputMethod"
                )}
            >
                <div className="col-sm-3">
                    <div className="title-box">
                        Spatial Coverage
                        <ValidationRequiredLabel validationFieldPath="$.spatialCoverage.spatialDataInputMethod" />
                        :
                    </div>
                </div>
                <div className="col-sm-9 content-box">
                    {spatialDataLoading
                        ? "Loading..."
                        : spatialDataError
                        ? spatialDataError.message
                        : spatialDataResult}
                </div>
            </CollapseItem>
        </CollapseBox>
    );
};

export default DetailsContents;
