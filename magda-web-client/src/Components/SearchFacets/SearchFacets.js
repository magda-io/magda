import React, { Component } from "react";
import { config } from "../../config";
import { Small, Medium } from "../../UI/Responsive";
import downArrowDark from "../../assets/downArrowDark.svg";
import ClearAllButtom from "./ClearAllButton";
import memoize from "memoize-one";

import "./SearchFacets.css";

// partition an array by size n
const partitionArray = (array, size) =>
    array
        .map((e, i) => (i % size === 0 ? array.slice(i, i + size) : null))
        .filter(e => e);

const partitionWithCache = memoize(partitionArray);

class SearchFacets extends Component {
    constructor(props) {
        super(props);
        this.state = { openFacet: null, showFilterOnMobile: false };
        this.toggleFacet = this.toggleFacet.bind(this);
        this.closeFacetWithKeyBoard = this.closeFacetWithKeyBoard.bind(this);
        this.onToggleFacetOnMobile = this.onToggleFacetOnMobile.bind(this);
        this.renderMobile = this.renderMobile.bind(this);
        this.renderDesktop = this.renderDesktop.bind(this);
        this.renderFacet = this.renderFacet.bind(this);
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

    renderFacet(facet) {
        return (
            <div
                className="search-facet"
                key={facet.id}
                onClick={ev => ev.stopPropagation()}
            >
                <facet.component
                    updateQuery={this.props.updateQuery}
                    location={this.props.location}
                    title={facet.id}
                    isOpen={this.state.openFacet === facet.id}
                    toggleFacet={this.toggleFacet.bind(this, facet.id)}
                    closeFacet={this.closeFacet.bind(this, facet.id)}
                />
            </div>
        );
    }

    renderDesktop() {
        // if we group facets in two, it would help some of the layout issues on smaller screen
        const facetGroup = partitionWithCache(config.facets, 2);
        return (
            <div className="search-facets-desktop">
                {facetGroup.map((group, i) => {
                    if (i == facetGroup.length - 1) {
                        return (
                            <div key={i} className="facet-group">
                                {group.map(facet => this.renderFacet(facet))}
                                <ClearAllButtom key={"clear-all-button"} />
                            </div>
                        );
                    }
                    return (
                        <div key={i} className="facet-group">
                            {group.map(facet => this.renderFacet(facet))}
                        </div>
                    );
                })}
            </div>
        );
    }

    renderMobile() {
        return (
            <div className="search-facets-mobile">
                <button
                    className="filter-toggle-button au-btn"
                    onClick={this.onToggleFacetOnMobile}
                >
                    Filters <img src={downArrowDark} alt="open filter" />
                </button>
                {this.state.showFilterOnMobile &&
                    config.facets.map(c => this.renderFacet(c))}
                {this.state.showFilterOnMobile && (
                    <ClearAllButtom key={"clear-all-button"} />
                )}
                {this.state.openFacet && (
                    <div className="mobile-facet-background" />
                )}
            </div>
        );
    }

    render() {
        return (
            <div>
                <Medium>{this.renderDesktop()}</Medium>
                <Small>{this.renderMobile()}</Small>
            </div>
        );
    }
}

export default SearchFacets;
