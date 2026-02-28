/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IpcMainInvokeEvent } from "electron";

/**
 * Télécharge une image depuis n'importe quelle URL via le processus main (Node.js),
 * ce qui contourne toutes les restrictions CORS du renderer Electron.
 * Retourne un data URL base64 prêt à utiliser dans un <img> ou canvas.
 */
export async function fetchImageAsDataUrl(_: IpcMainInvokeEvent, url: string): Promise<{ data: string; error?: never; } | { data?: never; error: string; }> {
    try {
        const res = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
            }
        });

        if (!res.ok) {
            return { error: `HTTP ${res.status} ${res.statusText}` };
        }

        const buffer = await res.arrayBuffer();
        const bytes = new Uint8Array(buffer);

        // Détecter le vrai type depuis les magic bytes (ignore le Content-Type du serveur)
        let mime = "image/jpeg";
        if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
            mime = "image/png";
        } else if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
            mime = "image/gif";
        } else if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[2] === 0x46 &&
            bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
            mime = "image/webp";
        } else if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
            mime = "image/jpeg";
        } else if (bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x00 &&
            (bytes[4] === 0x66 || bytes[4] === 0x61)) {
            mime = "image/avif";
        }

        const base64 = Buffer.from(buffer).toString("base64");
        return { data: `data:${mime};base64,${base64}` };
    } catch (e: any) {
        return { error: e?.message ?? String(e) };
    }
}
