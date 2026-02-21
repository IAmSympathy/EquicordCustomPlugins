/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings } from "@api/Settings";
import {Devs, EquicordDevs} from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { findStoreLazy } from "@webpack";

const ApplicationStreamingStore = findStoreLazy("ApplicationStreamingStore");

const settings = definePluginSettings({
    showIconOnVoiceUsers: {
        description: "Darken avatars of users watching your stream in the Voice Connected section",
        type: OptionType.BOOLEAN,
        default: true,
        restartNeeded: false
    },
    darknessLevel: {
        description: "How dark the avatar should be (0.0 = black, 1.0 = normal brightness)",
        type: OptionType.SLIDER,
        default: 0.8,
        markers: [0.2, 0.3, 0.4, 0.5, 0.6, 0.7],
        stickToMarkers: false,
        restartNeeded: false
    },
});

let observer: MutationObserver | null = null;
const processedAvatars = new WeakSet<HTMLElement>(); // Éviter de retraiter les mêmes avatars

// Function to extract user ID from avatar container
function extractUserIdFromAvatar(avatarContainer: HTMLElement): string | null {
    // Try to extract from background-image URL
    const avatarDiv = avatarContainer.querySelector<HTMLElement>("[class*='avatar__']");
    if (avatarDiv) {
        const bgImage = avatarDiv.style.backgroundImage;

        // Match Discord CDN avatar URL pattern
        const match = bgImage.match(/\/avatars\/(\d+)\//);
        if (match) {
            return match[1];
        }
    }

    return null;
}

// Function to check if user is watching stream
function isUserWatchingStream(userId: string): boolean {
    if (!settings.store.showIconOnVoiceUsers) {
        return false;
    }

    const stream = ApplicationStreamingStore.getCurrentUserActiveStream();
    if (!stream) {
        return false;
    }

    const viewers = ApplicationStreamingStore.getViewerIds(stream);

    return viewers.includes(userId);
}

// Function to add eye icon to avatar
function addEyeIconToAvatar(avatarContainer: HTMLElement) {
    const userId = extractUserIdFromAvatar(avatarContainer);
    if (!userId) {
        return;
    }

    const isWatching = isUserWatchingStream(userId);

    // Find the avatar div
    const avatarDiv = avatarContainer.querySelector<HTMLElement>("[class*='avatar__']");
    if (!avatarDiv) {
        return;
    }

    if (isWatching) {
        // User is watching - darken avatar and add eye icon if not already done
        if (!avatarDiv.classList.contains("vc-stream-watcher-darkened")) {
            avatarDiv.classList.add("vc-stream-watcher-darkened");
            avatarDiv.style.filter = `brightness(${settings.store.darknessLevel})`;
            avatarDiv.title = "Watching your stream";

            // Create wrapper if not exists
            if (!avatarDiv.parentElement?.classList.contains("vc-stream-watcher-indicator-wrapper")) {
                const wrapper = document.createElement("div");
                wrapper.className = "vc-stream-watcher-indicator-wrapper";
                avatarDiv.parentNode?.insertBefore(wrapper, avatarDiv);
                wrapper.appendChild(avatarDiv);
            }

            // Add eye icon overlay (without blue circle)
            const overlay = document.createElement("div");
            overlay.className = "vc-stream-watcher-eye-overlay";
            overlay.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 5C5.63636 5 2 12 2 12C2 12 5.63636 19 12 19C18.3636 19 22 12 22 12C22 12 18.3636 5 12 5Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            `;

            avatarDiv.parentElement?.appendChild(overlay);
        } else {
            // Update brightness in case settings changed
            avatarDiv.style.filter = `brightness(${settings.store.darknessLevel})`;
        }
    } else {
        // User is NOT watching - remove darkening and eye icon if present
        if (avatarDiv.classList.contains("vc-stream-watcher-darkened")) {
            avatarDiv.classList.remove("vc-stream-watcher-darkened");
            avatarDiv.style.filter = "";
            avatarDiv.title = "";

            // Remove eye icon overlay
            const overlay = avatarDiv.parentElement?.querySelector(".vc-stream-watcher-eye-overlay");
            if (overlay) {
                overlay.remove();
            }
        }
    }
}

// Fonction pour traiter tous les avatars des utilisateurs en vocal
function processVoiceUserAvatars() {
    const voiceUsersContainer = document.querySelector("[class*='voiceUsers__']");
    if (!voiceUsersContainer) {
        return;
    }

    const avatarContainers = voiceUsersContainer.querySelectorAll<HTMLElement>("[class*='avatarContainer__']");

    avatarContainers.forEach(container => {
        // Éviter de retraiter les mêmes avatars pour optimiser les performances
        if (!processedAvatars.has(container)) {
            processedAvatars.add(container);
        }
        addEyeIconToAvatar(container);
    });
}

// Function to start observing
function startObserver() {
    if (observer) return;

    observer = new MutationObserver(mutations => {
        let shouldProcess = false;

        for (const mutation of mutations) {
            // Check if voice users section was added/modified
            if (mutation.type === "childList") {
                for (const node of mutation.addedNodes) {
                    if (node instanceof HTMLElement) {
                        if (node.classList.contains("voiceUsers__68617") ||
                            node.querySelector("[class*='voiceUsers__']")) {
                            shouldProcess = true;
                            break;
                        }
                    }
                }
            }
        }

        if (shouldProcess) {
            processVoiceUserAvatars();
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // Initial process
    processVoiceUserAvatars();

    // Listen to stream changes
    const checkInterval = setInterval(() => {
        processVoiceUserAvatars();
    }, 2000);

    return () => {
        clearInterval(checkInterval);
    };
}

// Function to stop observing
function stopObserver() {
    if (observer) {
        observer.disconnect();
        observer = null;
    }
}

export default definePlugin({
    name: "StreamWatcherIndicator",
    description: "Shows an eye icon over avatars of users watching your stream in the Voice Connected section",
    authors: [EquicordDevs.IAmSympathy],
    settings,

    start() {
        startObserver();
    },

    stop() {
        stopObserver();
    },
});
