(() => {
    const MANAGED_STYLE_ID = "magda-managed-dsh-profile";

    function installManagedChrome() {
        let style = document.getElementById(MANAGED_STYLE_ID);
        const createdStyle = !style;
        if (!style) {
            style = document.createElement("style");
            style.id = MANAGED_STYLE_ID;
            document.head.appendChild(style);
        }
        style.textContent = `
        /* A managed Magda deployment owns the only workspace directory. */
        button[aria-label="Choose workspace"] {
            display: none !important;
        }
    `;

        const applyBrand = () => {
            for (const element of document.querySelectorAll("span")) {
                if (
                    element.childNodes.length !== 1 ||
                    element.firstChild?.nodeType !== Node.TEXT_NODE ||
                    element.textContent?.trim() !== "Into the Unknown"
                ) {
                    continue;
                }

                element.textContent = "Agent Workspace";
                const titleGroup = element.parentElement;
                const previewBadge = element.nextElementSibling;
                const brandMark = titleGroup?.previousElementSibling;
                if (previewBadge instanceof HTMLElement) {
                    previewBadge.style.display = "none";
                }
                if (brandMark instanceof HTMLElement) {
                    brandMark.style.display = "none";
                }
            }
        };

        applyBrand();
        const observer = new MutationObserver(applyBrand);
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });

        return () => {
            observer.disconnect();
            if (createdStyle) {
                style.remove();
            }
        };
    }

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
                    ctx.effect(
                        () => installManagedChrome(),
                        "managed profile: Magda chrome"
                    );

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
                                (candidate) =>
                                    !hiddenCommands.has(candidate.name)
                            );

                        return () => {
                            commandUi.candidates = candidates;
                        };
                    });
                }
            };
        }
    });
})();
