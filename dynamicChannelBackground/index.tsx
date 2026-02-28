/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { openModal } from "@utils/modal";
import definePlugin, { OptionType } from "@utils/types";
import { Channel } from "@vencord/discord-types";
import { ChannelStore, FluxDispatcher, Menu, React, SelectedChannelStore, SelectedGuildStore, useStateFromStores } from "@webpack/common";

import { SetBackgroundModal } from "./modal";
import { DynBgStore } from "./store";

// ─── Settings ─────────────────────────────────────────────────────────────────

const settings = definePluginSettings({
    overlayOpacity: {
        type: OptionType.SLIDER,
        description: "Opacity of the background overlay (0 = fully transparent, 100 = fully opaque).",
        default: 30,
        markers: [0, 25, 50, 75, 100],
        stickToMarkers: false,
        onChange: () => { updateChatExtBg(); updateVoiceBg(); updateForumBg(); },
    },
    overlayColor: {
        type: OptionType.STRING,
        description: "Background color of the chat overlay (hex, e.g. #000000).",
        default: "#000000",
        onChange: () => { updateChatExtBg(); updateVoiceBg(); updateForumBg(); },
    },
    sidebarOpacity: {
        type: OptionType.SLIDER,
        description: "Opacity of the dark overlay on the sidebar/guilds/titlebar background (0 = no overlay, 100 = fully opaque).",
        default: 60,
        markers: [0, 25, 50, 75, 100],
        stickToMarkers: false,
        onChange: () => { updateSidebarBg(); },
    },
    discordColor: {
        type: OptionType.STRING,
        description: "Color for misc elements, should match your Discord theme (hex, e.g. #323339)",
        default: "#323339",
        onChange: () => { updateForumBg(); },
    },
    backgroundSize: {
        type: OptionType.SELECT,
        description: "How the background image is sized.",
        default: "cover",
        options: [
            { label: "Cover (fill, crop if needed)", value: "cover", default: true },
            { label: "Contain (letterbox)", value: "contain" },
            { label: "Stretch", value: "100% 100%" },
        ],
    },
    transparentTheme: {
        type: OptionType.BOOLEAN,
        description: "Mode thème transparent (Mica/Glass) : rend la liste des salons, la liste des membres et le user panel transparents pour être compatibles avec les thèmes qui utilisent la transparence (ex: Discord Mica).",
        default: false,
        onChange: () => { updateSidebarBg(); updateChatExtBg(); },
    },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace("#", "");
    if (h.length === 3) return [
        parseInt(h[0] + h[0], 16),
        parseInt(h[1] + h[1], 16),
        parseInt(h[2] + h[2], 16),
    ];
    return [
        parseInt(h.slice(0, 2), 16),
        parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16),
    ];
}

// ─── Style statique ───────────────────────────────────────────────────────────

let globalStyle: HTMLStyleElement | null = null;

function ensureGlobalStyle() {
    if (globalStyle) return;
    globalStyle = document.createElement("style");
    globalStyle.id = "vc-dynbg-global";
    globalStyle.textContent = `
        .vc-dynbg-active li[class*="messageListItem_"]:hover {
            background: var(--background-message-hover) !important;
            border-radius: 0 !important;
        }
    `;
    document.head.appendChild(globalStyle);
}

function removeGlobalStyle() {
    globalStyle?.remove();
    globalStyle = null;
}

// ─── Composant interne ────────────────────────────────────────────────────────

interface WallpaperProps {
    url: string;
    size: string;
    fixed?: boolean;
}

function WallpaperInner({ url, size, fixed }: WallpaperProps) {
    const { overlayOpacity, overlayColor } = settings.use(["overlayOpacity", "overlayColor"]);
    const [r, g, b] = hexToRgb(overlayColor || "#000000");
    const alpha = ((overlayOpacity ?? 20) / 100).toFixed(3);

    return (
        <>
            <div
                className="vc-dynbg-image-layer"
                style={{
                    backgroundImage: `url(${url})`,
                    backgroundSize: size,
                    backgroundPosition: "center center",
                    backgroundRepeat: "no-repeat",
                    backgroundAttachment: fixed ? "fixed" : undefined,
                    position: "absolute",
                    inset: 0,
                    pointerEvents: "none",
                    zIndex: 0,
                }}
            />
            <div
                className="vc-dynbg-overlay-layer"
                style={{
                    background: `rgba(${r},${g},${b},${alpha})`,
                    position: "absolute",
                    inset: 0,
                    pointerEvents: "none",
                    zIndex: 0,
                }}
            />
            <div
                className="vc-dynbg-fade-layer"
                style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: "52px",
                    background: "var(--channeltextarea-background)",
                    pointerEvents: "none",
                    zIndex: 0,
                }}
            />
            <div
                className="vc-dynbg-fade-gradient"
                style={{
                    position: "absolute",
                    bottom: "52px",
                    left: 0,
                    right: 0,
                    height: "30px",
                    background: "linear-gradient(to top, var(--channeltextarea-background), transparent)",
                    pointerEvents: "none",
                    zIndex: 1,
                }}
            />
        </>
    );
}

// ─── Chat extension: header + member list ─────────────────────────────────────

let chatExtStyleEl: HTMLStyleElement | null = null;

function removeChatExtBg() {
    chatExtStyleEl?.remove();
    chatExtStyleEl = null;
}

function updateChatExtBg() {
    const selectedId = SelectedChannelStore.getChannelId();
    if (!selectedId) { removeChatExtBg(); return; }

    const channel = ChannelStore.getChannel(selectedId);
    if (!channel) { removeChatExtBg(); return; }

    // ── Cas vocal : le fond est géré par la div fixée du body (updateVoiceBg) ──
    // On rend simplement le panneau chat transparent pour laisser voir cette image.
    let isVoiceChat = false;
    if (channel.type === 2 || channel.type === 13) {
        isVoiceChat = true;
    } else if (channel.type === 11 || channel.type === 12) {
        const parentId = (channel as any).parent_id;
        if (parentId) {
            const parent = ChannelStore.getChannel(parentId);
            if (parent && (parent.type === 2 || parent.type === 13)) {
                isVoiceChat = true;
            }
        }
    }

    if (isVoiceChat) {
        const vocalId = channel.type === 2 || channel.type === 13
            ? channel.id
            : (channel as any).parent_id;
        const vocalChannel = ChannelStore.getChannel(vocalId);
        const voiceUrl = vocalId ? DynBgStore.getUrlForChannel(vocalId, vocalChannel?.guild_id) : undefined;
        if (!voiceUrl) { removeChatExtBg(); return; }

        const { backgroundSize, overlayOpacity, overlayColor } = settings.store;
        const size = (backgroundSize as string) ?? "cover";
        const [r, g, b] = hexToRgb(overlayColor || "#000000");
        const alpha = ((overlayOpacity ?? 20) / 100).toFixed(3);

        chatExtStyleEl?.remove();
        chatExtStyleEl = null;
        chatExtStyleEl = document.createElement("style");
        chatExtStyleEl.id = "vc-dynbg-chat-ext";
        document.head.appendChild(chatExtStyleEl);

        chatExtStyleEl.textContent = `
            div[class*="children_"]::after { display: none !important; }
            [class*="chat_"] [class*="messagesWrapper_"],
            [class*="chat_"] [class*="managedReactiveScroller_"],
            [class*="chat_"] [class*="scrollerBase_"][class*="auto_"],
            [class*="chat_"] [class*="scrollerBase_"][class*="thin_"],
            [class*="chat_"] [class*="scrollerBase_"][class*="none_"] {
                background: transparent !important;
            }

            [class*="subtitleContainer_"],
            [class*="subtitleContainer_"] section,
            [class*="subtitleContainer_"] [class*="container__"] {
                background: ${settings.store.transparentTheme ? "transparent" : "var(--background-primary)"} !important;
            }

            /* ── Sidebar du thread vocal : image + overlay ── */
            [class*="membersWrap_"] {
                position: relative !important;
                background: transparent !important;
            }
            [class*="membersWrap_"]::before {
                content: "";
                position: absolute;
                inset: 0;
                background-image: url(${voiceUrl});
                background-size: ${size};
                background-position: center center;
                background-repeat: no-repeat;
                background-attachment: fixed;
                z-index: 0;
                pointer-events: none;
            }
            [class*="membersWrap_"]::after {
                content: "";
                position: absolute;
                inset: 0;
                background: rgba(${r},${g},${b},${alpha});
                z-index: 0;
                pointer-events: none;
            }
            [class*="membersWrap_"] [class*="members_"],
            [class*="membersWrap_"] [class*="scroller_"],
            [class*="membersWrap_"] [class*="scrollerBase_"],
            [class*="membersWrap_"] [class*="thin_"] {
                background: transparent !important;
                position: relative;
                z-index: 1;
            }
        `;
        return;
    }

    // ── Cas normal (canal texte, forum, DM…) ──────────────────────────────────
    let url: string | undefined;
    let isForumThread = false;
    if (channel.type === 11 || channel.type === 12) {
        const parentId = (channel as any).parent_id;
        if (parentId) {
            const parent = ChannelStore.getChannel(parentId);
            if (parent && (parent.type === 5 || parent.type === 15)) {
                isForumThread = true;
            }
        }
        url = DynBgStore.getUrlForThread(selectedId, (channel as any).parent_id, channel.guild_id);
    } else {
        url = DynBgStore.getUrlForChannel(selectedId, channel.guild_id);
    }

    if (!url) { removeChatExtBg(); return; }

    const { backgroundSize, overlayOpacity, overlayColor } = settings.store;
    const size = (backgroundSize as string) ?? "cover";
    const [r, g, b] = hexToRgb(overlayColor || "#000000");
    const alpha = ((overlayOpacity ?? 20) / 100).toFixed(3);

    chatExtStyleEl?.remove();
    chatExtStyleEl = null;

    chatExtStyleEl = document.createElement("style");
    chatExtStyleEl.id = "vc-dynbg-chat-ext";
    document.head.appendChild(chatExtStyleEl);

    const membersSidebarCss = isForumThread ? `
        /* ── Sidebar du thread de forum : image + overlay ── */
        [class*="membersWrap_"] {
            position: relative !important;
            background: transparent !important;
        }
        [class*="membersWrap_"]::before {
            content: "";
            position: absolute;
            inset: 0;
            background-image: url(${url});
            background-size: ${size};
            background-position: center center;
            background-repeat: no-repeat;
            background-attachment: fixed;
            z-index: 0;
            pointer-events: none;
        }
        [class*="membersWrap_"]::after {
            content: "";
            position: absolute;
            inset: 0;
            background: rgba(${r},${g},${b},${alpha});
            z-index: 0;
            pointer-events: none;
        }
        [class*="membersWrap_"] [class*="members_"],
        [class*="membersWrap_"] [class*="scroller_"],
        [class*="membersWrap_"] [class*="scrollerBase_"],
        [class*="membersWrap_"] [class*="thin_"] {
            background: transparent !important;
            position: relative;
            z-index: 1;
        }
    ` : settings.store.transparentTheme ? `
        /* ── Mode thème transparent : liste des membres transparente ── */
        [class*="membersWrap_"] {
            background: transparent !important;
        }
        [class*="membersWrap_"] [class*="members_"],
        [class*="membersWrap_"] [class*="scroller_"],
        [class*="membersWrap_"] [class*="scrollerBase_"],
        [class*="membersWrap_"] [class*="thin_"] {
            background: transparent !important;
        }
    ` : `
        /* ── Liste des membres — fond natif Discord (bloque l'image fixed) ── */
        [class*="membersWrap_"] {
            background: var(--background-secondary) !important;
        }
        [class*="membersWrap_"] [class*="members_"],
        [class*="membersWrap_"] [class*="scroller_"],
        [class*="membersWrap_"] [class*="scrollerBase_"],
        [class*="membersWrap_"] [class*="thin_"] {
            background: transparent !important;
        }
    `;

        chatExtStyleEl.textContent = `
        /* ── Masquer le ::after natif Discord sur le conteneur children_ ── */
        div[class*="children_"]::after {
            display: none !important;
        }

        /* ── Zone de messages : transparente pour laisser voir l'image injectée ── */
        [class*="chat_"] [class*="messagesWrapper_"],
        [class*="chat_"] [class*="managedReactiveScroller_"],
        [class*="chat_"] [class*="scrollerBase_"][class*="auto_"],
        [class*="chat_"] [class*="scrollerBase_"][class*="thin_"],
        [class*="chat_"] [class*="scrollerBase_"][class*="none_"] {
            background: transparent !important;
        }

        ${settings.store.transparentTheme ? `
        /* ── Mode thème transparent : header transparent ── */
        [class*="subtitleContainer_"],
        [class*="subtitleContainer_"] section,
        [class*="subtitleContainer_"] [class*="container__"] {
            background: transparent !important;
        }
        ` : `
        /* ── Header du salon — fond natif Discord (bloque l'image fixed) ── */
        [class*="subtitleContainer_"],
        [class*="subtitleContainer_"] section,
        [class*="subtitleContainer_"] [class*="container__"] {
            background: var(--background-primary) !important;
        }
        `}

        ${membersSidebarCss}
    `;
}

// ─── Voice channel background ─────────────────────────────────────────────────

let voiceStyleEl: HTMLStyleElement | null = null;

function removeVoiceBg() {
    voiceStyleEl?.remove();
    voiceStyleEl = null;
}

function updateVoiceBg() {
    const { backgroundSize, overlayOpacity } = settings.store;

    const selectedId = SelectedChannelStore.getChannelId();
    if (!selectedId) { removeVoiceBg(); return; }

    const channel = ChannelStore.getChannel(selectedId);
    if (!channel || (channel.type !== 2 && channel.type !== 13)) { removeVoiceBg(); return; }

    const url = DynBgStore.getUrlForChannel(selectedId, channel.guild_id);
    if (!url) { removeVoiceBg(); return; }

    if (!voiceStyleEl) {
        voiceStyleEl = document.createElement("style");
        voiceStyleEl.id = "vc-dynbg-voice";
        document.head.appendChild(voiceStyleEl);
    }

    const size = (backgroundSize as string) ?? "cover";
    const alphaDark = Math.min(Math.max(((overlayOpacity ?? 20) / 100) * 1.8, 0.75), 0.92).toFixed(3);

    voiceStyleEl.textContent = `
        [class*="callContainer_"] {
            position: relative !important;
        }
        [class*="callContainer_"] > [class*="root_"] {
            background: transparent !important;
        }
        [class*="callContainer_"] > [class*="root_"] > div {
            background: transparent !important;
        }
        [class*="callContainer_"] > [class*="root_"] > div > div {
            background: transparent !important;
        }
        [class*="callContainer_"] [class*="pulseGradient_"] {
            display: none !important;
        }
        [class*="callContainer_"] [class*="gradientBackground_"] {
            display: none !important;
        }
        [class*="callContainer_"] [class*="tiles_"] {
            background: transparent !important;
        }
        [class*="callContainer_"] canvas {
            display: none !important;
        }
        [class*="callContainer_"] img[class*="art_"] {
            display: none !important;
        }
        [class*="callContainer_"] [class*="singleUserRoot_"] {
            background: transparent !important;
        }
        [class*="callContainer_"]::before {
            content: "";
            position: absolute;
            inset: 0;
            background-image: url(${url});
            background-size: ${size};
            background-position: center center;
            background-repeat: no-repeat;
            background-attachment: fixed;
            z-index: 0;
            pointer-events: none;
        }
        [class*="callContainer_"]::after {
            content: "";
            position: absolute;
            inset: 0;
            background: rgba(0,0,0,${alphaDark});
            z-index: 0;
            pointer-events: none;
        }
        [class*="callContainer_"] > [class*="root_"],
        [class*="callContainer_"] > [class*="videoControls_"] {
            position: relative;
            z-index: 1;
        }
        /* Neutraliser les transform sur callContainer_ et ses ancêtres proches   */
        /* pour que background-attachment:fixed fonctionne (fixed est cassé si un  */
        /* ancêtre a transform/filter/will-change)                                  */
        [class*="callContainer_"] {
            transform: none !important;
            will-change: auto !important;
        }

        /* ── Wrapper global (voichat + sidebar discussion) ── */
        /* Rend le wrapper englobant transparent pour que l'image du callContainer_ */
        /* soit visible dans la zone de séparation et le channelChatWrapper_         */
        [class*="sidebarOpen_"][class*="noChat_"],
        [class*="noChat_"][class*="video_"] {
            background: transparent !important;
            position: relative !important;
        }
        [class*="channelChatWrapper_"] {
            background: transparent !important;
        }
    `;
}

// ─── Forum channel background ─────────────────────────────────────────────────

let forumStyleEl: HTMLStyleElement | null = null;

function removeForumBg() {
    forumStyleEl?.remove();
    forumStyleEl = null;
}

function updateForumBg() {
    const { backgroundSize, overlayOpacity, overlayColor, discordColor } = settings.store;

    const selectedId = SelectedChannelStore.getChannelId();
    if (!selectedId) { removeForumBg(); return; }

    const channel = ChannelStore.getChannel(selectedId);
    if (!channel) { removeForumBg(); return; }

    // Type 5 = GUILD_FORUM, type 15 = GUILD_MEDIA
    // Type 11/12 = threads — on regarde si leur parent est un forum
    let url: string | undefined;
    if (channel.type === 5 || channel.type === 15) {
        url = DynBgStore.getUrlForChannel(selectedId, channel.guild_id);
    } else if (channel.type === 11 || channel.type === 12) {
        const parentId = (channel as any).parent_id;
        if (parentId) {
            const parent = ChannelStore.getChannel(parentId);
            if (parent && (parent.type === 5 || parent.type === 15)) {
                url = DynBgStore.getUrlForThread(selectedId, parentId, channel.guild_id);
            }
        }
    }

    if (!url) { removeForumBg(); return; }

    if (!forumStyleEl) {
        forumStyleEl = document.createElement("style");
        forumStyleEl.id = "vc-dynbg-forum";
        document.head.appendChild(forumStyleEl);
    }

    const size = (backgroundSize as string) ?? "cover";
    // overlayColor : couleur de l'overlay de l'image
    const [r, g, b] = hexToRgb(overlayColor || "#000000");
    const alpha = ((overlayOpacity ?? 20) / 100).toFixed(3);
    const alphaDark = Math.min(((overlayOpacity ?? 20) / 100) * 1.5, 1).toFixed(3);
    // discordColor : couleur des plaques (cards, header, recherche, tags)
    const [dr, dg, db] = hexToRgb((discordColor as string) || "#323339");

    forumStyleEl.textContent = `
        [class*="container_f369db"] {
            position: relative !important;
            overflow: hidden !important;
        }
        [class*="container_f369db"] {
            transform: none !important;
            will-change: auto !important;
        }
        [class*="container_f369db"]::before {
            content: "";
            position: absolute;
            inset: 0;
            background-image: url(${url});
            background-size: ${size};
            background-position: center center;
            background-repeat: no-repeat;
            background-attachment: fixed;
            z-index: 0;
            pointer-events: none;
        }
        [class*="container_f369db"]::after {
            content: "";
            position: absolute;
            inset: 0;
            background: rgba(${r},${g},${b},${alphaDark});
            z-index: 0;
            pointer-events: none;
        }
        [class*="container_f369db"] > * {
            position: relative;
            z-index: 1;
        }
        [class*="grid_f369db"], [class*="container__34c2c"] {
            background: transparent !important;
        }
        /* ── Plaques de thread ── */
        [class*="card_f369db"] {
            background: rgb(${dr},${dg},${db}) !important;
        }
        [class*="columnsSpan_f369db"] {
            margin-bottom: 16px !important;
            left: 0 !important;
            width: 100% !important;
            box-sizing: border-box !important;
            padding: 0 26px !important;
            background: transparent !important;
        }
        /* ── Header & barre de recherche ── */
        [class*="mainCard_f369db"][class*="header_f369db"],
        [class*="matchingPostsRow_f369db"] {
            background: rgb(${dr},${dg},${db}) !important;
        }
        [class*="tagsContainer_"] {
            background: transparent !important;
        }
        [class*="tagsContainer_"] [class*="tag_"] {
            background: rgba(${dr},${dg},${db},${alpha}) !important;
        }
        [class*="tagsContainer_"] button {
            background: rgba(${dr},${dg},${db},${alpha}) !important;
        }

        /* ── Wrapper englobant (forum + sidebar thread) ── */
        /* Rend transparent la zone de séparation entre le forum et sa sidebar */
        [class*="sidebarOpen_"]:not([class*="callContainer_"]),
        [class*="noChat_"]:not([class*="callContainer_"]) {
            background: transparent !important;
        }
        [class*="channelChatWrapper_"] {
            background: transparent !important;
        }
    `;
}

// ─── Sidebar / guilds / titlebar background ───────────────────────────────────

let sidebarStyleEl: HTMLStyleElement | null = null;

function removeSidebarBg() {
    sidebarStyleEl?.remove();
    sidebarStyleEl = null;
}

function updateSidebarBg() {
    const guildId = SelectedGuildStore?.getGuildId?.();
    const bgUrl = guildId ? DynBgStore.getForSidebar(guildId) : undefined;

    if (!bgUrl) { removeSidebarBg(); return; }

    const alpha = ((settings.store.sidebarOpacity ?? 50) / 100).toFixed(3);

    sidebarStyleEl?.remove();
    sidebarStyleEl = null;

    sidebarStyleEl = document.createElement("style");
    sidebarStyleEl.id = "vc-dynbg-sidebar";
    document.head.appendChild(sidebarStyleEl);

    // Utiliser background-attachment: fixed + pseudo-éléments avec z-index: -1
    // pour que l'image soit bien derrière le contenu et ne bloque rien.
    sidebarStyleEl.textContent = `
        /* ── Barre de titre ── */
        #app-mount [class*="bar_c38106"] {
            position: relative !important;
            background: transparent !important;
            background-color: transparent !important;
            isolation: isolate !important;
        }
        #app-mount [class*="bar_c38106"]::before {
            content: "";
            position: absolute;
            inset: 0;
            background-image: url("${bgUrl}");
            background-size: cover;
            background-position: left top;
            background-repeat: no-repeat;
            transform: translateZ(0);
            will-change: transform;
            z-index: -1;
            pointer-events: none;
        }
        #app-mount [class*="bar_c38106"]::after {
            content: "";
            position: absolute;
            inset: 0;
            background: rgba(0,0,0,${alpha});
            transform: translateZ(0);
            will-change: transform;
            z-index: -1;
            pointer-events: none;
        }

        /* ── Liste de serveurs (guilds) ── */
        #app-mount nav[class*="guilds_"] {
            position: relative !important;
            background: transparent !important;
            background-color: transparent !important;
        }
        #app-mount nav[class*="guilds_"]::before {
            content: "";
            position: absolute;
            inset: 0;
            background-image: url("${bgUrl}");
            background-size: cover;
            background-position: left top;
            background-repeat: no-repeat;
            transform: translateZ(0);
            will-change: transform;
            z-index: 0;
            pointer-events: none;
        }
        #app-mount nav[class*="guilds_"]::after {
            content: "";
            position: absolute;
            inset: 0;
            background: rgba(0,0,0,${alpha});
            transform: translateZ(0);
            will-change: transform;
            z-index: 0;
            pointer-events: none;
        }
        #app-mount nav[class*="guilds_"] [class*="scroller_"],
        #app-mount nav[class*="guilds_"] [class*="scrollerBase_"] {
            background: transparent !important;
            background-color: transparent !important;
            position: relative !important;
            z-index: 1 !important;
        }

        /* ── Supprimer les coins arrondis structurels de la sidebar ── */
        [class*="sidebarListRounded_"] {
            border-radius: 0 !important;
        }
        [class*="container_f37cb1"],
        [class*="container_f37cb1"] > [class*="animatedContainer"],
        [class*="container_f37cb1"] > [class*="animatedContainer"] > [class*="bannerImage"],
        [class*="container_f37cb1"] > [class*="animatedContainer"] > [class*="bannerImage"] img {
            border-radius: 0 !important;
        }
        /* ── Liste de salons ── */
        ${settings.store.transparentTheme ? `
        /* Mode thème transparent : on laisse la liste des salons, la liste des membres et le user panel transparents */
        nav[class*="container__2637a"] {
            background: transparent !important;
        }
        [class*="sidebar_"] {
            background: transparent !important;
        }
        /* User panel : totalement opaque pour ne pas être invisible */
        [class*="panels__"] {
            background: transparent !important;
            opacity: 1 !important;
            visibility: visible !important;
        }
        [class*="container__37e49"] {
            background: transparent !important;
            opacity: 1 !important;
            visibility: visible !important;
        }
        /* Liste des membres */
        [class*="membersWrap_"] {
            background: transparent !important;
        }
        [class*="members_"],
        [class*="member_"] {
            background: transparent !important;
        }
        ` : `
        /* Mode normal : fond natif Discord sur la liste des salons (bloque l'image de la guild bar) */
        nav[class*="container__2637a"] {
            background: var(--background-secondary) !important;
        }
        `}

        /* ── Autres éléments transparents ── */
        [class*="sidebar_"]::after {
            background: transparent !important;
            background-color: transparent !important;
        }
    `;
}

// ─── Context-menu helpers ──────────────────────────────────────────────────────

function buildChannelMenu(channelId: string) {
    const initialUrl = DynBgStore.getForChannel(channelId);

    const setUrl = (url: string) =>
        FluxDispatcher.dispatch({ type: "VC_DYNBG_CHANGE", channelId, url } as any);
    const removeUrl = () =>
        FluxDispatcher.dispatch({ type: "VC_DYNBG_REMOVE", channelId } as any);

    return (
        <Menu.MenuItem label="Dynamic Background" key="vc-dynbg-menu" id="vc-dynbg-menu">
            <Menu.MenuItem
                label="Set channel background"
                id="vc-dynbg-set"
                action={() => openModal(p => (
                    <SetBackgroundModal props={p} onSelect={setUrl} initialUrl={initialUrl}
                        title="Set channel background" />
                ))}
            />
            <Menu.MenuSeparator />
            <Menu.MenuItem label="Remove channel background" id="vc-dynbg-remove" color="danger"
                disabled={!initialUrl} action={removeUrl} />
        </Menu.MenuItem>
    );
}

function buildGuildMenu(guildId: string) {
    const initialSidebarUrl = DynBgStore.getForSidebar(guildId);

    const setSidebar = (url: string) =>
        FluxDispatcher.dispatch({ type: "VC_DYNBG_SIDEBAR_CHANGE", guildId, url } as any);
    const removeSidebar = () =>
        FluxDispatcher.dispatch({ type: "VC_DYNBG_SIDEBAR_REMOVE", guildId } as any);

    return (
        <Menu.MenuItem label="Dynamic Background" key="vc-dynbg-menu" id="vc-dynbg-menu">
            <Menu.MenuItem
                label="Set sidebar background"
                id="vc-dynbg-sidebar-set"
                action={() => openModal(p => (
                    <SetBackgroundModal props={p} onSelect={setSidebar} initialUrl={initialSidebarUrl}
                        title="Set server sidebar background" />
                ))}
            />
            <Menu.MenuSeparator />
            <Menu.MenuItem label="Remove sidebar background" id="vc-dynbg-sidebar-remove" color="danger"
                disabled={!initialSidebarUrl} action={removeSidebar} />
        </Menu.MenuItem>
    );
}

const ChannelContextPatch: NavContextMenuPatchCallback = (children, args) => {
    if (!args.channel) return;
    children.push(buildChannelMenu(args.channel.id));
};
const GuildContextPatch: NavContextMenuPatchCallback = (children, args) => {
    if (!args.guild) return;
    const item = buildGuildMenu(args.guild.id);
    const group = findGroupChildrenByChildId("privacy", children);
    if (group) group.push(item);
    else children.push(item);
};
const UserContextPatch: NavContextMenuPatchCallback = (children, args) => {
    if (!args.user) return;
    const dmChannelId = ChannelStore.getDMFromUserId(args.user.id);
    if (!dmChannelId) return;
    children.push(buildChannelMenu(dmChannelId));
};

// ─── Settings panel ───────────────────────────────────────────────────────────

function SettingsPanel() {
const globalDefault = useStateFromStores([DynBgStore], () => DynBgStore.globalDefault);

const setGlobal = (url: string) =>
FluxDispatcher.dispatch({ type: "VC_DYNBG_CHANGE_GLOBAL", url } as any);
const removeGlobal = () =>
FluxDispatcher.dispatch({ type: "VC_DYNBG_CHANGE_GLOBAL", url: undefined } as any);

const btn = (label: string, color: string, onClick: () => void) => (
<button onClick={onClick} style={{
padding: "6px 14px", borderRadius: 4, border: "none",
cursor: "pointer", fontSize: 14, color: "#fff", background: color,
}}>{label}</button>
);

return (
<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
<span style={{ color: "var(--text-muted)", fontSize: 13 }}>
    Right-click a <strong>channel</strong> or <strong>server</strong> → <em>Dynamic Background</em> to assign an image.
    The global default is used as fallback when nothing specific is set.
</span>
{globalDefault && (
    <img alt="preview" src={globalDefault}
        style={{ width: "100%", height: 100, objectFit: "cover", borderRadius: 8
    }} />
)}
<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
    {btn(globalDefault ? "Change global default" : "Set global default", "var(--brand-500)",
        () => openModal(p => <SetBackgroundModal props={p} onSelect={setGlobal}
            initialUrl={globalDefault} title="Set global default background" />))}
    {globalDefault && btn("Remove global default", "var(--red-500,#ed4245)", removeGlobal)}
    {btn("Reset all backgrounds", "var(--red-500,#ed4245)",
        () => FluxDispatcher.dispatch({ type: "VC_DYNBG_RESET" } as any))}
</div>
</div>
);
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export default definePlugin({
name: "DynamicChannelBackground",
description: "Applies a custom background image per channel, server, or globally. Edges fade for readability.",
authors: [Devs.Joona],
settings,

patches: [
{
    find: ".handleSendMessage,onResize",
    group: true,
    replacement: [
        {
            match: /return.{1,150},(?=keyboardModeEnabled)/,
            replace: "const vcDynBgState=$self.WallpaperState(arguments[0].channel);$&vcDynBgState,",
        },
        {
            match: /}\)]}\)](?=.{1,30}messages-)/,
            replace: "$&.toSpliced(0,0,$self.Wallpaper(this.props.vcDynBgState??{}))",
        },
    ],
},
],

contextMenus: {
    "channel-context": ChannelContextPatch,
    "thread-context": ChannelContextPatch,
    "gdm-context": ChannelContextPatch,
    "guild-context": GuildContextPatch,
    "user-context": UserContextPatch,
},

flux: {
    VOICE_CHANNEL_SELECT: () => { updateVoiceBg(); updateChatExtBg(); },
    CHANNEL_SELECT: () => { updateVoiceBg(); updateForumBg(); updateSidebarBg(); updateChatExtBg(); },
    GUILD_SELECT: () => { updateSidebarBg(); },
    VC_DYNBG_CHANGE: () => { updateVoiceBg(); updateForumBg(); updateChatExtBg(); updateSidebarBg(); },
    VC_DYNBG_REMOVE: () => { updateVoiceBg(); updateForumBg(); updateChatExtBg(); updateSidebarBg(); },
    VC_DYNBG_SIDEBAR_CHANGE: () => { updateSidebarBg(); },
    VC_DYNBG_SIDEBAR_REMOVE: () => { updateSidebarBg(); },
    VC_DYNBG_RESET: () => { updateVoiceBg(); updateForumBg(); removeSidebarBg(); removeChatExtBg(); },
    VC_DYNBG_CHANGE_GLOBAL: () => { updateVoiceBg(); updateForumBg(); updateChatExtBg(); },
},

settingsAboutComponent: SettingsPanel,

    Wallpaper({ url, fixed }: { url: string | undefined; fixed?: boolean; }) {
        if (!url) return null;
        const { backgroundSize } = settings.store;
        return (
            <WallpaperInner
                url={url}
                size={(backgroundSize as string) ?? "cover"}
                fixed={fixed}
            />
        );
    },

    WallpaperState(channel: Channel): { url: string | undefined; fixed: boolean; } {
        return useStateFromStores([DynBgStore, SelectedChannelStore], () => {
            const parentId = (channel as any).parent_id;

            // Threads (type 11 = PUBLIC_THREAD, type 12 = PRIVATE_THREAD)
            if (channel.type === 11 || channel.type === 12) {
                if (parentId) {
                    const parent = ChannelStore.getChannel(parentId);
                    // Thread d'un salon vocal → fixed pour continuité avec callContainer_::before
                    if (parent && (parent.type === 2 || parent.type === 13)) {
                        return { url: DynBgStore.getUrlForChannel(parentId, parent.guild_id), fixed: true };
                    }
                    // Thread d'un forum → fixed pour continuité avec container_f369db::before
                    if (parent && (parent.type === 5 || parent.type === 15)) {
                        return { url: DynBgStore.getUrlForThread(channel.id, parentId, channel.guild_id), fixed: true };
                    }
                }
                return { url: DynBgStore.getUrlForThread(channel.id, parentId, channel.guild_id), fixed: false };
            }

            // Salons vocaux et stages : fixed pour s'aligner avec callContainer_::before
            if (channel.type === 2 || channel.type === 13) {
                return { url: DynBgStore.getUrlForChannel(channel.id, channel.guild_id), fixed: true };
            }

            // Canal texte normal
            return { url: DynBgStore.getUrlForChannel(channel.id, channel.guild_id), fixed: false };
        });
    },

    start() {
        ensureGlobalStyle();
        updateVoiceBg();
        updateForumBg();
        updateSidebarBg();
        updateChatExtBg();
    },

    stop() {
        removeGlobalStyle();
        removeVoiceBg();
        removeForumBg();
        removeSidebarBg();
        removeChatExtBg();
    },
});
