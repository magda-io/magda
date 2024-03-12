import defaultFormatIcon from "assets/format-passive-dark.svg";
import iconApi from "assets/data-types/api.svg";
import iconArchive from "assets/data-types/archive.svg";
import iconDocument from "assets/data-types/document.svg";
import iconGis from "assets/data-types/gis.svg";
import iconHtml from "assets/data-types/html.svg";
import iconImageRaster from "assets/data-types/image-raster.svg";
import iconImageVector from "assets/data-types/image-vector.svg";
import iconPresentation from "assets/data-types/presentation.svg";
import iconSpreadsheet from "assets/data-types/spreadsheet.svg";
import iconTabular from "assets/data-types/tabular.svg";

const formatIcons = {
    default: defaultFormatIcon,
    api: iconApi,
    archive: iconArchive,
    document: iconDocument,
    gis: iconGis,
    html: iconHtml,
    "image-raster": iconImageRaster,
    "image-vector": iconImageVector,
    presentation: iconPresentation,
    spreadsheet: iconSpreadsheet,
    tabular: iconTabular
};

const CategoryDetermineConfigItems = [
    {
        regex: /wfs|wms|geojson|kml|kmz|shp|gdb|csv-geo-au|mpk|ArcGIS|ESRI REST/i,
        category: "gis"
    },
    {
        regex: /api|webservice| web service/i,
        category: "api"
    },
    {
        regex: /zip|7z|rar|arj/i,
        category: "archive"
    },
    {
        regex: /doc|pdf|docx|txt|plaintext/i,
        category: "document"
    },
    {
        regex: /html|htm|web page|web site/i,
        category: "html"
    },
    {
        regex: /^www:/i,
        category: "html"
    },
    {
        regex: /jpg|gif|jpeg/i,
        category: "image-raster"
    },
    {
        regex: /svg|png/i,
        category: "image-vector"
    },
    {
        regex: /ppt|pptx/i,
        category: "presentation"
    },
    {
        regex: /xlsx|xls/i,
        category: "spreadsheet"
    },
    {
        regex: /csv|tab/i,
        category: "tabular"
    }
];

function determineCategoryFromString(str) {
    let matchedCategory = "default";
    if (!str || typeof str !== "string") return matchedCategory;
    str = str.trim().toLowerCase();
    for (let i = 0; i < CategoryDetermineConfigItems.length; i++) {
        const config = CategoryDetermineConfigItems[i];
        if (str.match(config.regex)) {
            matchedCategory = config.category;
            break;
        }
    }
    return matchedCategory;
}

export function determineFormatIcon(distribution) {
    let matchedCategory = determineCategoryFromString(distribution.format);
    if (distribution.downloadURL && matchedCategory === "default") {
        matchedCategory = determineCategoryFromString(distribution.downloadURL);
    }
    return matchedCategory;
}

export function getFormatIcon(distribution, defaultIcon = "default") {
    let matchedCategory = determineFormatIcon(distribution);
    if (matchedCategory === "default" && defaultIcon) {
        matchedCategory = defaultIcon;
    }
    return formatIcons[matchedCategory];
}
