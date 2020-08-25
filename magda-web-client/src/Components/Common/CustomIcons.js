import React, { Component } from "react";
export const iconTypes = [
    "Default",
    "CSV",
    "DOC",
    "DOCX",
    "HTML",
    "JSON",
    "KML",
    "PDF",
    "TXT",
    "XLS",
    "XLSX",
    "ZIP"
];
class CustomIcons extends Component {
    getIcon(name, imageUrl) {
        if (imageUrl) {
            return imageUrl;
        }
        let type = 0;
        if (iconTypes.indexOf(name) > 0) {
            type = iconTypes.indexOf(name);
        }
        return `./assets/file-icons/${iconTypes[type]}.png`;
    }

    render() {
        return (
            <img
                src={this.getIcon(this.props.name, this.props.imageUrl)}
                alt={this.props.name}
                className={this.props.className}
            />
        );
    }
}

export default CustomIcons;
