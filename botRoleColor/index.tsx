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

// Bannière hardcodée pour le serveur The Not So Serious Lands
const HARDCODED_GUILD_ID = "827364829567647774";
const BANNER_DATA_URL = bannerB64 ? `data:image/png;base64,${bannerB64}` : "";
let bannerStyleElement: HTMLStyleElement | null = null;
let bgStyleElement: HTMLStyleElement | null = null;
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
    // Injecter la CSS var de background Netricsa une seule fois (évite de répéter ~200Ko de base64 dans chaque overlay div)
    if (BACKGROUND_DATA_URL && !bgStyleElement) {
        bgStyleElement = document.createElement("style");
        bgStyleElement.id = "notSoSeriousCord-netricsa-bg";
        bgStyleElement.textContent = `:root { --vc-netricsa-bg: url("${BACKGROUND_DATA_URL}"); }`;
        document.head.appendChild(bgStyleElement);
    }

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
    bgStyleElement?.remove();
    bgStyleElement = null;
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
    const card = (compV2.querySelector('[class*="withAccentColor"]') as HTMLElement | null)
        ?? (compV2.firstElementChild as HTMLElement | null)
        ?? compV2;
    applyEmbedBackground(card, true);
}

function applyEmbedBackground(embed: HTMLElement, preserveLeftBorder = false): void {
    if (!BACKGROUND_DATA_URL || embed.dataset.vcBgApplied) return;
    // Pas de getComputedStyle (reflow) — on force position:relative systématiquement
    // si l'élément n'a pas déjà une position non-static via un style inline.
    if (!embed.style.position || embed.style.position === "static") {
        embed.style.position = "relative";
    }
    const leftOffset = preserveLeftBorder ? "4px" : "0";
    const bg = document.createElement("div");
    bg.setAttribute("data-vc-bg-overlay", "1");
    bg.style.cssText = [
        "position:absolute",
        "top:0", "right:0", "bottom:0", `left:${leftOffset}`,
        "background-image:var(--vc-netricsa-bg)",
        "background-size:cover", "background-position:center", "background-repeat:no-repeat",
        "pointer-events:none", "z-index:0",
        preserveLeftBorder ? "border-radius:0 inherit inherit 0" : "border-radius:inherit",
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
    // Note: applyGradientToNames() est appelé par fakeServerBoost dans son propre RAF — ne pas le doubler ici
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

// ══════════════════════════════════════════════════════════════════════════════
// Effets custom pour les rôles du serveur
// Chaque effet est enregistré dans fakeServerBoost via registerCustomEffect()
// ══════════════════════════════════════════════════════════════════════════════

const BIRTHDAY_PRIMARY_RGB = "rgb(255, 0, 149)";   // #ff0095
const NETRICSA_PRIMARY_RGB  = "rgb(36, 148, 219)";  // #2494db
const KLODOVIK_PRIMARY_RGB  = "rgb(86, 253, 13)";   // #56fd0d
const GOLDEN_PRIMARY_RGB    = "rgb(191, 155, 48)";  // #bf9b30
const SILVER_PRIMARY_RGB    = "rgb(192, 192, 192)"; // #c0c0c0
const BRONZE_PRIMARY_RGB    = "rgb(160, 88, 34)";   // #a05822
const CELESTIAL_PRIMARY_RGB = "rgb(168, 85, 247)";  // #a855f7

// ── 🎂 HAPPY BIRTHDAY ────────────────────────────────────────────────────────

function cleanBirthdayEl(el: HTMLElement) {
    el.querySelectorAll("[data-fsb-bday-star]").forEach(s => s.remove());
    delete el.dataset.fsbBirthday;
    delete el.dataset.fsbCustomAnim;
}

function applyBirthdayEffect() {
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
`;

// ── 🧠 NETRICSA ───────────────────────────────────────────────────────────────

function applyNetricsaEffect() {
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
    @keyframes fsb-netricsa-scan { 0% { background-position: 0px 50%; } 100% { background-position: 300px 50%; } }
    div[class*="member__"]:hover span[data-fsb-netricsa] span[class*="name__"],
    a:hover span[data-fsb-netricsa] span[class*="name__"],
    span[data-fsb-netricsa]:hover span[class*="name__"] {
        animation: fsb-netricsa-scan 2s linear infinite !important;
        background-image: linear-gradient(to right, #2494db 0%, #247d90 49%, #ffffff 49%, #ffffff 51%, #247d90 51%, #2494db 100%) !important;
        background-size: 300px auto !important;
    }
    div[role="article"]:hover span[class*="username_"][data-fsb-netricsa],
    li[class*="messageListItem"]:hover span[class*="username_"][data-fsb-netricsa] {
        animation: fsb-netricsa-scan 2s linear infinite !important;
        background-image: linear-gradient(to right, #2494db 0%, #247d90 49%, #ffffff 49%, #ffffff 51%, #247d90 51%, #2494db 100%) !important;
        background-size: 300px auto !important;
    }
    div[class*="member__"]:hover span[data-fsb-netricsa], a:hover span[data-fsb-netricsa], span[data-fsb-netricsa]:hover { filter: drop-shadow(0 0 3px #2494db) !important; }
    div[role="article"]:hover span[class*="headerText"][data-fsb-netricsa-header],
    li[class*="messageListItem"]:hover span[class*="headerText"][data-fsb-netricsa-header] { filter: drop-shadow(0 0 3px #2494db) !important; }
    div[role="article"]:hover span[class*="headerText"][data-fsb-netricsa-header] span[class*="botTag"],
    li[class*="messageListItem"]:hover span[class*="headerText"][data-fsb-netricsa-header] span[class*="botTag"] { filter: none !important; }
    div[role="article"]:hover span[class*="username_"][data-fsb-netricsa],
    li[class*="messageListItem"]:hover span[class*="username_"][data-fsb-netricsa] { filter: none !important; }
    div[class*="members_"]:hover div[data-fsb-netricsa] span[data-fsb-gradient] {
        animation: fsb-netricsa-scan 2s linear infinite !important;
        background-image: linear-gradient(to right, #2494db 0%, #247d90 49%, #ffffff 49%, #ffffff 51%, #247d90 51%, #2494db 100%) !important;
        background-size: 300px auto !important;
    }
    div[class*="members_"]:hover div[data-fsb-netricsa] { filter: drop-shadow(0 0 3px #2494db) !important; }
    div[class*="voiceUser"]:hover div[data-fsb-netricsa] span[data-fsb-mention-text],
    div[class*="voiceUser"]:hover div[data-fsb-netricsa] span[data-fsb-gradient]:not([data-fsb-mention]) {
        animation: fsb-netricsa-scan 2s linear infinite !important;
        background-image: linear-gradient(to right, #2494db 0%, #247d90 49%, #ffffff 49%, #ffffff 51%, #247d90 51%, #2494db 100%) !important;
        background-size: 300px auto !important;
    }
    div[class*="voiceUser"]:hover [data-fsb-voice-container][data-fsb-netricsa-voice] { filter: drop-shadow(0 0 3px #2494db) !important; }
`;

// ── 🦜 KLODOVIK ───────────────────────────────────────────────────────────────

function applyKlodovikEffect() {
    document.querySelectorAll<HTMLElement>("[data-fsb-klodovik]").forEach(el => {
        const c1 = el.style.getPropertyValue("--custom-gradient-color-1");
        if (!c1 || normalizeColor(c1) !== KLODOVIK_PRIMARY_RGB) {
            delete el.dataset.fsbKlodovik; delete el.dataset.fsbCustomAnim;
            const h = el.closest<HTMLElement>("span[data-fsb-klodovik-header]");
            if (h) { delete h.dataset.fsbKlodovikHeader; delete h.dataset.fsbCustomAnim; }
        }
    });
    document.querySelectorAll<HTMLElement>("span[data-fsb-klodovik-header]").forEach(h => {
        if (!h.querySelector("[data-fsb-klodovik]")) { delete h.dataset.fsbKlodovikHeader; delete h.dataset.fsbCustomAnim; }
    });
    document.querySelectorAll<HTMLElement>('span[class*="nameContainer"][data-fsb-gradient]:not([data-fsb-klodovik])').forEach(el => {
        if (normalizeColor(el.style.getPropertyValue("--custom-gradient-color-1")) !== KLODOVIK_PRIMARY_RGB) return;
        el.dataset.fsbKlodovik = "1"; el.dataset.fsbCustomAnim = "1";
    });
    document.querySelectorAll<HTMLElement>('span[class*="username_"][data-fsb-gradient]:not([data-fsb-klodovik])').forEach(el => {
        if (normalizeColor(el.style.getPropertyValue("--custom-gradient-color-1")) !== KLODOVIK_PRIMARY_RGB) return;
        el.dataset.fsbKlodovik = "1"; el.dataset.fsbCustomAnim = "1";
        const h = el.closest<HTMLElement>('span[class*="headerText"]');
        if (h) { h.dataset.fsbKlodovikHeader = "1"; h.dataset.fsbCustomAnim = "1"; }
    });
    document.querySelectorAll<HTMLElement>('[aria-hidden="true"][data-fsb-cat-checked]:not([data-fsb-klodovik])').forEach(el => {
        if (normalizeColor(el.style.getPropertyValue("--custom-gradient-color-1")) !== KLODOVIK_PRIMARY_RGB) return;
        el.dataset.fsbKlodovik = "1"; el.dataset.fsbCustomAnim = "1";
    });
    document.querySelectorAll<HTMLElement>('div[class*="usernameContainer_"][data-fsb-voice-checked]:not([data-fsb-klodovik])').forEach(container => {
        const gradDiv = container.querySelector<HTMLElement>("[data-fsb-gradient], [data-fsb-mention]");
        const c1 = gradDiv?.style.getPropertyValue("--custom-gradient-color-1") ?? container.style.getPropertyValue("--custom-gradient-color-1");
        if (!c1 || normalizeColor(c1) !== KLODOVIK_PRIMARY_RGB) return;
        container.dataset.fsbKlodovik = "1"; container.dataset.fsbCustomAnim = "1";
        const vc = container.parentElement;
        if (vc?.dataset.fsbVoiceContainer) { vc.dataset.fsbKlodovikVoice = "1"; vc.dataset.fsbCustomAnim = "1"; }
    });
}

function cleanupKlodovikEffect() {
    document.querySelectorAll<HTMLElement>("[data-fsb-klodovik]").forEach(el => {
        delete el.dataset.fsbKlodovik; delete el.dataset.fsbCustomAnim;
        const h = el.closest<HTMLElement>("span[data-fsb-klodovik-header]");
        if (h) { delete h.dataset.fsbKlodovikHeader; delete h.dataset.fsbCustomAnim; }
    });
    document.querySelectorAll<HTMLElement>("[data-fsb-klodovik-voice]").forEach(el => {
        delete el.dataset.fsbKlodovikVoice; delete el.dataset.fsbCustomAnim;
    });
}

const KLODOVIK_CSS = `
    @keyframes fsb-klodovik-bounce {
        0% { transform: translateY(0); } 25% { transform: translateY(-3px); }
        50% { transform: translateY(0); } 75% { transform: translateY(-2px); } 100% { transform: translateY(0); }
    }
    div[class*="member__"]:hover span[data-fsb-klodovik] span[class*="name__"],
    a:hover span[data-fsb-klodovik] span[class*="name__"],
    span[data-fsb-klodovik]:hover span[class*="name__"] { display: inline-block !important; animation: fsb-klodovik-bounce 0.5s ease infinite !important; }
    div[role="article"]:hover span[class*="username_"][data-fsb-klodovik],
    li[class*="messageListItem"]:hover span[class*="username_"][data-fsb-klodovik] { display: inline-block !important; vertical-align: middle !important; animation: fsb-klodovik-bounce 0.5s ease infinite !important; }
    div[class*="member__"]:hover span[data-fsb-klodovik], a:hover span[data-fsb-klodovik], span[data-fsb-klodovik]:hover,
    div[role="article"]:hover span[class*="headerText"][data-fsb-klodovik-header],
    li[class*="messageListItem"]:hover span[class*="headerText"][data-fsb-klodovik-header] { filter: drop-shadow(0 0 3px #56fd0d) !important; }
    div[role="article"]:hover span[class*="headerText"][data-fsb-klodovik-header] span[class*="botTag"],
    li[class*="messageListItem"]:hover span[class*="headerText"][data-fsb-klodovik-header] span[class*="botTag"] { filter: none !important; }
    div[role="article"]:hover span[class*="username_"][data-fsb-klodovik],
    li[class*="messageListItem"]:hover span[class*="username_"][data-fsb-klodovik] { filter: none !important; }
    div[class*="members_"]:hover div[data-fsb-klodovik] span[data-fsb-gradient] { display: inline-block !important; animation: fsb-klodovik-bounce 0.5s ease infinite !important; }
    div[class*="members_"]:hover div[data-fsb-klodovik] { filter: drop-shadow(0 0 3px #56fd0d) !important; }
    div[class*="voiceUser"]:hover div[data-fsb-klodovik] span[data-fsb-mention-text],
    div[class*="voiceUser"]:hover div[data-fsb-klodovik] span[data-fsb-gradient]:not([data-fsb-mention]) { display: inline-block !important; animation: fsb-klodovik-bounce 0.5s ease infinite !important; }
    div[class*="voiceUser"]:hover [data-fsb-voice-container][data-fsb-klodovik-voice] { filter: drop-shadow(0 0 3px #56fd0d) !important; }
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
`;

// ── 🔮 CELESTIAL ─────────────────────────────────────────────────────────────

const CELESTIAL_STARS_CHARS = ["✦", "✦", "✦", "✦"];
const CELESTIAL_ORBIT_RADIUS = 14;
const CELESTIAL_ORBIT_DURATION = 2.4;

function injectCelestialStars(target: HTMLElement) {
    if (target.querySelector("[data-fsb-cstar]")) return;
    const wrap = document.createElement("span");
    wrap.dataset.fsbCelestialWrap = "1";
    wrap.style.cssText = "position:relative;display:inline-block;";
    while (target.firstChild) wrap.appendChild(target.firstChild);
    target.appendChild(wrap);
    CELESTIAL_STARS_CHARS.forEach((char, i) => {
        const star = document.createElement("span");
        star.dataset.fsbCstar = String(i);
        star.textContent = char;
        const startDeg = (360 / CELESTIAL_STARS_CHARS.length) * i;
        star.style.setProperty("--orbit-start", `${startDeg}deg`);
        star.style.setProperty("--orbit-rx", `${CELESTIAL_ORBIT_RADIUS}px`);
        star.style.setProperty("--orbit-duration", `${CELESTIAL_ORBIT_DURATION}s`);
        wrap.appendChild(star);
    });
    requestAnimationFrame(() => {
        const w = wrap.offsetWidth;
        if (w > 0) wrap.querySelectorAll<HTMLElement>("[data-fsb-cstar]").forEach(s => s.style.setProperty("--orbit-rx", `${Math.round(w / 2) + 6}px`));
    });
}

function injectCelestialStarsVoice(voiceContainer: HTMLElement, usernameContainer: HTMLElement) {
    if (voiceContainer.querySelector("[data-fsb-cstar]")) return;
    voiceContainer.style.position = "relative";
    voiceContainer.style.overflow = "visible";
    CELESTIAL_STARS_CHARS.forEach((char, i) => {
        const star = document.createElement("span");
        star.dataset.fsbCstar = String(i);
        star.dataset.fsbCstarVoice = "1";
        star.textContent = char;
        const startDeg = (360 / CELESTIAL_STARS_CHARS.length) * i;
        star.style.cssText = "position:absolute;pointer-events:none;";
        star.style.setProperty("--orbit-start", `${startDeg}deg`);
        star.style.setProperty("--orbit-rx", `${CELESTIAL_ORBIT_RADIUS}px`);
        star.style.setProperty("--orbit-duration", `${CELESTIAL_ORBIT_DURATION}s`);
        star.style.setProperty("--star-top", "50%");
        star.style.setProperty("--star-left", "50%");
        voiceContainer.appendChild(star);
    });
    requestAnimationFrame(() => {
        const nameDiv = usernameContainer.querySelector<HTMLElement>("[data-fsb-gradient], [data-fsb-mention]") ?? usernameContainer;
        const vcRect = voiceContainer.getBoundingClientRect();
        const nameRect = nameDiv.getBoundingClientRect();
        if (vcRect.width === 0 || nameRect.width === 0) return;
        const centerLeft = (nameRect.left - vcRect.left) + nameRect.width / 2;
        const centerTop = (nameRect.top - vcRect.top) + nameRect.height / 2;
        const rx = Math.round(nameRect.width / 2) + 6;
        voiceContainer.querySelectorAll<HTMLElement>("[data-fsb-cstar-voice]").forEach(star => {
            star.style.setProperty("--star-top", `${centerTop}px`);
            star.style.setProperty("--star-left", `${centerLeft}px`);
            star.style.setProperty("--orbit-rx", `${rx}px`);
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
        font-size: 9px !important; line-height: 1 !important; top: 50% !important; left: 50% !important;
        margin: -5px 0 0 -5px !important; width: 10px !important; height: 10px !important;
        text-align: center !important; opacity: 0 !important; z-index: 9999 !important;
        -webkit-text-fill-color: currentcolor !important; background-clip: unset !important;
        -webkit-background-clip: unset !important; background-image: none !important; color: #e9d5ff !important;
    }
    [data-fsb-cstar-voice] { top: var(--star-top, 50%) !important; left: var(--star-left, 50%) !important; margin: -5px 0 0 -5px !important; }
    div[class*="member__"]:hover [data-fsb-celestial-wrap] [data-fsb-cstar],
    div[role="article"]:hover [data-fsb-celestial-wrap] [data-fsb-cstar],
    li[class*="messageListItem"]:hover [data-fsb-celestial-wrap] [data-fsb-cstar],
    span[data-fsb-celestial-wrap]:hover [data-fsb-cstar] { opacity: 1 !important; animation: fsb-celestial-orbit var(--orbit-duration, 2.4s) linear infinite !important; }
    div[class*="voiceUser"]:hover [data-fsb-voice-container][data-fsb-celestial-voice] [data-fsb-cstar-voice] { opacity: 1 !important; animation: fsb-celestial-orbit var(--orbit-duration, 2.4s) linear infinite !important; }
    @keyframes fsb-celestial-orbit {
        from { opacity: 1; transform: rotate(var(--orbit-start, 0deg)) translateX(var(--orbit-rx, 20px)) rotate(calc(-1 * var(--orbit-start, 0deg))); }
        to   { opacity: 1; transform: rotate(calc(var(--orbit-start, 0deg) + 360deg)) translateX(var(--orbit-rx, 20px)) rotate(calc(-1 * (var(--orbit-start, 0deg) + 360deg))); }
    }
`;

// ── Définition de tous les effets à enregistrer ───────────────────────────────

const CUSTOM_EFFECTS: CustomEffect[] = [
    { id: "birthday",  styleCSS: BIRTHDAY_CSS,  applyFn: applyBirthdayEffect,  cleanupFn: cleanupBirthdayEffect,  primaryRGB: BIRTHDAY_PRIMARY_RGB },
    { id: "netricsa",  styleCSS: NETRICSA_CSS,  applyFn: applyNetricsaEffect,  cleanupFn: cleanupNetricsaEffect,  primaryRGB: NETRICSA_PRIMARY_RGB },
    { id: "klodovik",  styleCSS: KLODOVIK_CSS,  applyFn: applyKlodovikEffect,  cleanupFn: cleanupKlodovikEffect,  primaryRGB: KLODOVIK_PRIMARY_RGB },
    {
        id: "medals",
        styleCSS: MEDALS_CSS,
        applyFn: () => { for (const def of SIMPLE_EFFECT_DEFS) makeSimpleApply(def)(); },
        cleanupFn: () => { for (const def of SIMPLE_EFFECT_DEFS) makeSimpleCleanup(def)(); },
    },
    { id: "celestial", styleCSS: CELESTIAL_CSS, applyFn: applyCelestialEffect, cleanupFn: cleanupCelestialEffect, primaryRGB: CELESTIAL_PRIMARY_RGB },
];

// ── Plugin ────────────────────────────────────────────────────────────────────

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

                // Ignorer nos propres injections (overlays, éléments colorés, position/zIndex)
                const allNodes = [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)];
                const isOurMutation = allNodes.every(n => {
                    if (n.nodeType !== Node.ELEMENT_NODE) return true;
                    const el = n as HTMLElement;
                    return el.hasAttribute("data-vc-bg-overlay")
                        || el.dataset.vcColored !== undefined
                        || el.dataset.fsbRoleIcon !== undefined
                        || el.dataset.fsbBdayStar !== undefined;
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

        // Désenregistrer les effets custom
        for (const effect of CUSTOM_EFFECTS) {
            unregisterCustomEffect(effect.id);
        }

        unregisterHardcodedRoleColors(Object.keys(HARDCODED_ROLE_COLORS));
    },
});
