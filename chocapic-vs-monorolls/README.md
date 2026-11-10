# Chocapic vs Mono Rolls

Página de una sola vista que compara ambos cereales con una escena 3D (Three.js) guiada por el scroll.

- Piezas modeladas de forma procedural (pétalos ondulados y rollos en espiral) con `InstancedMesh`.
- Bucle a 60 fps con `setAnimationLoop`, suavizado independiente del framerate y resolución adaptativa si los fps bajan.
- Respeta `prefers-reduced-motion`.

Abre `index.html` en un navegador (necesita conexión para cargar Three.js y las fuentes).
