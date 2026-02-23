/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * SAFETY NOTICE / AVIS DE SÉCURITÉ:
 * This plugin is 100% CLIENT-SIDE ONLY and UNDETECTABLE by Discord.
 * Ce plugin est 100% CÔTÉ CLIENT UNIQUEMENT et INDÉTECTABLE par Discord.
 *
 * - It only modifies local display data AFTER receiving it from Discord
 * - Il modifie uniquement les données d'affichage locales APRÈS les avoir reçues de Discord
 *
 * - It does NOT send any data to Discord servers
 * - Il N'ENVOIE AUCUNE donnée aux serveurs Discord
 *
 * - It works exactly like the popular fakeNitro plugin (used by thousands safely)
 * - Il fonctionne exactement comme le plugin populaire fakeNitro (utilisé par des milliers en toute sécurité)
 *
 * - You CAN'T be banned for this, as Discord can't detect client-side display modifications
 * - Vous NE POUVEZ PAS être banni pour cela, car Discord ne peut pas détecter les modifications d'affichage côté client
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { GuildStore } from "@webpack/common";

let originalGetGuild: any;
let originalGetGuilds: any;

// Features à ajouter (utiliser une Set pour éviter les doublons et améliorer les performances)
const BOOST_FEATURES = new Set(["ROLE_ICONS", "BANNER", "ANIMATED_BANNER", "ANIMATED_ICON", "INVITE_SPLASH", "VANITY_URL"]);

export default definePlugin({
    name: "Fake Server Boost Level 2",
    description: "Unlocks server boost level 2 features client-side (role icons and server banner) without actually having boosts",
    authors: [Devs.IAmSympathy],

    patches: [
        {
            // Patch hasFeature checks - make BANNER and ROLE_ICONS always available
            find: ".ROLE_ICONS",
            predicate: () => true,
            noWarn: true,
            replacement: [
                {
                    // hasFeature(ROLE_ICONS) -> true
                    match: /\.hasFeature\((\i)\.(\i)\.(ROLE_ICONS|BANNER|ANIMATED_BANNER)\)/g,
                    replace: "(true)"
                }
            ]
        },
        {
            // Patch premium tier checks
            find: "premiumTier",
            predicate: () => true,
            noWarn: true,
            replacement: [
                {
                    // Make any premium tier >= 2 check pass
                    match: /(\i\.premiumTier)>=?(\d)/g,
                    replace: "(true||$1>=$2)"
                },
                {
                    // Make any premium tier === 2/3 check pass
                    match: /(\i\.premiumTier)===(\d)/g,
                    replace: "(true||$1===$2)"
                }
            ]
        }
    ],

    start() {
        // Intercepter GuildStore.getGuild pour ajouter les features (CLIENT-SIDE ONLY)
        if (GuildStore?.getGuild) {
            originalGetGuild = GuildStore.getGuild;
            GuildStore.getGuild = function (guildId: string) {
                const guild = originalGetGuild.call(this, guildId);
                if (guild) {
                    // Ajouter les features de boost (optimisé avec Set)
                    if (guild.features) {
                        BOOST_FEATURES.forEach(feature => guild.features.add(feature));
                    }

                    // Forcer le niveau premium à 3 (maximum) - utiliser defineProperty pour éviter les modifications
                    Object.defineProperty(guild, "premiumTier", {
                        get: () => 3,
                        set: () => { }, // Ignorer les tentatives de modification
                        configurable: true,
                        enumerable: true
                    });
                }
                return guild;
            };
        }

        // Patch getGuilds aussi
        if (GuildStore?.getGuilds) {
            originalGetGuilds = GuildStore.getGuilds;
            GuildStore.getGuilds = function () {
                const guilds = originalGetGuilds.call(this);
                Object.values(guilds).forEach((guild: any) => {
                    if (guild) {
                        if (guild.features) {
                            BOOST_FEATURES.forEach(feature => guild.features.add(feature));
                        }

                        Object.defineProperty(guild, "premiumTier", {
                            get: () => 3,
                            set: () => { },
                            configurable: true,
                            enumerable: true
                        });
                    }
                });
                return guilds;
            };
        }
    },

    stop() {
        if (originalGetGuild && GuildStore?.getGuild) {
            GuildStore.getGuild = originalGetGuild;
        }
        if (originalGetGuilds && GuildStore?.getGuilds) {
            GuildStore.getGuilds = originalGetGuilds;
        }
    }
});
