import React from "react";
import FacetTemporal from "./FacetTemporal";
import FacetHeader from "./FacetHeader";

interface Props {
    title: string;
    id: string;
    hasQuery: boolean;
    activeDates: [Date?, Date?];
    onToggleOption: () => void;
    onResetFacet: () => void;
    toggleFacet: () => void;
    isOpen: boolean;
    temporalRange?: [Date, Date];
    disableApply: boolean;
}

//Wrapper for the facetHeader and facetTemporal components
export function TemporalWrapper(props: Props) {
    const [startDate, endDate] = props.activeDates;

    const startYear = startDate && startDate.getFullYear();
    const startMonth = startDate && startDate.getMonth();
    const endYear = endDate && endDate.getFullYear();
    const endMonth = endDate && endDate.getMonth();

    return (
        <React.Fragment>
            <FacetHeader
                onResetFacet={props.onResetFacet}
                title={props.title}
                id={props.id}
                activeOptions={props.activeDates}
                hasQuery={props.hasQuery}
                onClick={props.toggleFacet}
                isOpen={props.isOpen}
            />
            {props.isOpen && (
                <FacetTemporal
                    {...{ startYear, startMonth, endYear, endMonth }}
                    onApply={}
                />
            )}
        </React.Fragment>
    );
}
