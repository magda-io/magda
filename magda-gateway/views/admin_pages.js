addSection("Pages", async function (body) {
    showJsonEditor(body, {
        label: "Content Pages",
        idPattern: "page/*",
        schema: pageSchema,
        allowDelete: true,
        allowAdd: true,
        allowIdFieldInput: true,
        newId: (id) => `page/${id}`
    });
});

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
