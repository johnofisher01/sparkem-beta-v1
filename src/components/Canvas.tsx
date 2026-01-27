import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Canvas,
  FabricImage,
  Point,
  TMat2D,
  util as fabricUtil,
} from "fabric";
import * as pdfjsLib from "pdfjs-dist";

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

const CANVAS_W = 1200;
const CANVAS_H = 800;

const CanvasComponent: React.FC = () => {
  // ✅ React never renders a <canvas> node (Fabric mutates DOM). We give Fabric a host div.
  const fabricHostRef = useRef<HTMLDivElement | null>(null);
  const fabricCanvas = useRef<Canvas | null>(null);

  const isSpaceDownRef = useRef(false);
  const pdfViewportRef = useRef<{ width: number; height: number } | null>(null);

  // Sidebar icons
  const [images] = useState([
    "/images/ampage.png",
    "/images/bobble-legs.png",
    "/images/bobble.png",
    "/images/fork-bobble.png",
    "/images/fork1.png",
    "/images/fork2.png",
  ]);

  // Toolbar show/hide (also driven by sidebar toggle button)
  const [toolbarVisible, setToolbarVisible] = useState(true);

  // Draggable toolbar
  const [toolbarPos, setToolbarPos] = useState({ x: 12, y: 12 });
  const dragRef = useRef({
    dragging: false,
    startX: 0,
    startY: 0,
    originX: 12,
    originY: 12,
  });

  // Zoom limits
  const MIN_ZOOM = 0.05;
  const MAX_ZOOM = 8;

  // ---- helpers (pan/zoom) ----
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

  const fitToPdf = useCallback(() => {
    const canvas = fabricCanvas.current;
    const pdf = pdfViewportRef.current;
    if (!canvas || !pdf) return;

    const padding = 30;
    const cw = canvas.getWidth() - padding * 2;
    const ch = canvas.getHeight() - padding * 2;

    const scale = Math.min(cw / pdf.width, ch / pdf.height);
    const s = clamp(scale, MIN_ZOOM, MAX_ZOOM);

    const dx = (canvas.getWidth() - pdf.width * s) / 2;
    const dy = (canvas.getHeight() - pdf.height * s) / 2;

    canvas.setViewportTransform([s, 0, 0, s, dx, dy]);
    canvas.requestRenderAll();
  }, [MIN_ZOOM, MAX_ZOOM]);

  // ---- keyboard (delete, arrows pan, space pan override) ----
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        isSpaceDownRef.current = true;
        return;
      }

      const canvas = fabricCanvas.current;
      if (!canvas) return;

      // don't hijack typing
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      const isTyping =
        tag === "input" ||
        tag === "textarea" ||
        (e.target as any)?.isContentEditable;
      if (isTyping) return;

      // delete selected
      if (e.key === "Delete" || e.key === "Backspace") {
        const active = canvas.getActiveObject();
        if (active) {
          canvas.remove(active);
          canvas.discardActiveObject();
          canvas.requestRenderAll();
          e.preventDefault();
        }
        return;
      }

      // arrow pan
      const step = e.shiftKey ? 80 : 35;
      if (e.key === "ArrowUp") {
        panBy(0, step);
        e.preventDefault();
      } else if (e.key === "ArrowDown") {
        panBy(0, -step);
        e.preventDefault();
      } else if (e.key === "ArrowLeft") {
        panBy(step, 0);
        e.preventDefault();
      } else if (e.key === "ArrowRight") {
        panBy(-step, 0);
        e.preventDefault();
      }
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

  // ---- init Fabric (React never renders the canvas node) ----
  useEffect(() => {
    if (fabricCanvas.current) return;
    if (!fabricHostRef.current) return;

    const el = document.createElement("canvas");
    el.width = CANVAS_W;
    el.height = CANVAS_H;
    el.style.width = "100%";
    el.style.height = `${CANVAS_H}px`;
    el.style.display = "block";
    fabricHostRef.current.appendChild(el);

    const canvas = new Canvas(el, {
      width: CANVAS_W,
      height: CANVAS_H,
      backgroundColor: "#f3f3f3",
      selection: true,
    });

    canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
    fabricCanvas.current = canvas;

    // ✅ remove selection "blue boxes" globally (still selectable/movable)
    canvas.selectionColor = "rgba(0,0,0,0)";
    canvas.selectionBorderColor = "rgba(0,0,0,0)";
    canvas.selectionLineWidth = 0;

    // Wheel zoom (wide range)
    const handleWheelZoom = (event: any) => {
      const e = event.e as WheelEvent;
      e.preventDefault();

      let zoom = canvas.getZoom();
      zoom *= 0.999 ** e.deltaY;
      zoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);

      canvas.zoomToPoint(new Point(e.offsetX, e.offsetY), zoom);
      canvas.requestRenderAll();
    };

    // Pan: drag empty space OR Space+drag anywhere
    const handleMouseDown = (event: any) => {
      const clickedObject = !!event.target;
      const allowPan = !clickedObject || isSpaceDownRef.current;
      if (!allowPan) return;

      const e = event.e as MouseEvent;
      canvas.isDragging = true;
      canvas.selection = false;
      canvas.defaultCursor = "grabbing";
      canvas.lastPosX = e.clientX;
      canvas.lastPosY = e.clientY;
    };

    const handleMouseMove = (event: any) => {
      if (!canvas.isDragging) return;
      const e = event.e as MouseEvent;

      const vpt = canvas.viewportTransform!;
      vpt[4] += e.clientX - (canvas.lastPosX ?? e.clientX);
      vpt[5] += e.clientY - (canvas.lastPosY ?? e.clientY);
      canvas.lastPosX = e.clientX;
      canvas.lastPosY = e.clientY;
      canvas.requestRenderAll();
    };

    const handleMouseUp = () => {
      canvas.isDragging = false;
      canvas.selection = true;
      canvas.defaultCursor = "default";
    };

    canvas.on("mouse:wheel", handleWheelZoom);
    canvas.on("mouse:down", handleMouseDown);
    canvas.on("mouse:move", handleMouseMove);
    canvas.on("mouse:up", handleMouseUp);

    // Drag/drop on upper canvas
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

      // ✅ icon size
      const TARGET_WIDTH = 30; // change this anytime
      const scale = TARGET_WIDTH / (img.width || 1);
      img.scale(scale);

      img.set({
        left: world.x,
        top: world.y,
        selectable: true,
        evented: true,

        // ✅ remove blue selection border/handles for icons
        hasBorders: false,
        hasControls: false,
      });

      canvas.add(img);
      canvas.setActiveObject(img);
      canvas.requestRenderAll();
    };

    upper.addEventListener("dragover", onDragOver);
    upper.addEventListener("drop", onDrop);

    return () => {
      upper.removeEventListener("dragover", onDragOver);
      upper.removeEventListener("drop", onDrop);

      canvas.off("mouse:wheel", handleWheelZoom);
      canvas.off("mouse:down", handleMouseDown);
      canvas.off("mouse:move", handleMouseMove);
      canvas.off("mouse:up", handleMouseUp);

      canvas.dispose();
      fabricCanvas.current = null;
      el.remove();
    };
  }, [MIN_ZOOM, MAX_ZOOM]);

  // ---- PDF upload ----
  const handlePdfUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
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

      const viewport = page.getViewport({ scale: 1 });
      pdfViewportRef.current = { width: viewport.width, height: viewport.height };

      const pdfCanvas = document.createElement("canvas");
      const ctx = pdfCanvas.getContext("2d");
      if (!ctx) throw new Error("No PDF canvas context");

      pdfCanvas.width = viewport.width;
      pdfCanvas.height = viewport.height;

      await page
        .render({
          canvasContext: ctx,
          viewport,
          canvas: pdfCanvas,
        } as any)
        .promise;

      const dataUrl = pdfCanvas.toDataURL("image/png");
      const pdfImage = await FabricImage.fromURL(dataUrl, {
        crossOrigin: "anonymous",
      });

      pdfImage.selectable = false;
      pdfImage.evented = false;

      canvas.backgroundImage = pdfImage;
      canvas.requestRenderAll();

      // Auto-fit after upload
      requestAnimationFrame(() => fitToPdf());
    } catch (err) {
      console.error(err);
      alert("Failed to upload PDF.");
    }
  };

  // Sidebar drag start
  const handleDragStart = (
    event: React.DragEvent<HTMLImageElement>,
    src: string
  ) => {
    event.dataTransfer.setData("text/plain", src);
    event.dataTransfer.effectAllowed = "copy";
  };

  // ---- toolbar dragging ----
  const onToolbarMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button")) return; // clicking buttons shouldn't drag

    dragRef.current.dragging = true;
    dragRef.current.startX = e.clientX;
    dragRef.current.startY = e.clientY;
    dragRef.current.originX = toolbarPos.x;
    dragRef.current.originY = toolbarPos.y;
    e.preventDefault();
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current.dragging) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;

      setToolbarPos({
        x: dragRef.current.originX + dx,
        y: dragRef.current.originY + dy,
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
  }, [toolbarPos.x, toolbarPos.y]);

  const PAN_STEP = 40;

  return (
    <div>
      {/* Upload */}
      <div style={styles.uploadSection}>
        <input
          type="file"
          accept="application/pdf"
          onChange={handlePdfUpload}
          style={styles.uploadInput}
        />
        <label style={styles.uploadLabel}>
          Delete removes selected icon. Arrow keys pan. Space+drag pans anywhere.
        </label>
      </div>

      {/* Workspace */}
      <div style={styles.workspace}>
        {/* Sidebar */}
        <div style={styles.iconsContainer}>
          {/* ✅ Nav Tool toggle button */}
          <button
            type="button"
            style={{
              ...styles.navToggleBtn,
              ...(toolbarVisible ? styles.navToggleBtnOn : styles.navToggleBtnOff),
            }}
            onClick={() => setToolbarVisible((v) => !v)}
            aria-pressed={toolbarVisible}
            title="Toggle navigation tool"
          >
            <span style={styles.navDot} />
            Nav Tool
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
            />
          ))}
        </div>

        {/* Canvas + overlay UI */}
        <div style={styles.canvasWrap}>
          {/* Fabric host (Fabric injects canvases inside here) */}
          <div ref={fabricHostRef} style={styles.fabricHost} />

          {/* Overlay layer (doesn't affect layout, doesn't interfere with canvas except toolbar area) */}
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
                    title="Hide navigation tool"
                    onClick={() => setToolbarVisible(false)}
                  >
                    ✕
                  </button>
                </div>

                <button
                  type="button"
                  style={styles.btn}
                  title="Pan up"
                  onClick={() => panBy(0, PAN_STEP)}
                >
                  ▲
                </button>

                <div style={styles.midRow}>
                  <button
                    type="button"
                    style={styles.btn}
                    title="Pan left"
                    onClick={() => panBy(PAN_STEP, 0)}
                  >
                    ◀
                  </button>

                  <div style={styles.zoomCol}>
                    <button
                      type="button"
                      style={styles.btn}
                      title="Zoom in"
                      onClick={() => zoomBy(0.2)}
                    >
                      🔍+
                    </button>
                    <button
                      type="button"
                      style={styles.btn}
                      title={`Zoom out (min ${MIN_ZOOM})`}
                      onClick={() => zoomBy(-0.2)}
                    >
                      🔍-
                    </button>
                    <button
                      type="button"
                      style={styles.btnSmall}
                      title="Fit PDF"
                      onClick={fitToPdf}
                    >
                      Fit
                    </button>
                  </div>

                  <button
                    type="button"
                    style={styles.btn}
                    title="Pan right"
                    onClick={() => panBy(-PAN_STEP, 0)}
                  >
                    ▶
                  </button>
                </div>

                <button
                  type="button"
                  style={styles.btn}
                  title="Pan down"
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
  uploadSection: {
    marginBottom: 16,
    textAlign: "center",
  },
  uploadInput: {
    padding: 10,
    borderRadius: 8,
    border: "1px solid rgba(0,0,0,0.2)",
  },
  uploadLabel: {
    fontSize: 13,
    color: "#555",
    display: "block",
    marginTop: 8,
  },

  workspace: {
    display: "flex",
    flexDirection: "row",
    gap: 20,
    alignItems: "flex-start",
  },

  iconsContainer: {
    width: 220,
    padding: 10,
    borderRight: "1px solid #e0e0e0",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },

  navToggleBtn: {
    height: 40,
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.18)",
    cursor: "pointer",
    fontWeight: 700,
    letterSpacing: "0.2px",
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "0 12px",
    boxShadow: "0 4px 14px rgba(0,0,0,0.08)",
    transition: "transform 80ms ease, box-shadow 120ms ease",
  },
  navToggleBtnOn: {
    background: "linear-gradient(180deg, #ffffff 0%, #f1f7ff 100%)",
  },
  navToggleBtnOff: {
    background: "linear-gradient(180deg, #ffffff 0%, #f7f7f7 100%)",
    opacity: 0.85,
  },
  navDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: "#2f7cf6",
    boxShadow: "0 0 0 3px rgba(47,124,246,0.15)",
  },

  icon: {
    width: 40,
    height: 40,
    cursor: "grab",
    border: "1px solid #ccc",
    borderRadius: 6,
    padding: 4,
    background: "white",
  },

  canvasWrap: {
    position: "relative",
    flex: 1,
  },

  // Fabric host gets the border + radius, Fabric canvases sit inside it
  fabricHost: {
    width: "100%",
    height: CANVAS_H,
    border: "1px solid #999",
    borderRadius: 12,
    overflow: "hidden",
    background: "#f3f3f3",
  },

  // Overlay sits on top, doesn't block canvas except where toolbar is
  overlay: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
  },

  toolbar: {
    pointerEvents: "auto",
    position: "absolute",
    zIndex: 10,
    width: 170,
    padding: 10,
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.15)",
    background: "rgba(255,255,255,0.92)",
    boxShadow: "0 8px 22px rgba(0,0,0,0.14)",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    userSelect: "none",
    cursor: "grab",
    backdropFilter: "blur(6px)",
  },

  toolbarHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },

  toolbarTitleRow: {
    display: "flex",
    flexDirection: "column",
    lineHeight: 1.1,
  },

  toolbarTitle: {
    fontSize: 12,
    fontWeight: 800,
    color: "#222",
  },

  toolbarSub: {
    fontSize: 11,
    color: "#666",
    fontWeight: 600,
  },

  closeBtn: {
    width: 34,
    height: 30,
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.18)",
    background: "white",
    cursor: "pointer",
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
    width: 44,
    height: 36,
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.18)",
    background: "white",
    cursor: "pointer",
    fontSize: 14,
  },

  btnSmall: {
    width: 44,
    height: 30,
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.18)",
    background: "white",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 800,
  },
};

export default CanvasComponent;
