/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { findByProps } from "@webpack";

import backgroundImageB64 from "file://./assets/background.png?base64";

const BACKGROUND_DATA_URL = backgroundImageB64 ? `data:image/png;base64,${backgroundImageB64}` : "";

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

// Bot ID to color mapping
const BOT_COLORS: Record<string, string> = {
    "1462959115528835092": "#1f9ccd",
    "1473424972046270608": "#56fd0d",
};

// Bot IDs that should have glow effect (embed text only)
const BOTS_WITH_GLOW = new Set(["1462959115528835092"]); // Netricsa
// Bot IDs that should have background image in embeds
const BOTS_WITH_BG = new Set(["1462959115528835092"]); // Netricsa

// Discord MessageStore - initialized in start()
let MessageStore: any = null;

// Guard to prevent re-entrant observer calls triggered by our own DOM mutations
let isApplying = false;

function hexToRgb(hex: string): [number, number, number] | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
        ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
        : null;
}

function interpolateColor(
    r1: number, g1: number, b1: number,
    r2: number, g2: number, b2: number,
    ratio: number,
): [number, number, number] {
    return [
        Math.round(r1 + (r2 - r1) * ratio),
        Math.round(g1 + (g2 - g1) * ratio),
        Math.round(b1 + (b2 - b1) * ratio),
    ];
}

/**
 * Returns true if this element is a mention (role/user) or is inside one.
 * Checks the element and up to 8 ancestors.
 */
function isMentionElement(el: Element | null): boolean {
    let node: Element | null = el;
    for (let i = 0; i < 8 && node; i++) {
        if (
            node.classList.contains("mention") ||
            node.classList.contains("interactive") ||
            node.classList.contains("wrapper_f61d60") ||
            (node.getAttribute("role") === "button" && node.classList.contains("interactive"))
        ) return true;
        // Also check by partial class name for role mentions
        for (const cls of Array.from(node.classList)) {
            if (cls.startsWith("roleMention") || cls.startsWith("userMention")) return true;
        }
        node = node.parentElement;
    }
    return false;
}

/**
 * Apply glow (white text-shadow) to an element.
 */
function applyGlow(el: HTMLElement, intensity: number): void {
    if (!settings.store.enableGlow) return;
    const r = intensity * 2;
    el.style.textShadow = `0 0 ${r}px white, 0 0 ${r * 1.5}px white`;
}

/**
 * Returns true if this element directly contains text (has text node children).
 */
function hasDirectTextContent(el: HTMLElement): boolean {
    for (const child of Array.from(el.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE && child.textContent && child.textContent.trim().length > 0) {
            return true;
        }
    }
    return false;
}

/**
 * Recursively apply color (and optionally glow) to elements,
 * completely skipping mention elements and their descendants.
 * Glow is only applied to leaf text elements, never to containers,
 * to prevent CSS text-shadow inheritance from affecting mentions.
 */
function colorizeNode(
    node: Node,
    r: number, g: number, b: number,
    glow: boolean,
    glowIntensity: number,
): void {
    if (node.nodeType === Node.TEXT_NODE) {
        const parent = node.parentElement;
        if (parent && !isMentionElement(parent) && !parent.dataset.vcColored) {
            parent.style.color = `rgb(${r}, ${g}, ${b})`;
            // Apply glow only on direct text containers, never on mentions
            if (glow && !isMentionElement(parent)) applyGlow(parent, glowIntensity);
            parent.dataset.vcColored = "1";
        }
        return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;

    // Never touch mentions or their children
    if (isMentionElement(el)) return;

    // Skip links
    if (el.tagName === "A") return;

    if (!el.dataset.vcColored) {
        el.style.color = `rgb(${r}, ${g}, ${b})`;
        // IMPORTANT: Only apply glow to leaves (elements with direct text), NOT to containers.
        // Applying text-shadow to containers causes it to cascade into mention children via CSS.
        if (glow && hasDirectTextContent(el) && !isMentionElement(el)) {
            applyGlow(el, glowIntensity);
        }
        el.dataset.vcColored = "1";
    }

    for (const child of Array.from(el.childNodes)) {
        colorizeNode(child, r, g, b, glow, glowIntensity);
    }
}

/**
 * Apply a low-opacity background image to an embed by inserting an overlay div.
 */
function applyEmbedBackground(embed: HTMLElement): void {
    if (!BACKGROUND_DATA_URL) return;
    if (embed.dataset.vcBgApplied) return;

    // brightness: 0-100 mapped to filter:brightness(0) to brightness(1)
    const brightness = 1;

    // Make embed a positioned container
    const pos = window.getComputedStyle(embed).position;
    if (pos === "static") embed.style.position = "relative";

    // Create the background overlay div - full opacity, brightness controlled by filter
    const bg = document.createElement("div");
    bg.setAttribute("data-vc-bg-overlay", "1");
    bg.style.cssText = [
        "position: absolute",
        "inset: 0",
        `background-image: url("${BACKGROUND_DATA_URL}")`,
        "background-size: cover",
        "background-position: center",
        "background-repeat: no-repeat",
        `filter: brightness(${brightness})`,
        "pointer-events: none",
        "z-index: 0",
        "border-radius: inherit",
    ].join(";");

    embed.insertBefore(bg, embed.firstChild);

    // Lift all non-overlay direct children above the bg
    for (const child of Array.from(embed.children)) {
        if (child === bg) continue;
        const c = child as HTMLElement;
        if (!c.style.position || c.style.position === "static") c.style.position = "relative";
        if (!c.style.zIndex) c.style.zIndex = "1";
    }

    embed.dataset.vcBgApplied = "1";
}

/**
 * Extract channelId and messageId from a Discord message wrapper ID.
 * Supports both formats:
 *   "chat-messages-{channelId}-{messageId}"
 *   "chat-messages___chat-messages-{channelId}-{messageId}"
 */
function parseMessageId(wrapperId: string): { channelId: string; messageId: string; } | null {
    // Normalise: take everything after the last "___" if present
    const normalized = wrapperId.includes("___") ? wrapperId.split("___").pop()! : wrapperId;
    // Expected: "chat-messages-{channelId}-{messageId}"
    // channelId and messageId are snowflakes (pure digits, 17-20 chars)
    const match = normalized.match(/^chat-messages-(\d+)-(\d+)$/);
    if (!match) return null;
    return { channelId: match[1], messageId: match[2] };
}

function getMessageAuthorId(wrapperId: string): string | null {
    if (!MessageStore) return null;
    const parsed = parseMessageId(wrapperId);
    if (!parsed) return null;
    try {
        const msg = MessageStore.getMessage?.(parsed.channelId, parsed.messageId);
        return msg?.author?.id ?? null;
    } catch { return null; }
}

function applyBotRoleColor() {
    const allMessages = document.querySelectorAll('[class*="cozy"][class*="wrapper"]');

    allMessages.forEach((messageWrapper: Element) => {
        const header = messageWrapper.querySelector('[class*="header"]');
        const botTag = header?.querySelector('[class*="botTag"]');

        const wrapperId = (messageWrapper as HTMLElement).id ?? "";

        // Primary: MessageStore (works for both first and grouped messages)
        let userId: string | null = getMessageAuthorId(wrapperId);

        // Fallback: avatar URL (only present on first message of a group)
        if (!userId) {
            const avatar = messageWrapper.querySelector('img[class*="avatar"]');
            const match = avatar?.getAttribute("src")?.match(/\/avatars\/(\d+)\//);
            if (match) userId = match[1];
        }

        if (!userId || !BOT_COLORS[userId]) return;

        // For grouped messages (no visible botTag), verify via MessageStore that it's a bot.
        // If we only found userId via avatar without a botTag, skip non-confirmed messages.
        if (!botTag) {
            if (!MessageStore) return;
            const parsed = parseMessageId(wrapperId);
            if (!parsed) return;
            try {
                const msg = MessageStore.getMessage?.(parsed.channelId, parsed.messageId);
                // If MessageStore doesn't have the message yet, skip WITHOUT marking as applied
                // so that a future retry pass can try again.
                if (!msg) return;
                if (!msg.author?.bot) return; // Not a bot, skip
            } catch { return; }
        }

        const username = header?.querySelector('[class*="username"]') as HTMLElement | null;
        const messageContent = messageWrapper.querySelector(
            '[class*="messageContent"]:not([class*="repliedTextContent"])'
        ) as HTMLElement | null;
        if (!messageContent) return;
        if (messageContent.dataset.vcMsgApplied) return;

        const rgb = hexToRgb(BOT_COLORS[userId]);
        if (!rgb) return;

        const [roleR, roleG, roleB] = rgb;
        const shouldGlow = BOTS_WITH_GLOW.has(userId);
        const shouldBg = BOTS_WITH_BG.has(userId);
        const intensity = settings.store.colorIntensity / 100;
        const { glowIntensity } = settings.store;

        const [newR, newG, newB] = interpolateColor(220, 221, 222, roleR, roleG, roleB, intensity);

        // Username: full role color, no glow (only on first message of a group)
        if (username && !username.dataset.originalColor) {
            username.dataset.originalColor = username.style.color || "";
            username.style.color = `rgb(${roleR}, ${roleG}, ${roleB})`;
        }

        // Message content text: colored, no glow
        messageContent.dataset.vcMsgApplied = "1";
        for (const child of Array.from(messageContent.childNodes)) {
            colorizeNode(child, newR, newG, newB, false, 0);
        }

        // Embeds: colored + glow + background image
        const embeds = messageWrapper.querySelectorAll('article[class*="embed"]');
        embeds.forEach((embedEl: Element) => {
            const embed = embedEl as HTMLElement;
            if (embed.dataset.vcEmbedApplied) return;

            if (shouldBg && BACKGROUND_DATA_URL) {
                applyEmbedBackground(embed);
            }

            for (const child of Array.from(embed.childNodes)) {
                colorizeNode(child, newR, newG, newB, shouldGlow, glowIntensity);
            }

            embed.dataset.vcEmbedApplied = "1";
        });
    });

    applyBotRoleColorToReplies();
    applyToOrphanEmbeds();
}

/**
 * Second pass: find all article[embed] not yet processed and try to resolve
 * the bot author. We ONLY look inside the direct message container (role="article")
 * of the embed — never in sibling or neighbouring messages.
 */
function applyToOrphanEmbeds() {
    const orphans = document.querySelectorAll('article[class*="embed"]:not([data-vc-embed-applied])');

    orphans.forEach((embedEl: Element) => {
        const embed = embedEl as HTMLElement;

        // Find the enclosing message article (role="article") — this is the strict boundary.
        const messageArticle = embed.closest('[role="article"]') as HTMLElement | null;
        if (!messageArticle) return;

        // Must have a botTag inside this same message
        const botTag = messageArticle.querySelector('[class*="botTag"]');
        if (!botTag) return;

        let userId: string | null = null;

        // Strategy 1: MessageStore via data-list-item-id (works for grouped messages too)
        if (MessageStore) {
            const listItemId = messageArticle.getAttribute("data-list-item-id") ?? "";
            const parsed = parseMessageId(listItemId);
            if (parsed) {
                try {
                    const msg = MessageStore.getMessage?.(parsed.channelId, parsed.messageId);
                    if (msg?.author) userId = msg.author.id;
                } catch { /* ignore */ }
            }
        }

        // Strategy 2: MessageStore via id walking up
        if (!userId && MessageStore) {
            let node: Element | null = messageArticle;
            while (node && node !== document.body) {
                const parsed = parseMessageId((node as HTMLElement).id ?? "");
                if (parsed) {
                    try {
                        const msg = MessageStore.getMessage?.(parsed.channelId, parsed.messageId);
                        if (msg?.author) { userId = msg.author.id; break; }
                    } catch { /* ignore */ }
                }
                node = node.parentElement;
            }
        }

        // Strategy 3: avatar URL (only present on first message of a group)
        if (!userId) {
            const avatarEl = messageArticle.querySelector('img[class*="avatar"]');
            if (avatarEl) {
                const match = avatarEl.getAttribute("src")?.match(/\/avatars\/(\d+)\//);
                if (match) userId = match[1];
            }
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

        if (shouldBg && BACKGROUND_DATA_URL) {
            applyEmbedBackground(embed);
        }

        for (const child of Array.from(embed.childNodes)) {
            colorizeNode(child, newR, newG, newB, shouldGlow, glowIntensity);
        }

        embed.dataset.vcEmbedApplied = "1";
    });
}

function applyBotRoleColorToReplies() {
    const repliedMessages = document.querySelectorAll('[class*="repliedMessage"]');
    repliedMessages.forEach((repliedWrapper: Element) => {
        const el = repliedWrapper as HTMLElement;
        if (el.dataset.vcReplyApplied) return;

        const botTag = repliedWrapper.querySelector('[class*="botTag"]');
        if (!botTag) return;

        const username = repliedWrapper.querySelector('[class*="username"]') as HTMLElement | null;
        const repliedText = repliedWrapper.querySelector('[class*="repliedTextContent"]') as HTMLElement | null;
        if (!username || !repliedText) return;

        let userId: string | null = null;
        const avatar = repliedWrapper.querySelector('img[class*="avatar"]');
        const match = avatar?.getAttribute("src")?.match(/\/avatars\/(\d+)\//);
        if (match) userId = match[1];

        if (!userId || !BOT_COLORS[userId]) return;

        const rgb = hexToRgb(BOT_COLORS[userId]);
        if (!rgb) return;

        const [roleR, roleG, roleB] = rgb;
        const intensity = settings.store.colorIntensity / 100;
        const [newR, newG, newB] = interpolateColor(220, 221, 222, roleR, roleG, roleB, intensity);

        if (!username.dataset.originalColor) {
            username.dataset.originalColor = username.style.color || "";
        }
        username.style.color = `rgb(${roleR}, ${roleG}, ${roleB})`;
        repliedText.style.color = `rgb(${newR}, ${newG}, ${newB})`;

        el.dataset.vcReplyApplied = "1";
    });
}

function resetAllBotColors(): void {
    // Reset all elements we colored
    document.querySelectorAll("[data-vc-colored]").forEach((el: Element) => {
        const h = el as HTMLElement;
        h.style.color = "";
        h.style.textShadow = "";
        delete h.dataset.vcColored;
    });

    // Reset embed background overlays
    document.querySelectorAll("[data-vc-embed-applied]").forEach((el: Element) => {
        const embed = el as HTMLElement;
        embed.querySelector("[data-vc-bg-overlay]")?.remove();
        embed.style.position = "";
        delete embed.dataset.vcBgApplied;
        delete embed.dataset.vcEmbedApplied;
        // Reset z-index on direct children
        for (const child of Array.from(embed.children)) {
            const c = child as HTMLElement;
            c.style.position = "";
            c.style.zIndex = "";
        }
    });

    // Reset message content markers
    document.querySelectorAll("[data-vc-msg-applied]").forEach((el: Element) => {
        delete (el as HTMLElement).dataset.vcMsgApplied;
    });

    // Reset replied markers
    document.querySelectorAll("[data-vc-reply-applied]").forEach((el: Element) => {
        delete (el as HTMLElement).dataset.vcReplyApplied;
    });

    // Restore original username colors
    document.querySelectorAll("[data-original-color]").forEach((el: Element) => {
        const h = el as HTMLElement;
        h.style.color = h.dataset.originalColor || "";
        delete h.dataset.originalColor;
    });
}

export default definePlugin({
    name: "The Not So Serious Cord",
    description:
        "Apply custom colors to specific bots' messages and names with configurable intensity",
    authors: [Devs.IAmSympathy],
    settings,

    start() {
        try {
            MessageStore = findByProps("getMessages", "getMessage");
        } catch (e) {
            console.warn("[botRoleColor] Could not find MessageStore", e);
        }

        if (!BACKGROUND_DATA_URL) {
            console.warn("[botRoleColor] No background image embedded. Place background.png in the assets folder and rebuild.");
        } else {
            console.log("[botRoleColor] Background image embedded and ready.");
        }

        setTimeout(() => applyBotRoleColor(), 100);

        /**
         * Reset all plugin markers on a message article element and all its
         * descendants so that the next applyBotRoleColor() pass re-processes it
         * from scratch (needed when a bot edits its message).
         */
        function resetMessageElement(article: HTMLElement): void {
            article.querySelectorAll("[data-vc-colored]").forEach((el: Element) => {
                const h = el as HTMLElement;
                h.style.color = "";
                h.style.textShadow = "";
                delete h.dataset.vcColored;
            });
            article.querySelectorAll("[data-vc-embed-applied], article[data-vc-embed-applied]").forEach((el: Element) => {
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
            if (article.dataset.vcEmbedApplied) {
                article.querySelector("[data-vc-bg-overlay]")?.remove();
                article.style.position = "";
                delete article.dataset.vcBgApplied;
                delete article.dataset.vcEmbedApplied;
            }
            article.querySelectorAll("[data-vc-msg-applied]").forEach((el: Element) => {
                delete (el as HTMLElement).dataset.vcMsgApplied;
            });
            if (article.dataset.vcMsgApplied) {
                delete article.dataset.vcMsgApplied;
            }
            article.querySelectorAll("[data-original-color]").forEach((el: Element) => {
                const h = el as HTMLElement;
                h.style.color = h.dataset.originalColor || "";
                delete h.dataset.originalColor;
            });
        }

        /**
         * Safe wrapper: disable observer, run work, re-enable observer.
         */
        function safeApply(fn: () => void): void {
            if (isApplying) return;
            isApplying = true;
            try {
                fn();
            } finally {
                isApplying = false;
            }
        }

        let rafPending = false;

        const observer = new MutationObserver((mutations: MutationRecord[]) => {
            // Ignore mutations caused by our own style/dataset changes
            if (isApplying) return;

            let hasNewNodes = false;
            const articlesToReset = new Set<HTMLElement>();

            for (const mutation of mutations) {
                if (mutation.type === "attributes") continue;

                if (mutation.addedNodes.length > 0) {
                    hasNewNodes = true;
                }

                if (mutation.type === "childList") {
                    // Skip mutations that are only our own overlay nodes
                    const allNodes = [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)];
                    const isOurOwnMutation = allNodes.length > 0 && allNodes.every(n => {
                        if (n.nodeType !== Node.ELEMENT_NODE) return true;
                        return (n as HTMLElement).hasAttribute("data-vc-bg-overlay");
                    });
                    if (isOurOwnMutation) continue;

                    // Strategy 1: detect explicit removal of embed/content nodes (full replacement)
                    const hasRemovedContent = Array.from(mutation.removedNodes).some(n => {
                        if (n.nodeType !== Node.ELEMENT_NODE) return false;
                        const el = n as HTMLElement;
                        return el.matches('article[class*="embed"]') ||
                            el.matches('[class*="messageContent"]') ||
                            el.querySelector('article[class*="embed"]') !== null;
                    });

                    if (hasRemovedContent) {
                        let node: Element | null = mutation.target as Element;
                        while (node && node !== document.body) {
                            if (node.getAttribute("role") === "article") {
                                articlesToReset.add(node as HTMLElement);
                                break;
                            }
                            node = node.parentElement;
                        }
                    }

                    // Strategy 2: detect in-place edits — mutation target is inside an already-
                    // colored element (data-vc-msg-applied or data-vc-embed-applied).
                    // Walk up to find the enclosing message article and schedule a reset.
                    if (!hasRemovedContent) {
                        let node: Element | null = mutation.target as Element;
                        while (node && node !== document.body) {
                            const h = node as HTMLElement;
                            if (
                                h.dataset.vcMsgApplied ||
                                h.dataset.vcEmbedApplied
                            ) {
                                // Find the message article ancestor
                                let articleNode: Element | null = node;
                                while (articleNode && articleNode !== document.body) {
                                    if (articleNode.getAttribute("role") === "article") {
                                        articlesToReset.add(articleNode as HTMLElement);
                                        break;
                                    }
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

            // Reset articles that need re-processing synchronously before the apply
            if (articlesToReset.size > 0) {
                safeApply(() => {
                    articlesToReset.forEach(article => resetMessageElement(article));
                });
            }

            // Use requestAnimationFrame instead of setTimeout to apply on the very next frame
            // with zero visible delay and no double-flicker from a second timer
            if (!rafPending) {
                rafPending = true;
                requestAnimationFrame(() => {
                    rafPending = false;
                    safeApply(() => applyBotRoleColor());
                });
            }
        });

        // Only observe childList (new nodes), NOT attributes or characterData.
        // This prevents our own style/dataset mutations from triggering the observer.
        observer.observe(document.body, { childList: true, subtree: true });
        (this as any).observer = observer;
    },

    stop() {
        if ((this as any).observer) {
            (this as any).observer.disconnect();
        }
        resetAllBotColors();
    },
});
