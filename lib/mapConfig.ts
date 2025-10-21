export type StyleSource = string | any;

export const UGANDA_BOUNDS: [[number, number], [number, number]] = [
  [29.573433, -1.482317],
  [35.03599, 4.234076],
];

export const KAMPALA_CENTER: [number, number] = [32.5825, 0.3476];

export function getMapStyle(): StyleSource {
  const explicit = process.env.NEXT_PUBLIC_MAP_STYLE_URL;
  if (explicit && explicit.trim().length > 0) {
    return explicit.trim();
  }
  const maptilerKey = process.env.NEXT_PUBLIC_MAPTILER_API_KEY;
  if (maptilerKey && maptilerKey.trim().length > 0) {
    return `https://api.maptiler.com/maps/streets-v2/style.json?key=${maptilerKey.trim()}`;
  }
  // Public demo style from MapLibre
  return 'https://demotiles.maplibre.org/style.json';
}

export function getStyleLabel(): string {
  const explicit = process.env.NEXT_PUBLIC_MAP_STYLE_URL;
  if (explicit && explicit.trim()) return 'Custom style URL';
  const maptilerKey = process.env.NEXT_PUBLIC_MAPTILER_API_KEY;
  if (maptilerKey && maptilerKey.trim()) return 'MapTiler Streets (API key)';
  return 'MapLibre Demo style';
}
