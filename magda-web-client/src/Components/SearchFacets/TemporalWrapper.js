import React from "react";
import FacetTemporal from "./FacetTemporal";
import FacetHeader from "./FacetHeader";

export default class TemporalWrapper extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            facetResetClicked: this.props.facetClicked
        };
    }

    resetTemporalFacet = () => {
        this.setState(
            () => {
                return {
                    facetResetClicked: true
                };
            },
            () => {
                this.props.onResetFacet();
            }
        );
    };
    componentWillReceiveProps(nextProps) {
        this.setState(() => {
            return {
                facetResetClicked: nextProps.facetClicked
            };
        });
    }

    toggleDateReset = () => {
        this.setState(prevState => {
            return {
                facetResetClicked: false
            };
        });
    };

    render() {
        return (
            <React.Fragment>
                <FacetHeader
                    onResetFacet={this.resetTemporalFacet}
                    title={this.props.title}
                    id={this.props.id}
                    activeOptions={this.props.activeDates}
                    hasQuery={this.props.hasQuery}
                    onClick={this.props.toggleFacet}
                    isOpen={this.props.isOpen}
                />
                {this.props.isOpen && this.props.temporalRange ? (
                    <FacetTemporal
                        title={this.props.title}
                        id={this.props.id}
                        hasQuery={this.props.hasQuery}
                        activeDates={this.props.activeDates}
                        onToggleOption={this.props.onToggleOption}
                        onResetFacet={this.props.onResetFacet}
                        toggleFacet={this.props.toggleFacet}
                        isOpen={this.props.isOpen}
                        temporalRange={this.props.temporalRange}
                        facetReset={this.state.facetResetClicked}
                        toggleDateReset={this.toggleDateReset}
                        // startYear={undefined}
                        // endYear={undefined}
                    />
                ) : null}
            </React.Fragment>
        );
    }
}
