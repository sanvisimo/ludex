// Le copertine si salvano come `image_id`, non come URL: l'URL si compone qui,
// scegliendo la dimensione in base a dove va l'immagine. Salvare l'URL gia'
// fatto avrebbe vincolato il formato al momento dell'enrichment.
//
// I formati sono quelli di IGDB: t_cover_small (90x128), t_cover_big (264x374),
// t_720p (1280x720). Il suffisso `_2x` raddoppia per gli schermi ad alta densita'.
export type CoverSize = "cover_small" | "cover_big" | "720p";

export function igdbCoverUrl(imageId: string, size: CoverSize = "cover_big", retina = true) {
  const suffix = retina ? "_2x" : "";
  return `https://images.igdb.com/igdb/image/upload/t_${size}${suffix}/${imageId}.jpg`;
}
