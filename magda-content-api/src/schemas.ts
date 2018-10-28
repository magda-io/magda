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
