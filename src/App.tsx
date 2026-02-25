import React from "react";
import { AppBar, Toolbar, Typography } from "@mui/material";
import CanvasEditor from "./components/CanvasEditor";

function App() {
  return (
    <>
      {/* Header */}
      <AppBar position="static" style={{ backgroundColor: "#002d62" }}>
        <Toolbar>
          <Typography
            variant="h6"
            style={{ color: "#fff", flex: 1, textAlign: "center" }}
          >
            RJ Dorey Electrical Designs
          </Typography>
        </Toolbar>
      </AppBar>

      {/* ✅ No Container wrapper - canvas measures full viewport width correctly */}
      <div style={{ width: "100%", margin: 0, padding: 0 }}>
        <CanvasEditor />
      </div>
    </>
  );
}

export default App;
