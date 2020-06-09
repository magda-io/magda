addSection("Header Navigation", async function (body) {
    showJsonEditor(body, {
        label: "Header Navigation",
        idPattern: "header/navigation/*",
        schema: headerNavigationSchema,
        allowDelete: true,
        allowAdd: true,
        newId: () => `header/navigation/${Date.now()}`
    });
});

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

addSection("Footer Navigation", async function (body) {
    body.text("");
    showJsonEditor(body.append("div"), {
        label: "Medium Footer Navigation Categories",
        idPattern: "footer/navigation/medium/category/*",
        schema: footerCategory,
        allowDelete: true,
        allowAdd: true,
        newId: (id) => `footer/navigation/medium/category/${Date.now()}`,
        extraControls: (parent, file) => {
            const prefix = file.id.substr(
                "footer/navigation/medium/category/".length
            );
            showJsonEditor(parent.append("div").style("padding-left", "5em"), {
                label: "Category Menu Items",
                idPattern: `footer/navigation/medium/category-links/${prefix}/*`,
                schema: footerLink,
                allowDelete: true,
                allowAdd: true,
                newId: (id) =>
                    `footer/navigation/medium/category-links/${prefix}/${Date.now()}`
            });
        }
    });
    showJsonEditor(body.append("div"), {
        label: "Small Footer Navigation Categories",
        idPattern: "footer/navigation/small/category/*",
        schema: footerCategory,
        allowDelete: true,
        allowAdd: true,
        newId: (id) => `footer/navigation/small/category/${Date.now()}`,
        extraControls: (parent, file) => {
            const prefix = file.id.substr(
                "footer/navigation/small/category/".length
            );
            showJsonEditor(parent.append("div").style("padding-left", "5em"), {
                label: "Category Menu Items",
                idPattern: `footer/navigation/small/category-links/${prefix}/*`,
                schema: footerLink,
                allowDelete: true,
                allowAdd: true,
                newId: (id) =>
                    `footer/navigation/small/category-links/${prefix}/${Date.now()}`
            });
        }
    });
});

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

addSection("Copyright", async function (body) {
    showJsonEditor(body, {
        label: "Footer Copyright",
        idPattern: "footer/copyright/*",
        schema: footerCopyright,
        allowDelete: true,
        allowAdd: true,
        newId: (id) => `footer/copyright/${Date.now()}`
    });
});

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
