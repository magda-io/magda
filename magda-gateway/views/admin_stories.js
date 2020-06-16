addSection("Stories", async function (body) {
    showJsonEditor(body, {
        label: "Home Stories",
        idPattern: "home/stories/*",
        schema: homeStorySchema,
        allowDelete: true,
        allowAdd: true,
        newId: () => `home/stories/${Date.now()}`,
        extraControls: (parent, file) => {
            parent.append("h4").text("Story Image");
            imageConfig(
                parent.append("div"),
                file.id.replace(/^home\/stories/, "home/story-images")
            );
        }
    });
});

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
