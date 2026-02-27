/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ModalContent, ModalHeader, ModalProps, ModalRoot, ModalSize } from "@utils/modal";
import { React, TextInput, useState } from "@webpack/common";

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
async function applyCanvasBlur(src: string, blurPx: number): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            // Redimensionner à 720p max
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
            if (blurPx > 0) {
                ctx.filter = `blur(${blurPx}px)`;
                const pad = blurPx * 2;
                ctx.drawImage(img, -pad, -pad, w + pad * 2, h + pad * 2);
            } else {
                ctx.drawImage(img, 0, 0, w, h);
            }
            resolve(canvas.toDataURL("image/jpeg", 0.92));
        };
        img.onerror = reject;
        img.src = src;
    });
}
export function SetBackgroundModal({ props, onSelect, initialUrl, title = "Set background image" }: Props) {
    const [tab, setTab] = useState<Tab>("file");
    const [url, setUrl] = useState(initialUrl ?? "");
    const [preview, setPreview] = useState(initialUrl ?? "");
    const [rawSrc, setRawSrc] = useState(initialUrl ?? "");
    const [fileName, setFileName] = useState<string | null>(null);
    const [dragging, setDragging] = useState(false);
    const [blurAmount, setBlurAmount] = useState(5);
    const [isProcessing, setIsProcessing] = useState(false);
    const applyBlur = async (src: string, blur: number) => {
        if (!src) return;
        setIsProcessing(true);
        try {
            const result = await applyCanvasBlur(src, blur);
            setUrl(result);
            setPreview(result);
        } catch {
            setUrl(src);
            setPreview(src);
        } finally {
            setIsProcessing(false);
        }
    };
    const onBlurChange = async (v: number) => {
        setBlurAmount(v);
        if (rawSrc) await applyBlur(rawSrc, v);
    };
    const loadFile = (file: File) => {
        if (!file.type.startsWith("image/")) return;
        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = async e => {
            const result = e.target?.result as string;
            setRawSrc(result);
            await applyBlur(result, blurAmount);
        };
        reader.readAsDataURL(file);
    };
    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) loadFile(file);
    };
    const onUrlChange = (v: string) => {
        setRawSrc(v);
        setUrl(v);
        setPreview(v);
        if (blurAmount > 0) applyBlur(v, blurAmount);
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
                        <TextInput
                            value={rawSrc}
                            onChange={onUrlChange}
                            placeholder="https://example.com/image.jpg"
                            autoFocus
                        />
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
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <label style={{ fontSize: 13, color: "var(--text-muted)", display: "flex", justifyContent: "space-between" }}>
                                <span>Blur de l image</span>
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
                                disabled={isProcessing}
                            />
                            {isProcessing && (
                                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Traitement en cours...</span>
                            )}
                        </div>
                    )}
                    {preview.length > 0 && (
                        <img
                            alt="Preview"
                            src={preview}
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
                            style={{ ...btnBase, background: "var(--brand-500)", color: "#fff", opacity: (url && !isProcessing) ? 1 : 0.5 }}
                            onClick={() => { if (url && !isProcessing) { onSelect(url); props.onClose(); } }}
                            disabled={!url || isProcessing}
                        >
                            Appliquer
                        </button>
                    </div>
                </div>
            </ModalContent>
        </ModalRoot>
    );
}
