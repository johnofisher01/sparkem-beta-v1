import React, { useEffect, useRef } from "react";
import { Canvas, FabricImage, Point } from "fabric";
import * as pdfjsLib from "pdfjs-dist";

// Configure PDF.js to use the locally hosted worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdf.worker.js`;

// Extend Fabric.js Canvas type
interface CustomFabricCanvas extends Canvas {
  isDragging?: boolean;
  lastPosX?: number;
  lastPosY?: number;
}

const FabricPdfCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fabricCanvas = useRef<CustomFabricCanvas | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    // Initialize Fabric.js canvas
    const canvas = new Canvas(canvasRef.current, {
      width: 1200,
      height: 800,
      backgroundColor: "#f3f3f3",
    }) as CustomFabricCanvas;

    fabricCanvas.current = canvas;

    // Zoom functionality
    const onWheel = (opt: any) => {
      const e = opt.e as WheelEvent;
      e.preventDefault();
      const delta = e.deltaY;
      let zoom = canvas.getZoom();
      zoom *= 0.999 ** delta;
      zoom = Math.max(0.5, Math.min(zoom, 3)); // Clamp between 0.5x and 3x

      const point = new Point(e.offsetX, e.offsetY); // Get pointer position relative to canvas
      canvas.zoomToPoint(point, zoom);
    };

    canvas.on("mouse:wheel", onWheel);

    // Panning with ALT + Drag
    const onMouseDown = (opt: any) => {
      const evt = opt.e as MouseEvent;
      if (evt.altKey) {
        canvas.isDragging = true;
        canvas.lastPosX = evt.clientX;
        canvas.lastPosY = evt.clientY;
        canvas.selection = false;
      }
    };

    const onMouseMove = (opt: any) => {
      if (!canvas.isDragging) return;
      const evt = opt.e as MouseEvent;
      const vpt = canvas.viewportTransform!;
      vpt[4] += evt.clientX - (canvas.lastPosX ?? evt.clientX);
      vpt[5] += evt.clientY - (canvas.lastPosY ?? evt.clientY);
      canvas.requestRenderAll();
      canvas.lastPosX = evt.clientX;
      canvas.lastPosY = evt.clientY;
    };

    const onMouseUp = () => {
      canvas.isDragging = false;
      canvas.selection = true;
    };

    canvas.on("mouse:down", onMouseDown);
    canvas.on("mouse:move", onMouseMove);
    canvas.on("mouse:up", onMouseUp);

    // Cleanup
    return () => {
      canvas.off("mouse:wheel", onWheel);
      canvas.off("mouse:down", onMouseDown);
      canvas.off("mouse:move", onMouseMove);
      canvas.off("mouse:up", onMouseUp);
      canvas.dispose();
      fabricCanvas.current = null;
    };
  }, []);

  const handlePdfUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const canvas = fabricCanvas.current;
    if (!canvas) return;

    const file = event.target.files?.[0];
    if (!file) {
      alert("No file selected!");
      return;
    }

    if (file.type !== "application/pdf") {
      alert("Invalid file type. Please upload a PDF.");
      return;
    }

    try {
      // Read the file as an ArrayBuffer
      const pdfData = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(new Error("Failed to read the PDF file"));
        reader.readAsArrayBuffer(file);
      });

      // Load the PDF document
      const pdfDoc = await pdfjsLib.getDocument({ data: pdfData }).promise;
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });

        // Render the PDF page on an offscreen canvas
        const pdfCanvas = document.createElement("canvas");
        pdfCanvas.width = viewport.width;
        pdfCanvas.height = viewport.height;
        const context = pdfCanvas.getContext("2d")!;
        await page.render({
          canvasContext: context,
          viewport,
          canvas: pdfCanvas, // Attach the offscreen canvas
        }).promise;

        // Convert the canvas to a Data URL
        const dataUrl = pdfCanvas.toDataURL("image/png");

        // Add the rendered page as an image on Fabric.js canvas
        const img = await FabricImage.fromURL(dataUrl);
        img.set({ left: 50, top: i * 100 }); // Position each page
        canvas.add(img);
      }

      canvas.requestRenderAll(); // Re-render the Fabric.js canvas
      console.log("PDF successfully rendered onto Fabric.js canvas!");
      event.target.value = ""; // Reset input value
    } catch (error) {
      console.error("Error processing the PDF:", error);
      alert("Failed to process the PDF.");
    }
  };

  return (
    <div>
      <label>
        Upload PDF
        <input
          type="file"
          hidden
          accept="application/pdf"
          onChange={handlePdfUpload}
        />
      </label>
      <canvas
        ref={canvasRef}
        style={{
          border: "1px solid black",
          width: "1200px",
          height: "800px",
        }}
      />
    </div>
  );
};

export default FabricPdfCanvas;