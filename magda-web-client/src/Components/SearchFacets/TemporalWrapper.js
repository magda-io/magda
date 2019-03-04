import React from "react";
import FacetTemporal from "./FacetTemporal";
import FacetHeader from "./FacetHeader";

//Wrapper for the facetHeader and facetTemporal components
export default class TemporalWrapper extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            disableApply: this.props.disableApplyTemporal
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
                    disableApply: true
                };
            },
            () => {
                this.props.onResetFacet();
            }
        );
    };

    UNSAFE_componentWillReceiveProps(nextProps) {
        this.setState({
            disableApply: nextProps.disableApplyTemporal
        });
    }

    /**
     * This is called once the componentWillUnmount is called in the
     * FacetTemporal class.
     */
    toggleDateReset = () => {
        this.setState(prevState => {
            return {
                disableApply: false
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
                {this.props.isOpen && this.props.temporalRange && (
                    <FacetTemporal
                        title={this.props.title}
                        id={this.props.id}
                        hasQuery={this.props.hasQuery}
                        activeDates={this.props.activeDates}
                        onToggleOption={this.props.onToggleOption}
                        onResetFacet={this.resetTemporalFacet}
                        toggleFacet={this.props.toggleFacet}
                        isOpen={this.props.isOpen}
                        temporalRange={this.props.temporalRange}
                        disableApply={this.state.disableApply}
                        toggleDateReset={this.toggleDateReset}
                    />
                )}
            </React.Fragment>
        );
    }
}
