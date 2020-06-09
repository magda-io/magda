import fastXmlParser from "fast-xml-parser";
import jsonToArray from "./jsonToArray";

export default function (xmlData: string) {
    // when a tag has attributes
    const options = {
        attrPrefix: "@_",
        textNodeName: "#text",
        ignoreNonTextNodeAttr: true,
        ignoreTextNodeAttr: true,
        ignoreNameSpace: true,
        ignoreRootElement: false,
        textNodeConversion: true,
        textAttrConversion: false
    };
    if (fastXmlParser.validate(xmlData) === true) {
        //optional
        const jsonObj = fastXmlParser.parse(xmlData, options);
        var array = jsonToArray(jsonObj);
        const data = {
            data: array,
            meta: {
                fields: ["name", "value"],
                type: "tabular"
            }
        };
        return data;
    }
    return null;
}
