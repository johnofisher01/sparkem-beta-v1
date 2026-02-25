import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Canvas,
  FabricImage,
  Point,
  TMat2D,
  util as fabricUtil,
  Rect,
} from "fabric";
import * as pdfjsLib from "pdfjs-dist";

declare global {
  interface Window {
    __fabricCanvas?: Canvas | null;
  }
}

declare module "fabric" {
  interface Canvas {
    isDragging?: boolean;
    lastPosX?: number;
    lastPosY?: number;
    viewportTransform: TMat2D;
  }
}

pdfjsLib.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdf.worker.js`;

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

// Fixed canvas height; width is measured from the DOM at runtime
const CANVAS_H = 700;

// A3 landscape at 150 DPI
const DPI = 150;
const MM_PER_INCH = 25.4;
const A3_W_PX = Math.round((420 / MM_PER_INCH) * DPI); // ~2480
const A3_H_PX = Math.round((297 / MM_PER_INCH) * DPI); // ~1754

const PAGE_NAME = "A3_PAGE";
const PDF_NAME = "PDF_PAGE";

const CanvasComponent: React.FC = () => {
  const fabricHostRef = useRef<HTMLDivElement | null>(null);
  const fabricCanvas = useRef<Canvas | null>(null);
  const isSpaceDownRef = useRef(false);

  const [images] = useState([
    "/images/ampage.png",
    "/images/bobble-legs.png",
    "/images/bobble.png",
    "/images/fork-bobble.png",
    "/images/fork1.png",
    "/images/fork2.png",
  ]);

  const [toolbarVisible, setToolbarVisible] = useState(true);
  const [toolbarPos, setToolbarPos] = useState({ x: 12, y: 12 });
  const dragRef = useRef({
    dragging: false,
    startX: 0,
    startY: 0,
    originX: 12,
    originY: 12,
  });

  const MIN_ZOOM = 0.02;
  const MAX_ZOOM = 12;

  const getPageRect = useCallback(() => {
    const canvas = fabricCanvas.current;
    if (!canvas) return null;
    return canvas.getObjects().find((o: any) => o?.name === PAGE_NAME) as any;
  }, []);

  const getPdfObj = useCallback(() => {
    const canvas = fabricCanvas.current;
    if (!canvas) return null;
    return canvas.getObjects().find((o: any) => o?.name === PDF_NAME) as any;
  }, []);

  const panBy = useCallback((dx: number, dy: number) => {
    const canvas = fabricCanvas.current;
    if (!canvas) return;
    const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
    vpt[4] += dx;
    vpt[5] += dy;
    canvas.setViewportTransform(vpt);
    canvas.requestRenderAll();
  }, []);

  const zoomTo = useCallback(
    (z: number) => {
      const canvas = fabricCanvas.current;
      if (!canvas) return;
      const next = clamp(z, MIN_ZOOM, MAX_ZOOM);
      const center = new Point(canvas.getWidth() / 2, canvas.getHeight() / 2);
      canvas.zoomToPoint(center, next);
      canvas.requestRenderAll();
    },
    [MIN_ZOOM, MAX_ZOOM]
  );

  const zoomBy = useCallback(
    (delta: number) => {
      const canvas = fabricCanvas.current;
      if (!canvas) return;
      zoomTo(canvas.getZoom() + delta);
    },
    [zoomTo]
  );

  /**
   * Fit the A3 page so it's fully visible and centered.
   * Because we now initialise the canvas at the host div's real clientWidth,
   * canvas.getWidth() is accurate and this calculation is correct.
   */
  const fitToA3Page = useCallback(() => {
    const canvas = fabricCanvas.current;
    if (!canvas) return;

    const padding = 50;
    const cw = canvas.getWidth() - padding * 2;
    const ch = canvas.getHeight() - padding * 2;

    const s = clamp(
      Math.min(cw / A3_W_PX, ch / A3_H_PX),
      MIN_ZOOM,
      MAX_ZOOM
    );

    const dx = padding + (cw - A3_W_PX * s) / 2;
    const dy = padding + (ch - A3_H_PX * s) / 2;

    canvas.setViewportTransform([s, 0, 0, s, dx, dy]);
    canvas.requestRenderAll();
  }, [MIN_ZOOM, MAX_ZOOM]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        isSpaceDownRef.current = true;
        return;
      }

      const canvas = fabricCanvas.current;
      if (!canvas) return;

      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      const isTyping =
        tag === "input" ||
        tag === "textarea" ||
        (e.target as any)?.isContentEditable;
      if (isTyping) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        const active: any = canvas.getActiveObject();
        if (active && active.name !== PAGE_NAME && active.name !== PDF_NAME) {
          canvas.remove(active);
          canvas.discardActiveObject();
          canvas.requestRenderAll();
          e.preventDefault();
        }
        return;
      }

      const step = e.shiftKey ? 80 : 35;
      if (e.key === "ArrowUp") { panBy(0, step); e.preventDefault(); }
      else if (e.key === "ArrowDown") { panBy(0, -step); e.preventDefault(); }
      else if (e.key === "ArrowLeft") { panBy(step, 0); e.preventDefault(); }
      else if (e.key === "ArrowRight") { panBy(-step, 0); e.preventDefault(); }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") isSpaceDownRef.current = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [panBy]);

  // Init Fabric
  useEffect(() => {
    if (fabricCanvas.current) return;
    if (!fabricHostRef.current) return;

    const hostEl = fabricHostRef.current;

    // ✅ THE FIX: delay by one tick so the host div has been painted
    // and hostEl.clientWidth reflects the real rendered width.
    // Previously the canvas was hardcoded to 1000px but rendered at ~900px,
    // so fitToA3Page calculated positions based on wrong dimensions.
    const initTimer = setTimeout(() => {
      const actualW = hostEl.clientWidth > 0 ? hostEl.clientWidth : 900;

      const el = document.createElement("canvas");
      el.width = actualW;
      el.height = CANVAS_H;
      el.style.width = "100%";
      el.style.height = `${CANVAS_H}px`;
      el.style.display = "block";
      hostEl.appendChild(el);

      const canvas = new Canvas(el, {
        width: actualW,
        height: CANVAS_H,
        backgroundColor: "#e9e9e9",
        selection: true,
      });

      canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
      fabricCanvas.current = canvas;
      (window as any).__fabricCanvas = canvas;

      canvas.selectionColor = "rgba(0,0,0,0)";
      canvas.selectionBorderColor = "rgba(0,0,0,0)";
      canvas.selectionLineWidth = 0;

      // White A3 page rect
      const pageRect = new Rect({
        left: 0,
        top: 0,
        width: A3_W_PX,
        height: A3_H_PX,
        fill: "#ffffff",
        stroke: "#c6c6c6",
        strokeWidth: 2,
        selectable: false,
        evented: false,
      }) as any;
      pageRect.name = PAGE_NAME;
      canvas.add(pageRect);

      // Canvas is properly sized now — fit immediately
      fitToA3Page();

      // ---- Click-to-rotate ----
      const clickState = {
        target: null as any,
        startX: 0,
        startY: 0,
        moved: false,
        shiftKey: false,
      };
      const THRESHOLD = 5;

      const onMouseDownRotate = (opt: any) => {
        const e = opt.e as MouseEvent;
        clickState.target = opt.target || null;
        clickState.startX = e.clientX;
        clickState.startY = e.clientY;
        clickState.moved = false;
        clickState.shiftKey = !!e.shiftKey;
      };

      const onMouseMoveRotate = (opt: any) => {
        if (!clickState.target) return;
        const e = opt.e as MouseEvent;
        if (
          Math.abs(e.clientX - clickState.startX) > THRESHOLD ||
          Math.abs(e.clientY - clickState.startY) > THRESHOLD
        ) {
          clickState.moved = true;
        }
      };

      const onMouseUpRotate = (opt: any) => {
        const target: any = opt.target || null;
        if (!clickState.target || target !== clickState.target || clickState.moved) return;
        if (target && target.type === "image" && target.name !== PDF_NAME) {
          const delta = clickState.shiftKey ? -90 : 90;
          target.rotate(((target.angle ?? 0) + delta + 360) % 360);
          canvas.requestRenderAll();
        }
      };

      canvas.on("mouse:down", onMouseDownRotate);
      canvas.on("mouse:move", onMouseMoveRotate);
      canvas.on("mouse:up", onMouseUpRotate);

      // ---- Wheel zoom ----
      const handleWheelZoom = (event: any) => {
        const e = event.e as WheelEvent;
        e.preventDefault();
        let zoom = canvas.getZoom();
        zoom *= 0.999 ** e.deltaY;
        zoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
        canvas.zoomToPoint(new Point(e.offsetX, e.offsetY), zoom);
        canvas.requestRenderAll();
      };

      // ---- Pan ----
      const handleMouseDownPan = (event: any) => {
        if (event.target && !isSpaceDownRef.current) return;
        const e = event.e as MouseEvent;
        canvas.isDragging = true;
        canvas.selection = false;
        canvas.defaultCursor = "grabbing";
        canvas.lastPosX = e.clientX;
        canvas.lastPosY = e.clientY;
      };

      const handleMouseMovePan = (event: any) => {
        if (!canvas.isDragging) return;
        const e = event.e as MouseEvent;
        const vpt = canvas.viewportTransform!;
        vpt[4] += e.clientX - (canvas.lastPosX ?? e.clientX);
        vpt[5] += e.clientY - (canvas.lastPosY ?? e.clientY);
        canvas.lastPosX = e.clientX;
        canvas.lastPosY = e.clientY;
        canvas.requestRenderAll();
      };

      const handleMouseUpPan = () => {
        canvas.isDragging = false;
        canvas.selection = true;
        canvas.defaultCursor = "default";
      };

      canvas.on("mouse:wheel", handleWheelZoom);
      canvas.on("mouse:down", handleMouseDownPan);
      canvas.on("mouse:move", handleMouseMovePan);
      canvas.on("mouse:up", handleMouseUpPan);

      // ---- Drag/drop icons ----
      const upper = canvas.upperCanvasEl;

      const onDragOver = (e: DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      };

      const onDrop = async (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const src = e.dataTransfer?.getData("text/plain");
        if (!src) return;

        const rect = upper.getBoundingClientRect();
        const domX = (e.clientX ?? 0) - rect.left;
        const domY = (e.clientY ?? 0) - rect.top;

        const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
        const inv = fabricUtil.invertTransform(vpt);
        const world = fabricUtil.transformPoint(new Point(domX, domY), inv);

        const img = await FabricImage.fromURL(src, { crossOrigin: "anonymous" });
        const scale = 30 / (img.width || 1);
        img.scale(scale);
        img.set({
          left: world.x,
          top: world.y,
          selectable: true,
          evented: true,
          hasBorders: false,
          hasControls: false,
        });

        canvas.add(img);
        canvas.setActiveObject(img);
        canvas.requestRenderAll();
      };

      upper.addEventListener("dragover", onDragOver);
      upper.addEventListener("drop", onDrop);

      // Store cleanup fn
      (canvas as any).__cleanup = () => {
        upper.removeEventListener("dragover", onDragOver);
        upper.removeEventListener("drop", onDrop);
        canvas.off("mouse:down", onMouseDownRotate);
        canvas.off("mouse:move", onMouseMoveRotate);
        canvas.off("mouse:up", onMouseUpRotate);
        canvas.off("mouse:wheel", handleWheelZoom);
        canvas.off("mouse:down", handleMouseDownPan);
        canvas.off("mouse:move", handleMouseMovePan);
        canvas.off("mouse:up", handleMouseUpPan);
        canvas.dispose();
        fabricCanvas.current = null;
        (window as any).__fabricCanvas = null;
        el.remove();
      };
    }, 0);

    return () => {
      clearTimeout(initTimer);
      const canvas = fabricCanvas.current;
      if (canvas && (canvas as any).__cleanup) {
        (canvas as any).__cleanup();
      }
    };
  }, [MIN_ZOOM, MAX_ZOOM, fitToA3Page]);

  // PDF upload
  const handlePdfUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const canvas = fabricCanvas.current;
    if (!canvas) return;

    const file = event.target.files?.[0];
    if (!file || file.type !== "application/pdf") {
      alert("Please upload a valid PDF file.");
      return;
    }

    try {
      const pdfData = await file.arrayBuffer();
      const pdfDoc = await pdfjsLib.getDocument({ data: pdfData }).promise;
      const page = await pdfDoc.getPage(1);

      const viewport = page.getViewport({ scale: 2 });
      const pdfCanvas = document.createElement("canvas");
      const ctx = pdfCanvas.getContext("2d");
      if (!ctx) throw new Error("No PDF canvas context");

      pdfCanvas.width = viewport.width;
      pdfCanvas.height = viewport.height;
      await page
        .render({ canvasContext: ctx, viewport, canvas: pdfCanvas } as any)
        .promise;

      const dataUrl = pdfCanvas.toDataURL("image/png");
      const pdfImage = await FabricImage.fromURL(dataUrl, {
        crossOrigin: "anonymous",
      });

      const oldPdf = getPdfObj();
      if (oldPdf) canvas.remove(oldPdf);

      (pdfImage as any).name = PDF_NAME;
      pdfImage.selectable = false;
      pdfImage.evented = false;

      const s = Math.min(
        A3_W_PX / (pdfImage.width || 1),
        A3_H_PX / (pdfImage.height || 1)
      );
      pdfImage.scale(s);
      pdfImage.set({
        left: (A3_W_PX - pdfImage.getScaledWidth()) / 2,
        top: (A3_H_PX - pdfImage.getScaledHeight()) / 2,
      });

      const pageRect: any = getPageRect();
      if (pageRect) {
        canvas.remove(pageRect);
        canvas.add(pageRect);
      }

      canvas.add(pdfImage);
      canvas.requestRenderAll();
      fitToA3Page();
    } catch (err) {
      console.error(err);
      alert("Failed to upload PDF.");
    }
  };

  const handleDragStart = (
    event: React.DragEvent<HTMLImageElement>,
    src: string
  ) => {
    event.dataTransfer.setData("text/plain", src);
    event.dataTransfer.effectAllowed = "copy";
  };

  // Toolbar drag
  const onToolbarMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button")) return;
    dragRef.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      originX: toolbarPos.x,
      originY: toolbarPos.y,
    };
    e.preventDefault();
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current.dragging) return;
      setToolbarPos({
        x: dragRef.current.originX + (e.clientX - dragRef.current.startX),
        y: dragRef.current.originY + (e.clientY - dragRef.current.startY),
      });
    };
    const onUp = () => {
      dragRef.current.dragging = false;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const PAN_STEP = 40;

  return (
    <div style={styles.page}>
      <div style={styles.uploadSection}>
        <input
          type="file"
          accept="application/pdf"
          onChange={handlePdfUpload}
          style={styles.uploadInput}
        />
        <label style={styles.uploadLabel}>
          Click icon to rotate 90°. Shift+Click rotates backwards. Drag to
          move. (Hold Space to pan anywhere)
        </label>
      </div>

      <div style={styles.workspace}>
        {/* Sidebar */}
        <div style={styles.iconsContainer}>
          <button
            type="button"
            style={{
              ...styles.navToggleBtn,
              ...(toolbarVisible
                ? styles.navToggleBtnOn
                : styles.navToggleBtnOff),
            }}
            onClick={() => setToolbarVisible((v) => !v)}
            title="Toggle navigation tool"
          >
            <span style={styles.navDot} />
            <span style={styles.navToggleText}>Nav</span>
          </button>
          <div style={{ height: 8 }} />
          {images.map((src, i) => (
            <img
              key={i}
              src={src}
              draggable
              onDragStart={(e) => handleDragStart(e, src)}
              style={styles.icon}
              alt={`Icon ${i}`}
              title="Drag onto page"
            />
          ))}
        </div>

        {/* Canvas area */}
        <div style={styles.canvasWrap}>
          <div ref={fabricHostRef} style={styles.fabricHost} />

          <div style={styles.overlay}>
            {toolbarVisible && (
              <div
                style={{
                  ...styles.toolbar,
                  left: toolbarPos.x,
                  top: toolbarPos.y,
                }}
                onMouseDown={onToolbarMouseDown}
              >
                <div style={styles.toolbarHeader}>
                  <div style={styles.toolbarTitleRow}>
                    <span style={styles.toolbarTitle}>Navigate</span>
                    <span style={styles.toolbarSub}>drag me</span>
                  </div>
                  <button
                    type="button"
                    style={styles.closeBtn}
                    onClick={() => setToolbarVisible(false)}
                  >
                    ✕
                  </button>
                </div>

                <button
                  type="button"
                  style={styles.btn}
                  onClick={() => panBy(0, PAN_STEP)}
                >
                  ▲
                </button>
                <div style={styles.midRow}>
                  <button
                    type="button"
                    style={styles.btn}
                    onClick={() => panBy(PAN_STEP, 0)}
                  >
                    ◀
                  </button>
                  <div style={styles.zoomCol}>
                    <button
                      type="button"
                      style={styles.btn}
                      onClick={() => zoomBy(0.2)}
                    >
                      🔍+
                    </button>
                    <button
                      type="button"
                      style={styles.btn}
                      onClick={() => zoomBy(-0.2)}
                    >
                      🔍-
                    </button>
                    <button
                      type="button"
                      style={styles.btnSmall}
                      onClick={fitToA3Page}
                    >
                      Fit
                    </button>
                  </div>
                  <button
                    type="button"
                    style={styles.btn}
                    onClick={() => panBy(-PAN_STEP, 0)}
                  >
                    ▶
                  </button>
                </div>
                <button
                  type="button"
                  style={styles.btn}
                  onClick={() => panBy(0, -PAN_STEP)}
                >
                  ▼
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  page: {
    width: "100%",
    overflowX: "hidden",
    margin: 0,
    padding: 0,
    background: "#1e1e1e",
  },

  uploadSection: {
    marginBottom: 16,
    textAlign: "center",
    padding: "16px 0",
    background: "#2d2d2d",
    borderBottom: "1px solid #3d3d3d",
  },
  uploadInput: {
    padding: "10px 16px",
    borderRadius: 6,
    border: "1px solid #4d4d4d",
    background: "#3d3d3d",
    color: "#e0e0e0",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
  },
  uploadLabel: {
    fontSize: 12,
    color: "#a0a0a0",
    display: "block",
    marginTop: 10,
    fontWeight: 400,
    letterSpacing: 0.3,
  },

  workspace: {
    display: "flex",
    flexDirection: "row",
    gap: 0,
    alignItems: "flex-start",
    width: "100%",
    padding: 0,
    margin: 0,
    background: "#1e1e1e",
  },

  iconsContainer: {
    width: 72,
    padding: "16px 8px",
    background: "#252525",
    borderRight: "1px solid #3d3d3d",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    alignItems: "center",
    flexShrink: 0,
    boxShadow: "2px 0 8px rgba(0,0,0,0.3)",
  },

  navToggleBtn: {
    height: 44,
    width: "100%",
    borderRadius: 8,
    border: "1px solid #4d4d4d",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 11,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "0 8px",
    transition: "all 0.2s ease",
    background: "#2d2d2d",
    color: "#e0e0e0",
  },
  navToggleBtnOn: {
    background: "linear-gradient(180deg, #3d5a80 0%, #2c4766 100%)",
    borderColor: "#4d6a90",
    color: "#ffffff",
  },
  navToggleBtnOff: {
    background: "#2d2d2d",
    opacity: 0.8,
  },
  navDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    background: "#5fa3ff",
    boxShadow: "0 0 0 2px rgba(95,163,255,0.2)",
  },
  navToggleText: { fontSize: 11, letterSpacing: 0.5, fontWeight: 700 },

  icon: {
    width: 52,
    height: 52,
    cursor: "pointer",
    border: "1px solid #4d4d4d",
    borderRadius: 8,
    padding: 8,
    background: "#3d3d3d",
    boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
    transition: "all 0.2s ease",
    filter: "brightness(1.4) contrast(1.2)",
  },

  canvasWrap: {
    position: "relative",
    width: "100%",
    margin: 0,
  },
  fabricHost: {
    width: "100%",
    height: 700,
    border: "1px solid #3d3d3d",
    overflow: "hidden",
    background: "#2a2a2a",
    boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
  },

  overlay: { position: "absolute", inset: 0, pointerEvents: "none" },

  toolbar: {
    pointerEvents: "auto",
    position: "absolute",
    zIndex: 10,
    width: 180,
    padding: 12,
    borderRadius: 8,
    border: "1px solid #4d4d4d",
    background: "rgba(45,45,45,0.98)",
    boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    userSelect: "none",
    cursor: "grab",
    backdropFilter: "blur(12px)",
  },

  toolbarHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingBottom: 8,
    borderBottom: "1px solid #3d3d3d",
  },
  toolbarTitleRow: {
    display: "flex",
    flexDirection: "column",
    lineHeight: 1.2,
  },
  toolbarTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "#e0e0e0",
    letterSpacing: 0.3,
  },
  toolbarSub: {
    fontSize: 10,
    color: "#888",
    fontWeight: 500,
    letterSpacing: 0.3,
  },

  closeBtn: {
    width: 32,
    height: 28,
    borderRadius: 6,
    border: "1px solid #4d4d4d",
    background: "#2d2d2d",
    color: "#e0e0e0",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
  },

  midRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  zoomCol: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },

  btn: {
    width: 48,
    height: 38,
    borderRadius: 6,
    border: "1px solid #4d4d4d",
    background: "#3d3d3d",
    color: "#e0e0e0",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
    boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
  },
  btnSmall: {
    width: 48,
    height: 32,
    borderRadius: 6,
    border: "1px solid #4d4d4d",
    background: "#3d3d3d",
    color: "#e0e0e0",
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.5,
    boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
  },
};

export default CanvasComponent;
