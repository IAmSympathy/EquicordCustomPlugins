/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { definePluginSettings } from "@api/Settings";
import { findByProps } from "@webpack";

let styleElement: HTMLStyleElement | null = null;

const settings = definePluginSettings({
    colorIntensity: {
        type: OptionType.SLIDER,
        description:
            "Color intensity for bot message text (0% = default text color, 100% = full role color)",
        default: 20,
        markers: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
        stickToMarkers: false,
        onChange: () => {
            // Approche optimisée: utiliser une classe CSS au lieu de manipuler le DOM
            const body = document.body;

            // Ajouter/retirer une classe pour que le CSS s'applique dynamiquement
            if (styleElement) {
                styleElement.remove();
                styleElement = null;
            }

            // Créer un nouvel élément de style avec les propriétés CSS
            styleElement = document.createElement("style");
            styleElement.textContent = `[data-bot-color-intensity] { --bot-color-intensity: ${settings.store.colorIntensity / 100}; }`;
            document.head.appendChild(styleElement);

            // Vérifier seulement les éléments affectés au lieu de tous les nettoyer
            const root = document.querySelector("[role='main']") || body;
            const messageGroups = root.querySelectorAll('[class*="message"]');

            // Appliquer/reset les couleurs de manière plus efficace
            messageGroups.forEach(group => {
                const messageContent = group.querySelector('[class*="messageContent"]');
                if (messageContent && messageContent instanceof HTMLElement) {
                    // Forcer un reflow pour que les changements CSS prennent effet
                    messageContent.style.opacity = "0.99";
                    requestAnimationFrame(() => {
                        messageContent.style.opacity = "";
                    });
                }
            });
        },
    },
});

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0,
        s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

        switch (max) {
            case r:
                h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
                break;
            case g:
                h = ((b - r) / d + 2) / 6;
                break;
            case b:
                h = ((r - g) / d + 4) / 6;
                break;
        }
    }

    return [h * 360, s * 100, l * 100];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    h /= 360;
    s /= 100;
    l /= 100;

    let r, g, b;

    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p: number, q: number, t: number) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;

        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// Interpolate between two RGB colors
function interpolateColor(
    r1: number,
    g1: number,
    b1: number,
    r2: number,
    g2: number,
    b2: number,
    ratio: number,
): [number, number, number] {
    const r = Math.round(r1 + (r2 - r1) * ratio);
    const g = Math.round(g1 + (g2 - g1) * ratio);
    const b = Math.round(b1 + (b2 - b1) * ratio);
    return [r, g, b];
}

// Bot ID to color mapping
const BOT_COLORS: Record<string, string> = {
    "1462959115528835092": "#1f9ccd",
    "1473424972046270608": "#56fd0d",
};

// Discord MessageStore - will be initialized in start()
let MessageStore: any = null;

function hexToRgb(hex: string): [number, number, number] | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
        ? [
            parseInt(result[1], 16),
            parseInt(result[2], 16),
            parseInt(result[3], 16),
        ]
        : null;
}

function applyBotRoleColor() {
    // Find all cozy messages
    const allMessages = document.querySelectorAll(
        '[class*="cozy"][class*="wrapper"]',
    );

    allMessages.forEach((messageWrapper) => {
        // Get the header element which contains the message author info
        const header = messageWrapper.querySelector('[class*="header"]');
        if (!header) return;

        // Check if THIS message's author (not a replied message) has a bot tag in the header
        const botTag = header.querySelector('[class*="botTag"]');
        if (!botTag) return; // This message is not from a bot

        // Get the username element to find the user ID
        const username = header.querySelector(
            '[class*="username"]',
        ) as HTMLElement;
        const messageContent = messageWrapper.querySelector(
            '[class*="messageContent"]:not([class*="repliedTextContent"])',
        ) as HTMLElement;

        if (!username || !messageContent) return;

        // Skip if already processed
        if (messageContent.dataset.botColorApplied) return;

        // Try to find the message ID from the wrapper
        let messageId: string | null = null;
        let channelId: string | null = null;
        let userId: string | null = null;

        // The message ID is often in the wrapper's id attribute
        const wrapperId = (messageWrapper as HTMLElement).id;
        if (wrapperId) {
            // Format is usually: chat-messages-{channelId}-{messageId}
            const parts = wrapperId.split("-");
            if (
                parts.length >= 4 &&
                parts[0] === "chat" &&
                parts[1] === "messages"
            ) {
                channelId = parts[2];
                messageId = parts[3];
            }
        }

        // If we have MessageStore, channelId and messageId, try to get the author ID from it
        if (MessageStore && channelId && messageId) {
            try {
                // Try to get the message using getMessage
                const message = MessageStore.getMessage?.(channelId, messageId);
                if (message && message.author) {
                    userId = message.author.id;
                }
            } catch (e) {
                // Ignore errors and try fallback
            }
        }

        // Fallback: try to find the user ID from the avatar
        if (!userId) {
            const avatar = messageWrapper.querySelector('img[class*="avatar"]');
            if (avatar) {
                // Avatar src often contains the user ID: /avatars/{user_id}/{avatar_hash}.png
                const avatarSrc = avatar.getAttribute("src");
                if (avatarSrc) {
                    const match = avatarSrc.match(/\/avatars\/(\d+)\//);
                    if (match) userId = match[1];
                }
            }
        }

        // If we still can't find the user ID, skip this message
        if (!userId || !BOT_COLORS[userId]) return;

        // Get the hex color for this bot
        const hexColor = BOT_COLORS[userId];
        const rgbColor = hexToRgb(hexColor);
        if (!rgbColor) return;

        const [roleR, roleG, roleB] = rgbColor;

        // Get color intensity from settings (0-100)
        const intensity = settings.store.colorIntensity / 100;

        // Default text color (light gray/white for dark theme)
        // Discord's default text color is approximately rgb(220, 221, 222)
        const defaultR = 220;
        const defaultG = 221;
        const defaultB = 222;

        // Interpolate between default text color and role color
        const [newR, newG, newB] = interpolateColor(
            defaultR,
            defaultG,
            defaultB,
            roleR,
            roleG,
            roleB,
            intensity,
        );

        // Do NOT apply color globally to messageContent - apply selectively instead
        messageContent.dataset.botColorApplied = "true";

        // Apply the full role color to the username (not affected by intensity setting)
        if (username) {
            // Save original color if not already saved
            if (!username.dataset.originalColor) {
                username.dataset.originalColor = username.style.color || "";
            }
            username.style.color = `rgb(${roleR}, ${roleG}, ${roleB})`;
        }

        // Apply color to text nodes and elements (but not links, mentions, or elements inside mentions)
        const applyColorRecursively = (node: any) => {
            // Skip if inside a mention element
            if (node.closest?.('[class*="mention"]')) return;

            if (node.nodeType === Node.TEXT_NODE) {
                // For text nodes, wrap them in a span if needed
                const text = node.textContent?.trim();
                if (text && text.length > 0) {
                    const span = document.createElement('span');
                    span.style.color = `rgb(${newR}, ${newG}, ${newB})`;
                    span.textContent = node.textContent;
                    node.parentNode?.replaceChild(span, node);
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node as HTMLElement;

                // Skip links, mentions, and their content
                if (
                    el.tagName === "A" ||
                    el.classList.contains("mention") ||
                    el.closest('[class*="mention"]') ||
                    el.closest('[class*="repliedMessage"]')
                ) {
                    return;
                }

                // For other elements, apply color and recurse
                if (!el.style.color) {
                    el.style.color = `rgb(${newR}, ${newG}, ${newB})`;
                }

                // Recurse to children
                Array.from(el.childNodes).forEach(child => applyColorRecursively(child));
            }
        };

        // Apply color to direct children
        Array.from(messageContent.childNodes).forEach(child => {
            if ((child as HTMLElement).closest?.('[class*="mention"]')) return;
            applyColorRecursively(child);
        });

        // Apply to embed content as well
        const embeds = messageWrapper.querySelectorAll('[class*="embed"]');
        embeds.forEach((embed: any) => {
            if (embed.dataset.botColorApplied) return;

            // Apply to embed title, description, fields, etc.
            const embedTexts = embed.querySelectorAll(
                '[class*="embedTitle"], [class*="embedDescription"], [class*="embedFieldValue"], [class*="embedFieldName"], [class*="embedAuthorName"]',
            );
            embedTexts.forEach((el: any) => {
                el.style.color = `rgb(${newR}, ${newG}, ${newB})`;
            });

            embed.dataset.botColorApplied = "true";
        });
    });

    // Also apply colors to replied messages (message previews when someone replies)
    applyBotRoleColorToReplies();
}

// Apply colors to replied messages (previews)
function applyBotRoleColorToReplies() {
    // Find all replied message elements
    const repliedMessages = document.querySelectorAll(
        '[class*="repliedMessage"]',
    );

    repliedMessages.forEach((repliedWrapper) => {
        // Check if already processed
        if ((repliedWrapper as HTMLElement).dataset.botColorApplied) return;

        // Try to find bot tag in the replied message
        const botTag = repliedWrapper.querySelector('[class*="botTag"]');
        if (!botTag) return; // Not a bot message

        // Get the username in the replied message
        const username = repliedWrapper.querySelector(
            '[class*="username"]',
        ) as HTMLElement;

        // Get the replied text content
        const repliedTextContent = repliedWrapper.querySelector(
            '[class*="repliedTextContent"]',
        ) as HTMLElement;

        if (!username || !repliedTextContent) return;

        // Try to find user ID from the replied message
        // Look for any avatar in or near the replied message
        let userId: string | null = null;

        // Try to get from avatar in the replied message area
        const avatar = repliedWrapper.querySelector('img[class*="avatar"]');
        if (avatar) {
            const avatarSrc = avatar.getAttribute("src");
            if (avatarSrc) {
                const match = avatarSrc.match(/\/avatars\/(\d+)\//);
                if (match) userId = match[1];
            }
        }

        // If we don't have the user ID, try to extract from nearby elements or message wrapper
        if (!userId) {
            const parentMessage = repliedWrapper.closest('[class*="message"]');
            if (parentMessage) {
                const parentAvatar = parentMessage.querySelector(
                    'img[class*="avatar"]',
                );
                if (parentAvatar) {
                    const avatarSrc = parentAvatar.getAttribute("src");
                    if (avatarSrc) {
                        const match = avatarSrc.match(/\/avatars\/(\d+)\//);
                        if (match) userId = match[1];
                    }
                }
            }
        }

        // If still no user ID, skip
        if (!userId || !BOT_COLORS[userId]) return;

        // Get the hex color for this bot
        const hexColor = BOT_COLORS[userId];
        const rgbColor = hexToRgb(hexColor);
        if (!rgbColor) return;

        const [roleR, roleG, roleB] = rgbColor;

        // Get color intensity from settings (0-100)
        const intensity = settings.store.colorIntensity / 100;

        // Default text color
        const defaultR = 220;
        const defaultG = 221;
        const defaultB = 222;

        // Interpolate between default text color and role color
        const [newR, newG, newB] = interpolateColor(
            defaultR,
            defaultG,
            defaultB,
            roleR,
            roleG,
            roleB,
            intensity,
        );

        // Apply the full role color to the username (not affected by intensity)
        if (username) {
            if (!username.dataset.originalColor) {
                username.dataset.originalColor = username.style.color || "";
            }
            username.style.color = `rgb(${roleR}, ${roleG}, ${roleB})`;
        }

        // Apply the color to the replied text content
        repliedTextContent.style.color = `rgb(${newR}, ${newG}, ${newB})`;

        // Mark as processed
        (repliedWrapper as HTMLElement).dataset.botColorApplied = "true";
    });
}

export default definePlugin({
    name: "The Not So Serious Cord",
    description:
        "Apply custom colors to specific bots' messages and names with configurable intensity",
    authors: [Devs.IAmSympathy],
    settings,

    start() {
        // Try to get Discord's MessageStore
        try {
            MessageStore = findByProps("getMessages", "getMessage");
        } catch (e) {
            console.warn(
                "The Not So Serious Cord: Could not find MessageStore",
                e,
            );
        }

        // Apply on load
        applyBotRoleColor();

        // Apply when new messages appear
        const observer = new MutationObserver(() => {
            applyBotRoleColor();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });

        // Store observer for cleanup
        (this as any).observer = observer;
    },

    stop() {
        // Clean up observer
        if ((this as any).observer) {
            (this as any).observer.disconnect();
        }

        // Reset colors
        const messageContents = document.querySelectorAll(
            '[class*="messageContent"]',
        ) as NodeListOf<HTMLElement>;
        messageContents.forEach((el) => {
            el.style.color = "";
            delete el.dataset.botColorApplied;

            // Reset child elements
            const children = el.querySelectorAll(
                "*",
            ) as NodeListOf<HTMLElement>;
            children.forEach((child) => {
                child.style.color = "";
            });
        });

        // Reset username colors
        const usernames = document.querySelectorAll(
            '[class*="username"]',
        ) as NodeListOf<HTMLElement>;
        usernames.forEach((el) => {
            if (el.dataset.originalColor) {
                el.style.color = el.dataset.originalColor;
                delete el.dataset.originalColor;
            }
        });

        // Reset embed colors
        const embeds = document.querySelectorAll(
            '[class*="embed"]',
        ) as NodeListOf<HTMLElement>;
        embeds.forEach((embed) => {
            delete embed.dataset.botColorApplied;

            const embedTexts = embed.querySelectorAll(
                '[class*="embedTitle"], [class*="embedDescription"], [class*="embedFieldValue"], [class*="embedFieldName"], [class*="embedAuthorName"]',
            ) as NodeListOf<HTMLElement>;
            embedTexts.forEach((el) => {
                el.style.color = "";
            });
        });

        // Reset replied message colors
        const repliedMessages = document.querySelectorAll(
            '[class*="repliedMessage"]',
        ) as NodeListOf<HTMLElement>;
        repliedMessages.forEach((replied) => {
            delete replied.dataset.botColorApplied;

            const repliedTexts = replied.querySelectorAll(
                '[class*="repliedTextContent"], [class*="username"]',
            ) as NodeListOf<HTMLElement>;
            repliedTexts.forEach((el) => {
                el.style.color = "";
                if (el.dataset.originalColor) {
                    el.style.color = el.dataset.originalColor;
                    delete el.dataset.originalColor;
                }
            });
        });
    },
});
