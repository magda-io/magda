import React, { Component } from "react";
import { config } from "../../config";
import { Medium } from "../../UI/Responsive";
// import downArrowDark from "../../assets/downArrowDark.svg";
import ClearAllButtom from "./ClearAllButton";

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

    renderDesktop() {
        return (
            <div className="search-facets-desktop">
                {config.facets.map(c => (
                    <div
                        className="search-facet"
                        key={c.id}
                        onClick={ev => ev.stopPropagation()}
                    >
                        <c.component
                            updateQuery={this.props.updateQuery}
                            location={this.props.location}
                            title={c.id}
                            isOpen={this.state.openFacet === c.id}
                            toggleFacet={this.toggleFacet.bind(this, c.id)}
                            closeFacet={this.closeFacet.bind(this, c.id)}
                        />
                    </div>
                ))}
                <ClearAllButtom key={"clear-all-button"} />
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
