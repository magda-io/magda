import React, { Component } from "react";
import find from "lodash/find";
import maxBy from "lodash/maxBy";
import defined from "helpers/defined";
import FacetSearchBox from "./FacetSearchBox";
import "./FacetBasicBody.scss";
import { NoResultsLabel } from "./NoResultsLabel";

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

    static getDerivedStateFromProps(props, state) {
        // only set props to state if state is not already set and if props is not empty
        if (!state._activeOptions.length && props.activeOptions.length) {
            return {
                _activeOptions: props.activeOptions
            };
        }
        return null;
    }

    componentDidMount() {
        this.props.searchFacet();
    }

    componentDidUpdate(prevProps) {
        if (prevProps.resetFilterEvent !== this.props.resetFilterEvent) {
            this.props.closeFacet();
            this.setState({
                _activeOptions: []
            });
        } else if (!this.props.isOpen && prevProps.isOpen) {
            this.props.onToggleOption(this.state._activeOptions);
        }
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
        // if the option is already selected remove it from _activeOptions
        if (index > -1) {
            this.setState({
                _activeOptions: [
                    ...this.state._activeOptions.slice(0, index),
                    ...this.state._activeOptions.slice(index + 1)
                ]
            });
            //else add it to the activeOptions
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
                    {option.value} ( {option.hitCount} )
                </span>
            </button>
        );
    }

    searchBoxValueChange(value) {
        this.props.searchFacet(value);
    }

    onApplyFilter() {
        this.props.onToggleOption(this.state._activeOptions);
    }

    render() {
        if (!this.props.isOpen) return null;
        let options = this.props.options;
        // the option that has the max hit value, use to calculate volumne indicator
        let maxOptionOptionList = maxBy(this.props.options, o => +o.hitCount);

        let optionsContent;
        if (options.length > 0) {
            optionsContent = options.map(o =>
                this.renderOption(o, maxOptionOptionList)
            );
        } else {
            optionsContent = <NoResultsLabel />;
        }

        return (
            <div
                className={`facet-body facet-${this.props.title} facet-${this.props.alignment}`}
            >
                <div className="clearfix facet-body__header">
                    <FacetSearchBox
                        renderOption={this.renderOption}
                        onToggleOption={this.onToggleOption}
                        searchBoxValueChange={this.searchBoxValueChange}
                        title={this.props.title}
                    />
                </div>
                {this.state.showOptions && (
                    <div>
                        <div className="facet-body-buttons">
                            {optionsContent}
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
