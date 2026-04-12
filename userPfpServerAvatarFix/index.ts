/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import userPfp from "@equicordplugins/userpfp";
import { Devs } from "@utils/constants";
import definePlugin, { StartAt } from "@utils/types";

export default definePlugin({
    name: "UserPFPServerAvatarFix",
    description: "Restores Nitro server avatars when UserPFP is enabled while keeping local custom UserPFP avatars.",
    authors: [Devs.Joona],
    dependencies: ["UserPFP"],

    startAt: StartAt.Init,

    originalGetAvatarServerHook: null as typeof userPfp.getAvatarServerHook | null,

    start() {
        if (this.originalGetAvatarServerHook) return;

        this.originalGetAvatarServerHook = userPfp.getAvatarServerHook;

        userPfp.getAvatarServerHook = (original: any) => {
            const userPfpHook = this.originalGetAvatarServerHook?.(original);

            return (config: any) => {
                const userId = config?.userId;
                const hasCustomAvatar = Boolean(userId && userPfp.data?.avatars?.[userId]);

                if (hasCustomAvatar && userPfpHook) {
                    return userPfpHook(config);
                }

                // Fall back to Discord's original server-avatar resolver to preserve Nitro per-server avatars.
                return original(config);
            };
        };
    },

    stop() {
        if (!this.originalGetAvatarServerHook) return;

        userPfp.getAvatarServerHook = this.originalGetAvatarServerHook;
        this.originalGetAvatarServerHook = null;
    }
});
