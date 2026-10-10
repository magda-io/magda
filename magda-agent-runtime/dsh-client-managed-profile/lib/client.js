window.__ModuleLoader__.load({
    id: "@magda/dsh-client-managed-profile",
    factory() {
        const hiddenCommands = new Set(["permission"]);

        return {
            inject: ["commandUi"],

            /**
             * Removes host commands that remain necessary for enforcement but
             * must not be selectable in Magda's deployment-managed composer UI.
             */
            apply(ctx) {
                ctx.inject(["commandUi"], (scope) => {
                    const commandUi = scope.get("commandUi");
                    if (!commandUi) {
                        throw new Error(
                            "managed profile: commandUi service unavailable"
                        );
                    }

                    const candidates = commandUi.candidates.bind(commandUi);
                    commandUi.candidates = async (...args) =>
                        (await candidates(...args)).filter(
                            (candidate) => !hiddenCommands.has(candidate.name)
                        );

                    return () => {
                        commandUi.candidates = candidates;
                    };
                });
            }
        };
    }
});
