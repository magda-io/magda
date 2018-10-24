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

export const footerCategoryItem: any = {
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
        links: {
            type: "array",
            items: {
                type: "array",
                minItems: 2,
                maxItems: 3,
                items: {
                    type: "string",
                    minLength: 1
                }
            }
        }
    },
    required: ["order", "category", "items"]
};

/**
   We need to conver the following content:
   <Copyright
        href="https://dta.gov.au/"
        logoSrc={dtaLogo}
        logoClassName="dta-logo"
        logoAlt="DTA Logo"
    >
        Operated with&nbsp;
        <span role="img" aria-label="love">
            ❤️
        </span>{" "}
        by{" "}
    </Copyright>
 */

export const footerCopyRightItem: any = {
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
