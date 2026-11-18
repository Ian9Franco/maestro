# Maestro

Editor narrativo. El cursor marca dónde sigue la historia, los documentos de contexto dicen qué hay que recordar, y más adelante el modelo continúa desde ahí.

Esta base reemplaza la mesa anterior. El manuscrito es un documento de ProseMirror: se escribe con el teclado y se guarda en este navegador. Al abrirlo hay dos ejemplos, sin modelo: uno en blanco y otro ya empezado. Los personajes, el estilo y la inspiración son mock, y el texto gris muestra cómo seguiría según el cursor y las fichas.

Todo el control generativo pasa por el cursor:

- Arrastrar sobre los renglones vacíos genera después del cursor, una oración por renglón. Tab genera un tramo corto.
- Seleccionar con el mouse texto generado lo borra. El texto escrito a mano no se borra así. Lo siguiente retoma la idea con otras palabras.
- Doble clic en una palabra la conecta al punto de inserción, esté donde esté. Las manijas la estiran hacia atrás o hacia adelante.
- La columna de la izquierda muestra cuánto pesa cada párrafo en lo que sigue: más lo reciente, nada lo que está después del cursor, y en azul lo que trae una referencia.

El escritor es mock: una escena en pasos con varias redacciones por paso. El prompt que recibiría un modelo se ve en el panel. Un bloque generado y una referencia se guardan con un id dentro del documento, no con un índice de caracteres.

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
