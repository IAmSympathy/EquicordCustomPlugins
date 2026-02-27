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
    opacity: {
        type: OptionType.SLIDER,
        description: "Opacity of the background overlay (0 = fully transparent, 100 = fully opaque).",
        default: 35,
        markers: [0, 25, 50, 75, 100],
        stickToMarkers: false,
        onChange: () => { updateChatExtBg(); },
    },
    bgColor: {
        type: OptionType.STRING,
        description: "Background color of the chat overlay (hex, e.g. #323339).",
        default: "#323339",
        onChange: () => { updateChatExtBg(); },
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
    sidebarOpacity: {
        type: OptionType.SLIDER,
        description: "Opacity of the dark overlay on the sidebar/guilds/titlebar background (0 = no overlay, 100 = fully opaque).",
        default: 50,
        markers: [0, 25, 50, 75, 100],
        stickToMarkers: false,
        onChange: () => { updateSidebarBg(); },
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
}

function WallpaperInner({ url, size }: WallpaperProps) {
    const { opacity, bgColor } = settings.use(["opacity", "bgColor"]);
    const [r, g, b] = hexToRgb(bgColor || "#323339");
    const alpha = ((opacity ?? 35) / 100).toFixed(3);

    return (
        <>
            {/* Fond image — positionné absolute dans le conteneur chat injecté par le patch */}
            <div
                className="vc-dynbg-image-layer"
                style={{
                    backgroundImage: `url(${url})`,
                    backgroundSize: size,
                    backgroundPosition: "center center",
                    backgroundRepeat: "no-repeat",
                    backgroundAttachment: "fixed",
                    position: "absolute",
                    inset: 0,
                    zIndex: 0,
                    pointerEvents: "none",
                }}
            />
            {/* Overlay de couleur semi-transparent par-dessus l'image */}
            <div
                className="vc-dynbg-overlay-layer"
                style={{
                    background: `rgba(${r},${g},${b},${alpha})`,
                    position: "absolute",
                    inset: 0,
                    zIndex: 0,
                    pointerEvents: "none",
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
    const { backgroundSize, opacity, bgColor } = settings.store;

    const selectedId = SelectedChannelStore.getChannelId();
    if (!selectedId) { removeChatExtBg(); return; }

    const channel = ChannelStore.getChannel(selectedId);
    if (!channel) { removeChatExtBg(); return; }

    // Pour les threads, on hérite du fond du parent forum
    let url: string | undefined;
    if (channel.type === 11 || channel.type === 12) {
        url = DynBgStore.getUrlForThread(selectedId, (channel as any).parent_id, channel.guild_id);
    } else {
        url = DynBgStore.getUrlForChannel(selectedId, channel.guild_id);
    }

    if (!url) { removeChatExtBg(); return; }

    if (!chatExtStyleEl) {
        chatExtStyleEl = document.createElement("style");
        chatExtStyleEl.id = "vc-dynbg-chat-ext";
        document.head.appendChild(chatExtStyleEl);
    }

    const size = (backgroundSize as string) ?? "cover";
    const [r, g, b] = hexToRgb(bgColor || "#323339");
    const alpha = ((opacity ?? 35) / 100).toFixed(3);

    // On utilise background-attachment:fixed + pseudo-éléments ::before/::after pour que
    // l'image couvre exactement le viewport sur chaque section (header, chat, member list).
    // Le fond du chat lui-même est géré par le patch JS (WallpaperInner injecté dans le scroller).
    chatExtStyleEl.textContent = `
        /* ── Zone de messages : rendre transparent pour voir les divs injectés par le patch ── */
        [class*="chat_"] [class*="messagesWrapper_"],
        [class*="chat_"] [class*="managedReactiveScroller_"],
        [class*="chat_"] [class*="scrollerBase_"][class*="auto_"],
        [class*="chat_"] [class*="scrollerBase_"][class*="thin_"],
        [class*="chat_"] [class*="scrollerBase_"][class*="none_"] {
            background: transparent !important;
        }

        /* ── Supprimer le gradient gris en bas du scroller ── */
        [class*="scrollerInner_"]::after,
        [class*="scrollerSpacer_"] {
            background: transparent !important;
            background-image: none !important;
        }

        /* ── Header du salon ── */
        /* Structure réelle : div.subtitleContainer_ > section.title_ */
        [class*="subtitleContainer_"] {
            background: transparent !important;
            position: relative !important;
            isolation: isolate !important;
        }
        [class*="subtitleContainer_"] > section[class*="title_"] {
            background: transparent !important;
            position: relative !important;
            isolation: isolate !important;
            z-index: 1 !important;
        }
        [class*="subtitleContainer_"]::before {
            content: "";
            position: absolute;
            inset: 0;
            background-image: url("${url}");
            background-size: ${size};
            background-position: center center;
            background-repeat: no-repeat;
            background-attachment: fixed;
            z-index: 0;
            pointer-events: none;
        }
        [class*="subtitleContainer_"]::after {
            content: "";
            position: absolute;
            inset: 0;
            background: rgba(${r},${g},${b},${alpha});
            z-index: 0;
            pointer-events: none;
        }
        /* S'assurer que le contenu du header reste par dessus les pseudo-éléments */
        [class*="subtitleContainer_"] > * {
            position: relative;
            z-index: 1;
        }


        /* ── Liste des membres (panneau droit) ── */
        [class*="membersWrap_"] {
            position: relative !important;
            isolation: isolate !important;
            background: transparent !important;
        }
        [class*="membersWrap_"]::before {
            content: "";
            position: absolute;
            inset: 0;
            background-image: url("${url}");
            background-size: ${size};
            background-position: center center;
            background-repeat: no-repeat;
            background-attachment: fixed;
            z-index: -1;
            pointer-events: none;
        }
        [class*="membersWrap_"]::after {
            content: "";
            position: absolute;
            inset: 0;
            background: rgba(${r},${g},${b},${alpha});
            z-index: -1;
            pointer-events: none;
        }
        [class*="membersWrap_"] [class*="members_"],
        [class*="membersWrap_"] [class*="scroller_"],
        [class*="membersWrap_"] [class*="scrollerBase_"],
        [class*="membersWrap_"] [class*="thin_"] {
            background: transparent !important;
        }
    `;
}

// ─── Voice channel background ─────────────────────────────────────────────────

let voiceStyleEl: HTMLStyleElement | null = null;

function removeVoiceBg() {
    voiceStyleEl?.remove();
    voiceStyleEl = null;
}

function updateVoiceBg() {
    const { backgroundSize, opacity } = settings.store;

    // Toujours utiliser le canal actuellement affiché, peu importe où l'on est connecté
    const selectedId = SelectedChannelStore.getChannelId();
    if (!selectedId) { removeVoiceBg(); return; }

    const channel = ChannelStore.getChannel(selectedId);
    // Ne s'applique qu'aux salons vocaux (type 2) et stage (type 13)
    if (!channel || (channel.type !== 2 && channel.type !== 13)) { removeVoiceBg(); return; }

    const url = DynBgStore.getUrlForChannel(selectedId, channel.guild_id);
    if (!url) { removeVoiceBg(); return; }

    if (!voiceStyleEl) {
        voiceStyleEl = document.createElement("style");
        voiceStyleEl.id = "vc-dynbg-voice";
        document.head.appendChild(voiceStyleEl);
    }

    const size = (backgroundSize as string) ?? "cover";
    const alpha = ((opacity ?? 35) / 100).toFixed(3);

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
            will-change: transform;
            transform: translateZ(0);
            z-index: 0;
            pointer-events: none;
        }
        [class*="callContainer_"]::after {
            content: "";
            position: absolute;
            inset: 0;
            background: rgba(0,0,0,${alpha});
            will-change: transform;
            transform: translateZ(0);
            z-index: 0;
            pointer-events: none;
        }
        [class*="callContainer_"] > [class*="root_"],
        [class*="callContainer_"] > [class*="videoControls_"] {
            position: relative;
            z-index: 1;
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
    const { backgroundSize, opacity, bgColor } = settings.store;

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
    const [r, g, b] = hexToRgb(bgColor || "#323339");
    const alpha = ((opacity ?? 35) / 100).toFixed(3);

    forumStyleEl.textContent = `
        [class*="container_f369db"] {
            position: relative !important;
            overflow: hidden !important;
        }
        [class*="container_f369db"]::before {
            content: "";
            position: absolute;
            inset: 0;
            background-image: url(${url});
            background-size: ${size};
            background-position: center center;
            background-repeat: no-repeat;
            will-change: transform;
            transform: translateZ(0);
            z-index: 0;
            pointer-events: none;
        }
        [class*="container_f369db"]::after {
            content: "";
            position: absolute;
            inset: 0;
            background: rgba(${r},${g},${b},${alpha});
            will-change: transform;
            transform: translateZ(0);
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
        [class*="card_f369db"] {
            background: rgb(${r},${g},${b}) !important;
        }
        [class*="columnsSpan_f369db"] {
            margin-bottom: 16px !important;
            left: 0 !important;
            width: 100% !important;
            box-sizing: border-box !important;
            padding: 0 26px !important;
            background: transparent !important;
        }
        [class*="mainCard_f369db"][class*="header_f369db"],
        [class*="matchingPostsRow_f369db"] {
            background: rgb(${r},${g},${b}) !important;
        }
        [class*="tagsContainer_f369db"] {
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

    if (!sidebarStyleEl) {
        sidebarStyleEl = document.createElement("style");
        sidebarStyleEl.id = "vc-dynbg-sidebar";
        document.head.appendChild(sidebarStyleEl);
    }

    // Utiliser background-attachment: fixed + pseudo-éléments avec z-index: -1
    // pour que l'image soit bien derrière le contenu et ne bloque rien.
    sidebarStyleEl.textContent = `
        /* Barre de titre */
        [class*="bar_c38106"] {
            position: relative !important;
            background: transparent !important;
            background-color: transparent !important;
            isolation: isolate !important;
        }
        [class*="bar_c38106"]::before {
            content: "";
            position: absolute;
            inset: 0;
            background-image: url("${bgUrl}");
            background-size: cover;
            background-position: left top;
            background-repeat: no-repeat;
            background-attachment: fixed;
            z-index: -1;
            pointer-events: none;
        }
        [class*="bar_c38106"]::after {
            content: "";
            position: absolute;
            inset: 0;
            background: rgba(0,0,0,${alpha});
            z-index: -1;
            pointer-events: none;
        }

        /* Liste de serveurs (guilds) */
        nav[class*="guilds_"] {
            position: relative !important;
            background: transparent !important;
            background-color: transparent !important;
            isolation: isolate !important;
        }
        nav[class*="guilds_"]::before {
            content: "";
            position: absolute;
            inset: 0;
            background-image: url("${bgUrl}");
            background-size: cover;
            background-position: left top;
            background-repeat: no-repeat;
            background-attachment: fixed;
            z-index: -1;
            pointer-events: none;
        }
        nav[class*="guilds_"]::after {
            content: "";
            position: absolute;
            inset: 0;
            background: rgba(0,0,0,${alpha});
            z-index: -1;
            pointer-events: none;
        }
        nav[class*="guilds_"] [class*="scroller_"],
        nav[class*="guilds_"] [class*="scrollerBase_"] {
            background: transparent !important;
        }

        /* Liste de salons (channel list) */
        nav[class*="container__2637a"] {
            position: relative !important;
            background: transparent !important;
            background-color: transparent !important;
            isolation: isolate !important;
        }
        nav[class*="container__2637a"]::before {
            content: "";
            position: absolute;
            inset: 0;
            background-image: url("${bgUrl}");
            background-size: cover;
            background-position: left top;
            background-repeat: no-repeat;
            background-attachment: fixed;
            z-index: -1;
            pointer-events: none;
        }
        nav[class*="container__2637a"]::after {
            content: "";
            position: absolute;
            inset: 0;
            background: rgba(0,0,0,${alpha});
            z-index: -1;
            pointer-events: none;
        }

        /* Rendre transparents les enfants directs qui ont leur propre background */
        [class*="sidebarRegion_"],
        [class*="sidebarRegionScroller_"],
        [class*="panels_"],
        [class*="container_f37cb1"],
        [class*="scroller__629e4"] {
            background: transparent !important;
            background-color: transparent !important;
        }

        /* Masquer le rectangle gris en bas de la sidebar */
        [class*="sidebar_"]::after {
            background: transparent !important;
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
            replace: "const vcDynBgUrl=$self.WallpaperState(arguments[0].channel);$&vcDynBgUrl,",
        },
        {
            match: /}\)]}\)](?=.{1,30}messages-)/,
            replace: "$&.toSpliced(0,0,$self.Wallpaper({url:this.props.vcDynBgUrl}))",
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
    VOICE_CHANNEL_SELECT: updateVoiceBg,
    CHANNEL_SELECT: () => { updateVoiceBg(); updateForumBg(); updateSidebarBg(); updateChatExtBg(); },
    GUILD_SELECT: () => { updateSidebarBg(); },
    VC_DYNBG_CHANGE: () => { updateVoiceBg(); updateForumBg(); updateChatExtBg(); },
    VC_DYNBG_REMOVE: () => { updateVoiceBg(); updateForumBg(); updateChatExtBg(); },
    VC_DYNBG_SIDEBAR_CHANGE: () => { updateSidebarBg(); },
    VC_DYNBG_SIDEBAR_REMOVE: () => { updateSidebarBg(); },
    VC_DYNBG_RESET: () => { updateVoiceBg(); updateForumBg(); removeSidebarBg(); removeChatExtBg(); },
    VC_DYNBG_CHANGE_GLOBAL: () => { updateVoiceBg(); updateForumBg(); updateChatExtBg(); },
},

settingsAboutComponent: SettingsPanel,

    Wallpaper({ url }: { url: string | undefined; }) {
        if (!url) return null;
        const { backgroundSize } = settings.store;
        return (
            <WallpaperInner
                url={url}
                size={(backgroundSize as string) ?? "cover"}
            />
        );
    },

    WallpaperState(channel: Channel): string | undefined {
        return useStateFromStores([DynBgStore, SelectedChannelStore], () => {
            // Threads (type 11 = PUBLIC_THREAD, type 12 = PRIVATE_THREAD, type 15 = GUILD_MEDIA thread)
            // Héritent du fond du salon forum parent
            if (channel.type === 11 || channel.type === 12) {
                return DynBgStore.getUrlForThread(channel.id, (channel as any).parent_id, channel.guild_id);
            }

            // Image propre au canal
            const own = DynBgStore.getUrlForChannel(channel.id, channel.guild_id);
            if (own) return own;

            // Fallback uniquement si ce canal EST un salon vocal (onglet discussion intégré)
            // Type 2 = vocal, type 13 = stage
            if (channel.type === 2 || channel.type === 13) {
                const voiceId = SelectedChannelStore.getVoiceChannelId();
                if (voiceId === channel.id) {
                    return DynBgStore.getUrlForChannel(voiceId, channel.guild_id);
                }
            }

            return undefined;
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
