/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { noticesQueue } from "@api/Notices";
import { showNotification } from "@api/Notifications";
import { definePluginSettings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType, PluginNative } from "@utils/types";
import { Alerts, Button, React, showToast, Toasts } from "@webpack/common";

const Native = VencordNative.pluginHelpers.CustomPluginsUpdater as PluginNative<typeof import("./native")>;

const logger = new Logger("CustomPluginsUpdater", "#f0a505");

const DATASTORE_KEY_PLUGINS = "CustomPluginsUpdater_lastKnownCommit";

const CHECK_INTERVAL_MS = 30 * 60 * 1000;

let checkIntervalId: ReturnType<typeof setInterval> | null = null;
let notifiedPluginsThisSession = false;

// Référence vers le proxy installé sur noticesQueue.push
let originalQueuePush: typeof noticesQueue.push | null = null;

const settings = definePluginSettings({
    repoUrl: {
        type: OptionType.STRING,
        description: "URL GitHub de votre repo de plugins custom (ex: https://github.com/USERNAME/EquicordCustomPlugins)",
        default: "https://github.com/IAmSympathy/EquicordCustomPlugins",
        placeholder: "https://github.com/USERNAME/MonRepo",
    },
    branch: {
        type: OptionType.STRING,
        description: "Branche à surveiller pour les plugins custom",
        default: "main",
        placeholder: "main",
    },
    checkOnStartup: {
        type: OptionType.BOOLEAN,
        description: "Vérifier les mises à jour des plugins custom au démarrage de Discord",
        default: true,
    },
    checkPeriodically: {
        type: OptionType.BOOLEAN,
        description: "Vérifier les mises à jour des plugins custom toutes les 30 minutes",
        default: true,
    },
    resetStoredSha: {
        type: OptionType.COMPONENT,
        description: "Réinitialiser le commit mémorisé (force une nouvelle détection au prochain démarrage)",
        component: () => (
            <Button onClick={async () => {
                await DataStore.del(DATASTORE_KEY_PLUGINS);
                notifiedPluginsThisSession = false;
                showToast("SHA réinitialisé. Redémarrez Discord pour re-détecter une éventuelle mise à jour.", Toasts.Type.SUCCESS);
            }}>
                Réinitialiser le SHA mémorisé
            </Button>
        ),
    },
});

// ──────────────────────────────────────────────
// Utilitaires
// ──────────────────────────────────────────────

function extractRepoPath(url: string): string | null {
    try {
        const u = new URL(url.trim());
        if (u.hostname !== "github.com") return null;
        const parts = u.pathname.replace(/^\//, "").replace(/\/$/, "").split("/");
        if (parts.length < 2) return null;
        return `${parts[0]}/${parts[1]}`;
    } catch {
        return null;
    }
}

async function fetchLatestCommitSha(repoPath: string, branch: string): Promise<string | null> {
    try {
        const response = await fetch(`https://api.github.com/repos/${repoPath}/commits/${branch}`, {
            headers: {
                Accept: "application/vnd.github+json",
                "User-Agent": "Equicord-CustomPluginsUpdater",
            },
        });
        if (!response.ok) {
            logger.error(`GitHub API a retourné ${response.status} pour ${repoPath}@${branch}`);
            return null;
        }
        const data = await response.json();
        return data.sha ?? null;
    } catch (err) {
        logger.error("Erreur lors de la requête à l'API GitHub :", err);
        return null;
    }
}

// ──────────────────────────────────────────────
// Lancement du script de mise à jour
// ──────────────────────────────────────────────

async function runUpdateScript(): Promise<void> {
    try {
        const result = await Native.launchUpdateScript();
        if (result.ok) {
            showToast("Le script de mise à jour a été lancé !", Toasts.Type.SUCCESS);
        } else {
            logger.error("Impossible de lancer le script :", result.error);
            Alerts.show({
                title: "Erreur de mise à jour",
                body: `Impossible de lancer le script de mise à jour.\n\n${result.error ?? "Erreur inconnue"}\n\nLancez manuellement "Install or Update Equicord.ps1".`,
                confirmText: "OK",
            });
        }
    } catch (err) {
        logger.error("Erreur native :", err);
        Alerts.show({
            title: "Erreur de mise à jour",
            body: "Une erreur inattendue s'est produite. Lancez manuellement \"Install or Update Equicord.ps1\".",
            confirmText: "OK",
        });
    }
}

// ──────────────────────────────────────────────
// Interception de la notice native Equicord
//
// Equicord pousse dans noticesQueue un tableau :
//   ["GENERIC", <message>, buttonText, onOkClick]
// On remplace le bouton "View Update" par "Mettre à jour"
// qui lance le script PS1.
// ──────────────────────────────────────────────

const EQUICORD_UPDATE_MESSAGES = [
    "A new version of Equicord is available!",
    "Equicord has been updated!",
];

function installNoticeInterceptor() {
    originalQueuePush = noticesQueue.push.bind(noticesQueue);

    noticesQueue.push = function (...items: any[]) {
        for (const item of items) {
            // item = ["GENERIC", message, buttonText, onOkClick]
            if (!Array.isArray(item) || item.length < 4) continue;

            const message = item[1];
            const isEquicordUpdate = typeof message === "string"
                ? EQUICORD_UPDATE_MESSAGES.some(m => message.includes(m))
                : false;

            if (isEquicordUpdate) {
                logger.info("Notice de mise à jour Equicord interceptée — remplacement du bouton par le script PS1.");
                // Remplacer le texte du bouton et l'action
                item[2] = "Mettre à jour";
                item[3] = () => {
                    Alerts.show({
                        title: "Mettre à jour Equicord ?",
                        body: "Cela lancera le script 'Install or Update Equicord.ps1' qui fermera Discord, appliquera les mises à jour et relancera Discord.",
                        confirmText: "Mettre à jour",
                        cancelText: "Plus tard",
                        onConfirm: runUpdateScript,
                    });
                };
            }
        }
        return originalQueuePush!(...items);
    } as typeof noticesQueue.push;
}

function uninstallNoticeInterceptor() {
    if (originalQueuePush) {
        noticesQueue.push = originalQueuePush;
        originalQueuePush = null;
    }
}

// ──────────────────────────────────────────────
// Vérification des plugins custom
// ──────────────────────────────────────────────

async function checkForCustomPluginsUpdate(): Promise<void> {
    const { repoUrl, branch } = settings.store;

    if (!repoUrl?.trim()) {
        logger.warn("Aucune URL de repo configurée, vérification ignorée.");
        return;
    }

    const repoPath = extractRepoPath(repoUrl);
    if (!repoPath) {
        logger.warn(`URL de repo invalide : "${repoUrl}"`);
        return;
    }

    logger.info(`Vérification des plugins custom : ${repoPath}@${branch || "main"}`);

    const latestSha = await fetchLatestCommitSha(repoPath, branch || "main");
    if (!latestSha) return;

    const knownSha = await DataStore.get(DATASTORE_KEY_PLUGINS) as string | undefined;

    if (!knownSha) {
        logger.info(`Premier démarrage plugins, commit enregistré : ${latestSha.slice(0, 7)}`);
        await DataStore.set(DATASTORE_KEY_PLUGINS, latestSha);
        return;
    }

    if (latestSha === knownSha) {
        logger.info("Plugins custom à jour.");
        return;
    }

    logger.info(`Mise à jour plugins custom ! ${knownSha.slice(0, 7)} → ${latestSha.slice(0, 7)}`);

    if (notifiedPluginsThisSession) return;
    notifiedPluginsThisSession = true;

    // On ne sauvegarde le nouveau SHA qu'une fois que l'utilisateur a lancé la mise à jour,
    // pour continuer à notifier aux prochains démarrages si ce n'est pas encore fait.
    const repoDisplayName = repoPath.split("/")[1] || repoPath;

    showNotification({
        title: "🔌 Mise à jour des plugins custom disponible !",
        body: `"${repoDisplayName}" a reçu des mises à jour. Cliquez pour mettre à jour.`,
        color: "var(--yellow-360)",
        permanent: true,
        noPersist: false,
        onClick: () => {
            Alerts.show({
                title: "Mettre à jour les plugins custom ?",
                body: "Cela lancera le script 'Install or Update Equicord.ps1' qui fermera Discord, appliquera les mises à jour et relancera Discord.",
                confirmText: "Mettre à jour",
                cancelText: "Plus tard",
                onConfirm: async () => {
                    // Sauvegarder le SHA seulement maintenant que l'utilisateur met à jour
                    await DataStore.set(DATASTORE_KEY_PLUGINS, latestSha);
                    await runUpdateScript();
                },
            });
        },
    });
}

// ──────────────────────────────────────────────
// Plugin
// ──────────────────────────────────────────────

export default definePlugin({
    name: "CustomPluginsUpdater",
    description: "Remplace le bouton de mise à jour natif d'Equicord par le lancement du script PS1, et notifie aussi pour les plugins custom.",
    authors: [{ name: "IAmSympathy", id: 288799652902469633n }],
    settings,

    start() {
        // Intercepter immédiatement la queue de notices (avant que runUpdateCheck ne s'exécute)
        installNoticeInterceptor();

        setTimeout(async () => {
            if (settings.store.checkOnStartup) {
                await checkForCustomPluginsUpdate();
            }

            if (settings.store.checkPeriodically) {
                checkIntervalId = setInterval(async () => {
                    notifiedPluginsThisSession = false;
                    await checkForCustomPluginsUpdate();
                }, CHECK_INTERVAL_MS);
            }
        }, 15_000);
    },

    stop() {
        uninstallNoticeInterceptor();

        if (checkIntervalId !== null) {
            clearInterval(checkIntervalId);
            checkIntervalId = null;
        }
    },
});
