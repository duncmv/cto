export type SchoolProps = {
  id?: string;
  name?: string;
  region?: string;
  ownership?: string;
  gender?: string;
  level?: string | null;
};

export type SchoolFeature = {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: SchoolProps;
};

export type SchoolFeatureCollection = {
  type: 'FeatureCollection';
  name?: string;
  features: SchoolFeature[];
};

let schoolsPromise: Promise<SchoolFeatureCollection> | null = null;

export function getSchoolsData(): Promise<SchoolFeatureCollection> {
  if (schoolsPromise) return schoolsPromise;
  schoolsPromise = fetch('/data/schools.geojson')
    .then((r) => {
      if (!r.ok) throw new Error(`Failed to load schools dataset: ${r.status}`);
      return r.json();
    })
    .then((json) => json as SchoolFeatureCollection)
    .catch((err) => {
      schoolsPromise = null;
      throw err;
    });
  return schoolsPromise;
}

export function prefetchSchoolsData(): void {
  if (schoolsPromise) return;
  try {
    // Kick off in background but ignore errors here
    schoolsPromise = fetch('/data/schools.geojson')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to prefetch schools'))))
      .then((json) => json as SchoolFeatureCollection)
      .catch(() => {
        schoolsPromise = null;
        return null as any;
      });
  } catch {
    // ignore
  }
}
