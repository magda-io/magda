addSection("Language", async function (body) {
    showJsonEditor(body, {
        label: "Language Items",
        idPattern: "lang/en/*",
        schema: languageSchema,
        allowDelete: true,
        allowAdd: true,
        allowIdFieldInput: true,
        newId: (id) => `lang/en/${id}`,
        mimeType: "text/plain"
    });
});

const languageSchema = {
    type: "string"
};
