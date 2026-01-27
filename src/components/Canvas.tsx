import React, { useRef, useEffect, useState } from "react";
import { Canvas, FabricImage, Point, TMat2D } from "fabric";
import * as pdfjsLib from "pdfjs-dist";

// Extend Fabric.js Canvas type to include custom properties
declare module "fabric" {
  interface Canvas {
    isDragging?: boolean;
    lastPosX?: number;
    lastPosY?: number;
    viewportTransform: TMat2D; // Always defined transformation matrix
  }
}

// Configure PDF.js Worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdf.worker.js`;

const CanvasComponent: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fabricCanvas = useRef<Canvas | null>(null);

  const [images] = useState([
    "/images/ampage.png",
    "/images/bobble-legs.png",
    "/images/bobble.png",
    "/images/fork-bobble.png",
    "/images/fork1.png",
    "/images/fork2.png",
  ]);

  useEffect(() => {
    if (fabricCanvas.current) return; // Prevent reinitialization
    if (!canvasRef.current) return;

    // Initialize the Fabric.js canvas
    const canvas = new Canvas(canvasRef.current, {
      width: 1200,
      height: 800,
      backgroundColor: "#f3f3f3",
    });

    // Explicitly initialize the viewportTransform to identity matrix
    canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
    fabricCanvas.current = canvas;

    // Enable zoom functionality
    const handleZoom = (event: any) => {
      const e = event.e as WheelEvent;
      e.preventDefault();

      let zoom = canvas.getZoom();
      zoom *= 0.999 ** e.deltaY; // Zoom in or out smoothly

      // Updated zoom limits to allow zooming out further
      if (zoom > 5) zoom = 5; // Max zoom level
      if (zoom < 0.1) zoom = 0.1; // Minimum zoom level
      canvas.zoomToPoint(new Point(e.offsetX, e.offsetY), zoom);
    };

    // Drag-to-pan functionality for the viewport
    const handleMouseDown = (event: any) => {
      const e = event.e as MouseEvent;
      canvas.isDragging = true;
      canvas.selection = false;
      canvas.lastPosX = e.clientX;
      canvas.lastPosY = e.clientY;
    };

    const handleMouseMove = (event: any) => {
      if (canvas.isDragging) {
        const e = event.e as MouseEvent;
        const vpt = canvas.viewportTransform!;
        vpt[4] += e.clientX - canvas.lastPosX!;
        vpt[5] += e.clientY - canvas.lastPosY!;
        canvas.requestRenderAll();
        canvas.lastPosX = e.clientX;
        canvas.lastPosY = e.clientY;
      }
    };

    const handleMouseUp = () => {
      canvas.isDragging = false;
      canvas.selection = true;
    };

    // Attach event listeners
    canvas.on("mouse:wheel", handleZoom);
    canvas.on("mouse:down", handleMouseDown);
    canvas.on("mouse:move", handleMouseMove);
    canvas.on("mouse:up", handleMouseUp);

    // Cleanup logic: Dispose canvas on unmount
    return () => {
      canvas.off("mouse:wheel", handleZoom);
      canvas.off("mouse:down", handleMouseDown);
      canvas.off("mouse:move", handleMouseMove);
      canvas.off("mouse:up", handleMouseUp);
      canvas.dispose();
      fabricCanvas.current = null;
    };
  }, []);

  // Handle PDF Upload: Centers and scales the PDF inside the canvas
  const handlePdfUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const canvas = fabricCanvas.current!;
    const file = event.target.files?.[0];
    if (!file || file.type !== "application/pdf") {
      alert("Please upload a valid PDF file.");
      return;
    }

    try {
      const pdfData = await file.arrayBuffer();
      const pdfDoc = await pdfjsLib.getDocument({ data: pdfData }).promise;
      const page = await pdfDoc.getPage(1); // Load the first page only
      const viewport = page.getViewport({ scale: 1 });

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

      const pdfImage = await FabricImage.fromURL(dataUrl);
      pdfImage.selectable = false;

      // Calculate proper scaling and centering
      const scaleX = canvas.width / viewport.width;
      const scaleY = canvas.height / viewport.height;
      const minScale = Math.min(scaleX, scaleY); // Fit within canvas

      pdfImage.scale(minScale);
      const centerX = (canvas.width - viewport.width * minScale) / 2;
      const centerY = (canvas.height - viewport.height * minScale) / 2;

      canvas.viewportTransform = [minScale, 0, 0, minScale, centerX, centerY];
      canvas.add(pdfImage);
      canvas.requestRenderAll();
    } catch (error) {
      console.error("Error uploading PDF:", error);
      alert("Failed to upload PDF. Please try again.");
    }
  };

  const handleDragStart = (event: React.DragEvent<HTMLImageElement>, src: string) => {
    event.dataTransfer.setData("text/plain", src);
  };

  const handleDrop = async (event: React.DragEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const canvas = fabricCanvas.current!;
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const imageSrc = event.dataTransfer.getData("text/plain");
    const img = await FabricImage.fromURL(imageSrc);
    img.set({ left: x, top: y, selectable: true });
    canvas.add(img);
    canvas.renderAll();
  };

  const handleDragOver = (event: React.DragEvent<HTMLCanvasElement>) => {
    event.preventDefault();
  };

  return (
    <div>
      {/* PDF Upload Section */}
      <div style={styles.uploadSection}>
        <input type="file" accept="application/pdf" onChange={handlePdfUpload} style={styles.uploadInput} />
        <label style={styles.uploadLabel}>Upload a PDF</label>
      </div>
      {/* Workspace */}
      <div style={styles.workspace}>
        <div style={styles.iconsContainer}>
          {images.map((src, index) => (
            <img
              key={index}
              src={src}
              draggable
              onDragStart={(event) => handleDragStart(event, src)}
              style={styles.icon}
              alt={`Icon ${index}`}
            />
          ))}
        </div>
        <canvas
          ref={canvasRef}
          style={styles.canvas}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        />
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