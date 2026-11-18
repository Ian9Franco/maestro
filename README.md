# Maestro

Editor narrativo. El cursor marca dónde sigue la historia, los documentos de contexto dicen qué hay que recordar, y más adelante el modelo continúa desde ahí.

Esta base reemplaza la mesa anterior. El manuscrito es un documento de ProseMirror: se escribe con el teclado y se guarda en este navegador. Al abrirlo hay dos ejemplos, sin modelo: uno en blanco y otro ya empezado. Los personajes, el estilo y la inspiración son mock, y el texto gris muestra cómo seguiría según el cursor y las fichas. Un bloque generado y una referencia se guardan con un id dentro del documento, no con un índice de caracteres.

## Cómo correrlo

Hace falta Node y pnpm.

```bash
pnpm install
pnpm dev
```

Abre [http://localhost:3000](http://localhost:3000).

```bash
pnpm test
pnpm build
```

## Licencia

MIT. Ver [LICENSE](LICENSE).
