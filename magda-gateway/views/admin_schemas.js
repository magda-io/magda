const headerNavigationSchema = {
    type: "object",
    properties: {
        order: {
            type: "number",
            default: 1,
            propertyOrder: 99
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
                            minLength: 1,
                            propertyOrder: 1
                        },
                        rel: {
                            type: "string",
                            minLength: 2,
                            propertyOrder: 3
                        },
                        target: {
                            type: "string",
                            enum: ["", "blank"],
                            propertyOrder: 4,
                            default: ""
                        },
                        href: {
                            type: "string",
                            minLength: 1,
                            propertyOrder: 2
                        }
                    },
                    required: ["label", "href"],
                    options: {
                        remove_empty_properties: true
                    }
                }
            },
            required: ["default"]
        },
        {
            title: "Authentication Menu",
            properties: {
                auth: {
                    title: "Authentication Menu",
                    type: "object",
                    options: {
                        hidden: true
                    }
                }
            },
            required: ["auth"]
        }
    ],
    required: ["order"]
};

const headerTaglineSchema = {
    type: "string"
};

const languageSchema = {
    type: "string"
};

const homeStorySchema = {
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
            minLength: 1,
            format: "markdown"
        }
    },
    required: ["title", "order", "content"]
};

const homeHighlightSchema = {
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

const footerCategory = {
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

const footerLink = {
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

const footerCopyright = {
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

const pageSchema = {
    type: "object",
    properties: {
        title: {
            type: "string",
            minLength: 1
        },
        content: {
            type: "string",
            minLength: 1,
            format: "markdown"
        }
    },
    required: ["title"]
};
