import React, { useEffect } from "react";
import { Canvas, FabricImage } from "fabric";

interface IconDropHandlerProps {
  fabricCanvas: Canvas | null; // Pass the Fabric.js canvas instance
}

const IconDropHandler: React.FC<IconDropHandlerProps> = ({ fabricCanvas }) => {
  const icons = [
    "/images/ampage.png",
    "/images/bobble-legs.png",
    "/images/bobble.png",
    "/images/fork-bobble.png",
    "/images/fork1.png",
    "/images/fork2.png",
  ];

  useEffect(() => {
    if (!fabricCanvas) return;

    // On icon click, rotate by 90 degrees
    const handleIconClick = (icon: FabricImage) => {
      icon.rotate((icon.angle || 0) + 90); // Increment rotation
      fabricCanvas.renderAll(); // Update the canvas fully
    };

    // Add click listeners to icons on the canvas
    fabricCanvas.on("mouse:down", (event) => {
      const target = event.target as FabricImage;
      if (target && target.type === "image") {
        handleIconClick(target); // Rotate the clicked icon
      }
    });

    return () => {
      fabricCanvas.off("mouse:down"); // Cleanup event listener
    };
  }, [fabricCanvas]);

  const handleDragStart = (
    event: React.DragEvent<HTMLImageElement>,
    src: string
  ) => {
    event.dataTransfer.setData("text/plain", src); // Pass icon source to drop event
  };

  const handleDrop = async (event: React.DragEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    if (!fabricCanvas) return;

    const canvasRect = fabricCanvas.lowerCanvasEl.getBoundingClientRect();
    const x = event.clientX - canvasRect.left; // Map mouse position to canvas
    const y = event.clientY - canvasRect.top;

    const src = event.dataTransfer.getData("text/plain");
    const img = await FabricImage.fromURL(src); // Load image from source
    img.set({
      left: x, // Set drop position
      top: y,
      selectable: true, // Allow interaction
    });

    fabricCanvas.add(img); // Add the image to the canvas
    fabricCanvas.renderAll(); // Re-render canvas to persist state
  };

  const handleDragOver = (event: React.DragEvent<HTMLCanvasElement>) => {
    event.preventDefault(); // Allow drop
  };

  return (
    <div style={styles.iconsContainer}>
      {icons.map((src, index) => (
        <img
          key={index}
          src={src}
          draggable
          onDragStart={(event) => handleDragStart(event, src)}
          style={styles.icon}
          alt={`Icon ${index}`}
        />
      ))}
      <canvas
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        style={{ display: "none" }} // Dummy canvas for handling drop interactions
      />
    </div>
  );
};

const styles = {
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
    borderRadius: "5px",
  },
};

export default IconDropHandler;