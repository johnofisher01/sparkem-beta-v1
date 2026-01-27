import React, { useRef, useEffect, useState, useCallback } from "react";
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

const CanvasComponent: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
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

  // --- helpers for toolbar ---
  const panBy = useCallback((dx: number, dy: number) => {
    const canvas = fabricCanvas.current;
    if (!canvas) return;

    const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
    vpt[4] += dx;
    vpt[5] += dy;
    canvas.setViewportTransform(vpt);
    canvas.requestRenderAll();
  }, []);

  const zoomBy = useCallback((delta: number) => {
    const canvas = fabricCanvas.current;
    if (!canvas) return;

    let zoom = canvas.getZoom();
    zoom = zoom + delta;

    if (zoom > 5) zoom = 5;
    if (zoom < 0.5) zoom = 0.5;

    // zoom around the canvas center
    const center = new Point(canvas.getWidth() / 2, canvas.getHeight() / 2);
    canvas.zoomToPoint(center, zoom);
    canvas.requestRenderAll();
  }, []);

  // --- keyboard: arrows pan, delete removes selected, space enables pan-anywhere ---
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        isSpaceDownRef.current = true;
        return;
      }

      const canvas = fabricCanvas.current;
      if (!canvas) return;

      // don’t hijack keys while typing
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

      // pan with arrows
      const step = e.shiftKey ? 60 : 25;
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

  // --- init fabric canvas + drag/drop ---
  useEffect(() => {
    if (fabricCanvas.current) return;
    if (!canvasRef.current) return;

    const canvas = new Canvas(canvasRef.current, {
      width: 1200,
      height: 800,
      backgroundColor: "#f3f3f3",
      selection: true,
    });

    canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
    fabricCanvas.current = canvas;

    // wheel zoom to cursor
    const handleZoom = (event: any) => {
      const e = event.e as WheelEvent;
      e.preventDefault();

      let zoom = canvas.getZoom();
      zoom *= 0.999 ** e.deltaY;

      if (zoom > 5) zoom = 5;
      if (zoom < 0.5) zoom = 0.5;

      canvas.zoomToPoint(new Point(e.offsetX, e.offsetY), zoom);
      canvas.requestRenderAll();
    };

    // pan: drag empty space OR Space+drag anywhere
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

    // shift+click rotate image
    const handleRotateOnShiftClick = (event: any) => {
      const e = event.e as MouseEvent;
      if (!e.shiftKey) return;

      const target = event.target as any;
      if (!target || target.type !== "image") return;

      target.rotate(((target.angle ?? 0) + 90) % 360);
      canvas.requestRenderAll();
    };

    canvas.on("mouse:wheel", handleZoom);
    canvas.on("mouse:down", handleMouseDown);
    canvas.on("mouse:move", handleMouseMove);
    canvas.on("mouse:up", handleMouseUp);
    canvas.on("mouse:down", handleRotateOnShiftClick);

    // drag/drop must be on Fabric upper canvas
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

      // ✅ icon size (change here)
      const TARGET_WIDTH = 30;
      const scale = TARGET_WIDTH / (img.width || 1);
      img.scale(scale);

      img.set({
        left: world.x,
        top: world.y,
        selectable: true,
        evented: true,
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

      canvas.off("mouse:wheel", handleZoom);
      canvas.off("mouse:down", handleMouseDown);
      canvas.off("mouse:move", handleMouseMove);
      canvas.off("mouse:up", handleMouseUp);
      canvas.off("mouse:down", handleRotateOnShiftClick);

      canvas.dispose();
      fabricCanvas.current = null;
    };
  }, []);

  // --- PDF upload ---
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

      // center + reset viewport
      const dx = (canvas.getWidth() - viewport.width) / 2;
      const dy = (canvas.getHeight() - viewport.height) / 2;
      canvas.setViewportTransform([1, 0, 0, 1, dx, dy]);

      canvas.requestRenderAll();
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

  // toolbar click handlers (don’t let clicks start selection on canvas)
  const PAN_STEP = 40;

  return (
    <div>
      <div style={styles.uploadSection}>
        <input
          type="file"
          accept="application/pdf"
          onChange={handlePdfUpload}
          style={styles.uploadInput}
        />
        <label style={styles.uploadLabel}>
          Drag background to pan (or Space+drag anywhere). Wheel zoom. Delete
          removes selected icon.
        </label>
      </div>

      <div style={styles.workspace}>
        <div style={styles.iconsContainer}>
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

        {/* Canvas wrapper is position:relative so toolbar can overlay */}
        <div style={styles.canvasWrap}>
          {/* Floating toolbar overlay */}
          <div
            style={styles.toolbar}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => e.preventDefault()}
          >
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

          <canvas ref={canvasRef} style={styles.canvas} />
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
    borderRadius: 6,
    border: "1px solid #ccc",
  },
  uploadLabel: {
    fontSize: 14,
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
    display: "flex",
    flexDirection: "column",
    gap: 10,
    borderRight: "1px solid #ccc",
    padding: 10,
    width: 200,
  },
  icon: {
    width: 40,
    height: 40,
    cursor: "grab",
    border: "1px solid #ccc",
    borderRadius: 4,
    padding: 4,
  },

  // wrapper so toolbar overlays without moving layout
  canvasWrap: {
    position: "relative",
    flex: 1,
  },

  canvas: {
    width: "100%",
    height: 800,
    border: "1px solid #999",
    borderRadius: 10,
    display: "block",
  },

  // floating toolbar
  toolbar: {
    position: "absolute",
    top: 12,
    left: 12,
    zIndex: 10,
    background: "rgba(255,255,255,0.9)",
    border: "1px solid rgba(0,0,0,0.15)",
    borderRadius: 12,
    padding: 10,
    boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    userSelect: "none",
  },

  midRow: {
    display: "flex",
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  zoomCol: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },

  btn: {
    width: 44,
    height: 36,
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.18)",
    background: "white",
    cursor: "pointer",
    fontSize: 14,
    lineHeight: "14px",
  },
};

export default CanvasComponent;
