# Maestro

Mesa para dirigir una historia línea por línea. La primera versión es la interfaz, sin modelo y sin claves: un manuscrito, un carrete de atención, cajas sobre palabras, un arco de tono y un cajón para el contexto que ya tenés.

## Qué se puede hacer

- Avanzar y rebobinar el playhead. Lo ya escrito vuelve desde caché. Una línea nueva se tipea en el momento.
- Fijar atención con doble clic sobre una palabra. La caja se arrastra, encaja en otra palabra y cambia de peso desde la esquina.
- Mover el arco entre dos polos (tierno / sombrío, suelta / tensa, Mara / narrador). Los chips de la derecha eligen el factor activo.
- Pegar o soltar documentos de personaje, saga, lore o notas. Maestro los parte en spans. Todavía no se envían a un modelo.

## Cómo correrlo

Hace falta Node y pnpm.

```bash
pnpm install
pnpm dev
```

La mesa abre en [http://localhost:3000](http://localhost:3000).

## Licencia

MIT. Ver [LICENSE](LICENSE).
