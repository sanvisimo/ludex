// Le copertine si salvano come `image_id` di IGDB e l'URL si compone qui, come
// in `apps/web/lib/igdb-image.ts`: il mobile non importa il web.
export function igdbImageUrl(
  imageId: string,
  size:
    'cover_small' | 'cover_big' | 'screenshot_med' | 'screenshot_big' | '1080p',
  retina = true,
) {
  const suffix = retina ? '_2x' : '';
  return `https://images.igdb.com/igdb/image/upload/t_${size}${suffix}/${imageId}.jpg`;
}

export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  return `${Math.round(minutes / 60)} h`;
}
