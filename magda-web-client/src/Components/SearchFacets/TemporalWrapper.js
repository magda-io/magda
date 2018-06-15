import React from "react";
import FacetTemporal from "./FacetTemporal";
import FacetHeader from "./FacetHeader";

//Wrapper for the facetHeader and facetTemporal components
export default class TemporalWrapper extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            facetResetClicked: this.props.facetClicked
        };
    }

    /**
     * This is activated when the 'x' is clicked on on the facet header.
     * in the case that temporalWrapper is open, if the FacetHeader 'x' buttton
     * is clicked, it calls the ToggleReset, which calls the closeFacet() method,
     * which in turns applies the selected dates. So we need to see if the 'x' has
     * been clicked in the facetHeader. If it has, then don't applyFilter.
     */
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

    /**
     * This is called once the componentWillUnmount is called in the
     * FacetTemporal class.
     */
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
                {this.props.isOpen &&
                    this.props.temporalRange && (
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
                        />
                    )}
            </React.Fragment>
        );
    }
}
