/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * SAFETY NOTICE / AVIS DE SÉCURITÉ:
 * This plugin is 100% CLIENT-SIDE ONLY and UNDETECTABLE by Discord.
 * Ce plugin est 100% CÔTÉ CLIENT UNIQUEMENT et INDÉTECTABLE par Discord.
 */

import * as DataStore from "@api/DataStore";
import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { findComponentByCodeLazy } from "@webpack";
import { FluxDispatcher, GuildMemberStore, GuildRoleStore, GuildStore } from "@webpack/common";

const RoleIcon = findComponentByCodeLazy("#{intl::ROLE_ICON_ALT_TEXT}");

let originalGetGuild: any;
let originalGetGuilds: any;

const BOOST_FEATURES = new Set(["ROLE_ICONS", "BANNER", "ANIMATED_BANNER", "ANIMATED_ICON", "INVITE_SPLASH", "VANITY_URL"]);
const PREMIUM_FEATURES = ["ENHANCED_ROLE_COLORS", "ANIMATED_ICON", "BANNER", "ANIMATED_BANNER", "ROLE_ICONS", "VANITY_URL", "AUDIO_BITRATE_384_KBPS"];

// Clés DataStore
const ROLE_COLORS_CACHE_KEY = "fakeServerBoost_roleColorsCache";
const GUILD_ASSETS_CACHE_KEY = "fakeServerBoost_guildAssetsCache";

// Cache en mémoire : { [guildId]: { [roleId]: { colorStrings, colors, displayNameStyles } } }
export type RoleColorData = {
    colorStrings: {
        primaryColor: string | undefined;
        secondaryColor: string | undefined;
        tertiaryColor: string | undefined;
    } | null;
    colors: {
        primary_color: number | undefined;
        secondary_color: number | undefined;
        tertiary_color: number | undefined;
    } | null;
    displayNameStyles: { effectId: number; colors: number[]; } | null;
};
type RoleColorsCache = Record<string, Record<string, RoleColorData>>;

// Cache des assets visuels du guild (bannière, splash, icon animée, etc.)
type GuildAssetsData = {
    banner: string | undefined;
    splash: string | undefined;
    icon: string | undefined;
    homeHeader: string | undefined;
};
type GuildAssetsCache = Record<string, GuildAssetsData>;

let roleColorsCache: RoleColorsCache = {};
let guildAssetsCache: GuildAssetsCache = {};
let cacheDirty = false;
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

// Registre de couleurs hardcodées enregistrées par d'autres plugins
// { [roleId]: RoleColorData }
const hardcodedRoleColors: Record<string, RoleColorData> = {};

// Index secondaire : colorString (ex: "#de5313") → RoleColorData
// Permet de retrouver les données même quand colorRoleId est absent
const colorStringIndex: Record<string, RoleColorData> = {};

// ── API d'effets custom ────────────────────────────────────────────────────────

/**
 * Décrit un effet visuel custom (animations, glow spécifique à un rôle…).
 * Enregistré par un autre plugin via registerCustomEffect().
 */
export type CustomEffect = {
    /** Identifiant unique de l'effet (ex: "birthday", "netricsa"). */
    id: string;
    /**
     * Bloc CSS à injecter dans un <style> dédié.
     * Peut contenir des @keyframes, des sélecteurs data-attributs, etc.
     */
    styleCSS: string;
    /**
     * Fonction appelée à chaque passe DOM (dans applyGradientToNames).
     * Elle doit lire le DOM, poser des data-attributs sur les éléments pertinents
     * et se débrouiller pour ne pas re-traiter ce qui l'est déjà.
     */
    applyFn: () => void;
    /**
     * Fonction de nettoyage : retire tous les data-attributs et modifications DOM
     * posés par applyFn. Appelée lors du reset général ET lors du unregister.
     */
    cleanupFn: () => void;
    /**
     * (Optionnel) Couleur primaire RGB (format "rgb(r, g, b)") de l'effet.
     * Si fournie, applyFn ne sera invoquée que si au moins un élément [data-fsb-gradient]
     * portant cette couleur est présent dans le DOM (optimisation).
     */
    primaryRGB?: string;
};

// Map id → CustomEffect
const registeredEffects: Map<string, CustomEffect> = new Map();
// Map id → <style> injecté
const effectStyles: Map<string, HTMLStyleElement> = new Map();

/**
 * Enregistre un effet visuel custom.
 * Injecte immédiatement son CSS et déclenche un refresh DOM.
 */
export function registerCustomEffect(effect: CustomEffect): void {
    registeredEffects.set(effect.id, effect);

    if (effect.styleCSS) {
        let styleEl = effectStyles.get(effect.id);
        if (!styleEl || !styleEl.isConnected) {
            styleEl = document.createElement("style");
            styleEl.id = `fsb-effect-${effect.id}`;
        }
        styleEl.textContent = effect.styleCSS;
        document.head.appendChild(styleEl);
        effectStyles.set(effect.id, styleEl);
    }
}

/**
 * Désenregistre un effet visuel custom.
 * Retire son CSS injecté et appelle cleanupFn pour nettoyer le DOM.
 */
export function unregisterCustomEffect(id: string): void {
    const effect = registeredEffects.get(id);
    if (!effect) return;
    effect.cleanupFn();
    effectStyles.get(id)?.remove();
    effectStyles.delete(id);
    registeredEffects.delete(id);
}

function rebuildColorStringIndex() {
    for (const k in colorStringIndex) delete colorStringIndex[k];
    for (const data of Object.values(hardcodedRoleColors)) {
        if (data.colorStrings?.primaryColor && data.colorStrings.secondaryColor) {
            colorStringIndex[data.colorStrings.primaryColor.toLowerCase()] = data;
        }
    }
    for (const guildCache of Object.values(roleColorsCache)) {
        for (const data of Object.values(guildCache)) {
            if (data.colorStrings?.primaryColor && data.colorStrings.secondaryColor) {
                colorStringIndex[data.colorStrings.primaryColor.toLowerCase()] = data;
            }
        }
    }
}

/**
 * Enregistre des couleurs hardcodées pour un ensemble de rôles.
 * Appelé par d'autres plugins (ex: botRoleColor) qui connaissent les couleurs statiquement.
 */
export function registerHardcodedRoleColors(colors: Record<string, RoleColorData>): void {
    Object.assign(hardcodedRoleColors, colors);
    rebuildColorStringIndex();
    rebuildRgbIndex();
    try { (GuildMemberStore as any).emitChange(); } catch { /* ignore */ }
}

/**
 * Supprime les couleurs hardcodées enregistrées par un plugin.
 */
export function unregisterHardcodedRoleColors(roleIds: string[]): void {
    for (const id of roleIds) delete hardcodedRoleColors[id];
    rebuildColorStringIndex();
    rebuildRgbIndex();
    try { (GuildMemberStore as any).emitChange(); } catch { /* ignore */ }
}

// ── DOM post-processing : applique les dégradés directement sur les nameContainer ──

type GradientInfo = { primary: string; secondary: string; tertiary: string; };
// Index rgb(r, g, b) → GradientInfo  (construit à partir de colorStringIndex)
const rgbToGradient: Map<string, GradientInfo> = new Map();

function hexToRgbString(hex: string): string | null {
    const m = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return null;
    return `rgb(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)})`;
}

function rebuildRgbIndex() {
    rgbToGradient.clear();
    for (const data of Object.values(colorStringIndex)) {
        const p = data.colorStrings?.primaryColor;
        const s = data.colorStrings?.secondaryColor;
        if (!p || !s) continue;
        const key = hexToRgbString(p);
        if (key) rgbToGradient.set(key, { primary: p, secondary: s, tertiary: data.colorStrings?.tertiaryColor ?? p });
    }
}

let gradientStyleEl: HTMLStyleElement | null = null;
let domObserver: MutationObserver | null = null;

// Classes CSS Discord pour le gradient — trouvées dynamiquement au premier usage
// (utilisées uniquement pour retrait propre au reset, pas pour injection)
let gradientClass: string | null = null;
let usernameGradientClass: string | null = null;

/** Tente de trouver les classes CSS Discord depuis un élément existant qui a déjà un vrai gradient */
function discoverGradientClasses() {
    if (gradientClass) return;
    const existing = document.querySelector<HTMLElement>('span[class*="nameContainer"] span[class*="usernameGradient"]');
    if (!existing) return;
    for (const cls of Array.from(existing.classList)) {
        if (cls.includes("twoColorGradient") || cls.includes("threeColorGradient")) gradientClass = cls;
        if (cls.includes("usernameGradient")) usernameGradientClass = cls;
    }
}

function ensureGradientStyle() {
    if (gradientStyleEl?.isConnected) return;
    gradientStyleEl = document.createElement("style");
    gradientStyleEl.id = "fakeServerBoost-gradient-names";
    gradientStyleEl.textContent = `
        /* ── Gradient : nameContainer ── */
        span[data-fsb-gradient] span[class*="name__"] {
            background-image: linear-gradient(to right,
                var(--custom-gradient-color-1),
                var(--custom-gradient-color-2),
                var(--custom-gradient-color-1)
            ) !important;
            -webkit-background-clip: text !important;
            background-clip: text !important;
            -webkit-text-fill-color: transparent !important;
            background-size: 200px auto !important;
            color: var(--custom-gradient-color-1) !important;
        }

        /* ── Gradient : headers de messages (span.username_) ── */
        span[class*="username_"][data-fsb-gradient]:not(:has(img)):not(:has(svg)) {
            background-image: linear-gradient(to right,
                var(--custom-gradient-color-1),
                var(--custom-gradient-color-2),
                var(--custom-gradient-color-1)
            ) !important;
            -webkit-background-clip: text !important;
            background-clip: text !important;
            -webkit-text-fill-color: transparent !important;
            background-size: 200px auto !important;
        }

        /* ── Icône de rôle voice chat ── */
        div[data-fsb-voice-checked] > img[data-fsb-role-icon] {
            vertical-align: middle !important;
            margin-left: 3px !important;
        }
        /* Animation + glow au hover de toute la plaque voice (voiceUser__) */
        div[data-fsb-voice-container] {
            transition: filter 0.15s ease;
        }
        div[class*="voiceUser"]:hover div[data-fsb-voice-container]:not([data-fsb-custom-anim]) div[data-fsb-gradient] {
            animation: fsb-gradient-scroll 1.5s linear infinite !important;
        }
        div[class*="voiceUser"]:hover div[data-fsb-voice-container]:not([data-fsb-custom-anim]) {
            filter: drop-shadow(0 0 2px var(--custom-gradient-color-1));
        }

        /* ── Animation hover ── */
        @keyframes fsb-gradient-scroll {
            0%   { background-position: 0px   50%; }
            100% { background-position: 200px 50%; }
        }

        /* nameContainer : <a> direct, plaque membre entière (member__), article message */
        a:hover span[data-fsb-gradient]:not([data-fsb-custom-anim]) span[class*="name__"],
        span[data-fsb-gradient]:not([data-fsb-custom-anim]):hover span[class*="name__"],
        div[class*="member__"]:hover span[data-fsb-gradient]:not([data-fsb-custom-anim]) span[class*="name__"],
        li[class*="messageListItem"]:hover span[data-fsb-gradient]:not([data-fsb-custom-anim]) span[class*="name__"],
        div[role="article"]:hover span[data-fsb-gradient]:not([data-fsb-custom-anim]) span[class*="name__"] {
            animation: fsb-gradient-scroll 1.5s linear infinite !important;
        }

        /* username_ header de message : animation au hover du message */
        div[role="article"]:hover span[class*="username_"][data-fsb-gradient]:not([data-fsb-custom-anim]),
        li[class*="messageListItem"]:hover span[class*="username_"][data-fsb-gradient]:not([data-fsb-custom-anim]) {
            animation: fsb-gradient-scroll 1.5s linear infinite !important;
        }

        /* ── Glow hover : nameContainer ── */
        span[data-fsb-gradient]:not([data-fsb-custom-anim]) span[class*="name__"] { transition: filter 0.15s ease; }
        a:hover span[data-fsb-gradient]:not([data-fsb-custom-anim]) span[class*="name__"],
        span[data-fsb-gradient]:not([data-fsb-custom-anim]):hover span[class*="name__"],
        div[class*="member__"]:hover span[data-fsb-gradient]:not([data-fsb-custom-anim]) span[class*="name__"],
        li[class*="messageListItem"]:hover span[data-fsb-gradient]:not([data-fsb-custom-anim]) span[class*="name__"],
        div[role="article"]:hover span[data-fsb-gradient]:not([data-fsb-custom-anim]) span[class*="name__"] {
            filter: drop-shadow(0 0 2px var(--custom-gradient-color-1)) !important;
        }

        /* ── Glow header de message : sur headerText pour inclure l'icône de rôle,
           mais annulé sur botTagCozy_ pour exclure le badge APP ── */
        span[class*="headerText"][data-fsb-header-vars] { transition: filter 0.15s ease; overflow: visible !important; }
        div[role="article"]:hover span[class*="headerText"][data-fsb-header-vars]:not([data-fsb-custom-anim]),
        li[class*="messageListItem"]:hover span[class*="headerText"][data-fsb-header-vars]:not([data-fsb-custom-anim]) {
            filter: drop-shadow(0 0 3px var(--custom-gradient-color-1));
        }
        /* Quand on hover sur le username_ directement, ne pas doubler le glow avec celui du headerText */
        div[role="article"]:hover span[class*="username_"][data-fsb-gradient]:not([data-fsb-custom-anim]),
        li[class*="messageListItem"]:hover span[class*="username_"][data-fsb-gradient]:not([data-fsb-custom-anim]) {
            filter: none !important;
        }
        /* Annuler le filter sur le badge APP */
        div[role="article"]:hover span[class*="headerText"][data-fsb-header-vars] span[class*="botTag"],
        li[class*="messageListItem"]:hover span[class*="headerText"][data-fsb-header-vars] span[class*="botTag"] {
            filter: none !important;
        }
        /* Ouvrir overflow sur les ancêtres du headerText pour ne pas clipper le glow */
        div[role="article"] h3,
        div[role="article"] h3 > span,
        li[class*="messageListItem"] h3,
        li[class*="messageListItem"] h3 > span {
            overflow: visible !important;
        }

        /* ── Gradient générique : voice, catégories membres, reactors, poll… ── */
        :is(span, strong, div)[data-fsb-gradient]:not(span[class*="username_"]):not([class*="nameContainer"]):not(:has(span[class*="name__"])):not(:has(img)):not(:has(svg)) {
            background-image: linear-gradient(to right,
                var(--custom-gradient-color-1),
                var(--custom-gradient-color-2),
                var(--custom-gradient-color-1)
            ) !important;
            -webkit-background-clip: text !important;
            background-clip: text !important;
            -webkit-text-fill-color: transparent !important;
            background-size: 200px auto !important;
            transition: filter 0.15s ease;
        }
        :is(span, strong, div)[data-fsb-gradient]:not([data-fsb-custom-anim]):not(span[class*="username_"]):not([class*="nameContainer"]):not(:has(span[class*="name__"])):not(:has(img)):not(:has(svg)):not([data-fsb-voice-checked] *):not([data-fsb-voice-checked]):not([data-fsb-cat-checked] *):hover,
        div[class*="member__"]:hover :is(span, strong, div)[data-fsb-gradient]:not([data-fsb-custom-anim]):not(span[class*="username_"]):not([class*="nameContainer"]):not(:has(img)):not(:has(svg)):not([data-fsb-voice-checked] *):not([data-fsb-voice-checked]):not([data-fsb-cat-checked] *) {
            animation: fsb-gradient-scroll 1.5s linear infinite !important;
            filter: drop-shadow(0 0 2px var(--custom-gradient-color-1));
        }

        /* ── Catégories de la liste des membres ── */
        div[class*="members_"]:hover div[data-fsb-cat-checked]:not([data-fsb-custom-anim]) span[data-fsb-gradient] {
            animation: fsb-gradient-scroll 1.5s linear infinite !important;
        }
        div[class*="members_"]:hover div[data-fsb-cat-checked]:not([data-fsb-custom-anim]) {
            filter: drop-shadow(0 0 2px var(--custom-gradient-color-1));
        }

        /* ── Voice générique (non-custom) ── */
        div[class*="voiceUser"]:hover div[data-fsb-voice-container]:not([data-fsb-custom-anim]) div[data-fsb-gradient]:not([data-fsb-mention]) {
            animation: fsb-gradient-scroll 1.5s linear infinite !important;
        }
        /* Voice avec icône de rôle (data-fsb-mention) : animer le span texte uniquement */
        div[class*="voiceUser"]:hover div[data-fsb-voice-container]:not([data-fsb-custom-anim]) div[data-fsb-mention] span[data-fsb-mention-text] {
            animation: fsb-gradient-scroll 1.5s linear infinite !important;
        }
        div[class*="voiceUser"]:hover div[data-fsb-voice-container]:not([data-fsb-custom-anim]) {
            filter: drop-shadow(0 0 2px var(--custom-gradient-color-1));
        }

        /* ── Gradient mentions (texte wrappé dans span[data-fsb-mention-text]) ── */
        span[data-fsb-mention-text] {
            background-image: linear-gradient(to right,
                var(--custom-gradient-color-1),
                var(--custom-gradient-color-2),
                var(--custom-gradient-color-1)
            ) !important;
            -webkit-background-clip: text !important;
            background-clip: text !important;
            -webkit-text-fill-color: transparent !important;
            background-size: 200px auto !important;
        }
        /* Hover : animation du texte */
        span[data-fsb-mention]:hover span[data-fsb-mention-text] {
            animation: fsb-gradient-scroll 1.5s linear infinite !important;
        }
        /* Glow sur le span racine entier (inclut l'icône) */
        span[data-fsb-mention] {
            transition: filter 0.15s ease;
        }
        span[data-fsb-mention]:hover {
            filter: drop-shadow(0 0 2px var(--custom-gradient-color-1));
        }

        /* ══════════════════════════════════════════════
           GRADIENT IDLE pour les rôles à animation custom
           (exclus des règles génériques via :not([data-fsb-custom-anim]))
           On réapplique le gradient statique avec var() pour qu'il soit toujours visible.
        ══════════════════════════════════════════════ */

        /* nameContainer → name__ */
        span[data-fsb-custom-anim][data-fsb-gradient] span[class*="name__"] {
            background-image: linear-gradient(to right,
                var(--custom-gradient-color-1),
                var(--custom-gradient-color-2),
                var(--custom-gradient-color-1)
            ) !important;
            -webkit-background-clip: text !important;
            background-clip: text !important;
            -webkit-text-fill-color: transparent !important;
            background-size: 200px auto !important;
        }

        /* username_ header message */
        span[class*="username_"][data-fsb-custom-anim][data-fsb-gradient]:not(:has([data-fsb-celestial-wrap])) {
            background-image: linear-gradient(to right,
                var(--custom-gradient-color-1),
                var(--custom-gradient-color-2),
                var(--custom-gradient-color-1)
            ) !important;
            -webkit-background-clip: text !important;
            background-clip: text !important;
            -webkit-text-fill-color: transparent !important;
            background-size: 200px auto !important;
        }

        /* voice / générique (div, span sans name__) */
        :is(span, strong, div)[data-fsb-custom-anim][data-fsb-gradient]:not(span[class*="username_"]):not([class*="nameContainer"]):not(:has(span[class*="name__"])):not(:has(img)):not(:has(svg)) {
            background-image: linear-gradient(to right,
                var(--custom-gradient-color-1),
                var(--custom-gradient-color-2),
                var(--custom-gradient-color-1)
            ) !important;
            -webkit-background-clip: text !important;
            background-clip: text !important;
            -webkit-text-fill-color: transparent !important;
            background-size: 200px auto !important;
        }

        /* mention-text dans voice pour les rôles custom-anim */
        [data-fsb-custom-anim] span[data-fsb-mention-text] {
            background-image: linear-gradient(to right,
                var(--custom-gradient-color-1),
                var(--custom-gradient-color-2),
                var(--custom-gradient-color-1)
            ) !important;
            -webkit-background-clip: text !important;
            background-clip: text !important;
            -webkit-text-fill-color: transparent !important;
            background-size: 200px auto !important;
        }

        /* Les effets CSS spécifiques aux rôles custom (Birthday, Netricsa, Klodovik, Golden, Silver, Bronze, Celestial)
           sont injectés par botRoleColor via registerCustomEffect(). */
    `;
    document.head.appendChild(gradientStyleEl);
}

export function normalizeColor(color: string): string {
    // Convertit #rrggbb en rgb(r, g, b) pour uniformiser les lookups
    if (color.startsWith("#")) {
        const m = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color);
        if (m) return `rgb(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)})`;
    }
    return color;
}

function applyGradientToContainer(nameContainer: HTMLElement, g: GradientInfo) {
    nameContainer.style.removeProperty("color");
    nameContainer.style.setProperty("--custom-gradient-color-1", g.primary);
    nameContainer.style.setProperty("--custom-gradient-color-2", g.secondary);
    nameContainer.style.setProperty("--custom-gradient-color-3", g.tertiary);
    nameContainer.dataset.fsbGradient = "1";

    const nameSpan = nameContainer.querySelector<HTMLElement>('span[class*="name__"]');
    if (nameSpan && !nameSpan.dataset.fsbGradientName) {
        nameSpan.dataset.fsbGradientName = "1";
        discoverGradientClasses();
        if (gradientClass) nameSpan.classList.add(gradientClass);
        if (usernameGradientClass) nameSpan.classList.add(usernameGradientClass);
    }
}

/** Applique le gradient directement sur un span "username" de header de message (span.username_c19a55) */
function applyGradientToUsernameSpan(el: HTMLElement, g: GradientInfo) {
    // Ne pas affecter les spans qui contiennent des icônes (img/svg)
    if (el.querySelector("img, svg")) return;
    el.style.setProperty("--custom-gradient-color-1", g.primary);
    el.style.setProperty("--custom-gradient-color-2", g.secondary);
    el.style.setProperty("--custom-gradient-color-3", g.tertiary);
    el.dataset.fsbGradient = "1";

    const headerText = el.closest<HTMLElement>('span[class*="headerText"]');
    if (headerText && !headerText.dataset.fsbHeaderVars) {
        headerText.style.setProperty("--custom-gradient-color-1", g.primary);
        headerText.dataset.fsbHeaderVars = "1";
    }
}

/** Marque data-fsb-gradient sur un span username_ qui a déjà ses CSS vars posées nativement par Discord */
function markUsernameGradientFromVars(el: HTMLElement) {
    if (el.querySelector("img, svg")) return;
    if (el.dataset.fsbGradient) return;
    const p = el.style.getPropertyValue("--custom-gradient-color-1");
    const s = el.style.getPropertyValue("--custom-gradient-color-2");
    if (!p || !s) return;
    el.dataset.fsbGradient = "1";
    const headerText = el.closest<HTMLElement>('span[class*="headerText"]');
    if (headerText && !headerText.dataset.fsbHeaderVars) {
        headerText.style.setProperty("--custom-gradient-color-1", p);
        headerText.dataset.fsbHeaderVars = "1";
    }
}

/** Applique le gradient sur n'importe quel élément générique coloré (mentions, voice, reactors...) */
/** Nettoie un élément [aria-hidden] de catégorie pour forcer une ré-évaluation complète */
function resetCatEl(el: HTMLElement) {
    el.querySelectorAll("[data-fsb-role-icon]").forEach(img => img.remove());
    el.querySelectorAll("[data-fsb-bday-star]").forEach(s => s.remove());
    el.style.removeProperty("--custom-gradient-color-1");
    delete el.dataset.fsbCatChecked;
    delete el.dataset.fsbCustomAnim;
    // Nettoyer aussi les spans enfants qui ont des CSS vars et data-fsb-gradient
    // (nœuds recyclés : le span garde les couleurs de l'ancienne catégorie)
    el.querySelectorAll<HTMLElement>("[data-fsb-gradient]").forEach(span => {
        span.style.removeProperty("--custom-gradient-color-1");
        span.style.removeProperty("--custom-gradient-color-2");
        span.style.removeProperty("--custom-gradient-color-3");
        delete span.dataset.fsbGradient;
        delete span.dataset.fsbCustomAnim;
        // Laisser les effets custom se nettoyer eux-mêmes via leur cleanupFn
    });
}

function applyGradientToGenericEl(el: HTMLElement, g: GradientInfo) {
    el.style.setProperty("--custom-gradient-color-1", g.primary);
    el.style.setProperty("--custom-gradient-color-2", g.secondary);
    el.style.setProperty("--custom-gradient-color-3", g.tertiary);
    el.dataset.fsbGradient = "1";

    // Si cet élément est dans un div[aria-hidden] de catégorie de membres,
    // propager la var au parent pour que son filter:drop-shadow fonctionne
    const ariaParent = el.closest<HTMLElement>('[aria-hidden="true"][data-fsb-cat-checked]');
    if (ariaParent) {
        ariaParent.style.setProperty("--custom-gradient-color-1", g.primary);
    }
}

export function applyRoleIcons() {
    // 0. Icônes de rôle dans les catégories de la liste des membres
    document.querySelectorAll<HTMLElement>(
        '[class*="membersGroup"] [aria-hidden="true"]'
    ).forEach(ariaHidden => {
        const currentRoleId = getCategoryRoleId(ariaHidden);
        if (currentRoleId === null) return;

        const storedRoleId = ariaHidden.dataset.fsbCatChecked;
        const existingIcon = ariaHidden.querySelector<HTMLImageElement>("[data-fsb-role-icon]");
        const existingIconRoleId = existingIcon?.dataset.fsbRoleIconId ?? null;

        const roleChanged = storedRoleId !== undefined && storedRoleId !== currentRoleId;
        const iconMismatch = existingIcon !== null && existingIconRoleId !== currentRoleId;

        // Nettoyage complet si le rôle a changé (recyclage de nœud virtualisé)
        if (roleChanged || iconMismatch) {
            resetCatEl(ariaHidden);
        }

        // Vérifier si le rôle actuel a encore une couleur dans notre registre.
        // Si le gradient span n'a plus de CSS var → le rôle n'est plus coloré → tout nettoyer.
        const gradSpan = ariaHidden.querySelector<HTMLElement>("[data-fsb-gradient]");
        const currentC1 = gradSpan?.style.getPropertyValue("--custom-gradient-color-1") ?? "";

        // Vérifier si une icône native Discord existe DANS notre ariaHidden (doublon réel)
        const nativeIconInAriaHidden = ariaHidden.querySelectorAll('img[class*="roleIcon"]:not([data-fsb-role-icon])').length > 0;

        if (nativeIconInAriaHidden) {
            ariaHidden.querySelectorAll("[data-fsb-role-icon]").forEach(img => img.remove());
            ariaHidden.dataset.fsbCatChecked = currentRoleId;
        } else if (!ariaHidden.dataset.fsbCatChecked) {
            ariaHidden.dataset.fsbCatChecked = currentRoleId;
            if (!ariaHidden.querySelector("[data-fsb-role-icon]")) {
                injectCategoryRoleIcon(ariaHidden, currentRoleId);
            }
        }

        // Propager --custom-gradient-color-1 depuis le span enfant vers ce div
        if (gradSpan && currentC1) ariaHidden.style.setProperty("--custom-gradient-color-1", currentC1);
    });

    // 0b. Icônes de rôle dans le voice chat — nouveaux containers uniquement
    document.querySelectorAll<HTMLElement>(
        'div[class*="usernameContainer_"]:not([data-fsb-voice-checked])'
    ).forEach(container => {
        container.dataset.fsbVoiceChecked = "1";
        if (container.querySelector("[data-fsb-role-icon]")) return;
        injectVoiceRoleIcon(container);
        const gradDiv = container.querySelector<HTMLElement>("[data-fsb-gradient]");
        if (gradDiv) {
            const c1 = gradDiv.style.getPropertyValue("--custom-gradient-color-1");
            if (c1) {
                container.style.setProperty("--custom-gradient-color-1", c1);
                const parentEl = container.parentElement;
                if (parentEl) {
                    parentEl.style.setProperty("--custom-gradient-color-1", c1);
                    parentEl.dataset.fsbVoiceContainer = "1";
                }
            }
        }
    });

}

/** Déplace le span contenant l'icône de rôle avant le span du clan tag dans les headers de messages */
function reorderRoleIconBeforeClanTag() {
    document.querySelectorAll<HTMLElement>('span[class*="headerText"]:not([data-fsb-role-reordered])').forEach(headerText => {
        const clanTagSpan = Array.from(headerText.children).find(child =>
            child.querySelector('[class*="chipletContainerInner"]')
        ) as HTMLElement | undefined;
        if (!clanTagSpan) {
            // Pas de clan tag → rien à réordonner, marquer pour ne pas rescanner
            headerText.dataset.fsbRoleReordered = "1";
            return;
        }

        const roleIconSpan = Array.from(headerText.children).find(child =>
            child !== clanTagSpan && child.querySelector('img[class*="roleIcon"]')
        ) as HTMLElement | undefined;
        if (!roleIconSpan) {
            // Clan tag présent mais pas encore d'icône de rôle → ne pas marquer, réessayer plus tard
            return;
        }

        const children = Array.from(headerText.children);
        const clanIdx = children.indexOf(clanTagSpan);
        const roleIdx = children.indexOf(roleIconSpan);
        // Réordonner si nécessaire, puis marquer dans tous les cas
        if (roleIdx > clanIdx) headerText.insertBefore(roleIconSpan, clanTagSpan);
        headerText.dataset.fsbRoleReordered = "1";
    });
}


export function applyGradientToNames() {
    // Toujours injecter les icônes, indépendamment des gradients
    applyRoleIcons();
    reorderRoleIconBeforeClanTag();

    if (rgbToGradient.size === 0) return;
    ensureGradientStyle();

    // 1. nameContainer — fusionné : color inline OU CSS vars déjà posées
    document.querySelectorAll<HTMLElement>(
        'span[class*="nameContainer"]:not([data-fsb-gradient])'
    ).forEach(el => {
        // Cas A : CSS vars déjà présentes (injectées par Discord natif ou un autre patch)
        const p = el.style.getPropertyValue("--custom-gradient-color-1");
        const s = el.style.getPropertyValue("--custom-gradient-color-2");
        if (p && s) {
            el.dataset.fsbGradient = "1";
            const nameSpan = el.querySelector<HTMLElement>('span[class*="name__"]');
            if (nameSpan && !nameSpan.dataset.fsbGradientName) {
                nameSpan.dataset.fsbGradientName = "1";
                discoverGradientClasses();
                if (gradientClass) nameSpan.classList.add(gradientClass);
                if (usernameGradientClass) nameSpan.classList.add(usernameGradientClass);
            }
            return;
        }
        // Cas B : color inline
        const raw = el.style.color;
        if (!raw) return;
        const g = rgbToGradient.get(normalizeColor(raw));
        if (g) applyGradientToContainer(el, g);
    });

    // 2. span.username_ dans les headers de messages
    document.querySelectorAll<HTMLElement>(
        'span[class*="username_"]:not([data-fsb-gradient])'
    ).forEach(el => {
        if (el.closest("[data-fsb-gradient]")) return;
        // Cas A : CSS vars déjà posées nativement par Discord (sans style.color)
        markUsernameGradientFromVars(el);
        if (el.dataset.fsbGradient) return;
        // Cas B : color inline
        const raw = el.dataset.originalColor || el.style.color;
        if (!raw) return;
        const g = rgbToGradient.get(normalizeColor(raw));
        if (g) applyGradientToUsernameSpan(el, g);
    });

    // 3. <a> anchor : chercher le nameContainer enfant
    document.querySelectorAll<HTMLAnchorElement>(
        'a[class*="anchor"]:not([data-fsb-anchor-checked])'
    ).forEach(a => {
        a.dataset.fsbAnchorChecked = "1";
        const raw = a.style.color;
        if (!raw) return;
        const g = rgbToGradient.get(normalizeColor(raw));
        if (!g) return;
        const container = a.querySelector<HTMLElement>('span[class*="nameContainer"]');
        if (container && !container.dataset.fsbGradient) applyGradientToContainer(container, g);
    });

    // 4. Éléments génériques colorés (mentions, voice, reactors, poll…)
    // Scope restreint aux conteneurs connus pour éviter un scan global du DOM
    // Utilisation de :scope pour limiter la profondeur
    const GENERIC_SCOPES = [
        '[class*="members_"] span:not([data-fsb-gradient])',
        '[class*="voiceUser"] span:not([data-fsb-gradient])',
        '[class*="voiceUser"] div:not([data-fsb-gradient])',
        '[class*="messageContent"] span:not([data-fsb-gradient])',
        '[class*="messageContent"] strong:not([data-fsb-gradient])',
        '[class*="reactors"] span:not([data-fsb-gradient])',
        '[class*="poll"] span:not([data-fsb-gradient])',
    ] as const;

    const coloredScopes = document.querySelectorAll<HTMLElement>(GENERIC_SCOPES.join(", "));
    coloredScopes.forEach(el => {
        if (el.closest("[data-fsb-gradient]")) return;
        if (
            el.matches('span[class*="nameContainer"]') ||
            el.matches('span[class*="username_"]') ||
            el.matches("a")
        ) return;
        if (!el.matches("span") && !el.matches("strong") && !el.matches("div")) return;
        const raw = el.style.color;
        if (!raw) return;
        const g = rgbToGradient.get(normalizeColor(raw));
        if (!g) return;

        if (el.querySelector("img")) {
            applyGradientToMention(el, g);
            return;
        }
        if (!el.querySelector("img, svg, span")) {
            applyGradientToGenericEl(el, g);
        }
    });

    // 5. Propager la CSS var au div.container parent des voice chat
    document.querySelectorAll<HTMLElement>("[data-fsb-voice-checked]").forEach(usernameContainer => {
        const gradDiv = usernameContainer.querySelector<HTMLElement>("[data-fsb-gradient]");
        if (!gradDiv) return;
        const c1 = gradDiv.style.getPropertyValue("--custom-gradient-color-1");
        if (!c1) return;
        usernameContainer.style.setProperty("--custom-gradient-color-1", c1);
        const parentEl = usernameContainer.parentElement;
        if (parentEl && !parentEl.dataset.fsbVoiceContainer) {
            parentEl.style.setProperty("--custom-gradient-color-1", c1);
            parentEl.dataset.fsbVoiceContainer = "1";
        }
    });

    // 6. Effets spéciaux enregistrés par les plugins dépendants (Birthday, Netricsa, Klodovik…)
    for (const effect of registeredEffects.values()) {
        // Optimisation : si l'effet déclare une couleur primaire et qu'aucun élément
        // gradienté avec cette couleur n'est présent dans le DOM, on saute l'appel.
        if (effect.primaryRGB && !rgbToGradient.has(effect.primaryRGB)) continue;
        effect.applyFn();
    }
}

// Cache des guildIds pour éviter d'appeler GuildStore.getGuilds() à chaque lookup
let cachedGuildIds: string[] = [];
let guildIdsCacheTime = 0;
const GUILD_IDS_TTL = 5000; // 5 secondes

function getGuildIds(): string[] {
    const now = Date.now();
    if (now - guildIdsCacheTime < GUILD_IDS_TTL) return cachedGuildIds;
    try {
        cachedGuildIds = Object.keys(GuildStore.getGuilds());
        guildIdsCacheTime = now;
    } catch { /* GuildStore pas encore prêt */ }
    return cachedGuildIds;
}

/** Extrait le texte visible d'un nœud [aria-hidden] de catégorie (sans compter les icônes injectées) */
function getCategoryVisibleText(ariaHiddenContainer: HTMLElement): string {
    // Cloner pour ne pas muter, retirer nos icônes injectées, récupérer le texte
    const clone = ariaHiddenContainer.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("[data-fsb-role-icon]").forEach(el => el.remove());
    return clone.textContent?.trim().toLowerCase() ?? "";
}

/** Trouve le roleId d'une catégorie de membres via data-list-item-id ou React fiber,
 *  puis valide que le nom du rôle correspond au texte visible (détecte le recyclage de nœud). */
function getCategoryRoleId(ariaHiddenContainer: HTMLElement): string | null {
    const membersGroupEl = ariaHiddenContainer.closest('[class*="membersGroup"]') as HTMLElement | null;
    if (!membersGroupEl) return null;

    let candidateId: string | null = null;

    // Stratégie 1 : data-list-item-id (ex: "members-list-group-123456789")
    const listItemId = membersGroupEl.dataset.listItemId ?? membersGroupEl.getAttribute("data-list-item-id");
    if (listItemId) {
        const m = /(\d{10,})/.exec(listItemId);
        if (m) candidateId = m[1];
    }

    // Stratégie 2 : React fiber — remonter uniquement via .return
    if (!candidateId) {
        const fiberKey = Object.keys(membersGroupEl).find(k => k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance"));
        if (fiberKey) {
            let fiber = (membersGroupEl as any)[fiberKey];
            for (let i = 0; i < 40 && fiber; i++) {
                const props = fiber.memoizedProps ?? fiber.pendingProps;
                if (props) {
                    const id = props.id ?? props.roleId;
                    if (id && /^\d{10,}$/.test(String(id))) { candidateId = String(id); break; }
                }
                fiber = fiber.return;
            }
        }
    }

    if (!candidateId) return null;

    // Validation croisée : le nom du rôle doit correspondre au texte visible
    // Si ce n'est pas le cas, le fiber n'est pas encore mis à jour (nœud recyclé)
    // → retourner null pour forcer un retry plus tard
    try {
        const visibleText = getCategoryVisibleText(ariaHiddenContainer);
        if (visibleText) {
            let roleName: string | null = null;
            for (const guildId of getGuildIds()) {
                const r = GuildRoleStore.getRole(guildId, candidateId);
                if (r?.name) { roleName = r.name.toLowerCase(); break; }
            }
            // Si on a trouvé le nom du rôle et qu'il ne correspond pas au texte visible,
            // le fiber pointe vers le mauvais rôle → on ne peut pas faire confiance
            if (roleName && !visibleText.startsWith(roleName) && !visibleText.includes(roleName)) {
                return null;
            }
        }
    } catch { /* ignore — en cas d'erreur on fait confiance au candidateId */ }

    return candidateId;
}

/** Injecte l'icône de rôle dans un div[aria-hidden] de catégorie de membres.
 *  roleId peut être passé directement pour éviter une double résolution. */
function injectCategoryRoleIcon(ariaHiddenContainer: HTMLElement, roleId: string | null = null) {
    const resolvedRoleId = roleId ?? getCategoryRoleId(ariaHiddenContainer);
    if (!resolvedRoleId) return;

    let role: any = null;
    try {
        for (const guildId of getGuildIds()) {
            const r = GuildRoleStore.getRole(guildId, resolvedRoleId);
            if (r) { role = r; break; }
        }
    } catch { /* ignore */ }

    if (!role?.icon) return;

    const cdnHost = (window as any).GLOBAL_ENV?.CDN_HOST ?? "cdn.discordapp.com";
    const iconUrl = `https://${cdnHost}/role-icons/${resolvedRoleId}/${role!.icon}.webp?size=20&quality=lossless`;

    const img = document.createElement("img");
    img.src = iconUrl;
    img.dataset.fsbRoleIcon = "1";
    img.dataset.fsbRoleIconId = resolvedRoleId;
    img.style.cssText = "width:16px;height:16px;vertical-align:middle;margin-right:3px;border-radius:2px;";

    const { firstChild } = ariaHiddenContainer;
    if (firstChild) {
        ariaHiddenContainer.insertBefore(img, firstChild);
    } else {
        ariaHiddenContainer.appendChild(img);
    }
}

/** Injecte l'icône de rôle après le nom dans un div.usernameContainer du voice chat */
function injectVoiceRoleIcon(usernameContainer: HTMLElement) {
    // Trouver userId + guildId via React fiber
    let userId: string | null = null;
    let guildId: string | null = null;

    const fiberKey = Object.keys(usernameContainer).find(k => k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance"));
    if (fiberKey) {
        let fiber = (usernameContainer as any)[fiberKey];
        for (let i = 0; i < 60 && fiber; i++) {
            const props = fiber.memoizedProps ?? fiber.pendingProps;
            if (props) {
                // userId : prop user.id ou userId
                if (!userId) {
                    const u = props.user?.id ?? props.userId ?? props.member?.userId;
                    if (u && /^\d{10,}$/.test(String(u))) userId = String(u);
                }
                // guildId : prop guildId
                if (!guildId) {
                    const g = props.guildId ?? props.guild?.id;
                    if (g && /^\d{10,}$/.test(String(g))) guildId = String(g);
                }
                if (userId && guildId) break;
            }
            fiber = fiber.return;
        }
    }

    if (!userId || !guildId) return;

    const member = GuildMemberStore.getMember(guildId, userId);
    if (!member?.colorRoleId) return;

    const role = GuildRoleStore.getRole(guildId, member.colorRoleId);
    if (!role?.icon) return;

    const cdnHost = (window as any).GLOBAL_ENV?.CDN_HOST ?? "cdn.discordapp.com";
    const iconUrl = `https://${cdnHost}/role-icons/${role.id}/${role.icon}.webp?size=20&quality=lossless`;

    const img = document.createElement("img");
    img.src = iconUrl;
    img.dataset.fsbRoleIcon = "1";
    img.style.cssText = "width:14px;height:14px;vertical-align:middle;border-radius:2px;margin-left:3px;";

    // Insérer à l'intérieur de div.usernameFont (après le texte du nom)
    // → collé au nom, pas poussé par le flex natif Discord
    const nameDiv = usernameContainer.querySelector<HTMLElement>('[class*="usernameFont"]');
    if (nameDiv) {
        nameDiv.appendChild(img);
        // Propager la CSS var
        const c1 = nameDiv.style.getPropertyValue("--custom-gradient-color-1");
        if (c1) {
            usernameContainer.style.setProperty("--custom-gradient-color-1", c1);
            const containerEl = usernameContainer.parentElement;
            if (containerEl) {
                containerEl.style.setProperty("--custom-gradient-color-1", c1);
                containerEl.dataset.fsbVoiceContainer = "1";
            }
        }
    } else {
        usernameContainer.appendChild(img);
    }
}

/** Wrappe récursivement tous les nœuds texte non vides dans un span gradienté,
 *  en sautant les branches img/svg et les wrappers déjà posés. */
function wrapTextNodes(node: Node, g: GradientInfo) {
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
    // Snapshot des childNodes pour éviter les mutations pendant l'itération
    for (const child of Array.from(el.childNodes)) {
        wrapTextNodes(child, g);
    }
}

/** Pour les mentions qui contiennent une img : wrapper le nœud texte dans un span gradienté */
function applyGradientToMention(el: HTMLElement, g: GradientInfo) {
    if (el.dataset.fsbMention) return; // déjà entièrement traité
    el.dataset.fsbMention = "1";
    el.dataset.fsbGradient = "1";
    el.style.setProperty("--custom-gradient-color-1", g.primary);
    el.style.setProperty("--custom-gradient-color-2", g.secondary);
    el.style.setProperty("--custom-gradient-color-3", g.tertiary);
    wrapTextNodes(el, g);
}

function resetGradients() {
    // Unwrapper les spans de mention avant de tout réinitialiser
    document.querySelectorAll<HTMLElement>("[data-fsb-mention-text]").forEach(wrapper => {
        const parent = wrapper.parentNode;
        if (!parent) return;
        while (wrapper.firstChild) parent.insertBefore(wrapper.firstChild, wrapper);
        wrapper.remove();
    });
    // Retirer les icônes de rôle injectées dans les catégories
    document.querySelectorAll<HTMLElement>("[data-fsb-role-icon]").forEach(img => img.remove());
    // Retirer les marqueurs de catégorie et voice
    document.querySelectorAll<HTMLElement>("[data-fsb-cat-checked]").forEach(el => delete (el as HTMLElement).dataset.fsbCatChecked);
    document.querySelectorAll<HTMLElement>("[data-fsb-voice-checked]").forEach(el => delete (el as HTMLElement).dataset.fsbVoiceChecked);
    document.querySelectorAll<HTMLElement>("[data-fsb-voice-container]").forEach(el => {
        delete el.dataset.fsbVoiceContainer;
        el.style.removeProperty("--custom-gradient-color-1");
    });
    document.querySelectorAll<HTMLElement>("[data-fsb-gradient]").forEach(el => {
        el.style.removeProperty("--custom-gradient-color-1");
        el.style.removeProperty("--custom-gradient-color-2");
        el.style.removeProperty("--custom-gradient-color-3");
        delete el.dataset.fsbGradient;
        delete el.dataset.fsbMention;
    });
    document.querySelectorAll<HTMLElement>("[data-fsb-header-vars]").forEach(el => {
        el.style.removeProperty("--custom-gradient-color-1");
        delete el.dataset.fsbHeaderVars;
    });
    document.querySelectorAll<HTMLElement>("[data-fsb-gradient-name]").forEach(el => {
        if (gradientClass) el.classList.remove(gradientClass);
        if (usernameGradientClass) el.classList.remove(usernameGradientClass);
        delete el.dataset.fsbGradientName;
    });
    document.querySelectorAll<HTMLElement>("[data-fsb-anchor-checked]").forEach(el => {
        delete el.dataset.fsbAnchorChecked;
    });
    document.querySelectorAll<HTMLElement>("[data-fsb-role-reordered]").forEach(el => {
        delete el.dataset.fsbRoleReordered;
    });
    gradientStyleEl?.remove();
    gradientStyleEl = null;
}

function startDomObserver() {
    if (domObserver) return;

    // Ensemble de nœuds à traiter accumulés entre mutations, vidé à chaque RAF
    const pendingRoots = new Set<HTMLElement>();
    let rafId: number | null = null;
    let fullScanScheduled = false;
    // Délai minimum entre deux full scans (ms) pour éviter la tempête lors du scroll de liste
    let lastFullScan = 0;
    const FULL_SCAN_THROTTLE = 200;

    function scheduleApply(root: HTMLElement | null) {
        if (root === null) {
            fullScanScheduled = true;
        } else {
            pendingRoots.add(root);
        }
        if (rafId !== null) return;
        rafId = requestAnimationFrame(() => {
            rafId = null;
            const doFullScan = fullScanScheduled;
            fullScanScheduled = false;
            const roots = Array.from(pendingRoots);
            pendingRoots.clear();

            if (doFullScan) {
                const now = Date.now();
                if (now - lastFullScan < FULL_SCAN_THROTTLE) {
                    // Trop tôt pour un nouveau full scan — reporter à la prochaine frame
                    fullScanScheduled = true;
                    rafId = requestAnimationFrame(() => {
                        rafId = null;
                        fullScanScheduled = false;
                        lastFullScan = Date.now();
                        document.querySelectorAll<HTMLElement>('[aria-hidden="true"][data-fsb-cat-checked]').forEach(resetCatEl);
                        applyGradientToNames();
                    });
                    return;
                }
                lastFullScan = now;
                document.querySelectorAll<HTMLElement>('[aria-hidden="true"][data-fsb-cat-checked]').forEach(resetCatEl);
                applyGradientToNames();
                return;
            }

            // Traitement ciblé : uniquement les zones mutées
            for (const root of roots) {
                // Catégories dans ce root
                root.querySelectorAll<HTMLElement>('[class*="membersGroup"] [aria-hidden="true"]').forEach(el => {
                    const stored = el.dataset.fsbCatChecked;
                    const current = getCategoryRoleId(el);
                    if (current === null) return;
                    if (stored !== current) resetCatEl(el);

                    el.querySelectorAll<HTMLElement>("span:not([data-fsb-gradient]), strong:not([data-fsb-gradient])").forEach(span => {
                        if (span.closest("[data-fsb-gradient]")) return;
                        if (span.querySelector("img, svg, span")) return;
                        const raw = span.style.color;
                        if (!raw) return;
                        const g = rgbToGradient.get(normalizeColor(raw));
                        if (g) applyGradientToGenericEl(span, g);
                    });

                    const gradSpan = el.querySelector<HTMLElement>("[data-fsb-gradient]");
                    if (gradSpan) {
                        const c1 = gradSpan.style.getPropertyValue("--custom-gradient-color-1");
                        if (c1) el.style.setProperty("--custom-gradient-color-1", c1);
                    }

                    if (!el.dataset.fsbCatChecked) {
                        el.dataset.fsbCatChecked = current;
                        if (!el.querySelector("[data-fsb-role-icon]")) injectCategoryRoleIcon(el, current);
                    }
                });

                // nameContainers dans ce root
                root.querySelectorAll<HTMLElement>('span[class*="nameContainer"]:not([data-fsb-gradient])').forEach(el => {
                    const raw = el.style.color;
                    if (!raw) return;
                    const g = rgbToGradient.get(normalizeColor(raw));
                    if (g) applyGradientToContainer(el, g);
                });

                // username_ headers dans ce root
                root.querySelectorAll<HTMLElement>('span[class*="username_"]:not([data-fsb-gradient])').forEach(el => {
                    if (el.closest("[data-fsb-gradient]")) return;
                    // Cas A : CSS vars déjà posées nativement par Discord
                    markUsernameGradientFromVars(el);
                    if (el.dataset.fsbGradient) return;
                    // Cas B : color inline
                    const raw = el.style.color;
                    if (!raw) return;
                    const g = rgbToGradient.get(normalizeColor(raw));
                    if (g) applyGradientToUsernameSpan(el, g);
                });

                // Réordonner l'icône de rôle avant le clan tag dans les nouveaux headers
                root.querySelectorAll<HTMLElement>('span[class*="headerText"]:not([data-fsb-role-reordered])').forEach(headerText => {
                    const clanTagSpan = Array.from(headerText.children).find(child =>
                        child.querySelector('[class*="chipletContainerInner"]')
                    ) as HTMLElement | undefined;
                    if (!clanTagSpan) { headerText.dataset.fsbRoleReordered = "1"; return; }
                    const roleIconSpan = Array.from(headerText.children).find(child =>
                        child !== clanTagSpan && child.querySelector('img[class*="roleIcon"]')
                    ) as HTMLElement | undefined;
                    if (!roleIconSpan) return;
                    const children = Array.from(headerText.children);
                    const clanIdx = children.indexOf(clanTagSpan);
                    const roleIdx = children.indexOf(roleIconSpan);
                    if (roleIdx > clanIdx) headerText.insertBefore(roleIconSpan, clanTagSpan);
                    headerText.dataset.fsbRoleReordered = "1";
                });

                // Voice containers dans ce root
                root.querySelectorAll<HTMLElement>('div[class*="usernameContainer_"]:not([data-fsb-voice-checked])').forEach(container => {
                    container.dataset.fsbVoiceChecked = "1";
                    if (!container.querySelector("[data-fsb-role-icon]")) injectVoiceRoleIcon(container);
                });
            }

            // Effets custom sur tout le DOM visible (peu d'éléments concernés)
            for (const effect of registeredEffects.values()) {
                effect.applyFn();
            }
        });
    }

    domObserver = new MutationObserver(mutations => {
        let membersZoneChanged = false;
        // Compteur de mutations "réelles" (hors nos propres injections de style)
        let realMutations = 0;

        for (const m of mutations) {
            if (m.type !== "childList") continue;
            if (m.addedNodes.length === 0 && m.removedNodes.length === 0) continue;

            // Ignorer nos propres injections (role icons, bday stars, CSS vars)
            const allNodes = [...Array.from(m.addedNodes), ...Array.from(m.removedNodes)];
            const isOurMutation = allNodes.every(n => {
                if (!(n instanceof HTMLElement)) return true; // nœuds texte → ignorer
                return n.dataset?.fsbRoleIcon !== undefined
                    || n.dataset?.fsbBdayStar !== undefined
                    || n.dataset?.fsbCstar !== undefined
                    || n.dataset?.fsbCelestialWrap !== undefined
                    || n.id?.startsWith("fsb-effect-")
                    || n.id === "fakeServerBoost-gradient-names";
            });
            if (isOurMutation) continue;

            realMutations++;
            const target = m.target as HTMLElement;

            // Nettoyage des marqueurs sur nœuds retirés
            m.removedNodes.forEach(n => {
                if (!(n instanceof HTMLElement)) return;
                if (n.dataset?.fsbMentionText) {
                    let cur: HTMLElement | null = target;
                    while (cur) {
                        if (cur.dataset?.fsbMention) {
                            delete cur.dataset.fsbMention;
                            delete cur.dataset.fsbGradient;
                            cur.style.removeProperty("--custom-gradient-color-1");
                            cur.style.removeProperty("--custom-gradient-color-2");
                            cur.style.removeProperty("--custom-gradient-color-3");
                            break;
                        }
                        cur = cur.parentElement;
                    }
                }
                n.querySelectorAll("[data-fsb-cat-checked]").forEach(el => delete (el as HTMLElement).dataset.fsbCatChecked);
                if (n.dataset?.fsbCatChecked) delete n.dataset.fsbCatChecked;
                n.querySelectorAll("[data-fsb-voice-checked]").forEach(el => delete (el as HTMLElement).dataset.fsbVoiceChecked);
                if (n.dataset?.fsbVoiceChecked) delete n.dataset.fsbVoiceChecked;
                n.querySelectorAll("[data-fsb-role-reordered]").forEach(el => delete (el as HTMLElement).dataset.fsbRoleReordered);
                if (n.dataset?.fsbRoleReordered) delete n.dataset.fsbRoleReordered;
            });

            // Détecter si un membersGroup apparaît ou disparaît
            const hasMembersGroupChange = (() => {
                for (const n of [...m.addedNodes, ...m.removedNodes]) {
                    if (!(n instanceof HTMLElement)) continue;
                    if (n.matches?.('[class*="membersGroup"]')) return true;
                    if (n.querySelector?.('[class*="membersGroup"]')) return true;
                }
                return !!(target.closest?.('[class*="membersGroup"]') || target.closest?.('[class*="members_"]'));
            })();

            if (hasMembersGroupChange) {
                membersZoneChanged = true;
            }

            // Pour les autres mutations (messages, voice), traitement ciblé
            if (!hasMembersGroupChange) {
                // Eviter de scanner des mutations purement internes à Discord
                // (style updates, attribute changes sur éléments sans rapport)
                const isRelevant = allNodes.some(n => {
                    if (!(n instanceof HTMLElement)) return false;
                    // Si le nœud ajouté/retiré contient un nameContainer, username_, ou voiceUser → pertinent
                    return n.matches?.('[class*="nameContainer"]')
                        || n.matches?.('[class*="username_"]')
                        || n.matches?.('[class*="messageListItem"]')
                        || n.matches?.('[class*="voiceUser"]')
                        || n.matches?.('[class*="cozy"]')
                        || n.querySelector?.('[class*="nameContainer"],[class*="username_"]') !== null;
                }) || target.closest?.('[class*="messageListItem"]') !== null
                  || target.closest?.('[class*="voiceUsers_"]') !== null
                  || target.closest?.('[class*="chat_"]') !== null;

                if (!isRelevant) continue;

                const scopeRoot =
                    target.closest<HTMLElement>('[class*="voiceUsers_"]') ??
                    target.closest<HTMLElement>('[class*="messageListItem"]') ??
                    target.closest<HTMLElement>('[class*="chat_"]') ??
                    null;
                scheduleApply(scopeRoot);
            }
        }

        // Si aucune mutation réelle → sortir
        if (realMutations === 0) return;

        // Une seule entrée pour toute la zone membres si nécessaire
        if (membersZoneChanged) {
            scheduleApply(null); // full scan de la zone membres
        }
    });

    domObserver.observe(document.body, { childList: true, subtree: true });

    // Flux : GUILD_MEMBER_UPDATE / VOICE_STATE_UPDATE → reset ciblé + re-scan
    let memberUpdateTimer: ReturnType<typeof setTimeout> | null = null;
    const onMemberOrVoiceUpdate = () => {
        // Debounce : regrouper les mises à jour en rafale (ex: plusieurs joins voice simultanés)
        if (memberUpdateTimer) return;
        memberUpdateTimer = setTimeout(() => {
            memberUpdateTimer = null;
            // Reset catégories
            document.querySelectorAll<HTMLElement>('[aria-hidden="true"][data-fsb-cat-checked]').forEach(resetCatEl);

            // Reset voice
            document.querySelectorAll<HTMLElement>("[data-fsb-voice-checked]").forEach(el => {
                delete el.dataset.fsbVoiceChecked;
                delete el.dataset.fsbCustomAnim;
            });

            // Laisser chaque effet custom se nettoyer lui-même
            for (const effect of registeredEffects.values()) {
                effect.cleanupFn();
            }

            scheduleApply(null); // full scan après reset
        }, 80);
    };

    for (const event of ["GUILD_MEMBER_UPDATE", "VOICE_STATE_UPDATE"] as const) {
        FluxDispatcher.subscribe(event, onMemberOrVoiceUpdate);
    }
    (domObserver as any)._fluxUnsub = () => {
        if (memberUpdateTimer) { clearTimeout(memberUpdateTimer); memberUpdateTimer = null; }
        for (const event of ["GUILD_MEMBER_UPDATE", "VOICE_STATE_UPDATE"] as const) {
            FluxDispatcher.unsubscribe(event, onMemberOrVoiceUpdate);
        }
    };
}

function stopDomObserver() {
    (domObserver as any)?._fluxUnsub?.();
    domObserver?.disconnect();
    domObserver = null;
}

/** Charge le cache depuis IndexedDB au démarrage */
async function loadCache() {
    const savedRoles = await DataStore.get<RoleColorsCache>(ROLE_COLORS_CACHE_KEY);
    if (savedRoles) roleColorsCache = savedRoles;
    const savedAssets = await DataStore.get<GuildAssetsCache>(GUILD_ASSETS_CACHE_KEY);
    if (savedAssets) guildAssetsCache = savedAssets;
    rebuildColorStringIndex();
}

/** Sauvegarde le cache en différé (debounce 2s pour éviter les writes trop fréquents) */
function scheduleSave() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        await DataStore.set(ROLE_COLORS_CACHE_KEY, roleColorsCache);
        await DataStore.set(GUILD_ASSETS_CACHE_KEY, guildAssetsCache);
        cacheDirty = false;
        saveTimeout = null;
    }, 2000);
}

/** Stocke les données de couleur d'un rôle si elles contiennent des infos utiles */
function cacheRoleColors(guildId: string, role: any) {
    if (!role?.id) return;

    const hasGradient = role.colorStrings?.secondaryColor || role.colorStrings?.tertiaryColor
        || role.colors?.secondary_color || role.colors?.tertiary_color;
    const hasStyle = role.displayNameStyles?.effectId;

    // Ne stocker que si le rôle a des données avancées (gradient ou style)
    if (!hasGradient && !hasStyle) return;

    if (!roleColorsCache[guildId]) roleColorsCache[guildId] = {};

    roleColorsCache[guildId][role.id] = {
        colorStrings: role.colorStrings ?? null,
        colors: role.colors ?? null,
        displayNameStyles: role.displayNameStyles ?? null,
    };
    cacheDirty = true;
    scheduleSave();
}

/** Scanne tous les rôles d'un guild et met le cache à jour */
function snapshotGuildRoles(guildId: string) {
    try {
        const roles = GuildRoleStore.getUnsafeMutableRoles(guildId);
        if (!roles) return;
        for (const role of Object.values(roles)) {
            cacheRoleColors(guildId, role);
        }
    } catch { /* GuildRoleStore pas encore prêt */ }
}

/** Réinjecte les données en cache dans un rôle qui a perdu ses couleurs */
function restoreRoleColors(guildId: string, role: any) {
    if (!role?.id) return;
    // Priorité : hardcodé > cache persistant
    const cached = hardcodedRoleColors[role.id] ?? roleColorsCache[guildId]?.[role.id];
    if (!cached) return;

    if (cached.colorStrings && !role.colorStrings?.secondaryColor && !role.colorStrings?.tertiaryColor) {
        role.colorStrings = {
            ...role.colorStrings,
            primaryColor: cached.colorStrings.primaryColor ?? role.colorStrings?.primaryColor,
            secondaryColor: cached.colorStrings.secondaryColor,
            tertiaryColor: cached.colorStrings.tertiaryColor,
        };
    }
    if (cached.colors && !role.colors?.secondary_color && !role.colors?.tertiary_color) {
        role.colors = {
            ...role.colors,
            primary_color: cached.colors.primary_color ?? role.colors?.primary_color,
            secondary_color: cached.colors.secondary_color,
            tertiary_color: cached.colors.tertiary_color,
        };
    }
    if (cached.displayNameStyles && !role.displayNameStyles) {
        role.displayNameStyles = cached.displayNameStyles;
    }
}

/** Réinjecte les couleurs de rôle dans un membre via son colorRoleId */
function restoreMemberColors(guildId: string, member: any) {
    if (!member) return;

    // Priorité 1 : correspondance directe par colorRoleId
    let cached = member.colorRoleId
        ? (hardcodedRoleColors[member.colorRoleId] ?? roleColorsCache[guildId]?.[member.colorRoleId])
        : null;

    // Priorité 2 : fallback via colorStringIndex si le membre a déjà une primaryColor
    // mais pas de secondaryColor (dégradé perdu côté serveur)
    if (!cached && !member.colorStrings?.secondaryColor && !member.colorStrings?.tertiaryColor) {
        // Essai via colorStrings.primaryColor
        const primary = member.colorStrings?.primaryColor;
        if (primary) cached = colorStringIndex[primary.toLowerCase()] ?? null;

        // Essai via colorString (ancienne API singulière, ex: "#de5313")
        if (!cached && member.colorString) {
            cached = colorStringIndex[member.colorString.toLowerCase()] ?? null;
        }
    }

    if (!cached) return;

    if (cached.colorStrings && !member.colorStrings?.secondaryColor && !member.colorStrings?.tertiaryColor) {
        // Si colorStrings est null, l'initialiser à partir de colorString existant
        const existingPrimary = member.colorStrings?.primaryColor ?? member.colorString ?? cached.colorStrings.primaryColor;
        member.colorStrings = {
            primaryColor: cached.colorStrings.primaryColor ?? existingPrimary,
            secondaryColor: cached.colorStrings.secondaryColor,
            tertiaryColor: cached.colorStrings.tertiaryColor ?? undefined,
        };
    }
    if (cached.displayNameStyles && !member.displayNameStyles) {
        member.displayNameStyles = cached.displayNameStyles;
    }
}

/** Stocke les assets visuels d'un guild (bannière, splash, icon, homeHeader) */
function cacheGuildAssets(guild: any) {
    if (!guild?.id) return;
    // Ne capturer que si au moins un asset existe (évite d'écraser un cache valide avec du vide)
    if (!guild.banner && !guild.splash && !guild.homeHeader) return;

    const current = guildAssetsCache[guild.id];
    const updated: GuildAssetsData = {
        banner: guild.banner ?? current?.banner,
        splash: guild.splash ?? current?.splash,
        icon: guild.icon ?? current?.icon,
        homeHeader: guild.homeHeader ?? current?.homeHeader,
    };

    // Ne sauvegarder que si quelque chose a changé
    if (
        current?.banner === updated.banner &&
        current?.splash === updated.splash &&
        current?.icon === updated.icon &&
        current?.homeHeader === updated.homeHeader
    ) return;

    guildAssetsCache[guild.id] = updated;
    cacheDirty = true;
    scheduleSave();
}

/** Réinjecte les assets en cache dans un guild qui les a perdus */
function restoreGuildAssets(guild: any) {
    if (!guild?.id) return;
    const cached = guildAssetsCache[guild.id];
    if (!cached) return;

    if (!guild.banner && cached.banner) guild.banner = cached.banner;
    if (!guild.splash && cached.splash) guild.splash = cached.splash;
    if (!guild.homeHeader && cached.homeHeader) guild.homeHeader = cached.homeHeader;
    // L'icône n'est pas liée aux boosts, mais on la préserve aussi au cas où
    if (!guild.icon && cached.icon) guild.icon = cached.icon;
}

function injectPremiumFeatures(guild: any) {
    if (!guild) return;

    // Capturer les assets du guild s'ils existent encore
    cacheGuildAssets(guild);

    if (guild.features) {
        BOOST_FEATURES.forEach(feature => guild.features.add(feature));
    }

    if (!guild.premiumFeatures) {
        guild.premiumFeatures = { features: [] };
    }
    if (!guild.premiumFeatures.features) {
        guild.premiumFeatures.features = [];
    }

    PREMIUM_FEATURES.forEach(feature => {
        if (!guild.premiumFeatures.features.includes(feature)) {
            guild.premiumFeatures.features.push(feature);
        }
    });

    // Restaurer les assets visuels si le guild les a perdus suite à la perte des boosts
    restoreGuildAssets(guild);

    Object.defineProperty(guild, "premiumTier", {
        get: () => 3,
        set: () => { },
        configurable: true,
        enumerable: true
    });
}

/**
 * Injecte des couleurs de rôle hardcodées dans un objet rôle.
 * Appelable depuis d'autres plugins via la dépendance fakeServerBoost.
 */
export function injectHardcodedRoleColors(role: any, data: RoleColorData): void {
    if (!role || !data) return;

    if (data.colorStrings && !role.colorStrings?.secondaryColor && !role.colorStrings?.tertiaryColor) {
        role.colorStrings = {
            ...role.colorStrings,
            primaryColor: data.colorStrings.primaryColor ?? role.colorStrings?.primaryColor,
            secondaryColor: data.colorStrings.secondaryColor,
            tertiaryColor: data.colorStrings.tertiaryColor,
        };
    }
    if (data.colors && !role.colors?.secondary_color && !role.colors?.tertiary_color) {
        role.colors = {
            ...role.colors,
            primary_color: data.colors.primary_color ?? role.colors?.primary_color,
            secondary_color: data.colors.secondary_color,
            tertiary_color: data.colors.tertiary_color,
        };
    }
    if (data.displayNameStyles && !role.displayNameStyles) {
        role.displayNameStyles = data.displayNameStyles;
    }
}

/**
 * Injecte des couleurs de rôle hardcodées dans un objet membre via son colorRoleId.
 * Appelable depuis d'autres plugins via la dépendance fakeServerBoost.
 */
export function injectHardcodedMemberColors(member: any, data: RoleColorData): void {
    if (!member || !data) return;

    if (data.colorStrings && !member.colorStrings?.secondaryColor && !member.colorStrings?.tertiaryColor) {
        member.colorStrings = {
            ...member.colorStrings,
            primaryColor: data.colorStrings.primaryColor ?? member.colorStrings?.primaryColor,
            secondaryColor: data.colorStrings.secondaryColor,
            tertiaryColor: data.colorStrings.tertiaryColor,
        };
    }
    if (data.displayNameStyles && !member.displayNameStyles) {
        member.displayNameStyles = data.displayNameStyles;
    }
}

// Handler Flux : écoute les mises à jour de rôles pour maintenir le cache
function onRoleUpdate({ guildId, role }: { guildId: string; role: any; }) {
    if (guildId && role) cacheRoleColors(guildId, role);
}

// Handler Flux : écoute les créations de rôles en masse (ex: connexion initiale)
function onGuildCreate({ guild }: { guild: any; }) {
    if (guild?.id) snapshotGuildRoles(guild.id);
}

let lastGuildId: string | null = null;

// Handler Flux : forcer le re-render quand l'utilisateur navigue vers un serveur/channel
function onChannelSelect({ guildId }: { guildId?: string | null; }) {
    const currentGuildId = guildId ?? null;
    const guildChanged = currentGuildId !== lastGuildId;
    lastGuildId = currentGuildId;

    // Réinitialiser les icônes de catégorie SEULEMENT si le guild a changé
    // (les nœuds sont recyclés par la virtualisation de Discord)
    if (guildChanged) {
        document.querySelectorAll<HTMLElement>("[data-fsb-cat-checked]").forEach(el => {
            el.querySelectorAll("[data-fsb-role-icon]").forEach(img => img.remove());
            delete el.dataset.fsbCatChecked;
        });
        // Réinitialiser aussi les ancres et voice containers
        document.querySelectorAll<HTMLElement>("[data-fsb-anchor-checked]").forEach(el => delete el.dataset.fsbAnchorChecked);
        document.querySelectorAll<HTMLElement>("[data-fsb-voice-checked]").forEach(el => {
            delete el.dataset.fsbVoiceChecked;
            delete el.dataset.fsbCustomAnim;
        });
        document.querySelectorAll<HTMLElement>("[data-fsb-role-reordered]").forEach(el => delete el.dataset.fsbRoleReordered);
    }
    // Pas d'emitChange() ici — trop coûteux (re-render de tous les membres).
    // Le MutationObserver prend en charge le re-scan naturellement.
}

export default definePlugin({
    name: "Fake Server Boost Level 2",
    description: "Unlocks server boost level 2 features client-side (role icons, server banner). Sauvegarde les styles de rôles avancés (dégradé, holographique) même après perte des boosts.",
    authors: [Devs.IAmSympathy],

    patches: [
        {
            find: ".ROLE_ICONS",
            predicate: () => true,
            noWarn: true,
            replacement: [
                {
                    match: /\.hasFeature\((\i)\.(\i)\.(ROLE_ICONS|BANNER|ANIMATED_BANNER)\)/g,
                    replace: "(true)"
                }
            ]
        },
        {
            // Réinjecte l'icône de rôle + gradient dans les headers de catégorie de la liste des membres.
            // Couvre à la fois le cas avec RoleColorEverywhere actif et sans.
            // Le ] de fin est capturé dans $1 pour éviter qu'il casse le tableau patches[].
            find: 'tutorialId:"whos-online',
            predicate: () => true,
            noWarn: true,
            replacement: {
                match: /(,"aria-hidden":!0,children:)\[.{0,300}\}\)\](\])/,
                replace: "$1[$self.renderCategoryHeader(arguments[0])]$2"
            }
        },
        {
            find: "premiumTier",
            all: true,
            predicate: () => true,
            noWarn: true,
            replacement: [
                {
                    match: /(\i\.premiumTier)>=?(\d)/g,
                    replace: "(true||$1>=$2)"
                },
                {
                    match: /(\i\.premiumTier)===(\d)/g,
                    replace: "(true||$1===$2)"
                }
            ]
        },
        {
            // Court-circuite la vérification ENHANCED_ROLE_COLORS dans TOUS les modules
            // (rendu natif Discord des noms + showMeYourName + autres)
            find: "ENHANCED_ROLE_COLORS",
            all: true,
            predicate: () => true,
            noWarn: true,
            replacement: {
                match: /(\i)\.premiumFeatures\?\.features\.includes\("ENHANCED_ROLE_COLORS"\)/g,
                replace: "(true)"
            }
        },
        {
            // Intercepte les colorStrings au niveau du composant natif Discord nameContainer
            // (même point d'entrée que ircColors) pour injecter secondaryColor depuis notre registre
            find: '="SYSTEM_TAG"',
            predicate: () => true,
            noWarn: true,
            replacement: {
                match: /(?<=colorString:\i,colorStrings:\i,colorRoleName:\i.*?}=)(\i),/,
                replace: "$self.injectGradientColorProps($1),"
            }
        },
        {
            // Module qui génère les CSS vars de dégradé (--custom-gradient-color-1/2/3)
            // On intercepte juste avant que t?.primaryColor soit lu
            // all: true pour couvrir tous les modules (natif Discord + showMeYourName, etc.)
            find: "--custom-gradient-color-1",
            all: true,
            predicate: () => true,
            noWarn: true,
            replacement: {
                // Remplace : _=t?.primaryColor??u  par : _=(t=$self.injectColorStrings(t))?.primaryColor??u
                match: /(\w+)=(\i)\?\.primaryColor\?\?/,
                replace: "$1=($2=$self.injectColorStrings($2))?.primaryColor??"
            }
        }
    ],

    renderCategoryHeader: ErrorBoundary.wrap(({ id, count, title, guildId, label }: { id: string; count: number; title: string; guildId: string; label: string; }) => {
        const role = GuildRoleStore.getRole(guildId, id);
        const colorString = role?.colorString;
        const rgbKey = colorString ? (hexToRgbString(colorString) ?? normalizeColor(colorString)) : null;
        const g = rgbKey ? rgbToGradient.get(rgbKey) : null;

        const textStyle: React.CSSProperties = g ? {
            backgroundImage: `linear-gradient(to right, ${g.primary}, ${g.secondary}, ${g.primary})`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent" as any,
            backgroundSize: "200px auto",
            animation: "fsb-gradient-scroll 1.5s linear infinite",
            display: "inline-block",
        } : { color: colorString };

        return (
            <span style={{ fontWeight: "unset", letterSpacing: ".05em", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                {role?.icon && <RoleIcon role={role} size="small" />}
                <span style={textStyle}>{title ?? label} &mdash; {count}</span>
            </span>
        );
    }, { noop: true }),

    injectGradientColorProps(colorProps: { colorString?: string; colorStrings?: { primaryColor?: string; secondaryColor?: string; tertiaryColor?: string; }; } | null | undefined) {
        try {
            if (!colorProps) return colorProps;
            // Déjà un dégradé — rien à faire
            if (colorProps.colorStrings?.secondaryColor) return colorProps;

            // Chercher dans l'index par primaryColor
            const primary = colorProps.colorStrings?.primaryColor ?? colorProps.colorString;
            if (!primary) return colorProps;

            const data = colorStringIndex[primary.toLowerCase()];
            if (!data?.colorStrings?.secondaryColor) return colorProps;

            return {
                ...colorProps,
                colorStrings: {
                    primaryColor: data.colorStrings.primaryColor ?? primary,
                    secondaryColor: data.colorStrings.secondaryColor,
                    tertiaryColor: data.colorStrings.tertiaryColor ?? undefined,
                }
            };
        } catch {
            return colorProps;
        }
    },

    injectColorStrings(colorStrings: { primaryColor?: string; secondaryColor?: string; tertiaryColor?: string; } | null | undefined) {
        try {
            if (colorStrings?.secondaryColor) return colorStrings; // Déjà un dégradé
            const primaryColor = colorStrings?.primaryColor;
            if (!primaryColor) return colorStrings;

            const data = colorStringIndex[primaryColor.toLowerCase()];
            if (!data?.colorStrings?.secondaryColor) return colorStrings;

            return {
                primaryColor: data.colorStrings.primaryColor ?? primaryColor,
                secondaryColor: data.colorStrings.secondaryColor,
                tertiaryColor: data.colorStrings.tertiaryColor ?? undefined,
            };
        } catch {
            return colorStrings;
        }
    },

    async start() {
        // Charger le cache persistant
        await loadCache();

        // Snapshoter les rôles de tous les guilds déjà chargés
        try {
            const guilds = GuildStore.getGuilds();
            for (const guildId of Object.keys(guilds)) {
                snapshotGuildRoles(guildId);
            }
        } catch { /* GuildStore pas encore prêt */ }

        // Forcer le re-render des noms maintenant que le cache est chargé
        try { (GuildMemberStore as any).emitChange(); } catch { /* ignore */ }

        // Démarrer le post-processing DOM pour les dégradés
        startDomObserver();
        setTimeout(() => applyGradientToNames(), 200);

        // Écouter les mises à jour de rôles en temps réel
        FluxDispatcher.subscribe("GUILD_ROLE_UPDATE", onRoleUpdate);
        FluxDispatcher.subscribe("GUILD_ROLE_CREATE", onRoleUpdate);
        FluxDispatcher.subscribe("GUILD_CREATE", onGuildCreate);
        // Forcer re-render quand l'utilisateur navigue vers un channel/serveur
        FluxDispatcher.subscribe("CHANNEL_SELECT", onChannelSelect);

        // Patch GuildStore.getGuild — injecte les features ET restaure les couleurs des rôles
        if (GuildStore?.getGuild) {
            originalGetGuild = GuildStore.getGuild;
            GuildStore.getGuild = function (guildId: string) {
                const guild = originalGetGuild.call(this, guildId);
                injectPremiumFeatures(guild);
                return guild;
            };
        }

        // Patch GuildStore.getGuilds
        if (GuildStore?.getGuilds) {
            originalGetGuilds = GuildStore.getGuilds;
            GuildStore.getGuilds = function () {
                const guilds = originalGetGuilds.call(this);
                Object.values(guilds).forEach(injectPremiumFeatures);
                return guilds;
            };
        }

        // Patch GuildRoleStore pour réinjecter les couleurs en cache sur les rôles qui les ont perdues
        const origGetRole = GuildRoleStore.getRole.bind(GuildRoleStore);
        (GuildRoleStore as any)._origGetRole = origGetRole;
        (GuildRoleStore as any).getRole = function (guildId: string, roleId: string) {
            const role = origGetRole(guildId, roleId);
            if (role) restoreRoleColors(guildId, role);
            return role;
        };

        const origGetUnsafe = GuildRoleStore.getUnsafeMutableRoles.bind(GuildRoleStore);
        (GuildRoleStore as any)._origGetUnsafe = origGetUnsafe;
        (GuildRoleStore as any).getUnsafeMutableRoles = function (guildId: string) {
            const roles = origGetUnsafe(guildId);
            if (roles) Object.values(roles).forEach((role: any) => restoreRoleColors(guildId, role));
            return roles;
        };

        // Patch GuildMemberStore — c'est ici que Discord lit colorStrings pour afficher les dégradés
        const origGetMember = GuildMemberStore.getMember.bind(GuildMemberStore);
        (GuildMemberStore as any)._origGetMember = origGetMember;
        (GuildMemberStore as any).getMember = function (guildId: string, userId: string) {
            const member = origGetMember(guildId, userId);
            if (member) restoreMemberColors(guildId, member);
            return member;
        };

        const origGetMutableAll = GuildMemberStore.getMutableAllGuildsAndMembers.bind(GuildMemberStore);
        (GuildMemberStore as any)._origGetMutableAll = origGetMutableAll;
        (GuildMemberStore as any).getMutableAllGuildsAndMembers = function () {
            const all = origGetMutableAll();
            for (const [guildId, members] of Object.entries(all)) {
                for (const member of Object.values(members as any)) {
                    restoreMemberColors(guildId, member);
                }
            }
            return all;
        };
    },

    stop() {
        stopDomObserver();
        resetGradients();

        FluxDispatcher.unsubscribe("GUILD_ROLE_UPDATE", onRoleUpdate);
        FluxDispatcher.unsubscribe("GUILD_ROLE_CREATE", onRoleUpdate);
        FluxDispatcher.unsubscribe("GUILD_CREATE", onGuildCreate);
        FluxDispatcher.unsubscribe("CHANNEL_SELECT", onChannelSelect);

        if (saveTimeout) {
            clearTimeout(saveTimeout);
            if (cacheDirty) {
                DataStore.set(ROLE_COLORS_CACHE_KEY, roleColorsCache);
                DataStore.set(GUILD_ASSETS_CACHE_KEY, guildAssetsCache);
            }
        }

        if (originalGetGuild && GuildStore?.getGuild) {
            GuildStore.getGuild = originalGetGuild;
        }
        if (originalGetGuilds && GuildStore?.getGuilds) {
            GuildStore.getGuilds = originalGetGuilds;
        }

        if ((GuildRoleStore as any)._origGetRole) {
            (GuildRoleStore as any).getRole = (GuildRoleStore as any)._origGetRole;
            delete (GuildRoleStore as any)._origGetRole;
        }
        if ((GuildRoleStore as any)._origGetUnsafe) {
            (GuildRoleStore as any).getUnsafeMutableRoles = (GuildRoleStore as any)._origGetUnsafe;
            delete (GuildRoleStore as any)._origGetUnsafe;
        }

        if ((GuildMemberStore as any)._origGetMember) {
            (GuildMemberStore as any).getMember = (GuildMemberStore as any)._origGetMember;
            delete (GuildMemberStore as any)._origGetMember;
        }
        if ((GuildMemberStore as any)._origGetMutableAll) {
            (GuildMemberStore as any).getMutableAllGuildsAndMembers = (GuildMemberStore as any)._origGetMutableAll;
            delete (GuildMemberStore as any)._origGetMutableAll;
        }
    }
});
