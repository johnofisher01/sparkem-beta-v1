import React, { useEffect, useRef } from "react";
import { Canvas, FabricImage, Point } from "fabric";

// Extend Fabric.js Canvas type to include custom properties
interface CustomFabricCanvas extends Canvas {
  isDragging?: boolean;
  lastPosX?: number;
  lastPosY?: number;
}

const FabricCanvasComponent: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fabricCanvas = useRef<CustomFabricCanvas | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    // Initialize the Fabric.js canvas
    const canvas = new Canvas(canvasRef.current, {
      width: 1200,
      height: 800,
      backgroundColor: "#f3f3f3",
    }) as CustomFabricCanvas;

    fabricCanvas.current = canvas;

    // Zoom with mouse wheel functionality
    const onWheel = (opt: any) => {
      const e = opt.e as WheelEvent;
      e.preventDefault();
      e.stopPropagation();

      const delta = e.deltaY;
      let zoom = canvas.getZoom();
      zoom *= 0.999 ** delta;
      zoom = Math.max(0.5, Math.min(zoom, 3)); // Clamp between 0.5x and 3x zoom

      const point = new Point(e.offsetX, e.offsetY);
      canvas.zoomToPoint(point, zoom);
    };

    canvas.on("mouse:wheel", onWheel);

    // Panning functionality (Alt + Mouse Drag)
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
      const vpt = canvas.viewportTransform;
      if (!vpt) return;

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

  // Handle File Upload and Add to Canvas
  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const canvas = fabricCanvas.current;
    if (!canvas) return;

    const file = event.target.files?.[0];
    if (!file) {
      alert("No file selected!");
      return;
    }

    // Ensure file is an image
    if (!file.type.startsWith("image/")) {
      alert("The selected file is not an image!");
      return;
    }

    console.log("Selected file:", file.name, "Type:", file.type);

    try {
      // Convert image file to Data URL
      const imageSrc = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
      });

      // Load image onto Fabric.js canvas
      const img = await FabricImage.fromURL(
        imageSrc, // The image's Data URL
        { crossOrigin: "anonymous" }, // Cross-origin handling
        { left: 100, top: 100 } // Default position for loaded image
      );

      canvas.add(img); // Add to canvas
      canvas.requestRenderAll(); // Render canvas

      // Allow re-uploading the same file
      event.target.value = "";
    } catch (error) {
      console.error("Failed to upload the image:", error);
      alert("Error uploading image. Please try again.");
    }
  };

  // Export the Fabric.js canvas as a PNG file
  const exportCanvas = () => {
    const canvas = fabricCanvas.current;
    if (!canvas) return;

    const dataURL = canvas.toDataURL({
      format: "png", // PNG format
      multiplier: 1, // Default scale
    });

    const link = document.createElement("a");
    link.href = dataURL;
    link.download = "design.png"; // File name for download
    link.click();
  };

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <button onClick={exportCanvas}>Export as PNG</button>
        <label style={{ cursor: "pointer" }}>
          Upload Image
          <input
            type="file"
            hidden
            accept=".png,image/png" // Explicitly allow PNG files
            onChange={handleUpload}
          />
        </label>
        <div style={{ marginLeft: "auto", opacity: 0.75 }}>
          Tip: Hold <b>Alt</b> + drag to pan, use the mouse wheel to zoom.
        </div>
      </div>

      {/* Canvas Container */}
      <canvas
        ref={canvasRef}
        style={{
          border: "1px solid black",
          display: "block",
          margin: "0 auto",
          width: "1200px",
          height: "800px",
        }}
      />
    </div>
  );
};

export default FabricCanvasComponent;