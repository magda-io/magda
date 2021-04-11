import React, { Component } from "react";
import "./FacetHeader.scss";
import { ReactComponent as PublisherIcon } from "assets/publisher-passive.svg";
import { ReactComponent as FormatIcon } from "assets/format-passive.svg";
import { ReactComponent as TemporalIcon } from "assets/temporal-passive.svg";
import { ReactComponent as RegionIcon } from "assets/region-passive.svg";
import { ReactComponent as RemoveIcon } from "assets/remove-light.svg";
import { config } from "config";
import upperFirst from "lodash/upperFirst";

const IconList = {
    PublisherIcon,
    FormatIcon,
    TemporalIcon,
    RegionIcon
};
/**
 * Facet header component, contains a title of the facet and a reset button when there is a active facet
 */
class FacetHeader extends Component {
    constructor(props) {
        super(props);
        this.state = { buttonActive: false };
        this.headerDiv = React.createRef();
    }

    componentDidMount() {
        if (this.props.updateComponentAlignment) {
            this.props.updateComponentAlignment(
                this.headerDiv.current.getBoundingClientRect().x
            );
        }
    }

    componentDidUpdate() {
        // if it has filter and the button is not active
        // then set it to active
        if (this.hasFilter() !== this.state.buttonActive) {
            this.setState({
                buttonActive: this.hasFilter()
            });
        }

        if (this.props.updateComponentAlignment) {
            this.props.updateComponentAlignment(
                this.headerDiv.current.getBoundingClientRect().x
            );
        }
    }

    displayMonth(date) {
        return (
            config.months[new Date(date).getUTCMonth()] +
            " " +
            new Date(date).getUTCFullYear()
        );
    }

    calculateTitle() {
        if (this.props.title === "date range") {
            if (!this.hasFilter()) {
                return <span> Any date </span>;
            } else if (
                this.props.activeOptions[0] &&
                !this.props.activeOptions[1]
            ) {
                return (
                    <span>
                        {" "}
                        since {this.displayMonth(this.props.activeOptions[0])}
                    </span>
                );
            } else if (
                this.props.activeOptions[1] &&
                !this.props.activeOptions[0]
            ) {
                return (
                    <span>
                        {" "}
                        before {this.displayMonth(this.props.activeOptions[1])}
                    </span>
                );
            }
            return (
                <span>
                    {" "}
                    from {this.displayMonth(this.props.activeOptions[0])} -{" "}
                    {this.displayMonth(this.props.activeOptions[1])}{" "}
                </span>
            );
        } else {
            if (!this.hasFilter()) {
                return <span>{"Any " + this.props.title}</span>;
            } else if (this.props.activeOptions.length === 1) {
                return (
                    <span>
                        {this.props.activeOptions[0].value ||
                            this.props.activeOptions[0].regionType +
                                ": " +
                                this.props.activeOptions[0].regionName}{" "}
                    </span>
                );
            } else {
                return (
                    <span>
                        {`${this.props.title}s : ${this.props.activeOptions.length}`}{" "}
                    </span>
                );
            }
        }
    }

    calculateAltText() {
        // --- this.props.name can be used for the filter name except date filter
        const filterName = this.props.title;
        if (this.props.id === "temporal") {
            if (!this.hasFilter()) {
                return "Date filter: any date";
            } else if (
                this.props.activeOptions[0] &&
                !this.props.activeOptions[1]
            ) {
                return `Date filter: since ${this.displayMonth(
                    this.props.activeOptions[0]
                )}`;
            } else if (
                this.props.activeOptions[1] &&
                !this.props.activeOptions[0]
            ) {
                return `Date filter: before ${this.displayMonth(
                    this.props.activeOptions[1]
                )}`;
            }
            return `Date filter: from ${this.displayMonth(
                this.props.activeOptions[0]
            )} - ${this.displayMonth(this.props.activeOptions[1])}`;
        } else {
            if (!this.hasFilter()) {
                return `${upperFirst(filterName)} filter: any ${filterName}`;
            } else if (this.props.activeOptions.length === 1) {
                return `${upperFirst(filterName)} filter: ${
                    this.props.activeOptions[0].value ||
                    this.props.activeOptions[0].regionType +
                        ": " +
                        this.props.activeOptions[0].regionName
                }`;
            } else {
                return `${upperFirst(
                    filterName
                )} filter: ${this.props.activeOptions
                    .map((option) => option.value)
                    .join(", ")}`;
            }
        }
    }

    calculateRemoveAltText() {
        if (this.props.id === "temporal") {
            return "Remove date filter";
        }
        const filterName = this.props.title;
        return `Remove ${filterName} filter`;
    }

    hasFilter() {
        let hasFilter = true;
        if (this.props.title === "date range") {
            if (this.props.activeOptions.every((o) => !o)) {
                hasFilter = false;
            }
        } else {
            if (
                !this.props.activeOptions ||
                this.props.activeOptions.length === 0 ||
                !this.props.activeOptions[0] ||
                (this.props.title === "location" &&
                    !this.props.activeOptions[0].regionType)
            ) {
                hasFilter = false;
            }
        }
        return hasFilter;
    }

    getButtonIcon() {
        if (!this.props.id) {
            return null;
        }
        const iconKey = upperFirst(this.props.id) + "Icon";
        return IconList[iconKey];
    }

    render() {
        const ButtonIcon = this.getButtonIcon();
        return (
            <div
                className={`facet-header ${
                    this.hasFilter() ? "not-empty" : ""
                }`}
                ref={this.headerDiv}
            >
                <button
                    className={`au-btn au-btn--secondary btn-facet ${
                        this.props.title
                    } ${this.props.isOpen ? "is-open" : ""}`}
                    onClick={this.props.onClick}
                    aria-label={this.calculateAltText()}
                    disabled={this.props.disabled}
                >
                    <ButtonIcon
                        className={`facet-icon ${
                            this.state.buttonActive ? "active" : ""
                        }`}
                        aria-label={this.calculateTitle()}
                    />
                    {this.calculateTitle()}
                </button>
                {this.props.hasQuery && (
                    <button
                        onClick={this.props.onResetFacet}
                        className="btn-remove au-btn"
                        aria-label={this.calculateRemoveAltText()}
                    >
                        <RemoveIcon
                            aria-label={this.calculateRemoveAltText()}
                        />
                    </button>
                )}
            </div>
        );
    }
}

FacetHeader.defaultProps = { title: "" };

export default FacetHeader;
