import React, { useRef, useEffect, useState } from "react";
import { Canvas, FabricImage } from "fabric";
import * as pdfjsLib from "pdfjs-dist";

// Configure PDF.js Worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdf.worker.js`;

const DragAndDropCanvas: React.FC = () => {
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
    if (!canvasRef.current) return;

    const canvas = new Canvas(canvasRef.current, {
      width: 1100,
      height: 800,
      backgroundColor: "#f8f9fa",
    });
    fabricCanvas.current = canvas;

    return () => {
      if (fabricCanvas.current) {
        fabricCanvas.current.dispose();
        fabricCanvas.current = null;
      }
    };
  }, []);

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
      const page = await pdfDoc.getPage(1); // Load the first page only
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

      const pdfImage = await FabricImage.fromURL(dataUrl);
      pdfImage.selectable = false;
      canvas.backgroundImage = pdfImage;
      pdfImage.scaleToWidth(canvas.width);
      pdfImage.scaleToHeight(canvas.height);
      canvas.renderAll();
    } catch (error) {
      console.error("Failed to load PDF:", error);
      alert("Failed to load PDF.");
    }
  };

  const handleDragStart = (event: React.DragEvent<HTMLImageElement>, src: string) => {
    event.dataTransfer.setData("text/plain", src);
  };

  const handleDrop = async (event: React.DragEvent<HTMLCanvasElement>) => {
    const canvas = fabricCanvas.current;
    if (!canvas) return;

    const imageSrc = event.dataTransfer.getData("text/plain");

    try {
      const rect = canvas.lowerCanvasEl.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      const img = await FabricImage.fromURL(imageSrc);
      img.set({
        left: x,
        top: y,
        selectable: true,
      });
      canvas.add(img);
      canvas.renderAll();
    } catch (error) {
      console.error("Failed to place image on canvas:", error);
      alert("Failed to place icon on the canvas.");
    }

    event.preventDefault();
  };

  const handleDragOver = (event: React.DragEvent<HTMLCanvasElement>) => {
    event.preventDefault();
  };

  return (
    <div>
      <div style={{ marginBottom: "20px" }}>
        <input type="file" accept="application/pdf" onChange={handlePdfUpload} />
        <label>Upload a PDF</label>
      </div>

      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        {images.map((src, index) => (
          <img
            key={index}
            src={src}
            draggable
            onDragStart={(event) => handleDragStart(event, src)}
            style={{
              width: "35px",
              height: "35px",
              cursor: "grab",
              border: "1px solid #ccc",
              padding: "5px",
            }}
            alt={`Icon ${index}`}
          />
        ))}
      </div>

      <canvas
        ref={canvasRef}
        style={{ border: "1px solid black", width: "1100px", height: "800px" }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      />
    </div>
  );
};

// Fix for isolatedModules error
export {};