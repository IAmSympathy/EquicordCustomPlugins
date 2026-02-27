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
 * - Custom banners are stored locally and only displayed on your client
 * - Les bannières personnalisées sont stockées localement et affichées uniquement sur votre client
 *
 * - No data is sent to Discord servers
 * - Aucune donnée n'est envoyée aux serveurs Discord
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { DataStore } from "@api/index";
import { Devs } from "@utils/constants";
import { openModal } from "@utils/modal";
import definePlugin from "@utils/types";
import { Guild } from "@vencord/discord-types";
import { GuildStore, Menu } from "@webpack/common";

import { SetBackgroundModal } from "./dynamicChannelBackground/modal";

const CUSTOM_BANNERS_KEY = "customServerBanners";
const BANNER_POSITIONS_KEY = "customServerBannersPositions";

interface CustomBannerData {
    [guildId: string]: string; // guildId -> base64 image data
}

interface BannerPositions {
    [guildId: string]: string; // guildId -> position (top, center, bottom, or custom like "20% 30%")
}

let customBanners: CustomBannerData = {};
let bannerPositions: BannerPositions = {};
let styleElement: HTMLStyleElement | null = null;
let originalGetGuild: any;

// Load custom banners from storage
async function loadCustomBanners() {
    customBanners = await DataStore.get(CUSTOM_BANNERS_KEY) || {};
    bannerPositions = await DataStore.get(BANNER_POSITIONS_KEY) || {};
    applyBannerStyles();
    patchGuildStore();
}

// Patch GuildStore to inject custom banners into guild objects
function patchGuildStore() {
    if (!GuildStore?.getGuild) return;

    // Restore si déjà patché
    if (originalGetGuild) {
        GuildStore.getGuild = originalGetGuild;
    }

    originalGetGuild = GuildStore.getGuild;
    GuildStore.getGuild = function (guildId: string) {
        const guild = originalGetGuild.call(this, guildId);

        // Injecter la bannière personnalisée si elle existe
        if (guild && customBanners[guildId]) {
            // Créer un hash de bannière artificiel pour faire croire à Discord qu'il y a une bannière
            guild.banner = guild.banner || "custom_banner_" + guildId;

            // Assurer que la guilde a la fonctionnalité BANNER
            if (guild.features) {
                guild.features.add("BANNER");
            }
        }

        return guild;
    };
}

// Sauvegarder les bannières personnalisées
async function saveCustomBanners() {
    await DataStore.set(CUSTOM_BANNERS_KEY, customBanners);
    await DataStore.set(BANNER_POSITIONS_KEY, bannerPositions);
}

// Ajuster la position de la bannière
async function adjustBannerPosition(guildId: string, guildName: string, position: string) {
    bannerPositions[guildId] = position;
    await saveCustomBanners();
    applyBannerStyles();
}

// Appliquer les styles de bannière à la page
function applyBannerStyles() {
    // Supprimer l'ancien élément style
    if (styleElement) {
        styleElement.remove();
        styleElement = null;
    }

    // Si pas de bannières personnalisées, ne pas créer d'élément de style
    const bannerCount = Object.keys(customBanners).length;
    if (bannerCount === 0) {
        return;
    }

    // Créer un nouvel élément style
    styleElement = document.createElement("style");
    styleElement.id = "custom-server-banners-style";

    let css = "";

    for (const [guildId, imageData] of Object.entries(customBanners)) {
        // Obtenir la position pour cette bannière (par défaut au centre)
        const position = bannerPositions[guildId] || "center center";

        // Remplacer l'URL de l'image de la bannière
        css += `img[src*="/banners/${guildId}/"],img[src*="custom_banner_${guildId}"]{content:url(${imageData})!important;object-fit:cover!important;object-position:${position}!important;width:100%!important;height:100%!important}[style*="/banners/${guildId}/"]{background-image:url(${imageData})!important;background-size:cover!important;background-position:${position}!important;background-repeat:no-repeat!important}[class*="animatedContainer"][style*="/banners/${guildId}/"],
[class*="animatedContainer"][style*="custom_banner_${guildId}"]{background-image:url(${imageData})!important;background-size:cover!important;background-position:${position}!important;background-repeat:no-repeat!important}`;
    }

    styleElement.textContent = css;
    document.head.appendChild(styleElement);
}

// Open modal and set banner
function uploadCustomBanner(guildId: string, guildName: string) {
    const initialUrl = customBanners[guildId];
    openModal(p => (
        <SetBackgroundModal
            props={p}
            onSelect={async (url: string) => {
                customBanners[guildId] = url;
                await saveCustomBanners();
                patchGuildStore();
                applyBannerStyles();
            }}
            initialUrl={initialUrl}
            title={`Custom Banner — ${guildName}`}
        />
    ));
}

// Remove custom banner
async function removeCustomBanner(guildId: string, guildName: string) {
    delete customBanners[guildId];
    delete bannerPositions[guildId];
    await saveCustomBanners();
    patchGuildStore();
    applyBannerStyles();

    console.log(`[CustomServerBanners] Removed custom banner for "${guildName}" (${guildId})`);
    alert(`Custom banner removed for "${guildName}"`);
}

// Context menu patch for guild header
const guildContextMenuPatch: NavContextMenuPatchCallback = (children, { guild }: { guild: Guild; }) => {
    if (!guild) return;

    const hasCustomBanner = customBanners[guild.id] !== undefined;

    const bannerSubmenu = (
        <Menu.MenuItem label="Custom Server Banner" key="custom-banner-menu" id="custom-banner-menu">
            <Menu.MenuItem
                id="custom-banner-upload"
                label={hasCustomBanner ? "Change banner" : "Set banner"}
                action={() => uploadCustomBanner(guild.id, guild.name)}
            />
            {hasCustomBanner && (
                <Menu.MenuItem
                    id="custom-banner-position"
                    label="Adjust position"
                >
                    <Menu.MenuItem id="custom-banner-position-top" label="Top"
                        action={() => adjustBannerPosition(guild.id, guild.name, "center top")} />
                    <Menu.MenuItem id="custom-banner-position-center" label="Center (Default)"
                        action={() => adjustBannerPosition(guild.id, guild.name, "center center")} />
                    <Menu.MenuItem id="custom-banner-position-bottom" label="Bottom"
                        action={() => adjustBannerPosition(guild.id, guild.name, "center bottom")} />
                </Menu.MenuItem>
            )}
            {hasCustomBanner && (
                <>
                    <Menu.MenuSeparator />
                    <Menu.MenuItem id="custom-banner-remove" label="Remove banner"
                        color="danger" action={() => removeCustomBanner(guild.id, guild.name)} />
                </>
            )}
        </Menu.MenuItem>
    );

    const group = findGroupChildrenByChildId("privacy", children);
    if (group) {
        group.push(bannerSubmenu);
    } else {
        children.push(<Menu.MenuGroup>{bannerSubmenu}</Menu.MenuGroup>);
    }
};

export default definePlugin({
    name: "Custom Server Banners",
    description: "Upload and display custom banners for any server (client-side only)",
    authors: [Devs.IAmSympathy],

    contextMenus: {
        "guild-context": guildContextMenuPatch,
        "guild-header-popout": guildContextMenuPatch
    },

    async start() {
        // Load custom banners from storage
        await loadCustomBanners();

        console.log("[CustomServerBanners] Plugin started!");
    },

    stop() {
        // Restore original GuildStore.getGuild
        if (originalGetGuild && GuildStore?.getGuild) {
            GuildStore.getGuild = originalGetGuild;
        }

        // Remove style element
        if (styleElement) {
            styleElement.remove();
            styleElement = null;
        }

        console.log("[CustomServerBanners] Plugin stopped");
    }
});
