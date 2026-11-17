# Maestro

Mesa para dirigir una historia línea por línea. La primera versión es la interfaz, sin modelo y sin claves: un manuscrito, un carrete de atención, cajas sobre palabras, curvas que salen del cursor y un cajón para el contexto que ya tenés.

## Qué se puede hacer

- Arrastrar el circulito en el plano mezcla el vector de lo que sigue: tono en horizontal, foco en vertical y tensión según la distancia al centro. El anillo se pone rojo y grueso cuando hay más tensión. El texto nuevo se tiñe con ese color. El circulito no escribe ni borra.
- El playhead solo se mueve arrastrando la barra. Hacia atrás vacía el futuro: el circulito se apaga, el anillo pulsa y, al soltar, vuelve con el color de ese punto. Desde el final, hacia la derecha, escribe una oración.
- Fijar atención con doble clic o arrastrando sobre palabras. La caja y la línea punteada hacia el carrete usan el color del vector con el que se creó. Un check verde marca la oración que realizó tono, foco o tensión.
- Las lecturas que todavía no son rumbo llegan punteadas y, mientras se asientan, dicen «realizado».
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
