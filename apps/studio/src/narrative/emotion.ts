/**
 * Color de la columna lateral. Cada párrafo se tiñe según la emoción que domina su texto.
 * El peso sigue siendo cuánto de ese párrafo entra en lo que sigue.
 */
export const EMOTIONS = [
  { id: "accion", name: "Acción", color: "#ff5c33" },
  { id: "tension", name: "Tensión", color: "#ffb020" },
  { id: "noir", name: "Noir", color: "#9eb7ff" },
  { id: "introspeccion", name: "Introspección", color: "#c084fc" },
  { id: "atmosfera", name: "Atmósfera", color: "#5ec8c5" },
  { id: "humor", name: "Humor", color: "#e6d35a" },
] as const;

export type EmotionId = (typeof EMOTIONS)[number]["id"];

const CUES: Record<EmotionId, string[]> = {
  accion: ["golpe", "salt", "corr", "pate", "paso", "físico", "movió", "cruzó"],
  tension: ["ruido", "esper", "puerta", "alguien", "nadie", "risa", "cerradura"],
  noir: ["noche", "sombra", "neón", "gotham", "ciudad", "edificio"],
  introspeccion: ["pens", "sabía", "guard", "todavía", "record", "secreto"],
  atmosfera: ["lluvia", "agua", "cornisa", "ventana", "azotea", "silencio"],
  humor: ["chiste", "entrada", "rió", "rio"],
};

export function emotionOf(text: string): (typeof EMOTIONS)[number] {
  const hay = text.toLowerCase();
  let best: EmotionId = "noir";
  let score = 0;
  for (const emotion of EMOTIONS) {
    const hits = CUES[emotion.id].reduce((total, cue) => total + (hay.includes(cue) ? 1 : 0), 0);
    if (hits > score) {
      best = emotion.id;
      score = hits;
    }
  }
  return EMOTIONS.find((emotion) => emotion.id === best) ?? EMOTIONS[2];
}
