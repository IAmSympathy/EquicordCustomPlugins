/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import bannersEverywhere from "@equicordplugins/bannersEverywhere";
import usrbg from "@plugins/usrbg";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { User } from "../../../packages/discord-types";

interface Nameplate {
    imgAlt: string;
    palette: {
        darkBackground: string;
        lightBackground: string;
        name: string;
    };
    src: string;
}

type BannerHook = typeof bannersEverywhere.memberListBannerHook;
type VoiceBackgroundHook = typeof usrbg.getVoiceBackgroundStyles;

const BANNER_ID_PREFIX = "vc-banners-everywhere-";

function isAnimatedBanner(url: string) {
    return /\.gif(?:\?|$)/i.test(url);
}

function gifToPngUrl(url: string) {
    return url.replace(/\.gif(?=\?|$)/i, ".png");
}

function isManagedAnimatedSource(url: string) {
    return isAnimatedBanner(url) || url.includes("/usrbg/v2/");
}

function extractCssUrl(value: string) {
    return /^url\(["']?(.*?)["']?\)$/.exec(value.trim())?.[1];
}

function getUsrbgUserId(url: string) {
    return /\/(\d+)(?:\?|$)/.exec(url)?.[1];
}

export default definePlugin({
    name: "AnimatedMediaFocusPause",
    description: "Pauses and resumes animated BannersEverywhere banners and USRBG voice backgrounds based on Discord focus.",
    authors: [Devs.Joona],
    dependencies: ["BannersEverywhere", "USRBG"],

    originalMemberListBannerHook: null as BannerHook | null,
    originalVoiceBackgroundHook: null as VoiceBackgroundHook | null,
    animatedUrlsByUserId: new Map<string, string>(),
    staticUrlsByUserId: new Map<string, string>(),
    voiceStaticUrlsByUserId: new Map<string, string>(),
    voiceAnimatedUrlsByUserId: new Map<string, string>(),
    voiceAnimatedUrlsByTile: new WeakMap<HTMLElement, string>(),

    hasFocus: document.hasFocus(),
    onFocusListener: null as (() => void) | null,
    onBlurListener: null as (() => void) | null,

    setImagePlaybackState(userId: string, focused: boolean) {
        if (!bannersEverywhere.settings.store.animate) return;

        const element = document.getElementById(`${BANNER_ID_PREFIX}${userId}`) as HTMLImageElement | null;
        if (!element) return;

        const animatedUrl = this.animatedUrlsByUserId.get(userId);
        if (!animatedUrl) return;

        if (focused) {
            if (element.src !== animatedUrl) element.src = animatedUrl;
            return;
        }

        const cachedStatic = this.staticUrlsByUserId.get(userId);
        if (cachedStatic && cachedStatic !== animatedUrl) {
            if (element.src !== cachedStatic) element.src = cachedStatic;
            return;
        }

        const fallbackStaticUrl = gifToPngUrl(animatedUrl);
        if (fallbackStaticUrl !== animatedUrl) {
            this.staticUrlsByUserId.set(userId, fallbackStaticUrl);
            if (element.src !== fallbackStaticUrl) element.src = fallbackStaticUrl;
            return;
        }

        bannersEverywhere.gifToPng(animatedUrl)
            .then(staticUrl => {
                if (!staticUrl) return;
                this.staticUrlsByUserId.set(userId, staticUrl);
                if (!this.hasFocus) {
                    const current = document.getElementById(`${BANNER_ID_PREFIX}${userId}`) as HTMLImageElement | null;
                    if (current && current.src !== staticUrl) current.src = staticUrl;
                }
            })
            .catch(() => null);
    },

    setAllImagesPlaybackState(focused: boolean) {
        for (const userId of this.animatedUrlsByUserId.keys()) this.setImagePlaybackState(userId, focused);
    },

    onWindowFocus() {
        this.hasFocus = true;
        this.resumeMountedVoiceTileBackgrounds();
        this.setAllImagesPlaybackState(true);
        window.dispatchEvent(new Event("resize"));
    },

    onWindowBlur() {
        this.hasFocus = false;
        this.setAllImagesPlaybackState(false);
        this.pauseMountedVoiceTileBackgrounds();
        window.dispatchEvent(new Event("resize"));
    },

    memberListBannerHookPatched(user: User, nameplate: Nameplate | undefined) {
        let url = bannersEverywhere.getBanner(user.id);
        if (!url) return;
        if (bannersEverywhere.settings.store.preferNameplate && nameplate) return;

        const canAnimate = bannersEverywhere.settings.store.animate && isManagedAnimatedSource(url);
        if (canAnimate) {
            this.animatedUrlsByUserId.set(user.id, url);

            const fallbackStaticUrl = gifToPngUrl(url);
            if (fallbackStaticUrl !== url) {
                this.staticUrlsByUserId.set(user.id, fallbackStaticUrl);
                if (!this.hasFocus) url = fallbackStaticUrl;
            }
        } else {
            this.animatedUrlsByUserId.delete(user.id);
            this.staticUrlsByUserId.delete(user.id);
        }

        return <img alt="" id={`${BANNER_ID_PREFIX}${user.id}`} src={url} className="vc-banners-everywhere-memberlist" />;
    },

    getVoiceBackgroundStylesPatched(args: { className?: string; participantUserId?: string; }) {
        const style = this.originalVoiceBackgroundHook?.call(usrbg, args);
        const userId = args.participantUserId;
        if (!style || !userId || typeof style.backgroundImage !== "string") return style;

        const match = /^url\(["']?(.*?)["']?\)$/.exec(style.backgroundImage.trim());
        const animatedUrl = match?.[1];
        if (!animatedUrl || !isManagedAnimatedSource(animatedUrl)) return style;

        if (userId) this.voiceAnimatedUrlsByUserId.set(userId, animatedUrl);

        if (this.hasFocus) {
            this.voiceStaticUrlsByUserId.delete(userId);
            return style;
        }

        const cachedStaticUrl = this.voiceStaticUrlsByUserId.get(userId);
        if (cachedStaticUrl && cachedStaticUrl !== animatedUrl) {
            return { ...style, backgroundImage: `url(${cachedStaticUrl})` };
        }

        const fallbackStaticUrl = gifToPngUrl(animatedUrl);
        if (fallbackStaticUrl !== animatedUrl) {
            this.voiceStaticUrlsByUserId.set(userId, fallbackStaticUrl);
            return { ...style, backgroundImage: `url(${fallbackStaticUrl})` };
        }

        bannersEverywhere.gifToPng(animatedUrl)
            .then(staticUrl => {
                if (!staticUrl || this.hasFocus) return;
                this.voiceStaticUrlsByUserId.set(userId, staticUrl);
                window.dispatchEvent(new Event("resize"));
            })
            .catch(() => null);

        return style;
    },

    pauseMountedVoiceTileBackgrounds() {
        const voiceTiles = document.querySelectorAll<HTMLElement>("[data-selenium-video-tile]");

        for (const tile of voiceTiles) {
            const animatedUrl = extractCssUrl(tile.style.backgroundImage ?? "");
            if (!animatedUrl || !isManagedAnimatedSource(animatedUrl)) continue;

            this.voiceAnimatedUrlsByTile.set(tile, animatedUrl);

            const userId = getUsrbgUserId(animatedUrl);
            if (userId) this.voiceAnimatedUrlsByUserId.set(userId, animatedUrl);

            const cachedStaticUrl = userId ? this.voiceStaticUrlsByUserId.get(userId) : undefined;
            if (cachedStaticUrl && cachedStaticUrl !== animatedUrl) {
                tile.style.backgroundImage = `url(${cachedStaticUrl})`;
                continue;
            }

            const fallbackStaticUrl = gifToPngUrl(animatedUrl);
            if (fallbackStaticUrl !== animatedUrl) {
                if (userId) this.voiceStaticUrlsByUserId.set(userId, fallbackStaticUrl);
                tile.style.backgroundImage = `url(${fallbackStaticUrl})`;
                continue;
            }

            bannersEverywhere.gifToPng(animatedUrl)
                .then(staticUrl => {
                    if (!staticUrl || this.hasFocus) return;
                    if (userId) this.voiceStaticUrlsByUserId.set(userId, staticUrl);
                    tile.style.backgroundImage = `url(${staticUrl})`;
                })
                .catch(() => null);
        }
    },

    resumeMountedVoiceTileBackgrounds() {
        const voiceTiles = document.querySelectorAll<HTMLElement>("[data-selenium-video-tile]");

        for (const tile of voiceTiles) {
            const currentUrl = extractCssUrl(tile.style.backgroundImage ?? "");
            const animatedFromTile = this.voiceAnimatedUrlsByTile.get(tile);
            const userId = currentUrl ? getUsrbgUserId(currentUrl) : undefined;
            const animatedFromUser = userId ? this.voiceAnimatedUrlsByUserId.get(userId) : undefined;
            const animatedUrl = animatedFromTile ?? animatedFromUser;

            if (!animatedUrl || !isManagedAnimatedSource(animatedUrl)) continue;
            if (currentUrl === animatedUrl) continue;

            tile.style.backgroundImage = `url(${animatedUrl})`;
        }
    },

    start() {
        this.originalMemberListBannerHook = bannersEverywhere.memberListBannerHook;
        bannersEverywhere.memberListBannerHook = this.memberListBannerHookPatched.bind(this);

        this.originalVoiceBackgroundHook = usrbg.getVoiceBackgroundStyles;
        usrbg.getVoiceBackgroundStyles = this.getVoiceBackgroundStylesPatched.bind(this);

        this.onFocusListener = () => this.onWindowFocus();
        this.onBlurListener = () => this.onWindowBlur();
        window.addEventListener("focus", this.onFocusListener);
        window.addEventListener("blur", this.onBlurListener);

        this.hasFocus = document.hasFocus();
        this.setAllImagesPlaybackState(this.hasFocus);
        if (!this.hasFocus) window.dispatchEvent(new Event("resize"));
    },

    stop() {
        if (this.onFocusListener) {
            window.removeEventListener("focus", this.onFocusListener);
            this.onFocusListener = null;
        }

        if (this.onBlurListener) {
            window.removeEventListener("blur", this.onBlurListener);
            this.onBlurListener = null;
        }

        if (this.originalMemberListBannerHook) {
            bannersEverywhere.memberListBannerHook = this.originalMemberListBannerHook;
            this.originalMemberListBannerHook = null;
        }

        if (this.originalVoiceBackgroundHook) {
            usrbg.getVoiceBackgroundStyles = this.originalVoiceBackgroundHook;
            this.originalVoiceBackgroundHook = null;
        }

        this.animatedUrlsByUserId.clear();
        this.staticUrlsByUserId.clear();
        this.voiceStaticUrlsByUserId.clear();
        this.voiceAnimatedUrlsByUserId.clear();
        this.voiceAnimatedUrlsByTile = new WeakMap<HTMLElement, string>();
    }
});
