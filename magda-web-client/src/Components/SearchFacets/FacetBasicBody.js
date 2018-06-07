import React, { Component } from "react";
import find from "lodash.find";
import maxBy from "lodash.maxby";
import defined from "../../helpers/defined";
import FacetSearchBox from "./FacetSearchBox";

// extends Facet class
class FacetBasicBody extends Component {
    constructor(props) {
        super(props);
        this.renderOption = this.renderOption.bind(this);
        this.onApplyFilter = this.onApplyFilter.bind(this);
        this.onToggleOption = this.onToggleOption.bind(this);
        this.searchBoxValueChange = this.searchBoxValueChange.bind(this);
        this.state = {
            _activeOptions: [],
            showOptions: true
        };
    }

    componentWillMount() {
        this.props.searchFacet();
        this.setState({
            _activeOptions: this.props.activeOptions
        });
    }

    componentWillReceiveProps(nextProps) {
        if (nextProps.resetFilterEvent !== this.props.resetFilterEvent) {
            // filter has been reset!
            this.setState({
                _activeOptions: []
            });
            this.props.closeFacet();
        }
    }

    componentWillUnmount() {
        this.props.onToggleOption(this.state._activeOptions);
    }

    checkActiveOption(option) {
        return find(
            this.state._activeOptions,
            o => o.value.toLowerCase() === option.value.toLowerCase()
        );
    }

    onToggleOption(option) {
        const existingOptions = this.state._activeOptions.map(o => o.value);
        const index = existingOptions.indexOf(option.value);
        if (index > -1) {
            this.setState({
                _activeOptions: [
                    ...this.state._activeOptions.slice(0, index),
                    ...this.state._activeOptions.slice(index + 1)
                ]
            });
        } else {
            this.setState({
                _activeOptions: [...this.state._activeOptions, option]
            });
        }
    }

    renderOption(option, optionMax) {
        if (!option) {
            return null;
        }
        let maxWidth = defined(optionMax)
            ? (+option.hitCount / optionMax.hitCount) * 200
            : 0;
        let divStyle = {
            width: maxWidth + "px",
            height: "3px",
            background: "#4C2A85"
        };
        let isActive = this.checkActiveOption(option);

        return (
            <button
                key={option.value}
                type="button"
                className={`${isActive ? "is-active" : ""} btn-facet-option`}
                onClick={this.onToggleOption.bind(this, option)}
                title={option.value}
            >
                <span
                    style={divStyle}
                    className="btn-facet-option__volume-indicator"
                />
                <span className="btn-facet-option__name">
                    {option.value} ({option.hitCount})
                </span>
            </button>
        );
    }

    searchBoxValueChange(value) {
        this.setState({
            showOptions: !value || value.length === 0
        });
    }

    onApplyFilter() {
        this.props.onToggleOption(this.state._activeOptions);
    }

    render() {
        let that = this;
        // default list of options to display for the facet filter except those already active, which will be displayed in a seperate list
        let inactiveOptions = this.props.options.filter(
            o => !this.checkActiveOption(o)
        );
        // the option that has the max object.value value, use to calculate volumne indicator
        let maxOptionOptionList = maxBy(this.props.options, o => +o.hitCount);
        return (
            <div className={`facet-body facet-${this.props.title}`}>
                <div className="clearfix facet-body__header">
                    <FacetSearchBox
                        renderOption={this.renderOption}
                        options={this.props.facetSearchResults}
                        onToggleOption={this.onToggleOption}
                        searchBoxValueChange={this.searchBoxValueChange}
                        title={this.props.title}
                    />
                </div>
                {this.state.showOptions && (
                    <div>
                        <div className="facet-body-buttons">
                            <ul className="list--unstyled facet-option__list">
                                {that.state._activeOptions
                                    .sort((a, b) => b.hitCount - a.hitCount)
                                    .map(o => (
                                        <li key={`${o.value}-${o.hitCount}`}>
                                            {that.renderOption(
                                                o,
                                                maxOptionOptionList
                                            )}
                                        </li>
                                    ))}
                                {this.props.options.length === 0 && (
                                    <li className="no-data">
                                        No {this.props.title} available
                                    </li>
                                )}
                            </ul>
                            {inactiveOptions.map(o =>
                                this.renderOption(o, maxOptionOptionList)
                            )}
                        </div>
                        <div className="facet-footer">
                            <button
                                className="au-btn au-btn--secondary"
                                disabled={
                                    this.state._activeOptions.length === 0
                                }
                                onClick={this.props.onResetFacet}
                            >
                                {" "}
                                Clear{" "}
                            </button>
                            <button
                                className="au-btn au-btn--primary"
                                disabled={
                                    this.state._activeOptions.length === 0
                                }
                                onClick={this.onApplyFilter}
                            >
                                {" "}
                                Apply{" "}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    }
}

export default FacetBasicBody;
