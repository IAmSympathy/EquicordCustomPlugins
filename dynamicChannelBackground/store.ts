/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { proxyLazy } from "@utils/lazy";
import { FluxEmitter, FluxStore } from "@vencord/discord-types";
import { Flux as FluxWP, FluxDispatcher } from "@webpack/common";

interface IFlux {
    PersistedStore: typeof FluxStore;
    Emitter: FluxEmitter;
}

// Fonds hardcodés enregistrés par d'autres plugins (ex: botRoleColor)
const externalChannelBgs: Map<string, string> = new Map();
const externalGuildBgs: Map<string, string> = new Map();

export function registerHardcodedChannelBgs(bgs: Record<string, string>) {
    for (const [id, url] of Object.entries(bgs)) externalChannelBgs.set(id, url);
}

export function unregisterHardcodedChannelBgs(bgs: Record<string, string>) {
    for (const id of Object.keys(bgs)) externalChannelBgs.delete(id);
}

export function registerHardcodedGuildBgs(bgs: Record<string, string>) {
    for (const [id, url] of Object.entries(bgs)) externalGuildBgs.set(id, url);
}

export function unregisterHardcodedGuildBgs(bgs: Record<string, string>) {
    for (const id of Object.keys(bgs)) externalGuildBgs.delete(id);
}

export const DynBgStore = proxyLazy(() => {
    const channelMap: Map<string, string> = new Map();
    const guildMap: Map<string, string> = new Map();
    let globalDefault: string | undefined;

    class DynBgStore extends (FluxWP as unknown as IFlux).PersistedStore {
        static persistKey = "DynamicChannelBackgroundStore";

        get globalDefault() { return globalDefault; }

        // @ts-ignore
        initialize(previous: { channelMap: [string, string][], guildMap: [string, string][], globalDefault?: string; } | undefined) {
            if (!previous) return;

            channelMap.clear();
            guildMap.clear();

            for (const [id, url] of previous.channelMap ?? []) {
                channelMap.set(id, url);
            }
            for (const [id, url] of previous.guildMap ?? []) {
                guildMap.set(id, url);
            }
            globalDefault = previous.globalDefault;
        }

        getState() {
            return {
                channelMap: Array.from(channelMap),
                guildMap: Array.from(guildMap),
                globalDefault,
            };
        }

        getUrlForChannel(channelId: string, guildId?: string | null): string | undefined {
            // Priorité 1 : fond sauvegardé par l'utilisateur pour ce canal
            if (channelMap.has(channelId)) return channelMap.get(channelId);
            // Priorité 2 : fond sauvegardé par l'utilisateur pour ce serveur
            if (guildId && guildMap.has(guildId)) return guildMap.get(guildId);
            // Priorité 3 : fond hardcodé externe pour ce canal
            if (externalChannelBgs.has(channelId)) return externalChannelBgs.get(channelId);
            // Priorité 4 : fond hardcodé externe pour ce serveur
            if (guildId && externalGuildBgs.has(guildId)) return externalGuildBgs.get(guildId);
            // Priorité 5 : fond global par défaut
            return globalDefault;
        }

        // Résout le fond d'un thread en remontant au parent forum si nécessaire
        getUrlForThread(channelId: string, parentId: string | null | undefined, guildId?: string | null): string | undefined {
            // Fond propre au thread en priorité
            const own = this.getUrlForChannel(channelId, guildId);
            // Si le fond vient du global/guild mais que le parent forum a un fond spécifique, préférer le parent
            if (parentId) {
                const parentUrl = channelMap.get(parentId) ?? externalChannelBgs.get(parentId);
                if (parentUrl) return parentUrl;
            }
            return own;
        }

        getForChannel(id: string) { return channelMap.get(id); }

        getForGuild(id: string) { return guildMap.get(id); }
    }

    const store = new DynBgStore(FluxDispatcher, {
        // @ts-ignore
        VC_DYNBG_CHANGE({ channelId, guildId, url }: { channelId?: string; guildId?: string; url: string; }) {
            if (channelId) channelMap.set(channelId, url);
            if (guildId) guildMap.set(guildId, url);
            store.emitChange();
        },
        // @ts-ignore
        VC_DYNBG_REMOVE({ channelId, guildId }: { channelId?: string; guildId?: string; }) {
            if (channelId) channelMap.delete(channelId);
            if (guildId) guildMap.delete(guildId);
            store.emitChange();
        },
        // @ts-ignore
        VC_DYNBG_CHANGE_GLOBAL({ url }: { url?: string; }) {
            globalDefault = url;
            store.emitChange();
        },
        // @ts-ignore
        VC_DYNBG_RESET() {
            channelMap.clear();
            guildMap.clear();
            globalDefault = undefined;
            store.emitChange();
        },
    });

    return store;
});

