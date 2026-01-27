import React, { useRef, useEffect, useState } from "react";
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

  // Track Space key (optional pan override)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") isSpaceDownRef.current = true;
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
  }, []);

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

    // Wheel zoom (zoom to cursor)
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

    // ✅ Pan behavior:
    // - Drag empty space to pan
    // - OR hold Space and drag anywhere (even over an icon) to pan
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

    // Rotate dropped icons on Shift+Click
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

    // ✅ Drag/drop must bind to Fabric's *upper* canvas
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

      // DOM coords relative to upper canvas
      const rect = upper.getBoundingClientRect();
      const domX = (e.clientX ?? 0) - rect.left;
      const domY = (e.clientY ?? 0) - rect.top;

      // Convert DOM coords -> Fabric world coords (handles pan/zoom)
      const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
      const inv = fabricUtil.invertTransform(vpt);
      const world = fabricUtil.transformPoint(new Point(domX, domY), inv);

      const img = await FabricImage.fromURL(src, {
        crossOrigin: "anonymous",
      });

      // ✅ Set a consistent dropped size
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

  // PDF Upload
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
          canvas: pdfCanvas, // required by your typings
        } as any)
        .promise;

      const dataUrl = pdfCanvas.toDataURL("image/png");

      const pdfImage = await FabricImage.fromURL(dataUrl, {
        crossOrigin: "anonymous",
      });

      pdfImage.selectable = false;
      pdfImage.evented = false;

      canvas.backgroundImage = pdfImage;

      // Center PDF and reset zoom/pan
      const dx = (canvas.getWidth() - viewport.width) / 2;
      const dy = (canvas.getHeight() - viewport.height) / 2;
      canvas.setViewportTransform([1, 0, 0, 1, dx, dy]);

      canvas.requestRenderAll();
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
          Drag background to pan (or hold Space to pan anywhere). Wheel to zoom.
          Shift+Click icon to rotate.
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

        {/* Important: no React onDrop here; Fabric overlays an upper canvas */}
        <canvas ref={canvasRef} style={styles.canvas} />
      </div>
    </div>
  );
};

const styles = {
  uploadSection: {
    marginBottom: "20px",
    textAlign: "center" as const,
  },
  uploadInput: {
    padding: "10px",
    borderRadius: "5px",
    border: "1px solid #ccc",
  },
  uploadLabel: {
    fontSize: "14px",
    color: "#555",
    display: "block" as const,
    marginTop: "8px",
  },
  workspace: {
    display: "flex" as const,
    flexDirection: "row" as const,
    gap: "20px",
    marginTop: "20px",
    alignItems: "flex-start" as const,
  },
  iconsContainer: {
    display: "flex" as const,
    flexDirection: "column" as const,
    gap: "10px",
    borderRight: "1px solid #ccc",
    padding: "10px",
    width: "200px",
  },
  icon: {
    width: "40px",
    height: "40px",
    cursor: "grab",
    border: "1px solid #ccc",
    borderRadius: "4px",
    padding: "4px",
  },
  canvas: {
    flex: 1,
    border: "1px solid #999",
    borderRadius: "10px",
    height: "800px",
  },
};

export default CanvasComponent;
