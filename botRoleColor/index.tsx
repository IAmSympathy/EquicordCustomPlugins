/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { findByProps } from "@webpack";
import { FluxDispatcher, GuildStore, SelectedGuildStore } from "@webpack/common";
import backgroundImageB64 from "file://./assets/background.png?base64";
import bannerB64 from "file://./assets/banner.png?base64";
import bgFrostpostB64 from "file://./assets/BGs/Channels/Frostpost.jpg?base64";
import bgKronorB64 from "file://./assets/BGs/Channels/Kronor.jpg?base64";
import bgLandofTheDamnedB64 from "file://./assets/BGs/Channels/LandofTheDamned.jpg?base64";
import bgMentalInstitutionB64 from "file://./assets/BGs/Channels/MentalInstitution.jpg?base64";
import bgNetricsaB64 from "file://./assets/BGs/Channels/Netricsa.png?base64";
import bgOilRigB64 from "file://./assets/BGs/Channels/OilRig.jpg?base64";
import bgSaratogaB64 from "file://./assets/BGs/Channels/Saratoga.png?base64";
import bgSiberiaB64 from "file://./assets/BGs/Channels/Siberia.jpg?base64";
import bgSiriusB64 from "file://./assets/BGs/Channels/Sirius.jpg?base64";
import bgSSSCenterpriceB64 from "file://./assets/BGs/Channels/SSSCenterprice.jpg?base64";
import bgCountrysideB64 from "file://./assets/BGs/Channels/Countryside.jpg?base64";
import bgGiantJunkyardB64 from "file://./assets/BGs/Channels/GiantJunkyard.jpg?base64";
import bgNexaB64 from "file://./assets/BGs/Channels/Nexa.png?base64";
import bgSierraDeChiapasB64 from "file://./assets/BGs/Channels/SierraDeChiapas.jpg?base64";
import bgTNSSSMPB64 from "file://./assets/BGs/Channels/TNSS-SMP2.png?base64";
import bgTNSSSMPBridgeB64 from "file://./assets/BGs/Channels/TNSS-SMP2-bridge.png?base64";
import bgTNSSLB64 from "file://./assets/BGs/Servers/TNSSL-Spring.jpg?base64";
import bgTreetopsB64 from "file://./assets/BGs/Channels/Treetops.jpg?base64";
import crystalGemB64 from "file://./assets/crystal-gem.webp?base64";

import {
    registerHardcodedChannelBgs,
    registerHardcodedGuildBgs,
    unregisterHardcodedChannelBgs,
    unregisterHardcodedGuildBgs,
} from "../dynamicChannelBackground/store";
import {
    CustomEffect,
    normalizeColor,
    registerCustomEffect,
    registerHardcodedRoleColors,
    RoleColorData,
    unregisterCustomEffect,
    unregisterHardcodedRoleColors,
} from "../fakeServerBoost";

const BACKGROUND_DATA_URL = backgroundImageB64 ? `data:image/png;base64,${backgroundImageB64}` : "";

// Bannière hardcodée pour le serveur The Not So Serious Lands (image locale)
const HARDCODED_GUILD_ID = "827364829567647774";
const BANNER_DATA_URL = bannerB64 ? `data:image/png;base64,${bannerB64}` : "";
let bannerStyleElement: HTMLStyleElement | null = null;
let bgStyleElement: HTMLStyleElement | null = null;
let originalGetGuild: any;
let originalGetGuilds: any;

// Cache des fonds de serveur enregistrés dynamiquement (guildId → url)
let registeredGuildBanners: Record<string, string> = {};

// Élément de style pour masquer les tags (bot / serveur) dans le serveur cible
let hideTagsStyleElement: HTMLStyleElement | null = null;
const HIDE_TAGS_BODY_CLASS = "notSoSeriousCord-in-target-guild";

/** Met à jour la classe body selon si on est dans le serveur cible. */
function updateHideTagsGuildClass() {
    try {
        const currentGuildId = SelectedGuildStore?.getGuildId?.() ?? null;
        console.log("[botRoleColor] updateHideTagsGuildClass - current guild:", currentGuildId, "target:", HARDCODED_GUILD_ID);
        if (currentGuildId === HARDCODED_GUILD_ID) {
            document.body.classList.add(HIDE_TAGS_BODY_CLASS);
            console.log("[botRoleColor] Added class:", HIDE_TAGS_BODY_CLASS);
        } else {
            document.body.classList.remove(HIDE_TAGS_BODY_CLASS);
            console.log("[botRoleColor] Removed class:", HIDE_TAGS_BODY_CLASS);
        }
    } catch (e) {
        console.error("[botRoleColor] Error in updateHideTagsGuildClass:", e);
        document.body.classList.remove(HIDE_TAGS_BODY_CLASS);
    }
}

function updateHideTagsStyle() {
    const { hideBotTagInGuild, hideServerTagInGuild, hideBoostIconInGuild } = settings.store;
    if (!hideBotTagInGuild && !hideServerTagInGuild && !hideBoostIconInGuild) {
        hideTagsStyleElement?.remove();
        hideTagsStyleElement = null;
        return;
    }
    if (!hideTagsStyleElement) {
        hideTagsStyleElement = document.createElement("style");
        hideTagsStyleElement.id = "notSoSeriousCord-hide-tags";
        document.head.appendChild(hideTagsStyleElement);
    }
    let css = "";
    if (hideBotTagInGuild) {
        // Masque le tag « APP » uniquement dans le serveur TNSSL
        css += `
/* Cache le tag APP (bot) dans le serveur TNSSL uniquement */
body.${HIDE_TAGS_BODY_CLASS} span[class*="headerText"] span[class*="botTag"],
body.${HIDE_TAGS_BODY_CLASS} span[class*="nameContainer"] span[class*="botTag"],
body.${HIDE_TAGS_BODY_CLASS} div[class*="member__"] span[class*="botTag"] {
    display: none !important;
}
`;
    }
    if (hideServerTagInGuild) {
        // Masque les tags de serveur uniquement dans le serveur TNSSL
        css += `
/* Cache le tag de serveur dans le serveur TNSSL uniquement */
body.${HIDE_TAGS_BODY_CLASS} span[class*="headerText"] [class*="clanTag"],
body.${HIDE_TAGS_BODY_CLASS} span[class*="headerText"] [class*="serverTag"],
body.${HIDE_TAGS_BODY_CLASS} span[class*="headerText"] [class*="memberNick"] ~ [class*="clanTag"],
body.${HIDE_TAGS_BODY_CLASS} div[class*="member__"] [class*="clanTag"],
body.${HIDE_TAGS_BODY_CLASS} div[class*="member__"] [class*="serverTag"],
body.${HIDE_TAGS_BODY_CLASS} [class*="chipletParent"],
body.${HIDE_TAGS_BODY_CLASS} [class*="chipletContainer"]:has([src *="/clan-badges/"]),
body.${HIDE_TAGS_BODY_CLASS} span[class*="clanTag"] {
    display: none !important;
}
`;
    }
    if (hideBoostIconInGuild) {
        // Masque l'icône de booster (diamant rose) dans la liste des membres uniquement dans le serveur TNSSL
        css += `
/* Cache l'icône de booster dans la liste des membres dans le serveur TNSSL uniquement */
body.${HIDE_TAGS_BODY_CLASS} svg[class*="premiumIcon"],
body.${HIDE_TAGS_BODY_CLASS} [class*="nameAndDecorators"] span:has(svg[class*="premiumIcon"]) {
    display: none !important;
}
`;
    }
    hideTagsStyleElement.textContent = css;
}

function removeHideTagsStyle() {
    hideTagsStyleElement?.remove();
    hideTagsStyleElement = null;
    document.body.classList.remove(HIDE_TAGS_BODY_CLASS);
}

// roleId → données de couleur à injecter
const HARDCODED_ROLE_COLORS: Record<string, RoleColorData> = {
    // Ugh-Zan
    "829521404214640671": {
        colorStrings: { primaryColor: "#de5313", secondaryColor: "#aa3701", tertiaryColor: undefined },
        colors: { primary_color: 14570259, secondary_color: 11155201, tertiary_color: undefined },
        displayNameStyles: null,
    },
    // Simp (booster)
    "883205136300802060": {
        colorStrings: { primaryColor: "#ff5dd6", secondaryColor: "#ff9cbf", tertiaryColor: undefined },
        colors: { primary_color: 16735702, secondary_color: 16751807, tertiary_color: undefined },
        displayNameStyles: null,
    },
    // Tah-Um
    "1122751212299767929": {
        colorStrings: { primaryColor: "#c51d22", secondaryColor: "#9c151a", tertiaryColor: undefined },
        colors: { primary_color: 12918050, secondary_color: 10229018, tertiary_color: undefined },
        displayNameStyles: null,
    },
    // Happy Birthday 🥳
    "1351232387111194725": {
        colorStrings: { primaryColor: "#ff0095", secondaryColor: "#b40069", tertiaryColor: undefined },
        colors: { primary_color: 16711829, secondary_color: 11796585, tertiary_color: undefined },
        displayNameStyles: null,
    },
    // Netricsa (bot)
    "1462959644195684528": {
        colorStrings: { primaryColor: "#2494db", secondaryColor: "#247d90", tertiaryColor: undefined },
        colors: { primary_color: 2397403, secondary_color: 2391440, tertiary_color: undefined },
        displayNameStyles: null,
    },
    // Golden
    "1469592407149514814": {
        colorStrings: { primaryColor: "#bf9b30", secondaryColor: "#f7d774", tertiaryColor: undefined },
        colors: { primary_color: 12557104, secondary_color: 16242548, tertiary_color: undefined },
        displayNameStyles: null,
    },
    // Silver
    "1469593432233087008": {
        colorStrings: { primaryColor: "#c0c0c0", secondaryColor: "#f2f2f2", tertiaryColor: undefined },
        colors: { primary_color: 12632256, secondary_color: 15921906, tertiary_color: undefined },
        displayNameStyles: null,
    },
    // Bronze
    "1469593737741992049": {
        colorStrings: { primaryColor: "#a05822", secondaryColor: "#d08a4a", tertiaryColor: undefined },
        colors: { primary_color: 10508322, secondary_color: 13666890, tertiary_color: undefined },
        displayNameStyles: null,
    },
    // Celestial
    "1469594382834602097": {
        colorStrings: { primaryColor: "#a855f7", secondaryColor: "#7c3aed", tertiaryColor: undefined },
        colors: { primary_color: 11033079, secondary_color: 8137453, tertiary_color: undefined },
        displayNameStyles: null,
    },
    // Klodovik (bot)
    "1473430517864075478": {
        colorStrings: { primaryColor: "#56fd0d", secondaryColor: "#f1ee27", tertiaryColor: undefined },
        colors: { primary_color: 5700877, secondary_color: 15855143, tertiary_color: undefined },
        displayNameStyles: null,
    },
    // Nexa 🎵 (bot)
    "1475717569200783382": {
        colorStrings: { primaryColor: "#dbd1a0", secondaryColor: "#A8975F", tertiaryColor: undefined },
        colors: { primary_color: 10822875, secondary_color: 5842064, tertiary_color: undefined },
        displayNameStyles: null,
    },
    // Milton (bot)
    "1482107544980815922": {
        colorStrings: { primaryColor: "#a524db", secondaryColor: "#592490", tertiaryColor: undefined },
        colors: { primary_color: 10822875, secondary_color: 5842064, tertiary_color: undefined },
        displayNameStyles: null,
    },
    // Game Notifications
    "1158221380622487552": {
        colorStrings: { primaryColor: "#2494db", secondaryColor: "#247d90", tertiaryColor: undefined },
        colors: { primary_color: 2397403, secondary_color: 2391440, tertiary_color: undefined },
        displayNameStyles: null,
    },
    // Products Notifications
    "1475892428304290006": {
        colorStrings: { primaryColor: "#2494db", secondaryColor: "#247d90", tertiaryColor: undefined },
        colors: { primary_color: 2397403, secondary_color: 2391440, tertiary_color: undefined },
        displayNameStyles: null,
    },
    // NPC
    "829528687358509116": {
        colorStrings: { primaryColor: "#00e7fe", secondaryColor: "#87f5ff", tertiaryColor: undefined },
        colors: { primary_color: 2397403, secondary_color: 2391440, tertiary_color: undefined },
        displayNameStyles: null,
    },
};

const settings = definePluginSettings({
    colorIntensity: {
        type: OptionType.SLIDER,
        description:
            "Color intensity for bot message text (0% = default text color, 100% = full role color)",
        default: 20,
        markers: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
        stickToMarkers: false,
        onChange: () => {
            resetAllBotColors();
            applyBotRoleColor();
        },
    },
    enableGlow: {
        type: OptionType.BOOLEAN,
        description: "Enable glow effect for Netricsa bot messages",
        default: true,
        onChange: () => {
            resetAllBotColors();
            applyBotRoleColor();
        },
    },
    glowIntensity: {
        type: OptionType.SLIDER,
        description: "Intensity of the glow effect (0-10)",
        default: 0.5,
        markers: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        stickToMarkers: false,
        onChange: () => {
            resetAllBotColors();
            applyBotRoleColor();
        },
    },
    hideBotTagInGuild: {
        type: OptionType.BOOLEAN,
        description: "Masquer le tag « APP » (bot) à côté des noms d'utilisateur dans ce serveur",
        default: true,
        onChange: () => updateHideTagsStyle(),
    },
    hideServerTagInGuild: {
        type: OptionType.BOOLEAN,
        description: "Masquer le tag de serveur personnalisé à côté des noms d'utilisateur dans ce serveur",
        default: true,
        onChange: () => updateHideTagsStyle(),
    },
    hideBoostIconInGuild: {
        type: OptionType.BOOLEAN,
        description: "Masquer l'icône de booster (💎) dans la liste des membres de ce serveur",
        default: true,
        onChange: () => updateHideTagsStyle(),
    },
});

// ── Bannières dynamiques (tous les serveurs avec bannière) ────────────────────

/** Construit l'URL CDN de la bannière d'un serveur. */
function getGuildBannerUrl(guildId: string, banner: string): string {
    const ext = banner.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/banners/${guildId}/${banner}.${ext}?size=512`;
}

/** Parcourt tous les serveurs connus et enregistre leur bannière dans DynBgStore. */
function registerAllGuildBanners() {
    if (!GuildStore?.getGuilds) return;
    const guilds = GuildStore.getGuilds();
    const toRegister: Record<string, string> = {};

    for (const [guildId, guild] of Object.entries(guilds) as [string, any][]) {
        // Ignorer les serveurs avec un fond de sidebar hardcodé dans GUILD_BGS
        if (GUILD_BGS[guildId]) continue;
        if (guild?.banner) {
            toRegister[guildId] = getGuildBannerUrl(guildId, guild.banner);
        }
    }

    // Désenregistrer les anciennes entrées qui ne sont plus valides
    const oldKeys = Object.keys(registeredGuildBanners);
    const newKeys = Object.keys(toRegister);
    const toRemove: Record<string, string> = {};
    for (const k of oldKeys) {
        if (!newKeys.includes(k)) toRemove[k] = registeredGuildBanners[k];
    }
    if (Object.keys(toRemove).length > 0) unregisterHardcodedGuildBgs(toRemove);

    registeredGuildBanners = toRegister;
    if (Object.keys(toRegister).length > 0) registerHardcodedGuildBgs(toRegister);
}

function applyHardcodedBanner() {
    // Appliquer le fond d'embed (image locale Netricsa)
    if (BACKGROUND_DATA_URL && !bgStyleElement) {
        bgStyleElement = document.createElement("style");
        bgStyleElement.id = "notSoSeriousCord-netricsa-bg";
        bgStyleElement.textContent = `
article[class*="embed"][data-vc-embed-applied] {
    background-image: url("${BACKGROUND_DATA_URL}") !important;
    background-size: cover !important;
    background-position: center center !important;
    background-repeat: no-repeat !important;
    will-change: contents;
}
[class*="isComponentsV2"][data-vc-comp-v2-applied] [class*="withAccentColor"],
[class*="isComponentsV2"][data-vc-comp-v2-applied]:not(:has([class*="withAccentColor"])) {
    background-image: url("${BACKGROUND_DATA_URL}") !important;
    background-size: cover !important;
    background-position: center center !important;
    background-repeat: no-repeat !important;
    will-change: contents;
}
`;
        document.head.appendChild(bgStyleElement);
    }

    // Bannière locale hardcodée pour TNSSL (remplace l'image CDN)
    if (BANNER_DATA_URL) {
        if (bannerStyleElement) bannerStyleElement.remove();
        bannerStyleElement = document.createElement("style");
        bannerStyleElement.id = "notSoSeriousCord-hardcoded-banner";
        bannerStyleElement.textContent = `
        img[src*="/banners/${HARDCODED_GUILD_ID}/"],
        img[src*="custom_banner_${HARDCODED_GUILD_ID}"] {
            content: url(${BANNER_DATA_URL}) !important;
            object-fit: cover !important;
            object-position: center center !important;
            width: 100% !important;
            height: 100% !important;
        }
        [style*="/banners/${HARDCODED_GUILD_ID}/"] {
            background-image: url(${BANNER_DATA_URL}) !important;
            background-size: cover !important;
            background-position: center center !important;
            background-repeat: no-repeat !important;
        }
    `;
        document.head.appendChild(bannerStyleElement);
    }

    // Enregistrer les bannières de tous les serveurs
    registerAllGuildBanners();
}

function removeHardcodedBanner() {
    bannerStyleElement?.remove();
    bannerStyleElement = null;
    bgStyleElement?.remove();
    bgStyleElement = null;
    if (Object.keys(registeredGuildBanners).length > 0) {
        unregisterHardcodedGuildBgs(registeredGuildBanners);
        registeredGuildBanners = {};
    }
    if (originalGetGuild && GuildStore?.getGuild) { GuildStore.getGuild = originalGetGuild; originalGetGuild = null; }
    if (originalGetGuilds && GuildStore?.getGuilds) { GuildStore.getGuilds = originalGetGuilds; originalGetGuilds = null; }
}

function patchGuildStoreForBanner() {
    // Uniquement pour TNSSL qui utilise une image locale
    if (!BANNER_DATA_URL) return;
    if (GuildStore?.getGuild) {
        originalGetGuild = GuildStore.getGuild;
        GuildStore.getGuild = function (guildId: string) {
            const guild = originalGetGuild.call(this, guildId);
            if (guild && guildId === HARDCODED_GUILD_ID) {
                guild.banner = guild.banner || "custom_banner_" + guildId;
                guild.features?.add("BANNER");
            }
            return guild;
        };
    }
    if (GuildStore?.getGuilds) {
        originalGetGuilds = GuildStore.getGuilds;
        GuildStore.getGuilds = function () {
            const guilds = originalGetGuilds.call(this);
            const target = guilds[HARDCODED_GUILD_ID];
            if (target) {
                target.banner = target.banner || "custom_banner_" + HARDCODED_GUILD_ID;
                target.features?.add("BANNER");
            }
            return guilds;
        };
    }
}

// ── Couleurs des messages de bots ─────────────────────────────────────────────

const BOT_COLORS: Record<string, string> = {
    "1462959115528835092": "#1f9ccd", // Netricsa
    "1473424972046270608": "#56fd0d", // Klodovik
};
const BOTS_WITH_GLOW = new Set(["1462959115528835092"]);

let MessageStore: any = null;
let isApplying = false;

function hexToRgb(hex: string): [number, number, number] | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : null;
}

function interpolateColor(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number, ratio: number): [number, number, number] {
    return [Math.round(r1 + (r2 - r1) * ratio), Math.round(g1 + (g2 - g1) * ratio), Math.round(b1 + (b2 - b1) * ratio)];
}

function isMentionElement(el: Element | null): boolean {
    let node: Element | null = el;
    for (let i = 0; i < 8 && node; i++) {
        if (node.classList.contains("mention") || node.classList.contains("interactive") || node.classList.contains("wrapper_f61d60") || (node.getAttribute("role") === "button" && node.classList.contains("interactive"))) return true;
        for (const cls of Array.from(node.classList)) {
            if (cls.startsWith("roleMention") || cls.startsWith("userMention")) return true;
        }
        node = node.parentElement;
    }
    return false;
}

function applyGlow(el: HTMLElement, intensity: number): void {
    if (!settings.store.enableGlow) return;
    const r = intensity * 2;
    el.style.textShadow = `0 0 ${r}px white, 0 0 ${r * 1.5}px white`;
}

function hasDirectTextContent(el: HTMLElement): boolean {
    for (const child of Array.from(el.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE && child.textContent && child.textContent.trim().length > 0) return true;
    }
    return false;
}

function colorizeNode(node: Node, r: number, g: number, b: number, glow: boolean, glowIntensity: number): void {
    if (node.nodeType === Node.TEXT_NODE) {
        const parent = node.parentElement;
        if (parent && !isMentionElement(parent) && !parent.dataset.vcColored) {
            parent.style.color = `rgb(${r}, ${g}, ${b})`;
            if (glow && !isMentionElement(parent)) applyGlow(parent, glowIntensity);
            parent.dataset.vcColored = "1";
        }
        return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (isMentionElement(el)) return;
    if (el.tagName === "A") return;
    if (!el.dataset.vcColored) {
        el.style.color = `rgb(${r}, ${g}, ${b})`;
        if (glow && hasDirectTextContent(el) && !isMentionElement(el)) applyGlow(el, glowIntensity);
        el.dataset.vcColored = "1";
    }
    for (const child of Array.from(el.childNodes)) colorizeNode(child, r, g, b, glow, glowIntensity);
}

function parseMessageId(wrapperId: string): { channelId: string; messageId: string; } | null {
    const normalized = wrapperId.includes("___") ? wrapperId.split("___").pop()! : wrapperId;
    const match = normalized.match(/^chat-messages-(\d+)-(\d+)$/);
    if (!match) return null;
    return { channelId: match[1], messageId: match[2] };
}

function getMessageAuthorId(wrapperId: string): string | null {
    if (!MessageStore) return null;
    const parsed = parseMessageId(wrapperId);
    if (!parsed) return null;
    try { return MessageStore.getMessage?.(parsed.channelId, parsed.messageId)?.author?.id ?? null; } catch { return null; }
}

function applyBotRoleColor() {
    document.querySelectorAll('[class*="cozy"][class*="wrapper"]').forEach((messageWrapper: Element) => {
        const header = messageWrapper.querySelector('[class*="header"]');
        const botTag = header?.querySelector('[class*="botTag"]');
        const wrapperId = (messageWrapper as HTMLElement).id ?? "";

        let userId: string | null = getMessageAuthorId(wrapperId);
        if (!userId) {
            const match = messageWrapper.querySelector('img[class*="avatar"]')?.getAttribute("src")?.match(/\/avatars\/(\d+)\//);
            if (match) userId = match[1];
        }
        if (!userId || !BOT_COLORS[userId]) return;

        if (!botTag) {
            if (!MessageStore) return;
            const parsed = parseMessageId(wrapperId);
            if (!parsed) return;
            try {
                const msg = MessageStore.getMessage?.(parsed.channelId, parsed.messageId);
                if (!msg || !msg.author?.bot) return;
            } catch { return; }
        }

        const username = header?.querySelector('[class*="username"]') as HTMLElement | null;
        const messageContent = messageWrapper.querySelector('[class*="messageContent"]:not([class*="repliedTextContent"])') as HTMLElement | null;
        if (!messageContent || messageContent.dataset.vcMsgApplied) return;

        const rgb = hexToRgb(BOT_COLORS[userId]);
        if (!rgb) return;

        const [roleR, roleG, roleB] = rgb;
        const shouldGlow = BOTS_WITH_GLOW.has(userId);
        const intensity = settings.store.colorIntensity / 100;
        const { glowIntensity } = settings.store;
        const [newR, newG, newB] = interpolateColor(220, 221, 222, roleR, roleG, roleB, intensity);

        if (username && !username.dataset.originalColor) {
            username.dataset.originalColor = username.style.color || "";
            username.style.color = `rgb(${roleR}, ${roleG}, ${roleB})`;
        }

        messageContent.dataset.vcMsgApplied = "1";
        for (const child of Array.from(messageContent.childNodes)) colorizeNode(child, newR, newG, newB, false, 0);

        messageWrapper.querySelectorAll('article[class*="embed"]').forEach((embedEl: Element) => {
            const embed = embedEl as HTMLElement;
            if (embed.dataset.vcEmbedApplied) return;
            for (const child of Array.from(embed.childNodes)) colorizeNode(child, newR, newG, newB, shouldGlow, glowIntensity);
            embed.dataset.vcEmbedApplied = "1";
        });

        messageWrapper.querySelectorAll('[class*="isComponentsV2"]').forEach((compV2El: Element) => {
            const compV2 = compV2El as HTMLElement;
            if (compV2.dataset.vcCompV2Applied) return;
            for (const child of Array.from(compV2.childNodes)) colorizeNode(child, newR, newG, newB, shouldGlow, glowIntensity);
            compV2.dataset.vcCompV2Applied = "1";
        });
    });
    applyBotRoleColorToReplies();
    applyToOrphanEmbeds();
    applyToOrphanComponentsV2();
}

function applyToOrphanEmbeds() {
    document.querySelectorAll('article[class*="embed"]:not([data-vc-embed-applied])').forEach((embedEl: Element) => {
        const embed = embedEl as HTMLElement;
        const messageArticle = embed.closest('[role="article"]') as HTMLElement | null;
        if (!messageArticle || !messageArticle.querySelector('[class*="botTag"]')) return;

        let userId: string | null = null;
        if (MessageStore) {
            for (let node: Element | null = messageArticle; node && node !== document.body; node = node.parentElement) {
                const parsed = parseMessageId((node as HTMLElement).getAttribute("data-list-item-id") ?? (node as HTMLElement).id ?? "");
                if (parsed) {
                    try { const msg = MessageStore.getMessage?.(parsed.channelId, parsed.messageId); if (msg?.author) { userId = msg.author.id; break; } } catch { /* ignore */ }
                }
            }
        }
        if (!userId) {
            const match = messageArticle.querySelector('img[class*="avatar"]')?.getAttribute("src")?.match(/\/avatars\/(\d+)\//);
            if (match) userId = match[1];
        }
        if (!userId || !BOT_COLORS[userId]) return;

        const rgb = hexToRgb(BOT_COLORS[userId]);
        if (!rgb) return;
        const [roleR, roleG, roleB] = rgb;
        const shouldGlow = BOTS_WITH_GLOW.has(userId);
        const intensity = settings.store.colorIntensity / 100;
        const { glowIntensity } = settings.store;
        const [newR, newG, newB] = interpolateColor(220, 221, 222, roleR, roleG, roleB, intensity);
        for (const child of Array.from(embed.childNodes)) colorizeNode(child, newR, newG, newB, shouldGlow, glowIntensity);
        embed.dataset.vcEmbedApplied = "1";
    });
}

function applyToOrphanComponentsV2() {
    document.querySelectorAll('[class*="isComponentsV2"]:not([data-vc-comp-v2-applied])').forEach((compV2El: Element) => {
        const compV2 = compV2El as HTMLElement;
        const messageArticle = compV2.closest('[role="article"]') as HTMLElement | null;
        if (!messageArticle || !messageArticle.querySelector('[class*="botTag"]')) return;

        let userId: string | null = null;
        if (MessageStore) {
            for (let node: Element | null = messageArticle; node && node !== document.body; node = node.parentElement) {
                const parsed = parseMessageId((node as HTMLElement).getAttribute("data-list-item-id") ?? (node as HTMLElement).id ?? "");
                if (parsed) {
                    try { const msg = MessageStore.getMessage?.(parsed.channelId, parsed.messageId); if (msg?.author) { userId = msg.author.id; break; } } catch { /* ignore */ }
                }
            }
        }
        if (!userId) {
            const match = messageArticle.querySelector('img[class*="avatar"]')?.getAttribute("src")?.match(/\/avatars\/(\d+)\//);
            if (match) userId = match[1];
        }
        if (!userId || !BOT_COLORS[userId]) return;

        const rgb = hexToRgb(BOT_COLORS[userId]);
        if (!rgb) return;
        const [roleR, roleG, roleB] = rgb;
        const shouldGlow = BOTS_WITH_GLOW.has(userId);
        const intensity = settings.store.colorIntensity / 100;
        const { glowIntensity } = settings.store;
        const [newR, newG, newB] = interpolateColor(220, 221, 222, roleR, roleG, roleB, intensity);
        for (const child of Array.from(compV2.childNodes)) colorizeNode(child, newR, newG, newB, shouldGlow, glowIntensity);
        compV2.dataset.vcCompV2Applied = "1";
    });
}

function applyBotRoleColorToReplies() {
    document.querySelectorAll('[class*="repliedMessage"]').forEach((repliedWrapper: Element) => {
        const el = repliedWrapper as HTMLElement;
        if (el.dataset.vcReplyApplied || !repliedWrapper.querySelector('[class*="botTag"]')) return;

        const username = repliedWrapper.querySelector('[class*="username"]') as HTMLElement | null;
        const repliedText = repliedWrapper.querySelector('[class*="repliedTextContent"]') as HTMLElement | null;
        if (!username || !repliedText) return;

        const match = repliedWrapper.querySelector('img[class*="avatar"]')?.getAttribute("src")?.match(/\/avatars\/(\d+)\//);
        const userId = match?.[1];
        if (!userId || !BOT_COLORS[userId]) return;

        const rgb = hexToRgb(BOT_COLORS[userId]);
        if (!rgb) return;
        const [roleR, roleG, roleB] = rgb;
        const intensity = settings.store.colorIntensity / 100;
        const [newR, newG, newB] = interpolateColor(220, 221, 222, roleR, roleG, roleB, intensity);

        if (!username.dataset.originalColor) username.dataset.originalColor = username.style.color || "";
        username.style.color = `rgb(${roleR}, ${roleG}, ${roleB})`;
        repliedText.style.color = `rgb(${newR}, ${newG}, ${newB})`;
        el.dataset.vcReplyApplied = "1";
    });
}

function resetAllBotColors(): void {
    document.querySelectorAll("[data-vc-colored]").forEach((el: Element) => {
        const h = el as HTMLElement;
        h.style.color = "";
        h.style.textShadow = "";
        delete h.dataset.vcColored;
    });
    document.querySelectorAll("[data-vc-embed-applied]").forEach((el: Element) => {
        const embed = el as HTMLElement;
        delete embed.dataset.vcBgApplied;
        delete embed.dataset.vcEmbedApplied;
    });
    document.querySelectorAll("[data-vc-comp-v2-applied]").forEach((el: Element) => {
        delete (el as HTMLElement).dataset.vcCompV2Applied;
    });
    document.querySelectorAll("[data-vc-msg-applied]").forEach((el: Element) => { delete (el as HTMLElement).dataset.vcMsgApplied; });
    document.querySelectorAll("[data-vc-reply-applied]").forEach((el: Element) => { delete (el as HTMLElement).dataset.vcReplyApplied; });
    document.querySelectorAll("[data-original-color]").forEach((el: Element) => {
        const h = el as HTMLElement;
        h.style.color = h.dataset.originalColor || "";
        delete h.dataset.originalColor;
    });
}

// ══════════════════════════════════════════════════════════════════════════════
// Effets custom pour les rôles du serveur
// Chaque effet est enregistré dans fakeServerBoost via registerCustomEffect()
// ══════════════════════════════════════════════════════════════════════════════

const BIRTHDAY_PRIMARY_RGB = "rgb(255, 0, 149)"; // #ff0095
const NETRICSA_PRIMARY_RGB = "rgb(36, 148, 219)"; // #2494db

const GOLDEN_PRIMARY_RGB = "rgb(191, 155, 48)"; // #bf9b30
const SILVER_PRIMARY_RGB = "rgb(192, 192, 192)"; // #c0c0c0
const BRONZE_PRIMARY_RGB = "rgb(160, 88, 34)"; // #a05822
const CELESTIAL_PRIMARY_RGB = "rgb(168, 85, 247)"; // #a855f7
const CRYSTAL_PRIMARY_RGB = "rgb(255, 93, 214)"; // #ff5dd6

// ── 🎂 HAPPY BIRTHDAY ────────────────────────────────────────────────────────

function cleanBirthdayEl(el: HTMLElement) {
    el.querySelectorAll("[data-fsb-bday-star]").forEach(s => s.remove());
    delete el.dataset.fsbBirthday;
    delete el.dataset.fsbCustomAnim;
}

function applyBirthdayEffect() {
    // Appliquer les gradients aux mentions de rôle en premier
    applyGradientsToRoleMentions();

    // Nettoyage
    document.querySelectorAll<HTMLElement>("span[data-fsb-birthday]").forEach(el => {
        const c1 = el.style.getPropertyValue("--custom-gradient-color-1");
        if (!c1 || normalizeColor(c1) !== BIRTHDAY_PRIMARY_RGB) {
            cleanBirthdayEl(el);
            const headerText = el.closest<HTMLElement>("span[data-fsb-birthday-header]");
            if (headerText) {
                headerText.querySelectorAll("[data-fsb-bday-star]").forEach(s => s.remove());
                delete headerText.dataset.fsbBirthdayHeader;
                delete headerText.dataset.fsbCustomAnim;
            }
        }
    });
    document.querySelectorAll<HTMLElement>("span[data-fsb-birthday-header]").forEach(headerText => {
        const username = headerText.querySelector<HTMLElement>("span[data-fsb-birthday]");
        if (!username) {
            headerText.querySelectorAll("[data-fsb-bday-star]").forEach(s => s.remove());
            delete headerText.dataset.fsbBirthdayHeader;
            delete headerText.dataset.fsbCustomAnim;
        }
    });

    // 1. nameContainer
    document.querySelectorAll<HTMLElement>('span[class*="nameContainer"][data-fsb-gradient]:not([data-fsb-birthday])').forEach(el => {
        const c1 = el.style.getPropertyValue("--custom-gradient-color-1");
        if (normalizeColor(c1) !== BIRTHDAY_PRIMARY_RGB) return;
        el.dataset.fsbBirthday = "1";
        el.dataset.fsbCustomAnim = "1";
        const nameSpan = el.querySelector<HTMLElement>('span[class*="name__"]');
        if (nameSpan && !el.querySelector('[data-fsb-bday-star="l"]')) {
            const starL = document.createElement("span");
            starL.dataset.fsbBdayStar = "l";
            starL.textContent = "✨";
            starL.style.cssText = "font-size:11px;margin-right:3px;vertical-align:middle;";
            el.insertBefore(starL, nameSpan);
            const starR = document.createElement("span");
            starR.dataset.fsbBdayStar = "r";
            starR.textContent = "🎉";
            starR.style.cssText = "font-size:11px;margin-left:3px;vertical-align:middle;";
            el.appendChild(starR);
        }
    });

    // 2. username_ header
    document.querySelectorAll<HTMLElement>('span[class*="username_"][data-fsb-gradient]:not([data-fsb-birthday])').forEach(el => {
        const c1 = el.style.getPropertyValue("--custom-gradient-color-1");
        if (normalizeColor(c1) !== BIRTHDAY_PRIMARY_RGB) return;
        el.dataset.fsbBirthday = "1";
        el.dataset.fsbCustomAnim = "1";
        const headerText = el.closest<HTMLElement>('span[class*="headerText"]');
        if (headerText) {
            headerText.dataset.fsbBirthdayHeader = "1";
            headerText.dataset.fsbCustomAnim = "1";
        }
        if (headerText && !headerText.querySelector("[data-fsb-bday-star]")) {
            const usernameWrapper = (el.parentElement?.parentElement === headerText
                ? el.parentElement
                : el.parentElement === headerText
                    ? el
                    : null) ?? el;
            const starL = document.createElement("span");
            starL.dataset.fsbBdayStar = "l";
            starL.textContent = "✨";
            starL.style.cssText = "font-size:11px;vertical-align:middle;margin-right:2px;";
            headerText.insertBefore(starL, usernameWrapper);
            const starR = document.createElement("span");
            starR.dataset.fsbBdayStar = "r";
            starR.textContent = "🎉";
            starR.style.cssText = "font-size:11px;vertical-align:middle;margin-left:2px;";
            usernameWrapper.after(starR);
        }
    });

    // 3. Catégorie membres
    document.querySelectorAll<HTMLElement>('[aria-hidden="true"][data-fsb-cat-checked]:not([data-fsb-birthday])').forEach(ariaHidden => {
        const c1 = ariaHidden.style.getPropertyValue("--custom-gradient-color-1");
        if (normalizeColor(c1) !== BIRTHDAY_PRIMARY_RGB) return;
        ariaHidden.dataset.fsbBirthday = "1";
        ariaHidden.dataset.fsbCustomAnim = "1";
    });

    // 4. Voice chat
    document.querySelectorAll<HTMLElement>('div[class*="usernameContainer_"][data-fsb-voice-checked]').forEach(container => {
        const voiceContainer = container.parentElement;
        const gradDiv = container.querySelector<HTMLElement>("[data-fsb-gradient], [data-fsb-mention]");
        Array.from(container.querySelectorAll<HTMLElement>("[data-fsb-bday-star]"))
            .filter(s => s.parentElement !== gradDiv)
            .forEach(s => { s.remove(); delete container.dataset.fsbBirthday; delete container.dataset.fsbCustomAnim; });
        if (voiceContainer?.dataset.fsbVoiceContainer) {
            Array.from(voiceContainer.querySelectorAll<HTMLElement>("[data-fsb-bday-star]"))
                .filter(s => s.parentElement === voiceContainer)
                .forEach(s => { s.remove(); delete container.dataset.fsbBirthday; delete container.dataset.fsbCustomAnim; });
        }
        if (container.dataset.fsbBirthday && gradDiv && !gradDiv.querySelector("[data-fsb-bday-star]")) {
            delete container.dataset.fsbBirthday;
            delete container.dataset.fsbCustomAnim;
        }
        if (container.dataset.fsbBirthday) return;
        const c1 = gradDiv?.style.getPropertyValue("--custom-gradient-color-1")
            ?? container.style.getPropertyValue("--custom-gradient-color-1");
        if (!c1 || normalizeColor(c1) !== BIRTHDAY_PRIMARY_RGB) return;
        container.dataset.fsbBirthday = "1";
        container.dataset.fsbCustomAnim = "1";
        if (voiceContainer?.dataset.fsbVoiceContainer) {
            voiceContainer.dataset.fsbBirthdayVoice = "1";
            voiceContainer.dataset.fsbCustomAnim = "1";
        }
        if (gradDiv && !gradDiv.querySelector("[data-fsb-bday-star]")) {
            const textNode = gradDiv.querySelector("[data-fsb-mention-text]") ?? gradDiv.firstChild;
            const starL = document.createElement("span");
            starL.dataset.fsbBdayStar = "l";
            starL.textContent = "✨";
            starL.style.cssText = "font-size:10px;margin-right:2px;vertical-align:middle;";
            if (textNode) gradDiv.insertBefore(starL, textNode);
            else gradDiv.prepend(starL);
            const starR = document.createElement("span");
            starR.dataset.fsbBdayStar = "r";
            starR.textContent = "🎉";
            starR.style.cssText = "font-size:10px;margin-left:2px;vertical-align:middle;";
            const roleIcon = gradDiv.querySelector<HTMLElement>("[data-fsb-role-icon]");
            if (roleIcon) gradDiv.insertBefore(starR, roleIcon);
            else gradDiv.append(starR);
        }
    });
    // Mentions utilisateur et mentions de rôle avec couleur Birthday
    document.querySelectorAll<HTMLElement>("span[data-fsb-mention][data-fsb-gradient]:not([data-fsb-birthday])").forEach(mention => {
        const c1 = mention.style.getPropertyValue("--custom-gradient-color-1");
        if (!c1 || normalizeColor(c1) !== BIRTHDAY_PRIMARY_RGB) return;
        mention.dataset.fsbBirthday = "1"; mention.dataset.fsbCustomAnim = "1";
    });
}

function cleanupBirthdayEffect() {
    document.querySelectorAll<HTMLElement>("[data-fsb-birthday]").forEach(el => cleanBirthdayEl(el));
    document.querySelectorAll<HTMLElement>("[data-fsb-birthday-header]").forEach(el => {
        el.querySelectorAll("[data-fsb-bday-star]").forEach(s => s.remove());
        delete el.dataset.fsbBirthdayHeader;
        delete el.dataset.fsbCustomAnim;
    });
    document.querySelectorAll<HTMLElement>("[data-fsb-birthday-voice]").forEach(el => {
        delete el.dataset.fsbBirthdayVoice;
        delete el.dataset.fsbCustomAnim;
    });
}

const BIRTHDAY_CSS = `
    div[class*="member__"]:hover span[data-fsb-birthday] span[class*="name__"],
    li[class*="messageListItem"]:hover span[data-fsb-birthday] span[class*="name__"],
    div[role="article"]:hover span[data-fsb-birthday] span[class*="name__"],
    a:hover span[data-fsb-birthday] span[class*="name__"],
    span[data-fsb-birthday]:hover span[class*="name__"] {
        animation: fsb-bday-scroll 0.65s linear infinite !important;
        background-image: linear-gradient(to right, #ff0095, #ff66cc, #b40069, #ff66cc, #ff0095) !important;
        background-size: 300px auto !important;
    }
    @keyframes fsb-bday-scroll { from { background-position: 0 50%; } to { background-position: 300px 50%; } }
    div[role="article"]:hover span[class*="username_"][data-fsb-birthday],
    li[class*="messageListItem"]:hover span[class*="username_"][data-fsb-birthday] {
        animation: fsb-bday-scroll 0.65s linear infinite !important;
        background-image: linear-gradient(to right, #ff0095, #ff66cc, #b40069, #ff66cc, #ff0095) !important;
        background-size: 300px auto !important;
    }
    div[role="article"]:hover span[class*="headerText"][data-fsb-birthday-header],
    li[class*="messageListItem"]:hover span[class*="headerText"][data-fsb-birthday-header] {
        filter: drop-shadow(0 0 6px #ff0095) drop-shadow(0 0 2px #ff66cc) !important;
    }
    div[role="article"]:hover span[class*="headerText"][data-fsb-birthday-header] span[class*="botTag"],
    li[class*="messageListItem"]:hover span[class*="headerText"][data-fsb-birthday-header] span[class*="botTag"] { filter: none !important; }
    div[role="article"]:hover span[class*="username_"][data-fsb-birthday],
    li[class*="messageListItem"]:hover span[class*="username_"][data-fsb-birthday] { filter: none !important; }
    div[class*="member__"]:hover span[data-fsb-birthday] { filter: drop-shadow(0 0 6px #ff0095) drop-shadow(0 0 2px #ff66cc) !important; }
    div[class*="members_"]:hover div[data-fsb-birthday] span[data-fsb-gradient] {
        animation: fsb-bday-scroll 0.65s linear infinite !important;
        background-image: linear-gradient(to right, #ff0095, #ff66cc, #b40069, #ff66cc, #ff0095) !important;
        background-size: 300px auto !important;
    }
    div[class*="members_"]:hover div[data-fsb-birthday] { filter: drop-shadow(0 0 6px #ff0095) drop-shadow(0 0 2px #ff66cc) !important; }
    div[class*="usernameContainer_"][data-fsb-birthday] { overflow: visible !important; }
    div[class*="voiceUser"]:hover div[data-fsb-birthday] span[data-fsb-mention-text] {
        animation: fsb-bday-scroll 0.65s linear infinite !important;
        background-image: linear-gradient(to right, #ff0095, #ff66cc, #b40069, #ff66cc, #ff0095) !important;
        background-size: 300px auto !important;
    }
    div[class*="voiceUser"]:hover [data-fsb-voice-container][data-fsb-birthday-voice] {
        filter: drop-shadow(0 0 6px #ff0095) drop-shadow(0 0 2px #ff66cc) !important;
    }
    [data-fsb-bday-star] {
        display: inline-block !important; font-style: normal !important; pointer-events: none !important;
        position: relative !important; -webkit-text-fill-color: currentcolor !important;
        color: white !important; opacity: 1 !important; visibility: visible !important;
        background-clip: unset !important; -webkit-background-clip: unset !important; background-image: none !important;
    }
    div[class*="member__"]:hover [data-fsb-bday-star], div[role="article"]:hover [data-fsb-bday-star],
    li[class*="messageListItem"]:hover [data-fsb-bday-star],
    div[class*="voiceUser"]:hover [data-fsb-voice-container] [data-fsb-bday-star],
    div[class*="voiceUser"]:hover [data-fsb-bday-star] { animation: fsb-bday-star-pop 1.3s ease-in-out infinite alternate; }
    [data-fsb-bday-star="l"] { animation-delay: 0s; }
    [data-fsb-bday-star="r"] { animation-delay: 0.55s; }
    @keyframes fsb-bday-star-pop {
        from { opacity: 1; transform: scale(1.15) rotate(-15deg); }
        to   { opacity: 1; transform: scale(0.85) rotate(15deg); }
    }
    /* Mentions utilisateur et mentions de rôle avec Birthday - Hover du message */
    span[data-fsb-mention][data-fsb-birthday][data-fsb-hover-anim] span[data-fsb-mention-text] {
        animation: fsb-bday-scroll 0.65s linear infinite !important;
        background-image: linear-gradient(to right, #ff0095, #ff66cc, #b40069, #ff66cc, #ff0095) !important;
        background-size: 300px auto !important;
        filter: drop-shadow(0 0 3px #ff0095) drop-shadow(0 0 1px #ff66cc);
    }
    span[data-fsb-mention][data-fsb-birthday][data-fsb-hover-anim] img[data-fsb-role-icon-wrapped],
    span[data-fsb-mention][data-fsb-birthday][data-fsb-hover-anim] img.vc-mentionAvatars-role-icon {
        animation: fsb-bday-star-pop 1.3s ease-in-out infinite alternate !important;
    }
    span[data-fsb-mention][data-fsb-birthday][data-fsb-hover-anim] .vc-mentionAvatars-container {
        filter: drop-shadow(0 0 3px #ff0095) drop-shadow(0 0 1px #ff66cc) !important;
    }
    span[data-fsb-mention][data-fsb-birthday][data-fsb-hover-anim]:not(:has(.vc-mentionAvatars-container)) {
        filter: drop-shadow(0 0 3px #ff0095) drop-shadow(0 0 1px #ff66cc) !important;
    }
    /* Mentions Birthday - Hover direct sur la mention */
    span[data-fsb-mention][data-fsb-birthday]:hover span[data-fsb-mention-text] {
        animation: fsb-bday-scroll 0.65s linear infinite !important;
        background-image: linear-gradient(to right, #ff0095, #ff66cc, #b40069, #ff66cc, #ff0095) !important;
        background-size: 300px auto !important;
        filter: drop-shadow(0 0 3px #ff0095) drop-shadow(0 0 1px #ff66cc);
    }
    span[data-fsb-mention][data-fsb-birthday]:hover img[data-fsb-role-icon-wrapped],
    span[data-fsb-mention][data-fsb-birthday]:hover img.vc-mentionAvatars-role-icon {
        animation: fsb-bday-star-pop 1.3s ease-in-out infinite alternate !important;
    }
    span[data-fsb-mention][data-fsb-birthday]:hover .vc-mentionAvatars-container {
        filter: drop-shadow(0 0 3px #ff0095) drop-shadow(0 0 1px #ff66cc) !important;
    }
    span[data-fsb-mention][data-fsb-birthday]:hover:not(:has(.vc-mentionAvatars-container)) {
        filter: drop-shadow(0 0 3px #ff0095) drop-shadow(0 0 1px #ff66cc) !important;
    }
`;

// ── 🧠 NETRICSA ───────────────────────────────────────────────────────────────

function applyNetricsaEffect() {
    // Appliquer les gradients aux mentions de rôle en premier
    applyGradientsToRoleMentions();

    document.querySelectorAll<HTMLElement>("[data-fsb-netricsa]").forEach(el => {
        const c1 = el.style.getPropertyValue("--custom-gradient-color-1");
        if (!c1 || normalizeColor(c1) !== NETRICSA_PRIMARY_RGB) {
            delete el.dataset.fsbNetricsa; delete el.dataset.fsbCustomAnim;
            const h = el.closest<HTMLElement>("span[data-fsb-netricsa-header]");
            if (h) { delete h.dataset.fsbNetricsaHeader; delete h.dataset.fsbCustomAnim; }
        }
    });
    document.querySelectorAll<HTMLElement>("span[data-fsb-netricsa-header]").forEach(h => {
        if (!h.querySelector("[data-fsb-netricsa]")) { delete h.dataset.fsbNetricsaHeader; delete h.dataset.fsbCustomAnim; }
    });
    document.querySelectorAll<HTMLElement>('span[class*="nameContainer"][data-fsb-gradient]:not([data-fsb-netricsa])').forEach(el => {
        if (normalizeColor(el.style.getPropertyValue("--custom-gradient-color-1")) !== NETRICSA_PRIMARY_RGB) return;
        el.dataset.fsbNetricsa = "1"; el.dataset.fsbCustomAnim = "1";
    });
    // Détection des username_ via CSS vars OU via data-original-color (pour les bots avec desaturateUserColors)
    document.querySelectorAll<HTMLElement>('span[class*="username_"]:not([data-fsb-netricsa])').forEach(el => {
        const c1 = el.style.getPropertyValue("--custom-gradient-color-1");
        const isViaGradient = el.dataset.fsbGradient && normalizeColor(c1) === NETRICSA_PRIMARY_RGB;
        const isViaOriginalColor = !el.dataset.fsbGradient
            && normalizeColor(el.dataset.originalColor || "") === NETRICSA_PRIMARY_RGB;
        if (!isViaGradient && !isViaOriginalColor) return;
        // Si détecté via data-original-color, poser les CSS vars et data-fsb-gradient maintenant
        if (isViaOriginalColor) {
            el.style.setProperty("--custom-gradient-color-1", "#2494db");
            el.style.setProperty("--custom-gradient-color-2", "#247d90");
            el.style.setProperty("--custom-gradient-color-3", "#2494db");
            el.dataset.fsbGradient = "1";
            const headerText = el.closest<HTMLElement>('span[class*="headerText"]');
            if (headerText && !headerText.dataset.fsbHeaderVars) {
                headerText.style.setProperty("--custom-gradient-color-1", "#2494db");
                headerText.dataset.fsbHeaderVars = "1";
            }
        }
        el.dataset.fsbNetricsa = "1"; el.dataset.fsbCustomAnim = "1";
        const h = el.closest<HTMLElement>('span[class*="headerText"]');
        if (h) { h.dataset.fsbNetricsaHeader = "1"; h.dataset.fsbCustomAnim = "1"; }
    });
    document.querySelectorAll<HTMLElement>('[aria-hidden="true"][data-fsb-cat-checked]:not([data-fsb-netricsa])').forEach(el => {
        if (normalizeColor(el.style.getPropertyValue("--custom-gradient-color-1")) !== NETRICSA_PRIMARY_RGB) return;
        el.dataset.fsbNetricsa = "1"; el.dataset.fsbCustomAnim = "1";
    });
    document.querySelectorAll<HTMLElement>('div[class*="usernameContainer_"][data-fsb-voice-checked]:not([data-fsb-netricsa])').forEach(container => {
        const gradDiv = container.querySelector<HTMLElement>("[data-fsb-gradient], [data-fsb-mention]");
        const c1 = gradDiv?.style.getPropertyValue("--custom-gradient-color-1") ?? container.style.getPropertyValue("--custom-gradient-color-1");
        if (!c1 || normalizeColor(c1) !== NETRICSA_PRIMARY_RGB) return;
        container.dataset.fsbNetricsa = "1"; container.dataset.fsbCustomAnim = "1";
        const vc = container.parentElement;
        if (vc?.dataset.fsbVoiceContainer) { vc.dataset.fsbNetricsaVoice = "1"; vc.dataset.fsbCustomAnim = "1"; }
    });
    // Mentions utilisateur et mentions de rôle avec couleur Netricsa
    document.querySelectorAll<HTMLElement>("span[data-fsb-mention][data-fsb-gradient]:not([data-fsb-netricsa])").forEach(mention => {
        const c1 = mention.style.getPropertyValue("--custom-gradient-color-1");
        if (!c1 || normalizeColor(c1) !== NETRICSA_PRIMARY_RGB) return;
        mention.dataset.fsbNetricsa = "1"; mention.dataset.fsbCustomAnim = "1";
    });
}

function cleanupNetricsaEffect() {
    document.querySelectorAll<HTMLElement>("[data-fsb-netricsa]").forEach(el => {
        delete el.dataset.fsbNetricsa; delete el.dataset.fsbCustomAnim;
        const h = el.closest<HTMLElement>("span[data-fsb-netricsa-header]");
        if (h) { delete h.dataset.fsbNetricsaHeader; delete h.dataset.fsbCustomAnim; }
    });
    document.querySelectorAll<HTMLElement>("[data-fsb-netricsa-voice]").forEach(el => {
        delete el.dataset.fsbNetricsaVoice; delete el.dataset.fsbCustomAnim;
    });
}

const NETRICSA_CSS = `
    @keyframes fsb-netricsa-scan {
        0% { background-position: -350px 50%; }
        100% { background-position: 350px 50%; }
    }
    @keyframes fsb-netricsa-pulse {
        0%, 100% {
            filter: drop-shadow(0 0 3px #2494db) drop-shadow(0 0 6px rgba(36, 148, 219, 0.4));
        }
        50% {
            filter: drop-shadow(0 0 6px #2494db) drop-shadow(0 0 16px rgba(36, 148, 219, 0.6)) drop-shadow(0 0 24px rgba(255, 255, 255, 0.3));
        }
    }
    div[class*="member__"]:hover span[data-fsb-netricsa] span[class*="name__"],
    a:hover span[data-fsb-netricsa] span[class*="name__"],
    span[data-fsb-netricsa]:hover span[class*="name__"] {
        animation: fsb-netricsa-scan 3.5s linear infinite !important;
        background-image: linear-gradient(to right,
            var(--custom-gradient-color-1) 0%,
            var(--custom-gradient-color-2) 47%,
            var(--custom-gradient-color-2) 48.5%,
            #ffffff 49%,
            #ffffff 51%,
            var(--custom-gradient-color-2) 51.5%,
            var(--custom-gradient-color-2) 53%,
            var(--custom-gradient-color-1) 100%) !important;
        background-size: 350px auto !important;
    }
    div[role="article"]:hover span[class*="username_"][data-fsb-netricsa][data-fsb-custom-anim][data-fsb-gradient],
    li[class*="messageListItem"]:hover span[class*="username_"][data-fsb-netricsa][data-fsb-custom-anim][data-fsb-gradient],
    h3[class*="header"]:hover span[class*="username_"][data-fsb-netricsa][data-fsb-custom-anim][data-fsb-gradient],
    span[class*="username_"][data-fsb-netricsa][data-fsb-custom-anim][data-fsb-gradient]:hover,
    span[class*="headerText"]:hover span[class*="username_"][data-fsb-netricsa][data-fsb-custom-anim][data-fsb-gradient] {
        animation: fsb-netricsa-scan 3.5s linear infinite !important;
        background-image: linear-gradient(to right,
            var(--custom-gradient-color-1) 0%,
            var(--custom-gradient-color-2) 47%,
            var(--custom-gradient-color-2) 48.5%,
            #ffffff 49%,
            #ffffff 51%,
            var(--custom-gradient-color-2) 51.5%,
            var(--custom-gradient-color-2) 53%,
            var(--custom-gradient-color-1) 100%) !important;
        background-size: 350px auto !important;
    }
    div[class*="member__"]:hover span[data-fsb-netricsa],
    a:hover span[data-fsb-netricsa],
    span[data-fsb-netricsa]:hover {
        animation: fsb-netricsa-pulse 3.5s ease-in-out infinite !important;
    }
    div[role="article"]:hover span[class*="headerText"][data-fsb-netricsa-header],
    li[class*="messageListItem"]:hover span[class*="headerText"][data-fsb-netricsa-header],
    h3[class*="header"]:hover span[class*="headerText"][data-fsb-netricsa-header] {
        animation: fsb-netricsa-pulse 3.5s ease-in-out infinite !important;
    }
    div[role="article"]:hover span[class*="headerText"][data-fsb-netricsa-header] span[class*="botTag"],
    li[class*="messageListItem"]:hover span[class*="headerText"][data-fsb-netricsa-header] span[class*="botTag"],
    h3[class*="header"]:hover span[class*="headerText"][data-fsb-netricsa-header] span[class*="botTag"] { filter: none !important; animation: none !important; }
    div[role="article"]:hover span[class*="username_"][data-fsb-netricsa],
    li[class*="messageListItem"]:hover span[class*="username_"][data-fsb-netricsa],
    h3[class*="header"]:hover span[class*="username_"][data-fsb-netricsa] { filter: none !important; animation: fsb-netricsa-scan 3.5s linear infinite !important; }
    div[class*="members_"]:hover div[data-fsb-netricsa] span[data-fsb-gradient] {
        animation: fsb-netricsa-scan 3.5s linear infinite !important;
        background-image: linear-gradient(to right,
            var(--custom-gradient-color-1) 0%,
            var(--custom-gradient-color-2) 47%,
            var(--custom-gradient-color-2) 48.5%,
            #ffffff 49%,
            #ffffff 51%,
            var(--custom-gradient-color-2) 51.5%,
            var(--custom-gradient-color-2) 53%,
            var(--custom-gradient-color-1) 100%) !important;
        background-size: 350px auto !important;
    }
    div[class*="members_"]:hover div[data-fsb-netricsa] {
        animation: fsb-netricsa-pulse 3.5s ease-in-out infinite !important;
    }
    div[class*="voiceUser"]:hover div[data-fsb-netricsa] span[data-fsb-mention-text],
    div[class*="voiceUser"]:hover div[data-fsb-netricsa] span[data-fsb-gradient]:not([data-fsb-mention]) {
        animation: fsb-netricsa-scan 3.5s linear infinite !important;
        background-image: linear-gradient(to right,
            var(--custom-gradient-color-1) 0%,
            var(--custom-gradient-color-2) 47%,
            var(--custom-gradient-color-2) 48.5%,
            #ffffff 49%,
            #ffffff 51%,
            var(--custom-gradient-color-2) 51.5%,
            var(--custom-gradient-color-2) 53%,
            var(--custom-gradient-color-1) 100%) !important;
        background-size: 350px auto !important;
    }
    div[class*="voiceUser"]:hover [data-fsb-voice-container][data-fsb-netricsa-voice] {
        animation: fsb-netricsa-pulse 3.5s ease-in-out infinite !important;
    }
    /* Mentions utilisateur et mentions de rôle avec Netricsa */
    /* Animation au hover DIRECT de la mention */
    span[data-fsb-mention][data-fsb-netricsa]:hover span[data-fsb-mention-text] {
        animation: fsb-netricsa-scan 3.5s linear infinite !important;
        background-image: linear-gradient(to right,
            var(--custom-gradient-color-1) 0%,
            var(--custom-gradient-color-2) 47%,
            var(--custom-gradient-color-2) 48.5%,
            #ffffff 49%,
            #ffffff 51%,
            var(--custom-gradient-color-2) 51.5%,
            var(--custom-gradient-color-2) 53%,
            var(--custom-gradient-color-1) 100%) !important;
        background-size: 350px auto !important;
        filter: drop-shadow(0 0 1.5px #2494db) drop-shadow(0 0 3px rgba(36, 148, 219, 0.4));
    }
    /* Icônes de rôle uniquement (pas les avatars utilisateur) */
    span[data-fsb-mention][data-fsb-netricsa]:hover img[data-fsb-role-icon-wrapped],
    span[data-fsb-mention][data-fsb-netricsa]:hover img.vc-mentionAvatars-role-icon {
        animation: fsb-netricsa-pulse 3.5s ease-in-out infinite !important;
    }
    /* Glow via le conteneur parent pour mentions utilisateur */
    span[data-fsb-mention][data-fsb-netricsa]:hover .vc-mentionAvatars-container {
        filter: drop-shadow(0 0 2px #2494db) drop-shadow(0 0 4px rgba(36, 148, 219, 0.4)) !important;
    }
    /* Glow direct pour mentions de rôle sans conteneur */
    span[data-fsb-mention][data-fsb-netricsa]:hover:not(:has(.vc-mentionAvatars-container)) {
        filter: drop-shadow(0 0 2px #2494db) drop-shadow(0 0 4px rgba(36, 148, 219, 0.4)) !important;
    }
`;

// ── 🏆 GOLDEN / 🥈 SILVER / 🥉 BRONZE ───────────────────────────────────────

type SimpleEffectDef = { dataKey: string; headerKey: string; voiceKey: string; rgb: string; };

const SIMPLE_EFFECT_DEFS: SimpleEffectDef[] = [
    { dataKey: "fsbGolden", headerKey: "fsbGoldenHeader", voiceKey: "fsbGoldenVoice", rgb: GOLDEN_PRIMARY_RGB },
    { dataKey: "fsbSilver", headerKey: "fsbSilverHeader", voiceKey: "fsbSilverVoice", rgb: SILVER_PRIMARY_RGB },
    { dataKey: "fsbBronze", headerKey: "fsbBronzeHeader", voiceKey: "fsbBronzeVoice", rgb: BRONZE_PRIMARY_RGB },
];

function makeSimpleApply(def: SimpleEffectDef) {
    return function () {
        // Appliquer les gradients aux mentions de rôle en premier
        applyGradientsToRoleMentions();

        const attrStr = def.dataKey.replace(/([A-Z])/g, m => `-${m.toLowerCase()}`).replace(/^fsb/, "data-fsb");
        const selector = `[${attrStr}]`;
        document.querySelectorAll<HTMLElement>(selector).forEach(el => {
            const c1 = el.style.getPropertyValue("--custom-gradient-color-1");
            if (!c1 || normalizeColor(c1) !== def.rgb) {
                delete (el.dataset as any)[def.dataKey]; delete el.dataset.fsbCustomAnim;
                const hAttr = def.headerKey.replace(/([A-Z])/g, m => `-${m.toLowerCase()}`);
                const h = el.closest<HTMLElement>(`[data-${hAttr}]`);
                if (h) { delete (h.dataset as any)[def.headerKey]; delete h.dataset.fsbCustomAnim; }
            }
        });
        document.querySelectorAll<HTMLElement>(`span[class*="nameContainer"][data-fsb-gradient]:not(${selector})`).forEach(el => {
            if (normalizeColor(el.style.getPropertyValue("--custom-gradient-color-1")) !== def.rgb) return;
            (el.dataset as any)[def.dataKey] = "1"; el.dataset.fsbCustomAnim = "1";
        });
        document.querySelectorAll<HTMLElement>(`span[class*="username_"][data-fsb-gradient]:not(${selector})`).forEach(el => {
            if (normalizeColor(el.style.getPropertyValue("--custom-gradient-color-1")) !== def.rgb) return;
            (el.dataset as any)[def.dataKey] = "1"; el.dataset.fsbCustomAnim = "1";
            const h = el.closest<HTMLElement>('span[class*="headerText"]');
            if (h) { (h.dataset as any)[def.headerKey] = "1"; h.dataset.fsbCustomAnim = "1"; }
        });
        document.querySelectorAll<HTMLElement>(`[aria-hidden="true"][data-fsb-cat-checked]:not(${selector})`).forEach(el => {
            if (normalizeColor(el.style.getPropertyValue("--custom-gradient-color-1")) !== def.rgb) return;
            (el.dataset as any)[def.dataKey] = "1"; el.dataset.fsbCustomAnim = "1";
        });
        document.querySelectorAll<HTMLElement>(`div[class*="usernameContainer_"][data-fsb-voice-checked]:not(${selector})`).forEach(container => {
            const gradDiv = container.querySelector<HTMLElement>("[data-fsb-gradient], [data-fsb-mention]");
            const c1 = gradDiv?.style.getPropertyValue("--custom-gradient-color-1") ?? container.style.getPropertyValue("--custom-gradient-color-1");
            if (!c1 || normalizeColor(c1) !== def.rgb) return;
            (container.dataset as any)[def.dataKey] = "1"; container.dataset.fsbCustomAnim = "1";
            const vc = container.parentElement;
            if (vc?.dataset.fsbVoiceContainer) { (vc.dataset as any)[def.voiceKey] = "1"; vc.dataset.fsbCustomAnim = "1"; }
        });
        // Mentions utilisateur et mentions de rôle
        document.querySelectorAll<HTMLElement>(`span[data-fsb-mention][data-fsb-gradient]:not(${selector})`).forEach(mention => {
            const c1 = mention.style.getPropertyValue("--custom-gradient-color-1");
            if (!c1 || normalizeColor(c1) !== def.rgb) return;
            (mention.dataset as any)[def.dataKey] = "1"; mention.dataset.fsbCustomAnim = "1";
        });
    };
}

function makeSimpleCleanup(def: SimpleEffectDef) {
    return function () {
        const attrStr = def.dataKey.replace(/([A-Z])/g, m => `-${m.toLowerCase()}`).replace(/^fsb/, "data-fsb");
        const hAttrStr = def.headerKey.replace(/([A-Z])/g, m => `-${m.toLowerCase()}`).replace(/^fsb/, "data-fsb");
        const vAttrStr = def.voiceKey.replace(/([A-Z])/g, m => `-${m.toLowerCase()}`).replace(/^fsb/, "data-fsb");
        document.querySelectorAll<HTMLElement>(`[${attrStr}]`).forEach(el => {
            delete (el.dataset as any)[def.dataKey]; delete el.dataset.fsbCustomAnim;
            const h = el.closest<HTMLElement>(`[${hAttrStr}]`);
            if (h) { delete (h.dataset as any)[def.headerKey]; delete h.dataset.fsbCustomAnim; }
        });
        document.querySelectorAll<HTMLElement>(`[${vAttrStr}]`).forEach(el => {
            delete (el.dataset as any)[def.voiceKey]; delete el.dataset.fsbCustomAnim;
        });
    };
}

const MEDALS_CSS = `
    @keyframes fsb-golden-shimmer { 0% { background-position: -300px 50%; } 100% { background-position: 300px 50%; } }
    @keyframes fsb-silver-shimmer { 0% { background-position: -300px 50%; } 100% { background-position: 300px 50%; } }
    @keyframes fsb-bronze-shimmer { 0% { background-position: -300px 50%; } 100% { background-position: 300px 50%; } }
    span[data-fsb-golden][data-fsb-gradient] span[class*="name__"], span[data-fsb-golden][data-fsb-custom-anim] span[class*="name__"],
    span[class*="username_"][data-fsb-golden][data-fsb-gradient], span[class*="username_"][data-fsb-golden][data-fsb-custom-anim] {
        background-image: linear-gradient(to right, #bf9b30, #f7d774, #bf9b30) !important; background-size: 200px auto !important; animation: none !important;
    }
    span[data-fsb-silver][data-fsb-gradient] span[class*="name__"], span[data-fsb-silver][data-fsb-custom-anim] span[class*="name__"],
    span[class*="username_"][data-fsb-silver][data-fsb-gradient], span[class*="username_"][data-fsb-silver][data-fsb-custom-anim] {
        background-image: linear-gradient(to right, #c0c0c0, #f2f2f2, #c0c0c0) !important; background-size: 200px auto !important; animation: none !important;
    }
    span[data-fsb-bronze][data-fsb-gradient] span[class*="name__"], span[data-fsb-bronze][data-fsb-custom-anim] span[class*="name__"],
    span[class*="username_"][data-fsb-bronze][data-fsb-gradient], span[class*="username_"][data-fsb-bronze][data-fsb-custom-anim] {
        background-image: linear-gradient(to right, #a05822, #d08a4a, #a05822) !important; background-size: 200px auto !important; animation: none !important;
    }
    div[class*="member__"]:hover span[data-fsb-golden][data-fsb-gradient] span[class*="name__"],
    a:hover span[data-fsb-golden][data-fsb-gradient] span[class*="name__"],
    div[role="article"]:hover span[class*="username_"][data-fsb-golden][data-fsb-gradient],
    li[class*="messageListItem"]:hover span[class*="username_"][data-fsb-golden][data-fsb-gradient],
    div[class*="members_"]:hover div[data-fsb-golden] span[data-fsb-gradient],
    div[class*="voiceUser"]:hover div[data-fsb-golden] span[data-fsb-mention-text],
    div[class*="voiceUser"]:hover div[data-fsb-golden] span[data-fsb-gradient]:not([data-fsb-mention]) {
        animation: fsb-golden-shimmer 1.2s linear infinite !important;
        background-image: linear-gradient(to right, #bf9b30 0%, #c8a435 30%, #ffffff 49%, #ffffff 51%, #c8a435 70%, #bf9b30 100%) !important;
        background-size: 300px auto !important;
    }
    div[class*="member__"]:hover span[data-fsb-silver][data-fsb-gradient] span[class*="name__"],
    a:hover span[data-fsb-silver][data-fsb-gradient] span[class*="name__"],
    div[role="article"]:hover span[class*="username_"][data-fsb-silver][data-fsb-gradient],
    li[class*="messageListItem"]:hover span[class*="username_"][data-fsb-silver][data-fsb-gradient],
    div[class*="members_"]:hover div[data-fsb-silver] span[data-fsb-gradient],
    div[class*="voiceUser"]:hover div[data-fsb-silver] span[data-fsb-mention-text],
    div[class*="voiceUser"]:hover div[data-fsb-silver] span[data-fsb-gradient]:not([data-fsb-mention]) {
        animation: fsb-silver-shimmer 1.45s linear infinite !important;
        background-image: linear-gradient(to right, #c0c0c0 0%, #d0d0d0 30%, #ffffff 49%, #ffffff 51%, #d0d0d0 70%, #c0c0c0 100%) !important;
        background-size: 300px auto !important;
    }
    div[class*="member__"]:hover span[data-fsb-bronze][data-fsb-gradient] span[class*="name__"],
    a:hover span[data-fsb-bronze][data-fsb-gradient] span[class*="name__"],
    div[role="article"]:hover span[class*="username_"][data-fsb-bronze][data-fsb-gradient],
    li[class*="messageListItem"]:hover span[class*="username_"][data-fsb-bronze][data-fsb-gradient],
    div[class*="members_"]:hover div[data-fsb-bronze] span[data-fsb-gradient],
    div[class*="voiceUser"]:hover div[data-fsb-bronze] span[data-fsb-mention-text],
    div[class*="voiceUser"]:hover div[data-fsb-bronze] span[data-fsb-gradient]:not([data-fsb-mention]) {
        animation: fsb-bronze-shimmer 1.8s linear infinite !important;
        background-image: linear-gradient(to right, #a05822 0%, #b86a30 30%, #f0c080 49%, #f0c080 51%, #b86a30 70%, #a05822 100%) !important;
        background-size: 300px auto !important;
    }
    div[class*="member__"]:hover span[data-fsb-golden], a:hover span[data-fsb-golden], span[data-fsb-golden]:hover { filter: drop-shadow(0 0 3px #f7d774) !important; }
    div[role="article"]:hover span[class*="headerText"][data-fsb-golden-header],
    li[class*="messageListItem"]:hover span[class*="headerText"][data-fsb-golden-header] { filter: drop-shadow(0 0 3px #f7d774) !important; }
    div[role="article"]:hover span[class*="headerText"][data-fsb-golden-header] span[class*="botTag"],
    li[class*="messageListItem"]:hover span[class*="headerText"][data-fsb-golden-header] span[class*="botTag"] { filter: none !important; }
    div[role="article"]:hover span[class*="username_"][data-fsb-golden],
    li[class*="messageListItem"]:hover span[class*="username_"][data-fsb-golden] { filter: none !important; }
    div[class*="members_"]:hover div[data-fsb-golden] { filter: drop-shadow(0 0 3px #f7d774) !important; }
    div[class*="voiceUser"]:hover [data-fsb-voice-container][data-fsb-golden-voice] { filter: drop-shadow(0 0 3px #f7d774) !important; }
    div[class*="member__"]:hover span[data-fsb-silver], a:hover span[data-fsb-silver], span[data-fsb-silver]:hover { filter: drop-shadow(0 0 3px #f2f2f2) !important; }
    div[role="article"]:hover span[class*="headerText"][data-fsb-silver-header],
    li[class*="messageListItem"]:hover span[class*="headerText"][data-fsb-silver-header] { filter: drop-shadow(0 0 3px #f2f2f2) !important; }
    div[role="article"]:hover span[class*="headerText"][data-fsb-silver-header] span[class*="botTag"],
    li[class*="messageListItem"]:hover span[class*="headerText"][data-fsb-silver-header] span[class*="botTag"] { filter: none !important; }
    div[role="article"]:hover span[class*="username_"][data-fsb-silver],
    li[class*="messageListItem"]:hover span[class*="username_"][data-fsb-silver] { filter: none !important; }
    div[class*="members_"]:hover div[data-fsb-silver] { filter: drop-shadow(0 0 3px #f2f2f2) !important; }
    div[class*="voiceUser"]:hover [data-fsb-voice-container][data-fsb-silver-voice] { filter: drop-shadow(0 0 3px #f2f2f2) !important; }
    div[class*="member__"]:hover span[data-fsb-bronze], a:hover span[data-fsb-bronze], span[data-fsb-bronze]:hover { filter: drop-shadow(0 0 3px #d08a4a) !important; }
    div[role="article"]:hover span[class*="headerText"][data-fsb-bronze-header],
    li[class*="messageListItem"]:hover span[class*="headerText"][data-fsb-bronze-header] { filter: drop-shadow(0 0 3px #d08a4a) !important; }
    div[role="article"]:hover span[class*="headerText"][data-fsb-bronze-header] span[class*="botTag"],
    li[class*="messageListItem"]:hover span[class*="headerText"][data-fsb-bronze-header] span[class*="botTag"] { filter: none !important; }
    div[role="article"]:hover span[class*="username_"][data-fsb-bronze],
    li[class*="messageListItem"]:hover span[class*="username_"][data-fsb-bronze] { filter: none !important; }
    div[class*="members_"]:hover div[data-fsb-bronze] { filter: drop-shadow(0 0 3px #d08a4a) !important; }
    div[class*="voiceUser"]:hover [data-fsb-voice-container][data-fsb-bronze-voice] { filter: drop-shadow(0 0 3px #d08a4a) !important; }
    /* Mentions utilisateur et mentions de rôle avec Golden - Hover direct */
    span[data-fsb-mention][data-fsb-golden]:hover span[data-fsb-mention-text] {
        animation: fsb-golden-shimmer 1.2s linear infinite !important;
        background-image: linear-gradient(to right, #bf9b30 0%, #c8a435 30%, #ffffff 49%, #ffffff 51%, #c8a435 70%, #bf9b30 100%) !important;
        background-size: 300px auto !important;
        filter: drop-shadow(0 0 1.5px #f7d774);
    }
    span[data-fsb-mention][data-fsb-golden]:hover img[data-fsb-role-icon-wrapped],
    span[data-fsb-mention][data-fsb-golden]:hover img.vc-mentionAvatars-role-icon {
        filter: drop-shadow(0 0 1.5px #f7d774) !important;
    }
    span[data-fsb-mention][data-fsb-golden]:hover .vc-mentionAvatars-container {
        filter: drop-shadow(0 0 1.5px #f7d774) !important;
    }
    span[data-fsb-mention][data-fsb-golden]:hover:not(:has(.vc-mentionAvatars-container)) {
        filter: drop-shadow(0 0 1.5px #f7d774) !important;
    }
    /* Mentions utilisateur et mentions de rôle avec Silver - Hover direct */
    span[data-fsb-mention][data-fsb-silver]:hover span[data-fsb-mention-text] {
        animation: fsb-silver-shimmer 1.45s linear infinite !important;
        background-image: linear-gradient(to right, #c0c0c0 0%, #d0d0d0 30%, #ffffff 49%, #ffffff 51%, #d0d0d0 70%, #c0c0c0 100%) !important;
        background-size: 300px auto !important;
        filter: drop-shadow(0 0 1.5px #f2f2f2);
    }
    span[data-fsb-mention][data-fsb-silver]:hover img[data-fsb-role-icon-wrapped],
    span[data-fsb-mention][data-fsb-silver]:hover img.vc-mentionAvatars-role-icon {
        filter: drop-shadow(0 0 1.5px #f2f2f2) !important;
    }
    span[data-fsb-mention][data-fsb-silver]:hover .vc-mentionAvatars-container {
        filter: drop-shadow(0 0 1.5px #f2f2f2) !important;
    }
    span[data-fsb-mention][data-fsb-silver]:hover:not(:has(.vc-mentionAvatars-container)) {
        filter: drop-shadow(0 0 1.5px #f2f2f2) !important;
    }
    /* Mentions utilisateur et mentions de rôle avec Bronze - Hover direct */
    span[data-fsb-mention][data-fsb-bronze]:hover span[data-fsb-mention-text] {
        animation: fsb-bronze-shimmer 1.8s linear infinite !important;
        background-image: linear-gradient(to right, #a05822 0%, #b86a30 30%, #f0c080 49%, #f0c080 51%, #b86a30 70%, #a05822 100%) !important;
        background-size: 300px auto !important;
        filter: drop-shadow(0 0 1.5px #d08a4a);
    }
    span[data-fsb-mention][data-fsb-bronze]:hover img[data-fsb-role-icon-wrapped],
    span[data-fsb-mention][data-fsb-bronze]:hover img.vc-mentionAvatars-role-icon {
        filter: drop-shadow(0 0 1.5px #d08a4a) !important;
    }
    span[data-fsb-mention][data-fsb-bronze]:hover .vc-mentionAvatars-container {
        filter: drop-shadow(0 0 1.5px #d08a4a) !important;
    }
    span[data-fsb-mention][data-fsb-bronze]:hover:not(:has(.vc-mentionAvatars-container)) {
        filter: drop-shadow(0 0 1.5px #d08a4a) !important;
    }
`;

// ── 🔮 CELESTIAL ─────────────────────────────────────────────────────────────

const CELESTIAL_STARS_CHARS = ["✦", "✦", "✦", "✦", "✦", "✦"];

function injectCelestialStars(target: HTMLElement) {
    if (target.querySelector("[data-fsb-cstar]")) return;
    const wrap = document.createElement("span");
    wrap.dataset.fsbCelestialWrap = "1";
    wrap.style.cssText = "position:relative;display:inline-block;";
    while (target.firstChild) wrap.appendChild(target.firstChild);
    target.appendChild(wrap);

    // Créer les étoiles avec positions temporaires
    const stars: HTMLElement[] = [];
    CELESTIAL_STARS_CHARS.forEach((char, i) => {
        const star = document.createElement("span");
        star.dataset.fsbCstar = String(i);
        star.textContent = char;
        star.style.setProperty("--twinkle-duration", `${1.2 + (i * 0.3)}s`);
        star.style.animationDelay = `${i * 0.2}s`;
        star.style.top = "50%";
        star.style.left = "50%";
        wrap.appendChild(star);
        stars.push(star);
    });

    // Calculer les positions après le rendu
    requestAnimationFrame(() => {
        const nameWidth = wrap.offsetWidth;
        const nameHeight = wrap.offsetHeight;
        if (nameWidth === 0) return;

        // Vérifier s'il y a une icône de rôle
        const roleIcon = wrap.querySelector<HTMLElement>('img[class*="role-icon"], [data-fsb-role-icon]');
        const roleIconWidth = roleIcon ? (roleIcon.offsetWidth + 4) : 0; // +4 pour le margin

        // Positions relatives en fonction de la taille du nom + icône
        const halfWidth = nameWidth / 2;
        const halfHeight = nameHeight / 2;
        const marginVertical = 12;

        // Pour chaque étoile, générer DEUX positions aléatoires différentes
        stars.forEach((star, i) => {
            // Vérifier s'il y a une icône de rôle pour compensation
            const iconOffset = roleIconWidth / 2;

            // Positions prédéfinies autour du nom (haut et côtés uniquement)
            const basePositions = [
                { x: 0, y: -1 }, // Haut centre
                { x: -0.7, y: -0.7 }, // Haut gauche
                { x: 0.7, y: -0.7 }, // Haut droite
                { x: -1, y: 0 }, // Milieu gauche
                { x: 1, y: 0 }, // Milieu droite
                { x: -0.5, y: -0.9 } // Haut gauche léger
            ];

            const basePos = basePositions[i % basePositions.length];
            const distance1 = marginVertical + Math.random() * 8;
            const distance2 = marginVertical + Math.random() * 8;

            // Première position
            const x1 = basePos.x * (halfWidth + distance1) - (basePos.x < 0 ? iconOffset : 0);
            const y1 = basePos.y * (halfHeight + distance1);

            // Deuxième position (variation aléatoire de la première)
            const variance = -2;
            const x2 = basePos.x * (halfWidth + distance2) * (1 + (Math.random() + 0.5) * variance) - (basePos.x < 0 ? iconOffset : 0);
            const y2 = basePos.y * (halfHeight + distance2) * (1 + (Math.random() + 0.5) * variance);

            star.style.setProperty("--star-x1", `${x1.toFixed(1)}px`);
            star.style.setProperty("--star-y1", `${y1.toFixed(1)}px`);
            star.style.setProperty("--star-x2", `${x2.toFixed(1)}px`);
            star.style.setProperty("--star-y2", `${y2.toFixed(1)}px`);
        });
    });
}

function injectCelestialStarsVoice(voiceContainer: HTMLElement, usernameContainer: HTMLElement) {
    if (voiceContainer.querySelector("[data-fsb-cstar]")) return;
    voiceContainer.style.position = "relative";
    voiceContainer.style.overflow = "visible";

    // Créer les étoiles
    const stars: HTMLElement[] = [];
    CELESTIAL_STARS_CHARS.forEach((char, i) => {
        const star = document.createElement("span");
        star.dataset.fsbCstar = String(i);
        star.dataset.fsbCstarVoice = "1";
        star.textContent = char;
        star.style.cssText = "position:absolute;pointer-events:none;top:50%;left:50%;";
        star.style.setProperty("--twinkle-duration", `${1.2 + (i * 0.3)}s`);
        star.style.animationDelay = `${i * 0.2}s`;
        voiceContainer.appendChild(star);
        stars.push(star);
    });

    requestAnimationFrame(() => {
        const nameDiv = usernameContainer.querySelector<HTMLElement>("[data-fsb-gradient], [data-fsb-mention]") ?? usernameContainer;
        const vcRect = voiceContainer.getBoundingClientRect();
        const nameRect = nameDiv.getBoundingClientRect();
        if (vcRect.width === 0 || nameRect.width === 0) return;

        const centerLeft = (nameRect.left - vcRect.left) + nameRect.width / 2;
        const centerTop = (nameRect.top - vcRect.top) + nameRect.height / 2;

        // Vérifier s'il y a une icône de rôle
        const roleIcon = usernameContainer.querySelector<HTMLElement>('img[class*="role-icon"], [data-fsb-role-icon]');
        const roleIconWidth = roleIcon ? (roleIcon.offsetWidth + 4) : 0;

        const halfWidth = nameRect.width / 2;
        const halfHeight = nameRect.height / 2;
        const marginVertical = 12;

        stars.forEach((star, i) => {
            star.style.top = `${centerTop}px`;
            star.style.left = `${centerLeft}px`;

            // Vérifier s'il y a une icône de rôle pour compensation
            const iconOffset = roleIconWidth / 2;

            // Positions prédéfinies autour du nom (haut et côtés uniquement)
            const basePositions = [
                { x: 0, y: -1 }, // Haut centre
                { x: -0.7, y: -0.7 }, // Haut gauche
                { x: 0.7, y: -0.7 }, // Haut droite
                { x: -1, y: 0 }, // Milieu gauche
                { x: 1, y: 0 }, // Milieu droite
                { x: -0.5, y: -0.9 } // Haut gauche léger
            ];

            const basePos = basePositions[i % basePositions.length];
            const distance1 = marginVertical + Math.random() * 8;
            const distance2 = marginVertical + Math.random() * 8;

            // Première position
            const x1 = basePos.x * (halfWidth + distance1) - (basePos.x < 0 ? iconOffset : 0);
            const y1 = basePos.y * (halfHeight + distance1);

            // Deuxième position (variation aléatoire de la première)
            const variance = 3;
            const x2 = basePos.x * (halfWidth + distance2) * (1 + (Math.random() - 0.5) * variance) - (basePos.x < 0 ? iconOffset : 0);
            const y2 = basePos.y * (halfHeight + distance2) * (1 + (Math.random() - 0.5) * variance);

            star.style.setProperty("--star-x1", `${x1.toFixed(1)}px`);
            star.style.setProperty("--star-y1", `${y1.toFixed(1)}px`);
            star.style.setProperty("--star-x2", `${x2.toFixed(1)}px`);
            star.style.setProperty("--star-y2", `${y2.toFixed(1)}px`);
        });
    });
}

function cleanCelestialEl(el: HTMLElement) {
    const wrap = el.querySelector<HTMLElement>("[data-fsb-celestial-wrap]");
    if (wrap) {
        Array.from(wrap.childNodes).forEach(n => {
            if (n instanceof HTMLElement && n.dataset.fsbCstar !== undefined) return;
            el.insertBefore(n, wrap);
        });
        wrap.remove();
    }
    el.querySelectorAll("[data-fsb-cstar-voice]").forEach(s => s.remove());
    if (el.dataset.fsbCelestialVoice) { el.style.position = ""; el.style.overflow = ""; }
    delete el.dataset.fsbCelestial;
    delete el.dataset.fsbCustomAnim;
}

function applyCelestialEffect() {
    // Appliquer les gradients aux mentions de rôle en premier
    applyGradientsToRoleMentions();

    document.querySelectorAll<HTMLElement>("[data-fsb-celestial]").forEach(el => {
        const c1 = el.style.getPropertyValue("--custom-gradient-color-1");
        if (!c1 || normalizeColor(c1) !== CELESTIAL_PRIMARY_RGB) {
            cleanCelestialEl(el);
            const h = el.closest<HTMLElement>("span[data-fsb-celestial-header]");
            if (h) { delete h.dataset.fsbCelestialHeader; delete h.dataset.fsbCustomAnim; }
        }
    });
    document.querySelectorAll<HTMLElement>("span[data-fsb-celestial-header]").forEach(h => {
        if (!h.querySelector("[data-fsb-celestial]")) { delete h.dataset.fsbCelestialHeader; delete h.dataset.fsbCustomAnim; }
    });
    document.querySelectorAll<HTMLElement>('span[class*="nameContainer"][data-fsb-gradient]:not([data-fsb-celestial])').forEach(el => {
        if (normalizeColor(el.style.getPropertyValue("--custom-gradient-color-1")) !== CELESTIAL_PRIMARY_RGB) return;
        el.dataset.fsbCelestial = "1"; el.dataset.fsbCustomAnim = "1";
        const nameSpan = el.querySelector<HTMLElement>('span[class*="name__"]');
        if (nameSpan && !nameSpan.querySelector("[data-fsb-celestial-wrap]")) injectCelestialStars(nameSpan);
    });
    document.querySelectorAll<HTMLElement>('span[class*="username_"][data-fsb-gradient]:not([data-fsb-celestial])').forEach(el => {
        if (normalizeColor(el.style.getPropertyValue("--custom-gradient-color-1")) !== CELESTIAL_PRIMARY_RGB) return;
        el.dataset.fsbCelestial = "1"; el.dataset.fsbCustomAnim = "1";
        const h = el.closest<HTMLElement>('span[class*="headerText"]');
        if (h) { h.dataset.fsbCelestialHeader = "1"; h.dataset.fsbCustomAnim = "1"; }
        if (!el.querySelector("[data-fsb-celestial-wrap]")) injectCelestialStars(el);
    });
    document.querySelectorAll<HTMLElement>('[aria-hidden="true"][data-fsb-cat-checked]:not([data-fsb-celestial])').forEach(el => {
        if (normalizeColor(el.style.getPropertyValue("--custom-gradient-color-1")) !== CELESTIAL_PRIMARY_RGB) return;
        el.dataset.fsbCelestial = "1"; el.dataset.fsbCustomAnim = "1";
    });
    document.querySelectorAll<HTMLElement>('div[class*="usernameContainer_"][data-fsb-voice-checked]:not([data-fsb-celestial])').forEach(container => {
        const gradDiv = container.querySelector<HTMLElement>("[data-fsb-gradient], [data-fsb-mention]");
        const c1 = gradDiv?.style.getPropertyValue("--custom-gradient-color-1") ?? container.style.getPropertyValue("--custom-gradient-color-1");
        if (!c1 || normalizeColor(c1) !== CELESTIAL_PRIMARY_RGB) return;
        container.dataset.fsbCelestial = "1"; container.dataset.fsbCustomAnim = "1";
        const vc = container.parentElement;
        if (vc?.dataset.fsbVoiceContainer) {
            vc.dataset.fsbCelestialVoice = "1"; vc.dataset.fsbCustomAnim = "1";
            if (!vc.querySelector("[data-fsb-cstar]")) injectCelestialStarsVoice(vc, container);
        }
    });
    // Mentions utilisateur et mentions de rôle avec Celestial
    document.querySelectorAll<HTMLElement>("span[data-fsb-mention][data-fsb-gradient]:not([data-fsb-celestial])").forEach(mention => {
        const c1 = mention.style.getPropertyValue("--custom-gradient-color-1");
        if (!c1 || normalizeColor(c1) !== CELESTIAL_PRIMARY_RGB) return;
        mention.dataset.fsbCelestial = "1"; mention.dataset.fsbCustomAnim = "1";
    });
}

function cleanupCelestialEffect() {
    document.querySelectorAll<HTMLElement>("[data-fsb-celestial]").forEach(el => {
        cleanCelestialEl(el);
        const h = el.closest<HTMLElement>("span[data-fsb-celestial-header]");
        if (h) { delete h.dataset.fsbCelestialHeader; delete h.dataset.fsbCustomAnim; }
    });
}

const CELESTIAL_CSS = `
    span[data-fsb-celestial] span[class*="name__"], span[class*="username_"][data-fsb-celestial] {
        background-image: linear-gradient(to right, #a855f7, #7c3aed, #a855f7) !important; background-size: 200px auto !important;
    }
    span[class*="username_"][data-fsb-celestial]:has([data-fsb-celestial-wrap]) { background-image: none !important; -webkit-text-fill-color: unset !important; }
    @keyframes fsb-celestial-shimmer { 0% { background-position: -300px 50%; } 100% { background-position: 300px 50%; } }
    div[role="article"]:hover [data-fsb-celestial-wrap], li[class*="messageListItem"]:hover [data-fsb-celestial-wrap],
    div[class*="member__"]:hover [data-fsb-celestial-wrap], a:hover [data-fsb-celestial-wrap],
    div[class*="voiceUser"]:hover [data-fsb-celestial-wrap] {
        animation: fsb-celestial-shimmer 2s linear infinite !important;
        background-image: linear-gradient(to right, #a855f7 0%, #9333ea 30%, #e9d5ff 49%, #e9d5ff 51%, #9333ea 70%, #a855f7 100%) !important;
        background-size: 300px auto !important;
    }
    div[class*="member__"]:hover span[data-fsb-celestial], a:hover span[data-fsb-celestial], span[data-fsb-celestial]:hover { filter: drop-shadow(0 0 4px #a855f7) !important; }
    div[role="article"]:hover span[class*="headerText"][data-fsb-celestial-header],
    li[class*="messageListItem"]:hover span[class*="headerText"][data-fsb-celestial-header] { filter: drop-shadow(0 0 4px #a855f7) !important; }
    div[role="article"]:hover span[class*="headerText"][data-fsb-celestial-header] span[class*="botTag"],
    li[class*="messageListItem"]:hover span[class*="headerText"][data-fsb-celestial-header] span[class*="botTag"] { filter: none !important; }
    div[role="article"]:hover span[class*="username_"][data-fsb-celestial],
    li[class*="messageListItem"]:hover span[class*="username_"][data-fsb-celestial] { filter: none !important; }
    div[class*="members_"]:hover div[data-fsb-celestial] { filter: drop-shadow(0 0 4px #a855f7) !important; }
    div[class*="voiceUser"]:hover [data-fsb-voice-container][data-fsb-celestial-voice] { filter: drop-shadow(0 0 4px #a855f7) !important; }
    span[class*="username_"][data-fsb-celestial], span[class*="headerText"][data-fsb-celestial-header],
    span[class*="nameContainer"][data-fsb-celestial], span[data-fsb-celestial] span[class*="name__"] { overflow: visible !important; }
    [data-fsb-celestial-wrap] {
        position: relative !important; display: inline-block !important; overflow: visible !important;
        background-image: linear-gradient(to right, #a855f7, #7c3aed, #a855f7) !important;
        -webkit-background-clip: text !important; background-clip: text !important;
        -webkit-text-fill-color: transparent !important; background-size: 200px auto !important;
    }
    [data-fsb-cstar] {
        position: absolute !important; display: inline-block !important; pointer-events: none !important;
        font-size: 10px !important; line-height: 1 !important;
        width: 10px !important; height: 10px !important;
        text-align: center !important; opacity: 0 !important; z-index: 999999 !important;
        -webkit-text-fill-color: currentcolor !important; background-clip: unset !important;
        -webkit-background-clip: unset !important; background-image: none !important; color: #e9d5ff !important;
        margin: -5px 0 0 -5px !important;
    }
    [data-fsb-cstar-voice] { margin: -5px 0 0 -5px !important; }
    div[class*="member__"]:hover [data-fsb-celestial-wrap] [data-fsb-cstar],
    div[role="article"]:hover [data-fsb-celestial-wrap] [data-fsb-cstar],
    li[class*="messageListItem"]:hover [data-fsb-celestial-wrap] [data-fsb-cstar],
    span[data-fsb-celestial-wrap]:hover [data-fsb-cstar] {
        animation: fsb-celestial-sparkle var(--twinkle-duration, 1.5s) ease-in-out infinite !important;
        opacity: 1 !important;
    }
    div[class*="voiceUser"]:hover [data-fsb-voice-container][data-fsb-celestial-voice] [data-fsb-cstar-voice] {
        animation: fsb-celestial-sparkle var(--twinkle-duration, 1.5s) ease-in-out infinite !important;
        opacity: 1 !important;
    }
    @keyframes fsb-celestial-sparkle {
        0% {
            opacity: 0;
            transform: translate(var(--star-x1, 0px), var(--star-y1, 0px)) scale(0.3);
        }
        15% {
            opacity: 1;
            transform: translate(var(--star-x1, 0px), var(--star-y1, 0px)) scale(1);
        }
        35% {
            opacity: 0;
            transform: translate(var(--star-x1, 0px), var(--star-y1, 0px)) scale(0.3);
        }
        50% {
            opacity: 0;
            transform: translate(var(--star-x2, 10px), var(--star-y2, -10px)) scale(0.3);
        }
        65% {
            opacity: 1;
            transform: translate(var(--star-x2, 10px), var(--star-y2, -10px)) scale(1);
        }
        85% {
            opacity: 0;
            transform: translate(var(--star-x2, 10px), var(--star-y2, -10px)) scale(0.3);
        }
        100% {
            opacity: 0;
            transform: translate(var(--star-x1, 0px), var(--star-y1, 0px)) scale(0.3);
        }
    }
            transform: translate(var(--star-x1, 0px), var(--star-y1, 0px)) scale(0.3);
        }
    }
    /* Mentions utilisateur et mentions de rôle avec Celestial - Hover direct */
    span[data-fsb-mention][data-fsb-celestial]:hover span[data-fsb-mention-text] {
        animation: fsb-celestial-shimmer 2s linear infinite !important;
        background-image: linear-gradient(to right, #a855f7 0%, #9333ea 30%, #e9d5ff 49%, #e9d5ff 51%, #9333ea 70%, #a855f7 100%) !important;
        background-size: 300px auto !important;
        filter: drop-shadow(0 0 2px #a855f7);
    }
    span[data-fsb-mention][data-fsb-celestial]:hover img[data-fsb-role-icon-wrapped],
    span[data-fsb-mention][data-fsb-celestial]:hover img.vc-mentionAvatars-role-icon {
        filter: drop-shadow(0 0 2px #a855f7) !important;
    }
    span[data-fsb-mention][data-fsb-celestial]:hover .vc-mentionAvatars-container {
        filter: drop-shadow(0 0 2px #a855f7) !important;
    }
    span[data-fsb-mention][data-fsb-celestial]:hover:not(:has(.vc-mentionAvatars-container)) {
        filter: drop-shadow(0 0 2px #a855f7) !important;
    }
`;

// ── 💎 CRYSTAL (SIMP) ────────────────────────────────────────────────────────

const CRYSTAL_GEM_URL = crystalGemB64 ? `data:image/png;base64,${crystalGemB64}` : "";
const CRYSTAL_GEM_COUNT = 6;

function injectCrystalGems(target: HTMLElement) {
    if (target.querySelector("[data-fsb-cgem]")) return;
    const wrap = document.createElement("span");
    wrap.dataset.fsbCrystalWrap = "1";
    wrap.style.cssText = "position:relative;display:inline-block;";
    while (target.firstChild) wrap.appendChild(target.firstChild);
    target.appendChild(wrap);

    // Créer les gemmes avec positions temporaires
    const gems: HTMLElement[] = [];
    for (let i = 0; i < CRYSTAL_GEM_COUNT; i++) {
        const gem = document.createElement("img");
        gem.dataset.fsbCgem = String(i);
        gem.src = CRYSTAL_GEM_URL;
        gem.alt = "💎";
        gem.style.setProperty("--fountain-duration", `${1.5 + (i * 0.2)}s`);
        gem.style.animationDelay = `${i * 0.15}s`;
        gem.style.top = "50%";
        gem.style.left = "50%";
        wrap.appendChild(gem);
        gems.push(gem);
    }

    // Calculer les positions après le rendu
    requestAnimationFrame(() => {
        const nameWidth = wrap.offsetWidth;
        if (nameWidth === 0) return;

        // Les gemmes partent du centre et montent en arc
        gems.forEach((gem, i) => {
            // Angle de départ pour créer un effet de fontaine
            const angle = -90 + (i - 2.5) * 20; // De -140° à -40° (vers le haut)
            const distance = 40 + (i % 2) * 10; // Distance variable
            gem.style.setProperty("--fountain-angle", `${angle}deg`);
            gem.style.setProperty("--fountain-distance", `${distance}px`);
        });
    });
}

function injectCrystalGemsVoice(voiceContainer: HTMLElement, usernameContainer: HTMLElement) {
    if (voiceContainer.querySelector("[data-fsb-cgem]")) return;
    voiceContainer.style.position = "relative";
    voiceContainer.style.overflow = "visible";

    const gems: HTMLElement[] = [];
    for (let i = 0; i < CRYSTAL_GEM_COUNT; i++) {
        const gem = document.createElement("img");
        gem.dataset.fsbCgem = String(i);
        gem.dataset.fsbCgemVoice = "1";
        gem.src = CRYSTAL_GEM_URL;
        gem.alt = "💎";
        gem.style.cssText = "position:absolute;pointer-events:none;top:50%;left:50%;";
        gem.style.setProperty("--fountain-duration", `${1.5 + (i * 0.2)}s`);
        gem.style.animationDelay = `${i * 0.15}s`;
        voiceContainer.appendChild(gem);
        gems.push(gem);
    }

    requestAnimationFrame(() => {
        const nameDiv = usernameContainer.querySelector<HTMLElement>("[data-fsb-gradient], [data-fsb-mention]") ?? usernameContainer;
        const vcRect = voiceContainer.getBoundingClientRect();
        const nameRect = nameDiv.getBoundingClientRect();
        if (vcRect.width === 0 || nameRect.width === 0) return;

        const centerLeft = (nameRect.left - vcRect.left) + nameRect.width / 2;
        const centerTop = (nameRect.top - vcRect.top) + nameRect.height / 2;

        gems.forEach((gem, i) => {
            gem.style.top = `${centerTop}px`;
            gem.style.left = `${centerLeft}px`;
            const angle = -90 + (i - 2.5) * 20;
            const distance = 40 + (i % 2) * 10;
            gem.style.setProperty("--fountain-angle", `${angle}deg`);
            gem.style.setProperty("--fountain-distance", `${distance}px`);
        });
    });
}

function cleanCrystalEl(el: HTMLElement) {
    const wrap = el.querySelector<HTMLElement>("[data-fsb-crystal-wrap]");
    if (wrap) {
        Array.from(wrap.childNodes).forEach(n => {
            if (n instanceof HTMLElement && n.dataset.fsbCgem !== undefined) return;
            el.insertBefore(n, wrap);
        });
        wrap.remove();
    }
    el.querySelectorAll("[data-fsb-cgem-voice]").forEach(s => s.remove());
    if (el.dataset.fsbCrystalVoice) { el.style.position = ""; el.style.overflow = ""; }
    delete el.dataset.fsbCrystal;
    delete el.dataset.fsbCustomAnim;
}

function applyCrystalEffect() {
    // Appliquer les gradients aux mentions de rôle en premier
    applyGradientsToRoleMentions();

    document.querySelectorAll<HTMLElement>("[data-fsb-crystal]").forEach(el => {
        const c1 = el.style.getPropertyValue("--custom-gradient-color-1");
        if (!c1 || normalizeColor(c1) !== CRYSTAL_PRIMARY_RGB) {
            cleanCrystalEl(el);
            const h = el.closest<HTMLElement>("span[data-fsb-crystal-header]");
            if (h) { delete h.dataset.fsbCrystalHeader; delete h.dataset.fsbCustomAnim; }
        }
    });
    document.querySelectorAll<HTMLElement>("span[data-fsb-crystal-header]").forEach(h => {
        if (!h.querySelector("[data-fsb-crystal]")) { delete h.dataset.fsbCrystalHeader; delete h.dataset.fsbCustomAnim; }
    });
    document.querySelectorAll<HTMLElement>('span[class*="nameContainer"][data-fsb-gradient]:not([data-fsb-crystal])').forEach(el => {
        if (normalizeColor(el.style.getPropertyValue("--custom-gradient-color-1")) !== CRYSTAL_PRIMARY_RGB) return;
        el.dataset.fsbCrystal = "1"; el.dataset.fsbCustomAnim = "1";
        const nameSpan = el.querySelector<HTMLElement>('span[class*="name__"]');
        if (nameSpan && !nameSpan.querySelector("[data-fsb-crystal-wrap]")) injectCrystalGems(nameSpan);
    });
    document.querySelectorAll<HTMLElement>('span[class*="username_"][data-fsb-gradient]:not([data-fsb-crystal])').forEach(el => {
        if (normalizeColor(el.style.getPropertyValue("--custom-gradient-color-1")) !== CRYSTAL_PRIMARY_RGB) return;
        el.dataset.fsbCrystal = "1"; el.dataset.fsbCustomAnim = "1";
        const h = el.closest<HTMLElement>('span[class*="headerText"]');
        if (h) { h.dataset.fsbCrystalHeader = "1"; h.dataset.fsbCustomAnim = "1"; }
        if (!el.querySelector("[data-fsb-crystal-wrap]")) injectCrystalGems(el);
    });
    document.querySelectorAll<HTMLElement>('[aria-hidden="true"][data-fsb-cat-checked]:not([data-fsb-crystal])').forEach(el => {
        if (normalizeColor(el.style.getPropertyValue("--custom-gradient-color-1")) !== CRYSTAL_PRIMARY_RGB) return;
        el.dataset.fsbCrystal = "1"; el.dataset.fsbCustomAnim = "1";
    });
    document.querySelectorAll<HTMLElement>('div[class*="usernameContainer_"][data-fsb-voice-checked]:not([data-fsb-crystal])').forEach(container => {
        const gradDiv = container.querySelector<HTMLElement>("[data-fsb-gradient], [data-fsb-mention]");
        const c1 = gradDiv?.style.getPropertyValue("--custom-gradient-color-1") ?? container.style.getPropertyValue("--custom-gradient-color-1");
        if (!c1 || normalizeColor(c1) !== CRYSTAL_PRIMARY_RGB) return;
        container.dataset.fsbCrystal = "1"; container.dataset.fsbCustomAnim = "1";
        const vc = container.parentElement;
        if (vc?.dataset.fsbVoiceContainer) {
            vc.dataset.fsbCrystalVoice = "1"; vc.dataset.fsbCustomAnim = "1";
            if (!vc.querySelector("[data-fsb-cgem]")) injectCrystalGemsVoice(vc, container);
        }
    });
    // Mentions utilisateur et mentions de rôle avec Crystal
    document.querySelectorAll<HTMLElement>("span[data-fsb-mention][data-fsb-gradient]:not([data-fsb-crystal])").forEach(mention => {
        const c1 = mention.style.getPropertyValue("--custom-gradient-color-1");
        if (!c1 || normalizeColor(c1) !== CRYSTAL_PRIMARY_RGB) return;
        mention.dataset.fsbCrystal = "1"; mention.dataset.fsbCustomAnim = "1";
    });
}

function cleanupCrystalEffect() {
    document.querySelectorAll<HTMLElement>("[data-fsb-crystal]").forEach(el => {
        cleanCrystalEl(el);
        const h = el.closest<HTMLElement>("span[data-fsb-crystal-header]");
        if (h) { delete h.dataset.fsbCrystalHeader; delete h.dataset.fsbCustomAnim; }
    });
}

const CRYSTAL_CSS = `
    span[data-fsb-crystal] span[class*="name__"], span[class*="username_"][data-fsb-crystal] {
        background-image: linear-gradient(to right, #ff5dd6, #ff9cbf, #ff5dd6) !important; background-size: 200px auto !important;
    }
    span[class*="username_"][data-fsb-crystal]:has([data-fsb-crystal-wrap]) { background-image: none !important; -webkit-text-fill-color: unset !important; }
    @keyframes fsb-crystal-shimmer { 0% { background-position: -300px 50%; } 100% { background-position: 300px 50%; } }
    div[role="article"]:hover [data-fsb-crystal-wrap], li[class*="messageListItem"]:hover [data-fsb-crystal-wrap],
    div[class*="member__"]:hover [data-fsb-crystal-wrap], a:hover [data-fsb-crystal-wrap],
    div[class*="voiceUser"]:hover [data-fsb-crystal-wrap] {
        animation: fsb-crystal-shimmer 2s linear infinite !important;
        background-image: linear-gradient(to right, #ff5dd6 0%, #ff33cc 30%, #ffd6f2 49%, #ffd6f2 51%, #ff33cc 70%, #ff5dd6 100%) !important;
        background-size: 300px auto !important;
    }
    div[class*="member__"]:hover span[data-fsb-crystal], a:hover span[data-fsb-crystal], span[data-fsb-crystal]:hover { filter: drop-shadow(0 0 4px #ff5dd6) !important; }
    div[role="article"]:hover span[class*="headerText"][data-fsb-crystal-header],
    li[class*="messageListItem"]:hover span[class*="headerText"][data-fsb-crystal-header] { filter: drop-shadow(0 0 4px #ff5dd6) !important; }
    div[role="article"]:hover span[class*="headerText"][data-fsb-crystal-header] span[class*="botTag"],
    li[class*="messageListItem"]:hover span[class*="headerText"][data-fsb-crystal-header] span[class*="botTag"] { filter: none !important; }
    div[role="article"]:hover span[class*="username_"][data-fsb-crystal],
    li[class*="messageListItem"]:hover span[class*="username_"][data-fsb-crystal] { filter: none !important; }
    div[class*="members_"]:hover div[data-fsb-crystal] { filter: drop-shadow(0 0 4px #ff5dd6) !important; }
    div[class*="voiceUser"]:hover [data-fsb-voice-container][data-fsb-crystal-voice] { filter: drop-shadow(0 0 4px #ff5dd6) !important; }
    span[class*="username_"][data-fsb-crystal], span[class*="headerText"][data-fsb-crystal-header],
    span[class*="nameContainer"][data-fsb-crystal], span[data-fsb-crystal] span[class*="name__"] { overflow: visible !important; }
    [data-fsb-crystal-wrap] {
        position: relative !important; display: inline-block !important; overflow: visible !important;
        background-image: linear-gradient(to right, #ff5dd6, #ff9cbf, #ff5dd6) !important;
        -webkit-background-clip: text !important; background-clip: text !important;
        -webkit-text-fill-color: transparent !important; background-size: 200px auto !important;
    }
    [data-fsb-cgem] {
        position: absolute !important; display: inline-block !important; pointer-events: none !important;
        width: 16px !important; height: 16px !important;
        opacity: 0 !important; z-index: 999999 !important;
        margin: -8px 0 0 -8px !important;
        filter: drop-shadow(0 0 4px #ff5dd6) drop-shadow(0 0 2px #ff9cbf);
        object-fit: contain !important;
    }
    [data-fsb-cgem-voice] { margin: -8px 0 0 -8px !important; }
    div[class*="member__"]:hover [data-fsb-crystal-wrap] [data-fsb-cgem],
    div[role="article"]:hover [data-fsb-crystal-wrap] [data-fsb-cgem],
    li[class*="messageListItem"]:hover [data-fsb-crystal-wrap] [data-fsb-cgem],
    span[data-fsb-crystal-wrap]:hover [data-fsb-cgem] {
        opacity: 1 !important;
        animation: fsb-crystal-fountain var(--fountain-duration, 1.8s) ease-out infinite !important;
    }
    div[class*="voiceUser"]:hover [data-fsb-voice-container][data-fsb-crystal-voice] [data-fsb-cgem-voice] {
        opacity: 1 !important;
        animation: fsb-crystal-fountain var(--fountain-duration, 1.8s) ease-out infinite !important;
    }
    @keyframes fsb-crystal-fountain {
        0% {
            opacity: 0;
            transform: rotate(var(--fountain-angle, -90deg)) translateX(0px) scale(0.3);
        }
        15% {
            opacity: 1;
        }
        75% {
            opacity: 1;
            transform: rotate(var(--fountain-angle, -90deg)) translateX(var(--fountain-distance, 40px)) scale(1);
        }
        100% {
            opacity: 0;
            transform: rotate(var(--fountain-angle, -90deg)) translateX(calc(var(--fountain-distance, 40px) + 5px)) scale(0.8);
        }
    }
    /* Mentions utilisateur et mentions de rôle avec Crystal */
    /* Animation au hover DIRECT de la mention */
    span[data-fsb-mention][data-fsb-crystal]:hover span[data-fsb-mention-text] {
        animation: fsb-crystal-shimmer 2s linear infinite !important;
        background-image: linear-gradient(to right, #ff5dd6 0%, #ff33cc 30%, #ffd6f2 49%, #ffd6f2 51%, #ff33cc 70%, #ff5dd6 100%) !important;
        background-size: 300px auto !important;
        filter: drop-shadow(0 0 2px #ff5dd6);
    }
    span[data-fsb-mention][data-fsb-crystal]:hover img[data-fsb-role-icon-wrapped],
    span[data-fsb-mention][data-fsb-crystal]:hover img.vc-mentionAvatars-role-icon {
        filter: drop-shadow(0 0 2px #ff5dd6) !important;
    }
    span[data-fsb-mention][data-fsb-crystal]:hover .vc-mentionAvatars-container {
        filter: drop-shadow(0 0 2px #ff5dd6) !important;
    }
    span[data-fsb-mention][data-fsb-crystal]:hover:not(:has(.vc-mentionAvatars-container)) {
        filter: drop-shadow(0 0 2px #ff5dd6) !important;
    }
`;

// ── Appliquer les gradients aux mentions de rôle ─────────────────────────────

/** Wrappe les nœuds texte dans un span avec gradient pour les mentions */
function wrapMentionTextNodes(node: Node, g: { primary: string; secondary: string; tertiary: string; }) {
    if (node.nodeType === Node.TEXT_NODE) {
        if (!(node.textContent ?? "").trim()) return;
        if ((node.parentElement as HTMLElement | null)?.dataset?.fsbMentionText) return;
        const wrapper = document.createElement("span");
        wrapper.dataset.fsbMentionText = "1";
        wrapper.style.setProperty("--custom-gradient-color-1", g.primary);
        wrapper.style.setProperty("--custom-gradient-color-2", g.secondary);
        wrapper.style.setProperty("--custom-gradient-color-3", g.tertiary);
        node.parentNode!.insertBefore(wrapper, node);
        wrapper.appendChild(node);
        return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el.tagName === "IMG" || el.tagName === "SVG" || el.dataset.fsbMentionText) return;
    for (const child of Array.from(el.childNodes)) {
        wrapMentionTextNodes(child, g);
    }
}

/**
 * Applique les gradients aux mentions de rôle qui ont une couleur hardcodée.
 * Cette fonction doit être appelée APRÈS que fakeServerBoost ait fait son premier scan,
 * car fakeServerBoost ne traite pas les mentions de rôle (elles contiennent des images SVG).
 */
function applyGradientsToRoleMentions() {
    // Trouver toutes les mentions de rôle qui n'ont pas encore été traitées
    document.querySelectorAll<HTMLElement>("span[class*=\"roleMention\"]:not([data-fsb-mention])").forEach(mention => {
        // Extraire le nom du rôle depuis le texte
        const roleNameSpan = mention.querySelector("span > span");
        if (!roleNameSpan) return;
        const roleName = roleNameSpan.textContent?.replace("@", "").trim();
        if (!roleName) return;

        // Chercher le rôle correspondant dans HARDCODED_ROLE_COLORS
        let roleData: RoleColorData | null = null;
        let roleId: string | null = null;

        for (const [id, data] of Object.entries(HARDCODED_ROLE_COLORS)) {
            // On ne peut pas matcher par nom car on n'a pas accès au GuildRoleStore ici
            // On va devoir se baser sur la couleur inline de la mention
            const inlineColor = mention.style.color;
            if (!inlineColor) continue;

            // Normaliser la couleur inline pour comparer
            const normalized = normalizeColor(inlineColor);
            const primaryNormalized = data.colorStrings?.primaryColor ? normalizeColor(data.colorStrings.primaryColor) : null;

            if (normalized === primaryNormalized) {
                roleData = data;
                roleId = id;
                break;
            }
        }

        if (!roleData || !roleData.colorStrings?.secondaryColor) return;

        // Appliquer les CSS vars de gradient
        mention.style.setProperty("--custom-gradient-color-1", roleData.colorStrings.primaryColor!);
        mention.style.setProperty("--custom-gradient-color-2", roleData.colorStrings.secondaryColor);
        mention.style.setProperty("--custom-gradient-color-3", roleData.colorStrings.tertiaryColor ?? roleData.colorStrings.primaryColor!);
        mention.dataset.fsbMention = "1";
        mention.dataset.fsbGradient = "1";

        // Wrapper les nœuds texte pour qu'ils aient le gradient
        const g = {
            primary: roleData.colorStrings.primaryColor!,
            secondary: roleData.colorStrings.secondaryColor,
            tertiary: roleData.colorStrings.tertiaryColor ?? roleData.colorStrings.primaryColor!
        };
        wrapMentionTextNodes(mention, g);
    });
}

// ── Définition de tous les effets à enregistrer ───────────────────────────────

const CUSTOM_EFFECTS: CustomEffect[] = [
    { id: "birthday", styleCSS: BIRTHDAY_CSS, applyFn: applyBirthdayEffect, cleanupFn: cleanupBirthdayEffect, primaryRGB: BIRTHDAY_PRIMARY_RGB },
    { id: "netricsa", styleCSS: NETRICSA_CSS, applyFn: applyNetricsaEffect, cleanupFn: cleanupNetricsaEffect, primaryRGB: NETRICSA_PRIMARY_RGB },
    {
        id: "medals",
        styleCSS: MEDALS_CSS,
        applyFn: () => { for (const def of SIMPLE_EFFECT_DEFS) makeSimpleApply(def)(); },
        cleanupFn: () => { for (const def of SIMPLE_EFFECT_DEFS) makeSimpleCleanup(def)(); },
    },
    { id: "celestial", styleCSS: CELESTIAL_CSS, applyFn: applyCelestialEffect, cleanupFn: cleanupCelestialEffect, primaryRGB: CELESTIAL_PRIMARY_RGB },
    { id: "crystal", styleCSS: CRYSTAL_CSS, applyFn: applyCrystalEffect, cleanupFn: cleanupCrystalEffect, primaryRGB: CRYSTAL_PRIMARY_RGB },
];

// ── Fonds de channel (DynamicChannelBackground) ───────────────────────────────
// Définis une constante pour chaque image et réutilise-la sur plusieurs channels.
// Format : channelId → url

const BG_FROSTPOST = bgFrostpostB64 ? `data:image/jpeg;base64,${bgFrostpostB64}` : "";
const BG_KRONOR = bgKronorB64 ? `data:image/jpeg;base64,${bgKronorB64}` : "";
const BG_LAND_DAMNED = bgLandofTheDamnedB64 ? `data:image/jpeg;base64,${bgLandofTheDamnedB64}` : "";
const BG_MENTAL_INST = bgMentalInstitutionB64 ? `data:image/jpeg;base64,${bgMentalInstitutionB64}` : "";
const BG_NETRICSA = bgNetricsaB64 ? `data:image/png;base64,${bgNetricsaB64}` : "";
const BG_OIL_RIG = bgOilRigB64 ? `data:image/jpeg;base64,${bgOilRigB64}` : "";
const BG_SIBERIA = bgSiberiaB64 ? `data:image/jpeg;base64,${bgSiberiaB64}` : "";
const BG_SARATOGA = bgSaratogaB64 ? `data:image/png;base64,${bgSaratogaB64}` : "";
const BG_SIRIUS = bgSiriusB64 ? `data:image/jpeg;base64,${bgSiriusB64}` : "";
const BG_SSS_CENTERPRICE = bgSSSCenterpriceB64 ? `data:image/jpeg;base64,${bgSSSCenterpriceB64}` : "";
const BG_GiantJunkyard = bgGiantJunkyardB64 ? `data:image/jpeg;base64,${bgGiantJunkyardB64}` : "";
const BG_Countryside = bgCountrysideB64 ? `data:image/jpeg;base64,${bgCountrysideB64}` : "";
const BG_SierraDeChiapas = bgSierraDeChiapasB64 ? `data:image/jpeg;base64,${bgSierraDeChiapasB64}` : "";
const BG_Nexa = bgNexaB64 ? `data:image/jpeg;base64,${bgNexaB64}` : "";
const BG_Treetops = bgTreetopsB64 ? `data:image/jpeg;base64,${bgTreetopsB64}` : "";
const BG_TNSSMP2 = bgTNSSSMPB64 ? `data:image/jpeg;base64,${bgTNSSSMPB64}` : "";
const BG_TNSSMP2_Bridge = bgTNSSSMPBridgeB64 ? `data:image/jpeg;base64,${bgTNSSSMPBridgeB64}` : "";

const CHANNEL_BGS: Record<string, string> = {
    "1470500922726809600": BG_SARATOGA, // #saratoga

    "1464154088492236831": BG_SARATOGA, // #saratoga
    "1158184382679498832": BG_SARATOGA, // #saratoga
    "827364829567647777": BG_SARATOGA, // #saratoga
    "829520141112836158": BG_SARATOGA, // #saratoga
    "1159552062846156810": BG_SARATOGA, // #saratoga
    "1159632067072630794": BG_SARATOGA, // #saratoga
    "1159553247158214737": BG_SARATOGA, // #saratoga

    "1174901601757040700": BG_SierraDeChiapas, // #land-of-the-damned
    "1278197210470944828": BG_GiantJunkyard, // #frostpost
    "1025941810499039272": BG_Treetops , // #oil-rig
    "829527572374224916": BG_Countryside, // #siberia

    "1468019853108711474": BG_NETRICSA, // #netricsa
    "1464063041950974125": BG_NETRICSA, // #netricsa
    "1469605945687408732": BG_NETRICSA, // #netricsa
    "1470245567392383019": BG_NETRICSA, // #netricsa
    "829523675594096650": BG_NETRICSA, // #netricsa
    "1472390304962445352": BG_Nexa, // #netricsa

    "1442594973643178004": BG_SIRIUS, // #sirius
    "1468008008570241130": BG_KRONOR, // #kronor
    "1466318031025209477": BG_KRONOR, // #kronor
    "1466318046632087637": BG_KRONOR, // #kronor
    "1466219791025963245": BG_SIRIUS, // #sirius
    "1129450972146573431": BG_SSS_CENTERPRICE, // #sss-centerprice
    "1159549877563445330": BG_MENTAL_INST, // #mental-institution

    "1481901329696817272": BG_TNSSMP2,
    "1481900902024482998": BG_TNSSMP2_Bridge,
    "1481902621005713530": BG_TNSSMP2,

};

// Fond par serveur (sidebar via DynamicChannelBackground)
// Distinct de la bannière Discord affichée dans le profil du serveur.
const BG_TNSSL = bgTNSSLB64 ? `data:image/jpeg;base64,${bgTNSSLB64}` : "";

const GUILD_BGS: Record<string, string> = {
    [HARDCODED_GUILD_ID]: BG_TNSSL, // TNSSL – fond de sidebar hardcodé
};

// ── Plugin ────────────────────────────────────────────────────────────────────

export default definePlugin({
    name: "The Not So Serious Cord",
    description: "Apply custom colors to specific bots' messages and names with configurable intensity",
    authors: [Devs.Ven],
    dependencies: ["Fake Server Boost Level 2", "DynamicChannelBackground", "AnimatedMediaFocusPause","UserPFPServerAvatarFix"],
    settings,

    start() {
        try { MessageStore = findByProps("getMessages", "getMessage"); }
        catch (e) { console.warn("[botRoleColor] Could not find MessageStore", e); }

        applyHardcodedBanner();
        patchGuildStoreForBanner();
        registerHardcodedRoleColors(HARDCODED_ROLE_COLORS);
        registerHardcodedChannelBgs(CHANNEL_BGS);
        registerHardcodedGuildBgs(GUILD_BGS);
        updateHideTagsStyle();
        updateHideTagsGuildClass();

        // Mettre à jour le fond global quand on change de guild
        (this as any)._guildSelectListener = () => { registerAllGuildBanners(); updateHideTagsGuildClass(); };
        FluxDispatcher.subscribe("GUILD_SELECT", (this as any)._guildSelectListener);
        FluxDispatcher.subscribe("CHANNEL_SELECT", (this as any)._guildSelectListener);

        // Enregistrer tous les effets custom dans fakeServerBoost
        for (const effect of CUSTOM_EFFECTS) {
            registerCustomEffect(effect);
        }

        setTimeout(() => applyBotRoleColor(), 100);

        function resetMessageElement(article: HTMLElement): void {
            article.querySelectorAll("[data-vc-colored]").forEach((el: Element) => {
                const h = el as HTMLElement; h.style.color = ""; h.style.textShadow = ""; delete h.dataset.vcColored;
            });
            article.querySelectorAll("[data-vc-embed-applied], article[data-vc-embed-applied]").forEach((el: Element) => {
                const embed = el as HTMLElement;
                delete embed.dataset.vcBgApplied; delete embed.dataset.vcEmbedApplied;
            });
            if (article.dataset.vcEmbedApplied) { delete article.dataset.vcBgApplied; delete article.dataset.vcEmbedApplied; }
            article.querySelectorAll("[data-vc-comp-v2-applied]").forEach((el: Element) => {
                delete (el as HTMLElement).dataset.vcCompV2Applied;
            });
            if (article.dataset.vcCompV2Applied) delete article.dataset.vcCompV2Applied;
            article.querySelectorAll("[data-vc-msg-applied]").forEach((el: Element) => { delete (el as HTMLElement).dataset.vcMsgApplied; });
            if (article.dataset.vcMsgApplied) delete article.dataset.vcMsgApplied;
            article.querySelectorAll("[data-original-color]").forEach((el: Element) => { const h = el as HTMLElement; h.style.color = h.dataset.originalColor || ""; delete h.dataset.originalColor; });
        }

        function safeApply(fn: () => void): void {
            if (isApplying) return;
            isApplying = true;
            try { fn(); } finally { isApplying = false; }
        }

        // Throttle : ne déclencher applyBotRoleColor qu'une fois par frame,
        // et seulement si une mutation pertinente a été détectée.
        let rafPending = false;
        let pendingReset = new Set<HTMLElement>();

        function scheduleApplyBot() {
            if (rafPending) return;
            rafPending = true;
            requestAnimationFrame(() => {
                rafPending = false;
                if (pendingReset.size > 0) {
                    const toReset = pendingReset;
                    pendingReset = new Set();
                    safeApply(() => { toReset.forEach(article => resetMessageElement(article)); });
                }
                safeApply(() => applyBotRoleColor());
            });
        }

        const observer = new MutationObserver((mutations: MutationRecord[]) => {
            if (isApplying) return;

            let hasRelevantNew = false;

            for (const mutation of mutations) {
                if (mutation.type !== "childList") continue;

                // Ignorer nos propres injections (overlays, éléments colorés)
                // Exceptions : icônes de rôle dans le serveur cible (besoin de re-scan pour les styles de masquage)
                const allNodes = [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)];
                const isOurMutation = allNodes.every(n => {
                    if (n.nodeType !== Node.ELEMENT_NODE) return true;
                    const el = n as HTMLElement;
                    // Toujours ignorer les éléments colorés et les étoiles d'anniversaire
                    if (el.dataset.vcColored !== undefined || el.dataset.fsbBdayStar !== undefined) return true;
                    // Pour les icônes de rôle : ignorer seulement si on n'est PAS dans le serveur cible
                    if (el.dataset.fsbRoleIcon !== undefined) {
                        const currentGuildId = SelectedGuildStore?.getGuildId?.() ?? null;
                        // Si on est dans le serveur cible, ne pas ignorer (pour déclencher le re-scan)
                        return currentGuildId !== HARDCODED_GUILD_ID;
                    }
                    return false;
                });
                if (isOurMutation) continue;

                // Détecter si du contenu pertinent a été retiré (embed re-rendu)
                const hasRemovedContent = Array.from(mutation.removedNodes).some(n => {
                    if (n.nodeType !== Node.ELEMENT_NODE) return false;
                    const el = n as HTMLElement;
                    return el.matches?.('article[class*="embed"]')
                        || el.matches?.('[class*="messageContent"]')
                        || el.matches?.('[class*="isComponentsV2"]')
                        || el.querySelector?.('article[class*="embed"]') !== null
                        || el.querySelector?.('[class*="isComponentsV2"]') !== null;
                });

                if (hasRemovedContent) {
                    let node: Element | null = mutation.target as Element;
                    while (node && node !== document.body) {
                        if (node.getAttribute("role") === "article") { pendingReset.add(node as HTMLElement); break; }
                        node = node.parentElement;
                    }
                    hasRelevantNew = true;
                    continue;
                }

                // Vérifier si des nœuds ajoutés sont pertinents pour applyBotRoleColor
                // (messages, embeds, composants V2 — pas les mutations de style pure)
                const target = mutation.target as HTMLElement;
                const isInMessageArea = !!(
                    target.closest?.('[class*="cozy"][class*="wrapper"]')
                    ?? target.closest?.('[role="article"]')
                    ?? target.closest?.('[class*="chat_"]')
                    ?? Array.from(mutation.addedNodes).some(n => {
                        if (n.nodeType !== Node.ELEMENT_NODE) return false;
                        const el = n as HTMLElement;
                        return el.matches?.('[class*="cozy"][class*="wrapper"]')
                            || el.matches?.('[role="article"]')
                            || el.querySelector?.('[class*="messageContent"]') !== null
                            || el.querySelector?.('article[class*="embed"]') !== null;
                    })
                );
                if (isInMessageArea) hasRelevantNew = true;
            }

            if (!hasRelevantNew && pendingReset.size === 0) return;
            scheduleApplyBot();
        });

        observer.observe(document.body, { childList: true, subtree: true });
        (this as any).observer = observer;
    },

    stop() {
        (this as any).observer?.disconnect();
        resetAllBotColors();
        removeHardcodedBanner();
        removeHideTagsStyle();

        // Désabonner les listeners de changement de guild
        if ((this as any)._guildSelectListener) {
            FluxDispatcher.unsubscribe("GUILD_SELECT", (this as any)._guildSelectListener);
            FluxDispatcher.unsubscribe("CHANNEL_SELECT", (this as any)._guildSelectListener);
            (this as any)._guildSelectListener = null;
        }

        // Désenregistrer les effets custom
        for (const effect of CUSTOM_EFFECTS) {
            unregisterCustomEffect(effect.id);
        }

        unregisterHardcodedRoleColors(Object.keys(HARDCODED_ROLE_COLORS));
        unregisterHardcodedChannelBgs(CHANNEL_BGS);
        unregisterHardcodedGuildBgs(GUILD_BGS);
        // Les bannières dynamiques sont désenregistrées dans removeHardcodedBanner()
    },
});
