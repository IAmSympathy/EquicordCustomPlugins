/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { findByProps } from "@webpack";
import { GuildStore } from "@webpack/common";
import backgroundImageB64 from "file://./assets/background.png?base64";
import bannerB64 from "file://./assets/banner.png?base64";

import { applyGradientToNames, registerHardcodedRoleColors, RoleColorData, unregisterHardcodedRoleColors } from "../fakeServerBoost";

const BACKGROUND_DATA_URL = backgroundImageB64 ? `data:image/png;base64,${backgroundImageB64}` : "";

// Bannière hardcodée pour le serveur The Not So Serious Lands
const HARDCODED_GUILD_ID = "827364829567647774";
const BANNER_DATA_URL = bannerB64 ? `data:image/png;base64,${bannerB64}` : "";
let bannerStyleElement: HTMLStyleElement | null = null;
let originalGetGuild: any;
let originalGetGuilds: any;

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
    // Klodovik (bot)
    "1473430517864075478": {
        colorStrings: { primaryColor: "#56fd0d", secondaryColor: "#f1ee27", tertiaryColor: undefined },
        colors: { primary_color: 5700877, secondary_color: 15855143, tertiary_color: undefined },
        displayNameStyles: null,
    },
    // Nexa 🎵 (bot)
    "1475717569200783382": {
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
    }
});

// ── Bannière hardcodée ────────────────────────────────────────────────────────

function applyHardcodedBanner() {
    if (!BANNER_DATA_URL) return;
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

function removeHardcodedBanner() {
    bannerStyleElement?.remove();
    bannerStyleElement = null;
    if (originalGetGuild && GuildStore?.getGuild) { GuildStore.getGuild = originalGetGuild; originalGetGuild = null; }
    if (originalGetGuilds && GuildStore?.getGuilds) { GuildStore.getGuilds = originalGetGuilds; originalGetGuilds = null; }
}

function patchGuildStoreForBanner() {
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
const BOTS_WITH_BG = new Set(["1462959115528835092"]);

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

function applyComponentV2Background(compV2: HTMLElement): void {
    if (!BACKGROUND_DATA_URL) return;
    // Le conteneur visuel avec la barre de couleur gauche
    const card = (compV2.querySelector('[class*="withAccentColor"]') as HTMLElement | null)
        ?? (compV2.firstElementChild as HTMLElement | null)
        ?? compV2;
    applyEmbedBackground(card, true);
}

function applyEmbedBackground(embed: HTMLElement, preserveLeftBorder = false): void {
    if (!BACKGROUND_DATA_URL || embed.dataset.vcBgApplied) return;
    const pos = window.getComputedStyle(embed).position;
    if (pos === "static") embed.style.position = "relative";
    // Si preserveLeftBorder, on mesure la largeur réelle du border-left pour ne pas le recouvrir
    const leftOffset = preserveLeftBorder
        ? (parseInt(window.getComputedStyle(embed).borderLeftWidth, 10) || 4) + "px"
        : "0";
    const bg = document.createElement("div");
    bg.setAttribute("data-vc-bg-overlay", "1");
    bg.style.cssText = [
        "position: absolute",
        "top: 0", "right: 0", "bottom: 0", `left: ${leftOffset}`,
        `background-image: url("${BACKGROUND_DATA_URL}")`,
        "background-size: cover", "background-position: center", "background-repeat: no-repeat",
        "filter: brightness(1)", "pointer-events: none", "z-index: 0",
        preserveLeftBorder ? "border-radius: 0 inherit inherit 0" : "border-radius: inherit",
    ].join(";");
    embed.insertBefore(bg, embed.firstChild);
    for (const child of Array.from(embed.children)) {
        if (child === bg) continue;
        const c = child as HTMLElement;
        if (!c.style.position || c.style.position === "static") c.style.position = "relative";
        if (!c.style.zIndex) c.style.zIndex = "1";
    }
    embed.dataset.vcBgApplied = "1";
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
        const shouldBg = BOTS_WITH_BG.has(userId);
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
            if (shouldBg && BACKGROUND_DATA_URL) applyEmbedBackground(embed);
            for (const child of Array.from(embed.childNodes)) colorizeNode(child, newR, newG, newB, shouldGlow, glowIntensity);
            embed.dataset.vcEmbedApplied = "1";
        });

        messageWrapper.querySelectorAll('[class*="isComponentsV2"]').forEach((compV2El: Element) => {
            const compV2 = compV2El as HTMLElement;
            if (compV2.dataset.vcCompV2Applied) return;
            if (shouldBg && BACKGROUND_DATA_URL) applyComponentV2Background(compV2);
            for (const child of Array.from(compV2.childNodes)) colorizeNode(child, newR, newG, newB, shouldGlow, glowIntensity);
            compV2.dataset.vcCompV2Applied = "1";
        });
    });
    applyBotRoleColorToReplies();
    applyToOrphanEmbeds();
    applyToOrphanComponentsV2();
    applyGradientToNames();
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
        const shouldBg = BOTS_WITH_BG.has(userId);
        const intensity = settings.store.colorIntensity / 100;
        const { glowIntensity } = settings.store;
        const [newR, newG, newB] = interpolateColor(220, 221, 222, roleR, roleG, roleB, intensity);
        if (shouldBg && BACKGROUND_DATA_URL) applyEmbedBackground(embed);
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
        const shouldBg = BOTS_WITH_BG.has(userId);
        const intensity = settings.store.colorIntensity / 100;
        const { glowIntensity } = settings.store;
        const [newR, newG, newB] = interpolateColor(220, 221, 222, roleR, roleG, roleB, intensity);
        if (shouldBg && BACKGROUND_DATA_URL) applyComponentV2Background(compV2);
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
        embed.querySelector("[data-vc-bg-overlay]")?.remove();
        embed.style.position = "";
        delete embed.dataset.vcBgApplied;
        delete embed.dataset.vcEmbedApplied;
        for (const child of Array.from(embed.children)) {
            const c = child as HTMLElement;
            c.style.position = "";
            c.style.zIndex = "";
        }
    });
    document.querySelectorAll("[data-vc-comp-v2-applied]").forEach((el: Element) => {
        const compV2 = el as HTMLElement;
        // Le bg-overlay peut être sur un sous-élément (la card withAccentColor)
        const cardWithBg = (compV2.querySelector("[data-vc-bg-applied]") as HTMLElement | null) ?? compV2;
        cardWithBg.querySelector("[data-vc-bg-overlay]")?.remove();
        cardWithBg.style.position = "";
        delete cardWithBg.dataset.vcBgApplied;
        for (const child of Array.from(cardWithBg.children)) {
            const c = child as HTMLElement;
            c.style.position = "";
            c.style.zIndex = "";
        }
        delete compV2.dataset.vcCompV2Applied;
    });
    document.querySelectorAll("[data-vc-msg-applied]").forEach((el: Element) => { delete (el as HTMLElement).dataset.vcMsgApplied; });
    document.querySelectorAll("[data-vc-reply-applied]").forEach((el: Element) => { delete (el as HTMLElement).dataset.vcReplyApplied; });
    document.querySelectorAll("[data-original-color]").forEach((el: Element) => {
        const h = el as HTMLElement;
        h.style.color = h.dataset.originalColor || "";
        delete h.dataset.originalColor;
    });
}

export default definePlugin({
    name: "The Not So Serious Cord",
    description: "Apply custom colors to specific bots' messages and names with configurable intensity",
    authors: [Devs.IAmSympathy],
    dependencies: ["Fake Server Boost Level 2"],
    settings,

    start() {
        try { MessageStore = findByProps("getMessages", "getMessage"); }
        catch (e) { console.warn("[botRoleColor] Could not find MessageStore", e); }

        applyHardcodedBanner();
        patchGuildStoreForBanner();
        registerHardcodedRoleColors(HARDCODED_ROLE_COLORS);
        // Le rgbToGradient est reconstruit dans fakeServerBoost via rebuildRgbIndex() appelé par registerHardcodedRoleColors
        // On déclenche un premier passage DOM après que React ait eu le temps de rendre les noms
        setTimeout(() => applyGradientToNames(), 200);

        setTimeout(() => applyBotRoleColor(), 100);

        function resetMessageElement(article: HTMLElement): void {
            article.querySelectorAll("[data-vc-colored]").forEach((el: Element) => {
                const h = el as HTMLElement; h.style.color = ""; h.style.textShadow = ""; delete h.dataset.vcColored;
            });
            article.querySelectorAll("[data-vc-embed-applied], article[data-vc-embed-applied]").forEach((el: Element) => {
                const embed = el as HTMLElement;
                embed.querySelector("[data-vc-bg-overlay]")?.remove();
                embed.style.position = ""; delete embed.dataset.vcBgApplied; delete embed.dataset.vcEmbedApplied;
                for (const child of Array.from(embed.children)) { const c = child as HTMLElement; c.style.position = ""; c.style.zIndex = ""; }
            });
            if (article.dataset.vcEmbedApplied) { article.querySelector("[data-vc-bg-overlay]")?.remove(); article.style.position = ""; delete article.dataset.vcBgApplied; delete article.dataset.vcEmbedApplied; }
            article.querySelectorAll("[data-vc-comp-v2-applied]").forEach((el: Element) => {
                const compV2 = el as HTMLElement;
                const cardWithBg = (compV2.querySelector("[data-vc-bg-applied]") as HTMLElement | null) ?? compV2;
                cardWithBg.querySelector("[data-vc-bg-overlay]")?.remove();
                cardWithBg.style.position = ""; delete cardWithBg.dataset.vcBgApplied;
                for (const child of Array.from(cardWithBg.children)) { const c = child as HTMLElement; c.style.position = ""; c.style.zIndex = ""; }
                delete compV2.dataset.vcCompV2Applied;
            });
            if (article.dataset.vcCompV2Applied) {
                const cardWithBg = (article.querySelector("[data-vc-bg-applied]") as HTMLElement | null) ?? article;
                cardWithBg.querySelector("[data-vc-bg-overlay]")?.remove();
                cardWithBg.style.position = ""; delete cardWithBg.dataset.vcBgApplied;
                delete article.dataset.vcCompV2Applied;
            }
            article.querySelectorAll("[data-vc-msg-applied]").forEach((el: Element) => { delete (el as HTMLElement).dataset.vcMsgApplied; });
            if (article.dataset.vcMsgApplied) delete article.dataset.vcMsgApplied;
            article.querySelectorAll("[data-original-color]").forEach((el: Element) => { const h = el as HTMLElement; h.style.color = h.dataset.originalColor || ""; delete h.dataset.originalColor; });
        }

        function safeApply(fn: () => void): void {
            if (isApplying) return;
            isApplying = true;
            try { fn(); } finally { isApplying = false; }
        }

        let rafPending = false;
        const observer = new MutationObserver((mutations: MutationRecord[]) => {
            if (isApplying) return;
            let hasNewNodes = false;
            const articlesToReset = new Set<HTMLElement>();

            for (const mutation of mutations) {
                if (mutation.type === "attributes") continue;
                if (mutation.type !== "childList") continue;
                if (mutation.addedNodes.length > 0) hasNewNodes = true;
                if (mutation.type === "childList") {
                    const allNodes = [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)];
                    if (allNodes.length > 0 && allNodes.every(n => n.nodeType !== Node.ELEMENT_NODE || (n as HTMLElement).hasAttribute("data-vc-bg-overlay"))) continue;

                    const hasRemovedContent = Array.from(mutation.removedNodes).some(n => {
                        if (n.nodeType !== Node.ELEMENT_NODE) return false;
                        const el = n as HTMLElement;
                        return el.matches('article[class*="embed"]') || el.matches('[class*="messageContent"]') || el.matches('[class*="isComponentsV2"]') || el.querySelector('article[class*="embed"]') !== null || el.querySelector('[class*="isComponentsV2"]') !== null;
                    });

                    let node: Element | null = mutation.target as Element;
                    if (hasRemovedContent) {
                        while (node && node !== document.body) {
                            if (node.getAttribute("role") === "article") { articlesToReset.add(node as HTMLElement); break; }
                            node = node.parentElement;
                        }
                    } else {
                        while (node && node !== document.body) {
                            const h = node as HTMLElement;
                            if (h.dataset.vcMsgApplied || h.dataset.vcEmbedApplied || h.dataset.vcCompV2Applied) {
                                let articleNode: Element | null = node;
                                while (articleNode && articleNode !== document.body) {
                                    if (articleNode.getAttribute("role") === "article") { articlesToReset.add(articleNode as HTMLElement); break; }
                                    articleNode = articleNode.parentElement;
                                }
                                break;
                            }
                            node = node.parentElement;
                        }
                    }
                }
            }

            if (!hasNewNodes && articlesToReset.size === 0) return;
            if (articlesToReset.size > 0) safeApply(() => { articlesToReset.forEach(article => resetMessageElement(article)); });
            if (!rafPending) { rafPending = true; requestAnimationFrame(() => { rafPending = false; safeApply(() => applyBotRoleColor()); }); }
        });

        observer.observe(document.body, { childList: true, subtree: true });
        (this as any).observer = observer;
    },

    stop() {
        (this as any).observer?.disconnect();
        resetAllBotColors();
        removeHardcodedBanner();
        unregisterHardcodedRoleColors(Object.keys(HARDCODED_ROLE_COLORS));
    },
});
