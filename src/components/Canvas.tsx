import React, { useEffect, useRef, useState } from "react";
import { Canvas, FabricImage, Point } from "fabric";
import * as pdfjsLib from "pdfjs-dist";

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdf.worker.js`;

// Extend Fabric.js Canvas type
interface CustomFabricCanvas extends Canvas {
  isDragging?: boolean;
  lastPosX?: number;
  lastPosY?: number;
}

const CanvasComponent: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fabricCanvas = useRef<CustomFabricCanvas | null>(null);

  // Draggable image assets
  const [images] = useState<string[]>([
    "/images/ampage.png",
    "/images/bobble-legs.png",
    "/images/bobble.png",
    "/images/fork-bobble.png",
    "/images/fork1.png",
    "/images/fork2.png",
  ]);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new Canvas(canvasRef.current, {
      width: 1200,
      height: 800,
      backgroundColor: "#f3f3f3",
    }) as CustomFabricCanvas;

    fabricCanvas.current = canvas;

    // Add zoom functionality
    const onWheel = (opt: any) => {
      const e = opt.e as WheelEvent;
      e.preventDefault();

      let zoom = canvas.getZoom();
      zoom *= 0.999 ** e.deltaY;

      // Allow zoom levels from 0.01x to 100x
      zoom = Math.max(0.01, Math.min(zoom, 100));
      const point = new Point(e.offsetX, e.offsetY);
      canvas.zoomToPoint(point, zoom);
    };

    canvas.on("mouse:wheel", onWheel);

    // Add panning functionality
    const onMouseDown = (opt: any) => {
      const evt = opt.e as MouseEvent;
      if (evt.altKey) {
        canvas.isDragging = true;
        canvas.selection = false;
        canvas.lastPosX = evt.clientX;
        canvas.lastPosY = evt.clientY;
      }
    };

    const onMouseMove = (opt: any) => {
      if (!canvas.isDragging) return;
      const e = opt.e as MouseEvent;
      const vpt = canvas.viewportTransform!;
      vpt[4] += e.clientX - (canvas.lastPosX || 0);
      vpt[5] += e.clientY - (canvas.lastPosY || 0);
      canvas.lastPosX = e.clientX;
      canvas.lastPosY = e.clientY;
      canvas.requestRenderAll();
    };

    const onMouseUp = () => {
      canvas.isDragging = false;
      canvas.selection = true;
    };

    canvas.on("mouse:down", onMouseDown);
    canvas.on("mouse:move", onMouseMove);
    canvas.on("mouse:up", onMouseUp);

    // Cleanup on unmount
    return () => {
      canvas.off("mouse:wheel", onWheel);
      canvas.off("mouse:down", onMouseDown);
      canvas.off("mouse:move", onMouseMove);
      canvas.off("mouse:up", onMouseUp);
      canvas.dispose();
      fabricCanvas.current = null;
    };
  }, []);

  // Handle PDF Upload
  const handlePdfUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const canvas = fabricCanvas.current;
    if (!canvas) return;

    const file = event.target.files?.[0];
    if (!file || file.type !== "application/pdf") {
      alert("Please upload a valid PDF.");
      return;
    }

    try {
      const pdfData = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(new Error("Failed to read file input"));
        reader.readAsArrayBuffer(file);
      });

      const pdfDoc = await pdfjsLib.getDocument({ data: pdfData }).promise;

      let pdfWidth = 0;
      let pdfHeight = 0;

      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });

        const pdfCanvas = document.createElement("canvas");
        const context = pdfCanvas.getContext("2d")!;
        pdfCanvas.width = viewport.width;
        pdfCanvas.height = viewport.height;

        await page.render({
          canvasContext: context,
          viewport,
          canvas: pdfCanvas,
        }).promise;

        const dataUrl = pdfCanvas.toDataURL("image/png");
        const img = await FabricImage.fromURL(dataUrl);
        img.set({ left: 50, top: i * 100 });
        canvas.add(img);

        pdfWidth = Math.max(pdfWidth, viewport.width);
        pdfHeight += viewport.height;
      }

      const scaleFactor = Math.min(canvas.width / pdfWidth, canvas.height / pdfHeight);
      canvas.setZoom(scaleFactor / 2);

      const vpt = canvas.viewportTransform!;
      vpt[4] = (canvas.width - pdfWidth * scaleFactor) / 2;
      vpt[5] = (canvas.height - pdfHeight * scaleFactor) / 2;
      canvas.setViewportTransform(vpt);
      canvas.requestRenderAll();
    } catch (error) {
      console.error("Error processing the uploaded PDF:", error);
      alert("Failed to process PDF.");
    }
  };

  // Handle image drag start
  const handleDragStart = (event: React.DragEvent<HTMLImageElement>, imageSrc: string) => {
    event.dataTransfer.setData("text/plain", imageSrc);
  };

  // Handle image drop onto canvas
  const handleDrop = async (event: React.DragEvent<HTMLCanvasElement>) => {
    const canvas = fabricCanvas.current;
    if (!canvas) return;

    const imageSrc = event.dataTransfer.getData("text/plain");
    try {
      const img = await FabricImage.fromURL(imageSrc);
      img.set({ left: event.clientX, top: event.clientY, selectable: true });
      canvas.add(img);

      // Enable rotation on click
      img.on("mousedown", () => {
        img.rotate((img.angle || 0) + 90);
        canvas.requestRenderAll();
      });

      canvas.requestRenderAll();
    } catch (error) {
      console.error("Error loading image:", error);
    }

    event.preventDefault();
  };

  // Allow drag-over
  const handleDragOver = (event: React.DragEvent<HTMLCanvasElement>) => {
    event.preventDefault();
  };

  return (
    <div>
      {/* Title and PDF Upload */}
      <div style={{ marginBottom: "20px", display: "flex", alignItems: "center" }}>
        <input
          type="file"
          accept="application/pdf"
          onChange={handlePdfUpload}
          style={{ marginRight: "10px", padding: "4px" }}
        />
      </div>

      {/* Layout: Icons and Canvas */}
      <div style={{ display: "flex" }}>
        {/* Icons Panel */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            padding: "5px", // Compact padding for left-side icons
          }}
        >
          {images.map((src, index) => (
            <img
              key={index}
              src={src}
              draggable
              onDragStart={(event) => handleDragStart(event, src)}
              style={{
                width: "25px",
                height: "25px",
                cursor: "grab",
                border: "1px solid rgba(0, 0, 0, 0.5)",
                borderRadius: "2px", // Slightly rounded icons
              }}
              alt={`Draggable Item ${index}`}
            />
          ))}
        </div>

        {/* Canvas */}
        <canvas
          ref={canvasRef}
          style={{
            border: "1px solid black",
            width: "100%",
            maxWidth: "1200px",
            height: "800px",
          }}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        />
      </div>
    </div>
  );
};

export default CanvasComponent;