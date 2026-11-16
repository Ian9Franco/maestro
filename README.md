# Maestro

Mesa para dirigir una historia línea por línea. La primera versión es la interfaz, sin modelo y sin claves: un manuscrito, un carrete de atención, cajas sobre palabras, curvas que salen del cursor y un cajón para el contexto que ya tenés.

## Qué se puede hacer

- Avanzar y rebobinar el playhead. Lo ya escrito vuelve desde caché. Una línea nueva se tipea en el momento.
- Fijar atención con doble clic sobre una palabra. La caja se arrastra, encaja en otra palabra y cambia de peso desde la esquina.
- Un clic en el punto abre el anillo de curvas del pasaje. Elegir una la despliega desde la cruz: el trazo rojo llega hasta la aguja y el rumbo queda en la columna. Arrastrar el punto sigue recortando hacia arriba y escribiendo hacia abajo.
- Las frases fijadas llegan al punto con línea continua. Una lectura que todavía no es rumbo llega punteada y, mientras se asienta, dice «realizado».
- Pegar o soltar documentos de personaje, saga, lore o notas. Maestro los parte en spans. Todavía no se envían a un modelo.

## Cómo correrlo

Hace falta Node y pnpm.

```bash
pnpm install
pnpm dev
```

La mesa abre en [http://localhost:3000](http://localhost:3000). En pantalla chica: barra superior con lecturas deslizables, cajón de prompt y contexto a pantalla completa, punto de escritura más grande y timeline con área segura del sistema.

## Licencia

MIT. Ver [LICENSE](LICENSE).
