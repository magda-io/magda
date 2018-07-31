import React, { Component } from "react";
import { config } from "../../config";
import { Medium } from "../../UI/Responsive";
import Tooltip from "../../UI/Tooltip";
// import downArrowDark from "../../assets/downArrowDark.svg";
import ClearAllButton from "./ClearAllButton";

import "./SearchFacets.css";

class SearchFacets extends Component {
    constructor(props) {
        super(props);
        this.state = { openFacet: null, showFilterOnMobile: false };
        this.toggleFacet = this.toggleFacet.bind(this);
        this.closeFacetWithKeyBoard = this.closeFacetWithKeyBoard.bind(this);
        this.onToggleFacetOnMobile = this.onToggleFacetOnMobile.bind(this);
        // this.renderMobile = this.renderMobile.bind(this);
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

    renderFilterButton = filter => {
        return (
            <Tooltip
                launcher={() => (
                    <div
                        className="search-facet"
                        key={filter.id}
                        onClick={ev => ev.stopPropagation()}
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
                )}
            >
                blah
            </Tooltip>
        );
    };

    renderDesktop() {
        return (
            <div className="search-facets-desktop">
                {config.facets.map(this.renderFilterButton)}
                <ClearAllButton key={"clear-all-button"} />
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
