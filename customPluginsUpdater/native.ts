/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { spawn } from "child_process";
import { IpcMainInvokeEvent } from "electron";
import { existsSync } from "fs";
import { join } from "path";

// __dirname = dist/desktop/ (patcher.js est bundlé dans dist/desktop/)
// dist/desktop/ -> dist/ -> Equicord/ : deux niveaux suffisent
const EQUICORD_ROOT = join(__dirname, "..", "..");

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


