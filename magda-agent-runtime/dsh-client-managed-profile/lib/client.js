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
        /* Magda owns the only filesystem workspace. Keep DSH's native Session
           navigation and Search, but hide controls that create or regroup
           filesystem workspaces. */
        button[aria-label="Choose workspace"],
        button[aria-label="Add workspace"],
        button[aria-label="View options"] {
            display: none !important;
        }

        .magda-dsh-brand-mark {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            box-sizing: border-box;
            border-radius: 6px;
            background: #30384d;
            color: #fff;
            font-size: 13px;
            font-weight: 700;
            line-height: 1;
        }

        .magda-dsh-brand-name {
            overflow: hidden;
            color: var(--dsw-alias-label-primary);
            font-weight: 600;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
    `;

        // The pinned DSH release does not expose the new-session hero through a
        // branding slot. Keep this narrowly scoped replacement while using the
        // native sidebar branding slots below.
        const applyHeroBrand = () => {
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

        applyHeroBrand();
        const observer = new MutationObserver(applyHeroBrand);
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
        factory(require) {
            const { jsx } = require("react/jsx-runtime");
            const hiddenCommands = new Set(["permission"]);
            const EmptySlot = () => null;
            const AgentWorkspaceBrandMark = ({ size }) =>
                jsx("span", {
                    "aria-hidden": true,
                    className: "magda-dsh-brand-mark",
                    style: { width: size, height: size },
                    children: "M"
                });
            const AgentWorkspaceBrandName = () =>
                jsx("span", {
                    className: "magda-dsh-brand-name",
                    children: "Agent Workspace"
                });

            return {
                inject: ["commandUi", "slots"],

                /**
                 * Removes host commands that remain necessary for enforcement but
                 * must not be selectable in Magda's deployment-managed composer UI.
                 * It also composes the supported DSH sidebar slots instead of
                 * replacing the sidebar or disabling the Settings service.
                 */
                apply(ctx) {
                    ctx.effect(
                        () => installManagedChrome(),
                        "managed profile: Magda chrome"
                    );

                    ctx.slots.inject("sidebar.brand.mark", () =>
                        ctx.slots.register(
                            { name: "sidebar.brand.mark", priority: -100 },
                            AgentWorkspaceBrandMark
                        )
                    );
                    ctx.slots.inject("sidebar.brand.name", () =>
                        ctx.slots.register(
                            { name: "sidebar.brand.name", priority: -100 },
                            AgentWorkspaceBrandName
                        )
                    );
                    // Hide only the Settings trigger. The DSH Settings service and
                    // its host-side enforcement remain mounted.
                    ctx.slots.inject("sidebar.settings", () =>
                        ctx.slots.register(
                            { name: "sidebar.settings", priority: -100 },
                            EmptySlot
                        )
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
