const getBoolValWithDefault = (val: any, defaultVal: boolean = false) =>
    typeof val === "boolean" ? val : defaultVal;
export default getBoolValWithDefault;
