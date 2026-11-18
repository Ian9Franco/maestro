# Maestro

Editor narrativo. El cursor marca dónde sigue la historia, los documentos de contexto dicen qué hay que recordar, y más adelante el modelo continúa desde ahí.

Esta base reemplaza la mesa anterior. El manuscrito es un documento de ProseMirror: se escribe con el teclado y se guarda en este navegador. Al abrirlo hay dos ejemplos, sin modelo: uno en blanco y otro ya empezado. Los personajes, el estilo y la inspiración son mock, y el texto gris muestra cómo seguiría según el cursor y las fichas.

Todo el control generativo pasa por el cursor:

- Hay dos modos. En generar, arrastrar el texto gris acepta la propuesta hasta esa oración, y arrastrar sobre texto generado lo borra. El punto azul se queda donde se generó por última vez: el clic no lo mueve.
- En contexto, el doble clic marca una palabra y esconde la propuesta. Las marcas se unen con una línea al punto de inserción. El texto nuevo entra siempre en su propio párrafo, nunca en medio de una palabra.
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
