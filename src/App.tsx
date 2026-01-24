import React from 'react';
import { AppBar, Toolbar, Typography, Container } from '@mui/material';
import FabricCanvas from './components/Canvas';

function App() {
  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6">A3 Design Editor</Typography>
        </Toolbar>
      </AppBar>
      <Container style={{ marginTop: 20 }}>
        <Typography variant="h4" gutterBottom>
          Design Workspace
        </Typography>
        <FabricCanvas />
      </Container>
    </>
  );
}

export default App;