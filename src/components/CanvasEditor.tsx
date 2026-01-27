import React, { useEffect, useMemo, useRef, useState } from "react";
import CanvasComponent from "./Canvas";
import { Canvas } from "fabric";

declare global {
  interface Window {
    __fabricCanvas?: Canvas | null;
  }
}

type SavedDoc = {
  version: 1;
  name: string;
  savedAt: string;
  fabricJson: any;
};

const LS_KEY = "rjded:savedDocs:v1";
const EXTRA_PROPS = ["selectable", "evented", "hasControls", "hasBorders"] as const;
const PAGE_NAME = "A3_PAGE";

function loadSavedDocs(): SavedDoc[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function persistSavedDocs(docs: SavedDoc[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(docs));
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadDataUrl(filename: string, dataUrl: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  downloadBlob(filename, blob);
}

async function fileToText(file: File): Promise<string> {
  return await file.text();
}

const CanvasEditor: React.FC = () => {
  const [docs, setDocs] = useState<SavedDoc[]>(() => loadSavedDocs());
  const [docName, setDocName] = useState("My Design");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [savedOpen, setSavedOpen] = useState(true);

  const [exportOpen, setExportOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    persistSavedDocs(docs);
  }, [docs]);

  // close export menu on outside click / escape
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!exportMenuRef.current) return;
      if (!exportMenuRef.current.contains(e.target as Node)) setExportOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExportOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const safeName = useMemo(() => {
    const n = (docName.trim() || "Untitled").replace(/[^\w\- ]+/g, "");
    return n.replace(/\s+/g, "_");
  }, [docName]);

  const getCanvas = () => {
    const c = window.__fabricCanvas;
    if (!c) {
      alert("Canvas not ready yet.");
      return null;
    }
    return c;
  };

  // ✅ find A3 page rect bounds in WORLD space
  const getA3Region = () => {
    const canvas = getCanvas();
    if (!canvas) return null;

    const page: any = canvas.getObjects().find((o: any) => o?.name === PAGE_NAME);
    if (!page) {
      alert("A3 page not found (PAGE_NAME mismatch).");
      return null;
    }

    const left = page.left ?? 0;
    const top = page.top ?? 0;
    const width = page.width ?? 1;
    const height = page.height ?? 1;

    return {
      canvas,
      left,
      top,
      width,
      height,
      orientation: width >= height ? ("landscape" as const) : ("portrait" as const),
    };
  };

  const toPageDataUrl = (format: "png" | "jpeg") => {
    const region = getA3Region();
    if (!region) return null;

    const { canvas, left, top, width, height } = region;

    // IMPORTANT: this crops in WORLD space (independent of zoom/pan)
    const dataUrl = (canvas as any).toDataURL({
      format,
      left,
      top,
      width,
      height,
      multiplier: 2,
      enableRetinaScaling: true,
      quality: format === "jpeg" ? 0.92 : undefined,
    });

    return dataUrl as string;
  };

  const handleSaveToLocal = () => {
    const canvas = getCanvas();
    if (!canvas) return;

    const json = (canvas as any).toJSON(EXTRA_PROPS);

    const saved: SavedDoc = {
      version: 1,
      name: docName.trim() || "Untitled",
      savedAt: new Date().toISOString(),
      fabricJson: json,
    };

    setDocs((prev) => [saved, ...prev]);
  };

  const handleLoadFromLocal = async (saved: SavedDoc) => {
    const canvas = getCanvas();
    if (!canvas) return;

    canvas.clear();

    await new Promise<void>((resolve) => {
      (canvas as any).loadFromJSON(saved.fabricJson, () => {
        canvas.getObjects().forEach((obj: any) => {
          obj.selectable = true;
          obj.evented = true;
          obj.hasControls = false;
          obj.hasBorders = false;

          // keep page rect non-editable
          if (obj.name === PAGE_NAME) {
            obj.selectable = false;
            obj.evented = false;
          }
          // keep PDF non-editable too
          if (obj.name === "PDF_PAGE") {
            obj.selectable = false;
            obj.evented = false;
          }
        });

        canvas.requestRenderAll();
        resolve();
      });
    });
  };

  const handleDeleteSaved = (idx: number) => {
    setDocs((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleExportJsonFile = () => {
    const canvas = getCanvas();
    if (!canvas) return;

    const json = (canvas as any).toJSON(EXTRA_PROPS);

    const payload: SavedDoc = {
      version: 1,
      name: docName.trim() || "Untitled",
      savedAt: new Date().toISOString(),
      fabricJson: json,
    };

    downloadJson(`${safeName}.json`, payload);
    setExportOpen(false);
  };

  const handleImportJsonFile = async (file: File) => {
    try {
      const text = await fileToText(file);
      const parsed = JSON.parse(text) as SavedDoc;

      if (!parsed || parsed.version !== 1 || !parsed.fabricJson) {
        alert("That file doesn't look like a valid saved document.");
        return;
      }

      setDocs((prev) => [parsed, ...prev]);
      await handleLoadFromLocal(parsed);
    } catch (e) {
      console.error(e);
      alert("Failed to import that file.");
    }
  };

  // -------- Downloads --------
  const handleDownloadPng = () => {
    const dataUrl = toPageDataUrl("png");
    if (!dataUrl) return;
    downloadDataUrl(`${safeName}.png`, dataUrl);
    setExportOpen(false);
  };

  const handleDownloadJpeg = () => {
    const dataUrl = toPageDataUrl("jpeg");
    if (!dataUrl) return;
    downloadDataUrl(`${safeName}.jpeg`, dataUrl);
    setExportOpen(false);
  };

  const handleDownloadPdf = async () => {
    const region = getA3Region();
    if (!region) return;

    const dataUrl = toPageDataUrl("png");
    if (!dataUrl) return;

    try {
      const mod = await import("jspdf");
      const jsPDF = mod.jsPDF;

      const isLandscape = region.orientation === "landscape";
      const pageWmm = isLandscape ? 420 : 297;
      const pageHmm = isLandscape ? 297 : 420;

      // ✅ Use explicit mm dimensions to avoid weird scaling
      const pdf = new jsPDF({
        unit: "mm",
        format: [pageWmm, pageHmm],
      });

      pdf.addImage(dataUrl, "PNG", 0, 0, pageWmm, pageHmm, undefined, "FAST");
      pdf.save(`${safeName}.pdf`);
      setExportOpen(false);
    } catch (err) {
      console.error(err);
      alert("PDF export needs jsPDF. Run: npm i jspdf");
    }
  };

  /**
   * ✅ FIXED PRINT A3 (Chrome-safe + correct sizing)
   * - open a blank tab immediately (prevents popup blocking)
   * - generate a true-A3 PDF with explicit mm page size
   * - navigate the opened tab to the blob URL
   * - user prints from the PDF viewer (reliable sizing)
   */
  const handlePrint = async () => {
    const region = getA3Region();
    if (!region) return;

    const dataUrl = toPageDataUrl("png");
    if (!dataUrl) return;

    // ✅ open synchronously (avoids popup blocker)
    const w = window.open("", "_blank");
    if (!w) {
      alert("Popup blocked. Allow popups to print.");
      return;
    }

    w.document.open();
    w.document.write(
      "<p style='font-family:system-ui;padding:16px'>Preparing A3 print…</p>"
    );
    w.document.close();

    try {
      const mod = await import("jspdf");
      const jsPDF = mod.jsPDF;

      const isLandscape = region.orientation === "landscape";
      const pageWmm = isLandscape ? 420 : 297;
      const pageHmm = isLandscape ? 297 : 420;

      const pdf = new jsPDF({
        unit: "mm",
        format: [pageWmm, pageHmm],
      });

      // ✅ force-fill the page in mm
      pdf.addImage(dataUrl, "PNG", 0, 0, pageWmm, pageHmm, undefined, "FAST");

      // bloburl is convenient for viewer printing
      const blobUrl = (pdf as any).output("bloburl") as string;

      // show the PDF in the already-open tab
      w.location.href = blobUrl;

      // Optional: you can auto-open print dialog (some browsers ignore it for PDFs)
      // setTimeout(() => { try { w.focus(); w.print(); } catch {} }, 900);
    } catch (err) {
      console.error(err);
      try {
        w.close();
      } catch {}
      alert("Print needs jsPDF. Run: npm i jspdf");
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.topBar}>
        <div style={styles.left}>
          <div style={styles.title}>Document</div>
          <input
            value={docName}
            onChange={(e) => setDocName(e.target.value)}
            style={styles.input}
            placeholder="Name…"
          />

          <button
            style={styles.btn}
            onClick={() => setSavedOpen((v) => !v)}
            title={savedOpen ? "Hide Saved list" : "Show Saved list"}
          >
            {savedOpen ? "Hide Saved" : "Show Saved"}
          </button>
        </div>

        <div style={styles.actions}>
          <button style={styles.btn} onClick={handleSaveToLocal}>
            Save
          </button>

          <div style={{ position: "relative" }} ref={exportMenuRef}>
            <button
              style={styles.btn}
              onClick={() => setExportOpen((v) => !v)}
              title="Download as PNG / JPEG / PDF"
            >
              Download ▾
            </button>

            {exportOpen && (
              <div style={styles.menu}>
                <button style={styles.menuItem} onClick={handleDownloadPng}>
                  PNG (.png)
                </button>
                <button style={styles.menuItem} onClick={handleDownloadJpeg}>
                  JPEG (.jpeg)
                </button>
                <button style={styles.menuItem} onClick={handleDownloadPdf}>
                  PDF A3 (.pdf)
                </button>
                <div style={styles.menuDivider} />
                <button style={styles.menuItem} onClick={handleExportJsonFile}>
                  Export JSON (.json)
                </button>
              </div>
            )}
          </div>

          <button style={styles.btn} onClick={() => fileInputRef.current?.click()}>
            Import .json
          </button>

          <button style={styles.btnPrimary} onClick={handlePrint}>
            Print A3
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImportJsonFile(f);
              e.currentTarget.value = "";
            }}
          />
        </div>
      </div>

      <div style={styles.body}>
        {savedOpen && (
          <div style={styles.sidebar}>
            <div style={styles.sidebarHeader}>
              <div style={styles.sidebarTitle}>Saved</div>
              <button style={styles.sidebarHideBtn} onClick={() => setSavedOpen(false)}>
                ✕
              </button>
            </div>

            {docs.length === 0 && <div style={styles.empty}>No saved docs yet.</div>}

            {docs.map((d, idx) => (
              <div key={`${d.savedAt}-${idx}`} style={styles.card}>
                <div style={styles.cardTop}>
                  <div style={styles.cardName}>{d.name}</div>
                  <div style={styles.cardDate}>{new Date(d.savedAt).toLocaleString()}</div>
                </div>

                <div style={styles.cardBtns}>
                  <button style={styles.smallBtn} onClick={() => handleLoadFromLocal(d)}>
                    Load
                  </button>
                  <button
                    style={styles.smallBtnDanger}
                    onClick={() => handleDeleteSaved(idx)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={styles.canvasArea}>
          <CanvasComponent />
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  page: { width: "100%", minHeight: "100vh", background: "#fff" },

  topBar: {
    position: "sticky",
    top: 0,
    zIndex: 50,
    display: "flex",
    gap: 12,
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 12px",
    borderBottom: "1px solid rgba(0,0,0,0.08)",
    background: "rgba(255,255,255,0.92)",
    backdropFilter: "blur(8px)",
  },

  left: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  title: { fontWeight: 800, fontSize: 14, color: "#222" },

  input: {
    height: 34,
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.18)",
    padding: "0 10px",
    outline: "none",
    fontSize: 14,
    minWidth: 220,
  },

  actions: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },

  btn: {
    height: 34,
    padding: "0 12px",
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.18)",
    background: "white",
    cursor: "pointer",
    fontWeight: 700,
  },

  btnPrimary: {
    height: 34,
    padding: "0 12px",
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.18)",
    background: "#0b5cff",
    color: "white",
    cursor: "pointer",
    fontWeight: 800,
  },

  body: { display: "flex", width: "100%" },

  sidebar: {
    width: 260,
    padding: 12,
    borderRight: "1px solid rgba(0,0,0,0.08)",
    background: "#fafafa",
  },

  sidebarHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  sidebarTitle: { fontWeight: 900, fontSize: 13 },

  sidebarHideBtn: {
    width: 32,
    height: 30,
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.18)",
    background: "white",
    cursor: "pointer",
    fontWeight: 900,
  },

  empty: { color: "#666", fontSize: 13 },

  card: {
    background: "white",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    boxShadow: "0 8px 18px rgba(0,0,0,0.06)",
  },

  cardTop: { display: "flex", flexDirection: "column", gap: 4 },
  cardName: { fontWeight: 900, fontSize: 13 },
  cardDate: { fontSize: 12, color: "#666" },

  cardBtns: { display: "flex", gap: 8, marginTop: 10 },

  smallBtn: {
    height: 30,
    padding: "0 10px",
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.18)",
    background: "white",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 12,
  },

  smallBtnDanger: {
    height: 30,
    padding: "0 10px",
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.18)",
    background: "white",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 12,
    color: "#b00020",
  },

  canvasArea: { flex: 1, minWidth: 0 },

  menu: {
    position: "absolute",
    right: 0,
    top: "calc(100% + 8px)",
    width: 200,
    background: "white",
    border: "1px solid rgba(0,0,0,0.12)",
    borderRadius: 12,
    boxShadow: "0 14px 30px rgba(0,0,0,0.14)",
    padding: 6,
    zIndex: 999,
  },

  menuItem: {
    width: "100%",
    textAlign: "left",
    padding: "10px 10px",
    borderRadius: 10,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontWeight: 800,
  },

  menuDivider: {
    height: 1,
    background: "rgba(0,0,0,0.08)",
    margin: "6px 6px",
  },
};

export default CanvasEditor;
