export const headerNavigation: any = {
    type: "object",
    properties: {
        order: {
            type: "number",
            default: 1
        }
    },
    oneOf: [
        {
            title: "Regular Menu",
            properties: {
                default: {
                    title: "Configuration",
                    type: "object",
                    properties: {
                        label: {
                            type: "string",
                            minLength: 1
                        },
                        rel: {
                            type: "string",
                            minLength: 2
                        },
                        target: {
                            type: "string",
                            enum: ["", "blank"]
                        },
                        href: {
                            type: "string",
                            minLength: 1
                        }
                    },
                    required: ["label", "href"]
                }
            },
            required: ["default"]
        },
        {
            title: "Authentication Menu",
            properties: {
                auth: {
                    title: "Authentication Menu",
                    type: "object"
                }
            },
            required: ["auth"]
        }
    ],
    required: ["order"]
};

export const homeTagLine: any = {
    type: "string"
};

export const homeHighlight: any = {
    type: "object",
    properties: {
        text: {
            type: "string",
            minLength: 1
        },
        url: {
            type: "string",
            minLength: 1
        }
    },
    required: ["text", "url"]
};

export const homeStory: any = {
    type: "object",
    properties: {
        title: {
            type: "string",
            minLength: 1
        },
        titleUrl: {
            type: "string",
            minLength: 1
        },
        order: {
            type: "number"
        },
        content: {
            type: "string",
            minLength: 1
        }
    },
    required: ["title", "order", "content"]
};

export const languageString: any = {
    type: "string"
};

export const footerCategory: any = {
    type: "object",
    properties: {
        order: {
            type: "number",
            default: 1
        },
        label: {
            type: "string",
            minLength: 1
        }
    },
    required: ["order", "label"]
};

export const footerLink: any = {
    type: "object",
    properties: {
        order: {
            type: "number",
            default: 1
        },
        label: {
            type: "string",
            minLength: 1
        },
        href: {
            type: "string",
            minLength: 1
        }
    },
    required: ["order", "label", "href"]
};

export const footerCopyright: any = {
    type: "object",
    properties: {
        order: {
            type: "number",
            default: 1
        },
        href: {
            type: "string",
            minLength: 1
        },
        logoSrc: {
            type: "string",
            minLength: 1
        },
        logoClassName: {
            type: "string",
            default: ""
        },
        logoAlt: {
            type: "string",
            default: ""
        },
        htmlContent: {
            type: "string",
            minLength: 1
        }
    },
    required: ["order", "href", "logoSrc", "htmlContent"]
};

export const configDatasetSearchSuggestionScoreThreshold: any = {
    type: "number",
    minimum: -1
};

export const configSearchResultsPerPage: any = {
    type: "number",
    minimum: 1
};
