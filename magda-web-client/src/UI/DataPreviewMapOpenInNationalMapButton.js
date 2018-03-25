import React, { Component } from "react";
import PropTypes from "prop-types";
import "./DataPreviewMapOpenInNationalMapButton.css";

class DataPreviewMapOpenInNationalMapButton extends Component {
    constructor(props) {
        super(props);
        this.state = {};
    }

    determineCatalogItemType() {
        let format = this.props.distribution.format.toLowerCase();
        if (format === "csv-geo-au") format = "csv";
        return format;
    }

    createCatalogItemFromDistribution() {
        return {
            initSources: [
                {
                    catalog: [
                        {
                            name: this.props.distribution.title,
                            type: this.determineCatalogItemType(),
                            url: this.props.distribution.downloadURL,
                            isEnabled: true,
                            zoomOnEnable: true
                        }
                    ]
                }
            ]
        };
    }

    onButtonClick() {
        window.open(
            "https://nationalmap.gov.au/#start=" +
                encodeURIComponent(
                    JSON.stringify(this.createCatalogItemFromDistribution())
                ),
            "National Map Australia"
        );
    }

    render() {
        return (
            <div style={this.props.style}>
                <button
                    className="open-in-national-map-button"
                    onClick={() => this.onButtonClick()}
                >
                    <div className="rectangle-2" />
                    <div className="rectangle-1" />
                    <div className="open-national-map-button-text">
                        Open In National Map
                    </div>
                </button>
            </div>
        );
    }
}

DataPreviewMapOpenInNationalMapButton.propTypes = {
    distribution: PropTypes.object.isRequired
};

DataPreviewMapOpenInNationalMapButton.defaultProps = {
    distribution: null
};

export default DataPreviewMapOpenInNationalMapButton;
