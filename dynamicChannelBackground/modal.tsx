/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ModalContent, ModalHeader, ModalProps, ModalRoot, ModalSize } from "@utils/modal";
import { PluginNative } from "@utils/types";
import { React, TextInput, useState } from "@webpack/common";

function getNative() {
    return VencordNative.pluginHelpers.DynamicChannelBackground as PluginNative<typeof import("./native")>;
}

interface Props {
    props: ModalProps;
    onSelect: (url: string) => void;
    initialUrl?: string;
    title?: string;
}
const btnBase: React.CSSProperties = {
    padding: "6px 16px",
    borderRadius: 4,
    border: "none",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 500,
};
type Tab = "url" | "file";

async function fetchToDataUrl(url: string): Promise<string> {
    const result = await getNative().fetchImageAsDataUrl(url);
    if (result.error) throw new Error(result.error);
    return result.data!;
}

async function applyCanvasEffects(src: string, blurPx: number, brightnessPct: number): Promise<string> {
    let dataSrc = src;
    if (/^https?:\/\//i.test(src)) {
        dataSrc = await fetchToDataUrl(src);
    }

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const MAX_H = 720;
            let w = img.naturalWidth;
            let h = img.naturalHeight;
            if (h > MAX_H) {
                w = Math.round(w * MAX_H / h);
                h = MAX_H;
            }

            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d")!;

            const filters: string[] = [];
            if (blurPx > 0) filters.push(`blur(${blurPx}px)`);
            if (brightnessPct !== 100) filters.push(`brightness(${brightnessPct}%)`);
            ctx.filter = filters.length > 0 ? filters.join(" ") : "none";

            if (blurPx > 0) {
                const pad = blurPx * 2;
                ctx.drawImage(img, -pad, -pad, w + pad * 2, h + pad * 2);
            } else {
                ctx.drawImage(img, 0, 0, w, h);
            }
            resolve(canvas.toDataURL("image/jpeg", 0.92));
        };
        img.onerror = reject;
        img.src = dataSrc;
    });
}

export function SetBackgroundModal({ props, onSelect, initialUrl, title = "Set background image" }: Props) {
    const [tab, setTab] = useState<Tab>("file");
    // urlInput : valeur brute du champ texte (pas encore confirmée)
    const [urlInput, setUrlInput] = useState("");
    // rawSrc : source confirmée (data URL ou URL http après confirmation)
    const [rawSrc, setRawSrc] = useState(initialUrl ?? "");
    // processedUrl : résultat canvas (data URL avec effets appliqués) — c'est ce qui est appliqué
    const [processedUrl, setProcessedUrl] = useState(initialUrl ?? "");
    const [fileName, setFileName] = useState<string | null>(null);
    const [dragging, setDragging] = useState(false);
    const [blurAmount, setBlurAmount] = useState(0);
    const [brightnessAmount, setBrightnessAmount] = useState(100);
    const [isProcessing, setIsProcessing] = useState(false);
    const [urlError, setUrlError] = useState<string | null>(null);

    // Ref pour toujours avoir les valeurs fraîches dans les callbacks async
    const rawSrcRef = React.useRef(rawSrc);
    const blurRef = React.useRef(blurAmount);
    const brightnessRef = React.useRef(brightnessAmount);
    const runIdRef = React.useRef(0);
    const debounceTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const runEffects = async (src: string, blur: number, brightness: number) => {
        if (!src) return;
        const runId = ++runIdRef.current;
        setIsProcessing(true);
        setUrlError(null);
        try {
            const result = await applyCanvasEffects(src, blur, brightness);
            // Si un autre runEffects a été lancé entre-temps, on ignore ce résultat
            if (runId !== runIdRef.current) return;
            setProcessedUrl(result);
        } catch (err: any) {
            if (runId !== runIdRef.current) return;
            console.error("[DynBg] applyCanvasEffects failed:", err);
            setUrlError(`Impossible de charger l'image : ${err?.message ?? err}`);
            setProcessedUrl("");
        } finally {
            if (runId === runIdRef.current) setIsProcessing(false);
        }
    };

    const runEffectsDebounced = (src: string, blur: number, brightness: number, delay = 200) => {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => runEffects(src, blur, brightness), delay);
    };

    const confirmUrl = () => {
        const trimmed = urlInput.trim();
        if (!trimmed) return;
        rawSrcRef.current = trimmed;
        setRawSrc(trimmed);
        runEffects(trimmed, blurRef.current, brightnessRef.current);
    };

    const onBlurChange = (v: number) => {
        blurRef.current = v;
        setBlurAmount(v);
        if (rawSrcRef.current) runEffectsDebounced(rawSrcRef.current, v, brightnessRef.current);
    };

    const onBrightnessChange = (v: number) => {
        brightnessRef.current = v;
        setBrightnessAmount(v);
        if (rawSrcRef.current) runEffectsDebounced(rawSrcRef.current, blurRef.current, v);
    };

    const loadFile = (file: File) => {
        if (!file.type.startsWith("image/")) return;
        setFileName(file.name);
        setUrlError(null);
        const reader = new FileReader();
        reader.onload = async e => {
            const result = e.target?.result as string;
            rawSrcRef.current = result;
            setRawSrc(result);
            await runEffects(result, blurRef.current, brightnessRef.current);
        };
        reader.readAsDataURL(file);
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) loadFile(file);
    };

    const tabStyle = (active: boolean): React.CSSProperties => ({
        flex: 1,
        padding: "6px 0",
        borderRadius: 4,
        border: "none",
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 600,
        background: active ? "var(--brand-500)" : "var(--background-modifier-hover)",
        color: active ? "#fff" : "var(--text-muted)",
    });

    return (
        <ModalRoot {...props} size={ModalSize.SMALL}>
            <ModalHeader>
                <span style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 8 }}>
                    {title}
                </span>
            </ModalHeader>
            <ModalContent>
                <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: 16 }}>
                    <div style={{ display: "flex", gap: 6 }}>
                        <button style={tabStyle(tab === "file")} onClick={() => setTab("file")}>Fichier local</button>
                        <button style={tabStyle(tab === "url")} onClick={() => setTab("url")}>URL</button>
                    </div>

                    {tab === "url" ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <div style={{ display: "flex", gap: 6 }}>
                                <div style={{ flex: 1 }}>
                                    <TextInput
                                        value={urlInput}
                                        onChange={setUrlInput}
                                        placeholder="https://example.com/image.jpg"
                                        autoFocus
                                        onKeyDown={(e: React.KeyboardEvent) => {
                                            if (e.key === "Enter") confirmUrl();
                                        }}
                                    />
                                </div>
                                <button
                                    style={{ ...btnBase, background: "var(--brand-500)", color: "#fff", whiteSpace: "nowrap" }}
                                    onClick={confirmUrl}
                                    disabled={!urlInput.trim() || isProcessing}
                                >
                                    Charger
                                </button>
                            </div>
                            {urlError && (
                                <span style={{ fontSize: 12, color: "var(--text-danger)" }}>{urlError}</span>
                            )}
                        </div>
                    ) : (
                        <div
                            onDragOver={e => { e.preventDefault(); setDragging(true); }}
                            onDragLeave={() => setDragging(false)}
                            onDrop={onDrop}
                            onClick={() => {
                                const input = document.createElement("input");
                                input.type = "file";
                                input.accept = "image/*";
                                input.onchange = () => { if (input.files?.[0]) loadFile(input.files[0]); };
                                input.click();
                            }}
                            style={{
                                border: `2px dashed ${dragging ? "var(--brand-500)" : "var(--background-modifier-accent)"}`,
                                borderRadius: 8,
                                padding: "24px 16px",
                                textAlign: "center",
                                cursor: "pointer",
                                color: dragging ? "var(--brand-500)" : "var(--text-muted)",
                                fontSize: 14,
                                transition: "border-color 0.15s, color 0.15s",
                                background: dragging ? "var(--brand-experiment-15a)" : "transparent",
                            }}
                        >
                            {fileName
                                ? <><strong style={{ color: "var(--text-normal)" }}>{fileName}</strong><br /><span style={{ fontSize: 12 }}>Cliquer ou glisser pour changer</span></>
                                : <><strong>Cliquer pour choisir</strong> ou glisser une image ici<br /><span style={{ fontSize: 12 }}>PNG, JPG, GIF, WEBP...</span></>
                            }
                        </div>
                    )}

                    {rawSrc.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                <label style={{ fontSize: 13, color: "var(--text-muted)", display: "flex", justifyContent: "space-between" }}>
                                    <span>Flou</span>
                                    <span style={{ color: "var(--text-normal)" }}>{blurAmount}px</span>
                                </label>
                                <input
                                    type="range"
                                    min={0}
                                    max={40}
                                    step={1}
                                    value={blurAmount}
                                    onChange={e => onBlurChange(Number(e.target.value))}
                                    style={{ width: "100%", accentColor: "var(--brand-500)" }}
                                />
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                <label style={{ fontSize: 13, color: "var(--text-muted)", display: "flex", justifyContent: "space-between" }}>
                                    <span>Luminosité</span>
                                    <span style={{ color: "var(--text-normal)" }}>{brightnessAmount}%</span>
                                </label>
                                <input
                                    type="range"
                                    min={10}
                                    max={200}
                                    step={5}
                                    value={brightnessAmount}
                                    onChange={e => onBrightnessChange(Number(e.target.value))}
                                    style={{ width: "100%", accentColor: "var(--brand-500)" }}
                                />
                            </div>
                            {isProcessing && (
                                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Traitement en cours...</span>
                            )}
                        </div>
                    )}

                    {processedUrl.length > 0 && (
                        <img
                            alt="Preview"
                            src={processedUrl}
                            style={{
                                display: "block",
                                width: "100%",
                                height: 160,
                                objectFit: "cover",
                                borderRadius: 8,
                                background: "var(--background-secondary)",
                            }}
                        />
                    )}

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                        <button style={{ ...btnBase, background: "var(--background-modifier-hover)", color: "#fff" }} onClick={props.onClose}>
                            Annuler
                        </button>
                        <button
                            style={{ ...btnBase, background: "var(--brand-500)", color: "#fff", opacity: (processedUrl && !isProcessing) ? 1 : 0.5 }}
                            onClick={() => { if (processedUrl && !isProcessing) { onSelect(processedUrl); props.onClose(); } }}
                            disabled={!processedUrl || isProcessing}
                        >
                            Appliquer
                        </button>
                    </div>
                </div>
            </ModalContent>
        </ModalRoot>
    );
}
