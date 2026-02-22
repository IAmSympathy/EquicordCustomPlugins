/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { spawn } from "child_process";
import { IpcMainInvokeEvent } from "electron";
import { existsSync } from "fs";
import { join } from "path";

// Chemin vers la racine du repo Equicord (deux niveaux au dessus de dist/)
// __dirname pointe vers dist/ en production (après build)
const EQUICORD_ROOT = join(__dirname, "..", "..", "..");

/**
 * Lance le script PowerShell "Install or Update Equicord.ps1" dans une nouvelle fenêtre.
 */
export async function launchUpdateScript(_: IpcMainInvokeEvent): Promise<{ ok: boolean; error?: string; }> {
    const scriptPath = join(EQUICORD_ROOT, "Install or Update Equicord.ps1");

    if (!existsSync(scriptPath)) {
        return { ok: false, error: `Script introuvable : ${scriptPath}` };
    }

    try {
        // Lance dans une nouvelle fenêtre PowerShell visible pour que l'utilisateur voie la progression
        spawn(
            "powershell.exe",
            [
                "-NoProfile",
                "-ExecutionPolicy", "Bypass",
                "-Command",
                `Start-Process powershell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"' -Verb RunAs`,
            ],
            {
                detached: true,
                stdio: "ignore",
            }
        ).unref();

        return { ok: true };
    } catch (err: any) {
        return { ok: false, error: String(err?.message ?? err) };
    }
}

/**
 * Retourne le git hash courant du repo Equicord local (HEAD),
 * ainsi que le remote origin URL.
 */
export async function getLocalGitInfo(_: IpcMainInvokeEvent): Promise<{ hash: string | null; remote: string | null; }> {
    const { execFile } = await import("child_process");
    const { promisify } = await import("util");
    const execFileAsync = promisify(execFile);

    try {
        const [hashRes, remoteRes] = await Promise.all([
            execFileAsync("git", ["rev-parse", "HEAD"], { cwd: EQUICORD_ROOT }),
            execFileAsync("git", ["remote", "get-url", "origin"], { cwd: EQUICORD_ROOT }),
        ]);

        const hash = hashRes.stdout.trim() || null;
        const remote = remoteRes.stdout
            .trim()
            .replace(/git@(.+):/, "https://$1/")
            .replace(/\.git$/, "")
            || null;

        return { hash, remote };
    } catch {
        return { hash: null, remote: null };
    }
}
