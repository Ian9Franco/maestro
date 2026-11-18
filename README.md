# Maestro

Editor narrativo. El cursor marca dónde sigue la historia, los documentos de contexto dicen qué hay que recordar, y más adelante el modelo continúa desde ahí.

Esta base reemplaza la mesa anterior. El manuscrito es un documento de ProseMirror: se escribe con el teclado y se guarda en este navegador. Al abrirlo hay dos ejemplos, sin modelo: uno en blanco y otro ya empezado. Los personajes, el estilo y la inspiración son mock, y el texto gris muestra cómo seguiría según el cursor y las fichas.

Todo el control generativo pasa por el cursor:

- Un clic mueve el punto de inserción: ahí se escribe a mano, y la generación sigue después de ese párrafo. Clic en el punto abre el modo y las características (tensión, sorpresa, ritmo, distancia); arrastrarlo hacia una de ellas la sube o la baja.
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
pnpm typecheck
pnpm test
pnpm build
```

## Integración

Cada push a `main` y cada pull request corre [CI](.github/workflows/ci.yml): instala con el lockfile, y después `pnpm typecheck`, `pnpm test` y `pnpm build`. Si alguno falla, el check queda en rojo. No despliega.

El despliegue lo hace Vercel, que ya estaba conectado al repo. El proyecto es el Next de `apps/studio`. Un pull request publica un preview. Al mergear a `main`, Vercel publica producción en [maestro-ian9francos-projects.vercel.app](https://maestro-ian9francos-projects.vercel.app). Vercel compila con Node 26. El CI usa Node 22, la misma versión con la que se desarrollan las pruebas.

Antes de este workflow, un pull request solo mostraba el preview de Vercel y un aviso de CodeRabbit. CodeRabbit no revisa el repo porque tiene menos de 10 estrellas. Nadie ejecutaba los tipos ni las pruebas antes de mergear.

## Licencia

MIT. Ver [LICENSE](LICENSE).
