import React from "react";
import { AppBar, Toolbar, Typography, Container } from "@mui/material";
import CanvasEditor from "./components/CanvasEditor"; // ✅ NEW wrapper with save/load/print

function App() {
  return (
    <>
      {/* Professional Header */}
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

      {/* Main Content */}
      <Container style={{ marginTop: 20, maxWidth: "xl" as any }}>
        {/* ✅ Canvas Editor (includes toolbar + save/load/print) */}
        <CanvasEditor />
      </Container>
    </>
  );
}

export default App;
