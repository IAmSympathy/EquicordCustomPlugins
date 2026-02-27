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
import { ChannelStore, FluxDispatcher, Menu, React, SelectedChannelStore, useEffect, useRef, useState, useStateFromStores } from "@webpack/common";

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
    },
    bgColor: {
        type: OptionType.STRING,
        description: "Background color of the chat overlay (hex, e.g. #323339).",
        default: "#323339",
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
let headerBarStyle: HTMLStyleElement | null = null;

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

function updateHeaderBarStyle() {
    const { bgColor } = settings.store;
    const [r, g, b] = hexToRgb(bgColor || "#323339");

    if (!headerBarStyle) {
        headerBarStyle = document.createElement("style");
        headerBarStyle.id = "vc-dynbg-headerbar";
        document.head.appendChild(headerBarStyle);
    }
    headerBarStyle.textContent = `
        body [class*="chatHeaderBar_"] {
            background: rgb(${r},${g},${b}) !important;
            position: relative !important;
            z-index: 100 !important;
        }
    `;
}

function removeGlobalStyle() {
    globalStyle?.remove();
    globalStyle = null;
    headerBarStyle?.remove();
    headerBarStyle = null;
}

// ─── Composant interne ────────────────────────────────────────────────────────

interface WallpaperProps {
    url: string;
    size: string;
}

function WallpaperInner({ url, size }: WallpaperProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [inputHeight, setInputHeight] = useState(68);
    const { opacity, bgColor } = settings.use(["opacity", "bgColor"]);
    const scrollerRef = useRef<HTMLElement | null>(null);

    const applyBg = (scroller: HTMLElement, op: number, color: string) => {
        const [r, g, b] = hexToRgb(color || "#323339");
        scroller.style.setProperty("background", `rgba(${r},${g},${b},${(op / 100).toFixed(3)})`, "important");
    };

    useEffect(() => {
        if (scrollerRef.current) {
            applyBg(scrollerRef.current, opacity ?? 35, bgColor || "#323339");
        }
    }, [opacity, bgColor]);

    useEffect(() => {
        ensureGlobalStyle();

        const container = containerRef.current;
        if (!container) return;

        const findScroller = (): HTMLElement | null => {
            // D'abord remonter les parents directs
            let el: HTMLElement | null = container;
            while (el) {
                if (el.className && el.className.includes("managedReactiveScroller_")) return el;
                el = el.parentElement;
            }
            // Fallback : chercher depuis le chatArea
            const chatArea = container.closest("[class*='chat_']") as HTMLElement | null;
            return (
                chatArea?.querySelector("[class*='managedReactiveScroller_']") as HTMLElement | null
                ?? chatArea?.querySelector("[class*='scrollerBase_']") as HTMLElement | null
            );
        };

        const setupScroller = (scroller: HTMLElement) => {
            scrollerRef.current = scroller;
            scroller.classList.add("vc-dynbg-active");
            applyBg(scroller, settings.store.opacity ?? 35, settings.store.bgColor || "#323339");
        };

        const scroller = findScroller();
        if (scroller) setupScroller(scroller);

        const mo = new MutationObserver(() => {
            const s = findScroller();
            if (s && s !== scrollerRef.current) setupScroller(s);
        });
        mo.observe(document.body, { childList: true, subtree: true });

        const updateInputHeight = () => {
            const chatArea = container.closest("[class*='chat_']") as HTMLElement | null;
            if (!chatArea) return;
            const s = chatArea.querySelector("[class*='managedReactiveScroller_']") as HTMLElement | null;
            if (!s) return;
            const chatRect = chatArea.getBoundingClientRect();
            const scrollerRect = s.getBoundingClientRect();
            setInputHeight(Math.max(0, chatRect.bottom - scrollerRect.bottom));
        };

        const chatArea = container.closest("[class*='chat_']") as HTMLElement | null;
        const textArea = chatArea?.querySelector("[class*='channelTextArea_']") as HTMLElement | null;
        const ro = new ResizeObserver(updateInputHeight);
        if (textArea) ro.observe(textArea);
        updateInputHeight();

        return () => {
            mo.disconnect();
            ro.disconnect();
            if (scrollerRef.current) {
                scrollerRef.current.classList.remove("vc-dynbg-active");
                scrollerRef.current.style.background = "";
                scrollerRef.current = null;
            }
        };
    }, []);

    const [r, g, b] = hexToRgb(bgColor || "#323339");

    return (
        <>
            <div
                ref={containerRef}
                className="vc-dynbg-container"
                style={{ bottom: `${inputHeight}px`, right: "-1px" }}
            >
                <div
                    className="vc-dynbg-image"
                    style={{
                        position: "absolute",
                        inset: 0,
                        backgroundImage: `url(${url})`,
                        backgroundSize: size,
                        backgroundPosition: "center center",
                        backgroundRepeat: "no-repeat",
                        willChange: "transform",
                        transform: "translateZ(0)",
                        zIndex: 0,
                    }}
                />
            </div>
            <div style={{
                position: "absolute",
                left: 0, right: 0, bottom: 0,
                height: `${inputHeight}px`,
                background: `rgb(${r},${g},${b})`,
                zIndex: 0,
                pointerEvents: "none",
            }} />
        </>
    );
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

// ─── Context-menu helpers ──────────────────────────────────────────────────────

function buildMenu(channelId?: string, guildId?: string) {
const initialUrl = channelId
? DynBgStore.getForChannel(channelId)
: guildId ? DynBgStore.getForGuild(guildId) : undefined;

const setUrl = (url: string) =>
FluxDispatcher.dispatch({ type: "VC_DYNBG_CHANGE", channelId, guildId, url } as any);
const removeUrl = () =>
FluxDispatcher.dispatch({ type: "VC_DYNBG_REMOVE", channelId, guildId } as any);

return (
<Menu.MenuItem label="Dynamic Background" key="vc-dynbg-menu" id="vc-dynbg-menu">
<Menu.MenuItem
    label="Set background image"
    id="vc-dynbg-set"
    action={() => openModal(p => (
        <SetBackgroundModal props={p} onSelect={setUrl} initialUrl={initialUrl}
            title={channelId ? "Set channel background" : "Set server background"} />
    ))}
/>
<Menu.MenuSeparator />
<Menu.MenuItem label="Remove background image" id="vc-dynbg-remove" color="danger"
    disabled={!initialUrl} action={removeUrl} />
</Menu.MenuItem>
);
}

const ChannelContextPatch: NavContextMenuPatchCallback = (children, args) => {
if (!args.channel) return;
children.push(buildMenu(args.channel.id, undefined));
};
const GuildContextPatch: NavContextMenuPatchCallback = (children, args) => {
    if (!args.guild) return;
    const item = buildMenu(undefined, args.guild.id);
    const group = findGroupChildrenByChildId("privacy", children);
    if (group) group.push(item);
    else children.push(item);
};
const UserContextPatch: NavContextMenuPatchCallback = (children, args) => {
if (!args.user) return;
const dmChannelId = ChannelStore.getDMFromUserId(args.user.id);
if (!dmChannelId) return;
children.push(buildMenu(dmChannelId, undefined));
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
    CHANNEL_SELECT: () => { updateVoiceBg(); updateForumBg(); },
    VC_DYNBG_CHANGE: () => { updateVoiceBg(); updateForumBg(); updateHeaderBarStyle(); },
    VC_DYNBG_REMOVE: () => { updateVoiceBg(); updateForumBg(); updateHeaderBarStyle(); },
    VC_DYNBG_RESET: () => { updateVoiceBg(); updateForumBg(); updateHeaderBarStyle(); },
    VC_DYNBG_CHANGE_GLOBAL: () => { updateVoiceBg(); updateForumBg(); updateHeaderBarStyle(); },
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
        updateHeaderBarStyle();
        updateVoiceBg();
        updateForumBg();
    },

    stop() {
        removeGlobalStyle();
        removeVoiceBg();
        removeForumBg();
    },
});
