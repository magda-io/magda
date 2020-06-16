import React, { Component } from "react";
import { config } from "config";
import { Medium } from "Components/Common/Responsive";
import TooltipWrapper from "Components/Common/TooltipWrapper";
import ClearAllButton from "./ClearAllButton";
import { retrieveLocalData, setLocalData } from "storage/localStorage";
import FilterExplanation from "./FilterExplanation";
import memoize from "memoize-one";

import "./SearchFacets.scss";

// partition an array by size n
const partitionArray = (array, size) =>
    array
        .map((e, i) => (i % size === 0 ? array.slice(i, i + size) : null))
        .filter((e) => e);

const partitionWithCache = memoize(partitionArray);

class SearchFacets extends Component {
    constructor(props) {
        super(props);
        this.state = { openFacet: null, showFilterOnMobile: false };
        this.toggleFacet = this.toggleFacet.bind(this);
        this.closeFacetWithKeyBoard = this.closeFacetWithKeyBoard.bind(this);
        this.onToggleFacetOnMobile = this.onToggleFacetOnMobile.bind(this);
        this.renderDesktop = this.renderDesktop.bind(this);
    }

    componentDidMount() {
        window.addEventListener("click", this.closeFacetWithKeyBoard);
    }

    closeFacetWithKeyBoard(event) {
        if (event.keyCode) {
            if (event.keyCode === 27) {
                this.setState({
                    openFacet: null
                });
            } else {
                return false;
            }
        } else {
            this.setState({
                openFacet: null
            });
        }
    }

    componentWillUnmount() {
        const that = this;
        window.removeEventListener("click", that.closeFacetWithKeyBoard);
    }

    toggleFacet(facet) {
        this.setState({
            openFacet: this.state.openFacet === facet ? null : facet
        });
    }

    closeFacet(facet) {
        if (this.state.openFacet === facet) {
            this.setState({
                openFacet: null
            });
        }
        return false;
    }

    onToggleFacetOnMobile() {
        this.setState({
            showFilterOnMobile: !this.state.showFilterOnMobile
        });
    }

    renderFilterButton = (filter) => {
        const filterComponent = (
            <div
                className="search-facet"
                key={filter.id}
                onClick={(ev) => ev.stopPropagation()}
            >
                <filter.component
                    updateQuery={this.props.updateQuery}
                    location={this.props.location}
                    title={filter.id}
                    isOpen={this.state.openFacet === filter.id}
                    toggleFacet={this.toggleFacet.bind(this, filter.id)}
                    closeFacet={this.closeFacet.bind(this, filter.id)}
                />
            </div>
        );

        if (
            filter.showExplanation &&
            this.props.location.state &&
            this.props.location.state.showFilterExplanation &&
            !retrieveLocalData("hideFilterTooltips", false)
        ) {
            return (
                <TooltipWrapper
                    key={filter.id + "tooltip"}
                    startOpen={true}
                    requireClickToDismiss={true}
                    launcher={() => filterComponent}
                    onDismiss={() => setLocalData("hideFilterTooltips", true)}
                    orientation="below"
                >
                    {(dismiss) => (
                        <FilterExplanation
                            dismiss={dismiss}
                            filterType={filter.name}
                        />
                    )}
                </TooltipWrapper>
            );
        } else {
            return filterComponent;
        }
    };

    renderDesktop() {
        // if we group facets in two, it would help some of the layout issues on smaller screen
        const facetGroup = partitionWithCache(config.facets, 2);
        return (
            <div className="search-facets-desktop">
                {facetGroup.map((group, i) => {
                    if (i === facetGroup.length - 1) {
                        return (
                            <div key={i} className="facet-group">
                                {group.map(this.renderFilterButton)}
                                <ClearAllButton key={"clear-all-button"} />
                            </div>
                        );
                    }
                    return (
                        <div key={i} className="facet-group">
                            {group.map(this.renderFilterButton)}
                        </div>
                    );
                })}
            </div>
        );
    }

    render() {
        return (
            <div>
                <Medium>{this.renderDesktop()}</Medium>
            </div>
        );
    }
}

export default SearchFacets;
