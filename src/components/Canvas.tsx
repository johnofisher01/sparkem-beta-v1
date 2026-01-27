// Canvas.tsx
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
  // Fabric host (React never renders <canvas> directly)
  const fabricHostRef = useRef<HTMLDivElement | null>(null);
  const fabricCanvas = useRef<Canvas | null>(null);

  const isSpaceDownRef = useRef(false);

  // Sidebar icons
  const [images] = useState([
    "/images/ampage.png",
    "/images/bobble-legs.png",
    "/images/bobble.png",
    "/images/fork-bobble.png",
    "/images/fork1.png",
    "/images/fork2.png",
  ]);

  // Nav Tool toggle
  const [toolbarVisible, setToolbarVisible] = useState(true);

  // Draggable toolbar position
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

  // ---------------------------------------
  // Pan / Zoom helpers
  // ---------------------------------------
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

  // ✅ Fit uses Fabric backgroundImage real size (matches your "image 2" feel)
  const fitToPdf = useCallback(() => {
    const canvas = fabricCanvas.current;
    if (!canvas) return;

    const bg = canvas.backgroundImage as any;
    if (!bg) return;

    const bgW = (bg.width || 1) * (bg.scaleX || 1);
    const bgH = (bg.height || 1) * (bg.scaleY || 1);

    // ✅ leave room on the RIGHT so the PDF isn't hidden behind the nav tool
    const paddingLeft = 20;
    const paddingTop = 20;
    const paddingBottom = 20;
    const paddingRight = toolbarVisible ? 240 : 20; // room for floating nav tool

    const cw = canvas.getWidth() - paddingLeft - paddingRight;
    const ch = canvas.getHeight() - paddingTop - paddingBottom;

    const s = clamp(Math.min(cw / bgW, ch / bgH), MIN_ZOOM, MAX_ZOOM);

    const dx = paddingLeft + (cw - bgW * s) / 2;
    const dy = paddingTop + (ch - bgH * s) / 2;

    canvas.setViewportTransform([s, 0, 0, s, dx, dy]);
    canvas.requestRenderAll();
  }, [MIN_ZOOM, MAX_ZOOM, toolbarVisible]);

  // Re-fit when nav tool is shown/hidden so right padding updates
  useEffect(() => {
    // small delay so layout settles
    const t = window.setTimeout(() => fitToPdf(), 0);
    return () => window.clearTimeout(t);
  }, [toolbarVisible, fitToPdf]);

  // ---------------------------------------
  // Keyboard: delete removes selected, arrows pan, space = pan-anywhere override
  // ---------------------------------------
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        isSpaceDownRef.current = true;
        return;
      }

      const canvas = fabricCanvas.current;
      if (!canvas) return;

      // don't hijack keys while typing
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      const isTyping =
        tag === "input" ||
        tag === "textarea" ||
        (e.target as any)?.isContentEditable;
      if (isTyping) return;

      // delete selected object
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

  // ---------------------------------------
  // Init Fabric (React never owns the <canvas> DOM)
  // ---------------------------------------
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

    // Remove global selection visuals
    canvas.selectionColor = "rgba(0,0,0,0)";
    canvas.selectionBorderColor = "rgba(0,0,0,0)";
    canvas.selectionLineWidth = 0;

    // ✅ Click-to-rotate (no rotate on drag)
    const clickState = {
      target: null as any,
      startX: 0,
      startY: 0,
      moved: false,
      shiftKey: false,
    };
    const CLICK_MOVE_THRESHOLD = 5;

    const onMouseDownRotateGate = (opt: any) => {
      const e = opt.e as MouseEvent;
      clickState.target = opt.target || null;
      clickState.startX = e.clientX;
      clickState.startY = e.clientY;
      clickState.moved = false;
      clickState.shiftKey = !!e.shiftKey;
    };

    const onMouseMoveRotateGate = (opt: any) => {
      if (!clickState.target) return;
      const e = opt.e as MouseEvent;
      const dx = Math.abs(e.clientX - clickState.startX);
      const dy = Math.abs(e.clientY - clickState.startY);
      if (dx > CLICK_MOVE_THRESHOLD || dy > CLICK_MOVE_THRESHOLD) {
        clickState.moved = true;
      }
    };

    const onMouseUpRotateGate = (opt: any) => {
      const target = opt.target || null;
      if (!clickState.target) return;
      if (target !== clickState.target) return;
      if (clickState.moved) return;

      if (target && target.type === "image") {
        const delta = clickState.shiftKey ? -90 : 90;
        target.rotate(((target.angle ?? 0) + delta + 360) % 360);
        canvas.requestRenderAll();
      }
    };

    canvas.on("mouse:down", onMouseDownRotateGate);
    canvas.on("mouse:move", onMouseMoveRotateGate);
    canvas.on("mouse:up", onMouseUpRotateGate);

    // Wheel zoom
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
    const handleMouseDownPan = (event: any) => {
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

      const TARGET_WIDTH = 30;
      const scale = TARGET_WIDTH / (img.width || 1);
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

    return () => {
      upper.removeEventListener("dragover", onDragOver);
      upper.removeEventListener("drop", onDrop);

      canvas.off("mouse:down", onMouseDownRotateGate);
      canvas.off("mouse:move", onMouseMoveRotateGate);
      canvas.off("mouse:up", onMouseUpRotateGate);

      canvas.off("mouse:wheel", handleWheelZoom);
      canvas.off("mouse:down", handleMouseDownPan);
      canvas.off("mouse:move", handleMouseMovePan);
      canvas.off("mouse:up", handleMouseUpPan);

      canvas.dispose();
      fabricCanvas.current = null;
      el.remove();
    };
  }, [MIN_ZOOM, MAX_ZOOM]);

  // ---------------------------------------
  // PDF upload (sharp + auto-fit)
  // ---------------------------------------
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

      const RENDER_SCALE = 2;
      const viewport = page.getViewport({ scale: RENDER_SCALE });

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
      pdfImage.scaleX = 1;
      pdfImage.scaleY = 1;

      canvas.backgroundImage = pdfImage;
      canvas.requestRenderAll();

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

  // ---------------------------------------
  // Toolbar dragging
  // ---------------------------------------
  const onToolbarMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button")) return;

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
    <div style={styles.page}>
      <div style={styles.uploadSection}>
        <input
          type="file"
          accept="application/pdf"
          onChange={handlePdfUpload}
          style={styles.uploadInput}
        />
        <label style={styles.uploadLabel}>
          Click icon to rotate 90°. Shift+Click rotates backwards. Drag to move.
        </label>
      </div>

      <div style={styles.workspace}>
        {/* ✅ Slim sidebar (removes the big wasted area) */}
        <div style={styles.iconsContainer}>
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
              title="Drag onto PDF"
            />
          ))}
        </div>

        {/* Canvas + overlay */}
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
                      title="Zoom out"
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
  page: {
    width: "100%",
    maxWidth: "100vw",
    overflowX: "hidden",
  },

  uploadSection: { marginBottom: 12, textAlign: "center" },
  uploadInput: {
    padding: 10,
    borderRadius: 8,
    border: "1px solid rgba(0,0,0,0.2)",
    background: "white",
  },
  uploadLabel: {
    fontSize: 13,
    color: "#555",
    display: "block",
    marginTop: 8,
  },

  // ✅ smaller gap so sidebar doesn't eat space
  workspace: {
    display: "flex",
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    width: "100%",
  },

  // ✅ slim sidebar
  iconsContainer: {
    width: 86,
    padding: 8,
    borderRight: "1px solid #e0e0e0",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    alignItems: "center",
    flexShrink: 0,
  },

  navToggleBtn: {
    height: 40,
    width: "100%",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.18)",
    cursor: "pointer",
    fontWeight: 800,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: "0 10px",
    boxShadow: "0 4px 14px rgba(0,0,0,0.08)",
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
  navToggleText: {
    fontSize: 13,
    letterSpacing: 0.2,
  },

  // ✅ slightly bigger icons but tighter layout
  icon: {
    width: 46,
    height: 46,
    cursor: "grab",
    border: "1px solid #ccc",
    borderRadius: 12,
    padding: 6,
    background: "white",
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
  },

  // ✅ minWidth:0 is IMPORTANT so flex lets it expand properly
  canvasWrap: { position: "relative", flex: 1, minWidth: 0 },

  fabricHost: {
    width: "100%",
    height: CANVAS_H,
    border: "1px solid #999",
    borderRadius: 12,
    overflow: "hidden",
    background: "#f3f3f3",
  },

  overlay: { position: "absolute", inset: 0, pointerEvents: "none" },

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

  toolbarTitleRow: { display: "flex", flexDirection: "column", lineHeight: 1.1 },
  toolbarTitle: { fontSize: 12, fontWeight: 800, color: "#222" },
  toolbarSub: { fontSize: 11, color: "#666", fontWeight: 600 },

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

  zoomCol: { display: "flex", flexDirection: "column", gap: 6 },

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
