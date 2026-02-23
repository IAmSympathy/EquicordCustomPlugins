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

export async function launchUpdateScript(_: IpcMainInvokeEvent): Promise<{ ok: boolean; error?: string; }> {
    const scriptPath = join(EQUICORD_ROOT, "Install or Update Equicord.ps1");

    if (!existsSync(scriptPath)) {
        return { ok: false, error: `Script introuvable : ${scriptPath}` };
    }

    try {
        // Ouvre une nouvelle fenêtre cmd qui lance PowerShell — visible, sans UAC
        const child = spawn(
            "cmd.exe",
            [
                "/c", "start", "powershell.exe",
                "-NoProfile",
                "-ExecutionPolicy", "Bypass",
                "-File", scriptPath,
            ],
            {
                detached: true,
                stdio: "ignore",
                cwd: EQUICORD_ROOT,
            }
        );
        child.unref();

        return { ok: true };
    } catch (err: any) {
        return { ok: false, error: String(err?.message ?? err) };
    }
}
