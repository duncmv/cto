"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { getMapStyle, getStyleLabel, KAMPALA_CENTER, UGANDA_BOUNDS } from "@/lib/mapConfig";

const MAX_BOUNDS_PADDING_DEG = 0.5; // allow a little pan leeway around Uganda

function expandBounds(
  bounds: [[number, number], [number, number]],
  padDeg: number
): [[number, number], [number, number]] {
  return [
    [bounds[0][0] - padDeg, bounds[0][1] - padDeg],
    [bounds[1][0] + padDeg, bounds[1][1] + padDeg],
  ];
}

// Minimal types for our sample schools dataset
type SchoolProps = {
  id: string;
  name: string;
  region: string;
  ownership: string;
  gender: string;
  level?: string | null;
};

type SchoolFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: SchoolProps;
};

type SchoolFeatureCollection = {
  type: "FeatureCollection";
  name?: string;
  features: SchoolFeature[];
};

const LAYER_IDS = {
  fiberLines: "fiber-lines",
  schoolClusters: "schools-clusters",
  schoolClusterCount: "schools-cluster-count",
  schoolUnclustered: "schools-unclustered",
};

export default function Map() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [styleLabel, setStyleLabel] = useState<string>("");

  const [fiberVisible, setFiberVisible] = useState<boolean>(true);
  const [schoolsVisible, setSchoolsVisible] = useState<boolean>(true);

  const [schoolsData, setSchoolsData] = useState<SchoolFeatureCollection | null>(null);

  // Filter state
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedRegions, setSelectedRegions] = useState<Set<string>>(new Set());
  const [selectedOwnerships, setSelectedOwnerships] = useState<Set<string>>(new Set());
  const [selectedGenders, setSelectedGenders] = useState<Set<string>>(new Set());

  // Derive option lists from loaded data
  const filterOptions = useMemo(() => {
    const regions = new Set<string>();
    const ownerships = new Set<string>();
    const genders = new Set<string>();
    if (schoolsData) {
      for (const f of schoolsData.features) {
        if (f.properties.region) regions.add(f.properties.region);
        if (f.properties.ownership) ownerships.add(f.properties.ownership);
        if (f.properties.gender) genders.add(f.properties.gender);
      }
    }
    return {
      regions: Array.from(regions).sort((a, b) => a.localeCompare(b)),
      ownerships: Array.from(ownerships).sort((a, b) => a.localeCompare(b)),
      genders: Array.from(genders).sort((a, b) => a.localeCompare(b)),
    };
  }, [schoolsData]);

  // Apply filters to base schools data
  const filteredSchools = useMemo<SchoolFeatureCollection | null>(() => {
    if (!schoolsData) return null;
    const q = searchQuery.trim().toLowerCase();
    const hasRegion = selectedRegions.size > 0;
    const hasOwner = selectedOwnerships.size > 0;
    const hasGender = selectedGenders.size > 0;

    const out: SchoolFeature[] = [];
    for (const f of schoolsData.features) {
      const p = f.properties;
      if (hasRegion && !selectedRegions.has(p.region)) continue;
      if (hasOwner && !selectedOwnerships.has(p.ownership)) continue;
      if (hasGender && !selectedGenders.has(p.gender)) continue;
      if (q && !(p.name || "").toLowerCase().includes(q)) continue;
      out.push(f);
    }
    return { type: "FeatureCollection", name: schoolsData.name, features: out };
  }, [schoolsData, searchQuery, selectedRegions, selectedOwnerships, selectedGenders]);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current) return;
    const style = getMapStyle();
    setStyleLabel(getStyleLabel());

    const map = new maplibregl.Map({
      container: containerRef.current,
      style,
      center: KAMPALA_CENTER,
      zoom: 6,
      attributionControl: true,
      maxBounds: expandBounds(UGANDA_BOUNDS, MAX_BOUNDS_PADDING_DEG),
      hash: false,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

    map.once("load", () => {
      map.fitBounds(UGANDA_BOUNDS, { padding: 40, animate: false });

      // Add fiber source + lines layer
      map.addSource("fiber", {
        type: "geojson",
        data: "/data/fiber.geojson",
      } as any);

      map.addLayer({
        id: LAYER_IDS.fiberLines,
        type: "line",
        source: "fiber",
        filter: [
          "any",
          ["==", ["geometry-type"], "LineString"],
          ["==", ["geometry-type"], "MultiLineString"],
        ],
        layout: {
          visibility: fiberVisible ? "visible" : "none",
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": "#e55e0f",
          "line-width": 2,
          "line-opacity": 0.85,
        },
      });

      map.on("click", LAYER_IDS.fiberLines, (e) => {
        const f = e.features && e.features[0];
        const p: any = f?.properties || {};
        const name = p.name || "Fiber segment";
        const operator = p.operator || p.owner || "Unknown";
        new maplibregl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="min-width:220px">
              <strong>${name}</strong><br/>
              <div>Operator/Owner: ${operator}</div>
              <div>Source: ${p.source || "OpenStreetMap"}</div>
            </div>`
          )
          .addTo(map);
      });

      map.on("mouseenter", LAYER_IDS.fiberLines, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", LAYER_IDS.fiberLines, () => (map.getCanvas().style.cursor = ""));

      // Load schools dataset and add clustered source + layers
      fetch("/data/schools.geojson")
        .then((r) => r.json())
        .then((json: SchoolFeatureCollection) => {
          setSchoolsData(json);

          map.addSource("schools", {
            type: "geojson",
            data: json,
            cluster: true,
            clusterMaxZoom: 14,
            clusterRadius: 50,
          } as any);

          // Clusters
          map.addLayer({
            id: LAYER_IDS.schoolClusters,
            type: "circle",
            source: "schools",
            filter: ["has", "point_count"],
            layout: { visibility: schoolsVisible ? "visible" : "none" },
            paint: {
              // Color clusters by size
              "circle-color": [
                "step",
                ["get", "point_count"],
                "#90cdf4",
                5,
                "#63b3ed",
                15,
                "#4299e1",
                25,
                "#3182ce",
              ],
              "circle-radius": [
                "step",
                ["get", "point_count"],
                16,
                5,
                20,
                15,
                24,
                25,
                28,
              ],
              "circle-stroke-color": "#1e3a8a",
              "circle-stroke-width": 1,
              "circle-opacity": 0.85,
            },
          });

          // Cluster count labels
          map.addLayer({
            id: LAYER_IDS.schoolClusterCount,
            type: "symbol",
            source: "schools",
            filter: ["has", "point_count"],
            layout: {
              visibility: schoolsVisible ? "visible" : "none",
              "text-field": ["get", "point_count_abbreviated"],
              "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
              "text-size": 12,
            },
            paint: { "text-color": "#0c4a6e" },
          });

          // Unclustered points
          map.addLayer({
            id: LAYER_IDS.schoolUnclustered,
            type: "circle",
            source: "schools",
            filter: ["!", ["has", "point_count"]],
            layout: { visibility: schoolsVisible ? "visible" : "none" },
            paint: {
              "circle-color": "#16a34a",
              "circle-radius": 6,
              "circle-stroke-color": "#064e3b",
              "circle-stroke-width": 1,
              "circle-opacity": 0.9,
            },
          });

          // Interactions for clusters
          map.on("click", LAYER_IDS.schoolClusters, (e) => {
            const feature = e.features && (e.features[0] as any);
            const clusterId = feature?.properties?.cluster_id as number | undefined;
            if (typeof clusterId === "number") {
              const src = map.getSource("schools") as any;
              if (src && typeof src.getClusterExpansionZoom === "function") {
                src.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
                  if (err) return;
                  map.easeTo({ center: e.lngLat, zoom });
                });
              }
            }
          });
          map.on("mouseenter", LAYER_IDS.schoolClusters, () => (map.getCanvas().style.cursor = "pointer"));
          map.on("mouseleave", LAYER_IDS.schoolClusters, () => (map.getCanvas().style.cursor = ""));

          // Interactions for unclustered points
          map.on("click", LAYER_IDS.schoolUnclustered, (e) => {
            const f = e.features && (e.features[0] as any);
            const p: SchoolProps = f?.properties || ({} as any);
            const html = `
              <div style="min-width:240px">
                <div style="font-weight:600;margin-bottom:4px;">${p.name || "School"}</div>
                <div><strong>Region:</strong> ${p.region || "—"}</div>
                <div><strong>Ownership:</strong> ${p.ownership || "—"}</div>
                <div><strong>Gender:</strong> ${p.gender || "—"}</div>
                ${p.level ? `<div><strong>Level:</strong> ${p.level}</div>` : ""}
              </div>
            `;
            new maplibregl.Popup().setLngLat(e.lngLat).setHTML(html).addTo(map);
          });
          map.on("mouseenter", LAYER_IDS.schoolUnclustered, () => (map.getCanvas().style.cursor = "pointer"));
          map.on("mouseleave", LAYER_IDS.schoolUnclustered, () => (map.getCanvas().style.cursor = ""));
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error("Failed to load schools dataset:", err);
        });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // When filters change, update the schools source data to recluster based on the filtered set
  useEffect(() => {
    if (!mapRef.current || !filteredSchools) return;
    const src = mapRef.current.getSource("schools") as any;
    if (src && typeof src.setData === "function") {
      src.setData(filteredSchools);
    }
  }, [filteredSchools]);

  const recenter = () => {
    mapRef.current?.fitBounds(UGANDA_BOUNDS, { padding: 40, animate: true });
  };

  const setLayerVisibility = (layerId: string, visible: boolean) => {
    const map = mapRef.current;
    if (!map) return;
    if (!map.getLayer(layerId)) return;
    map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
  };

  const onToggleFiber = (checked: boolean) => {
    setFiberVisible(checked);
    setLayerVisibility(LAYER_IDS.fiberLines, checked);
  };

  const onToggleSchools = (checked: boolean) => {
    setSchoolsVisible(checked);
    setLayerVisibility(LAYER_IDS.schoolClusters, checked);
    setLayerVisibility(LAYER_IDS.schoolClusterCount, checked);
    setLayerVisibility(LAYER_IDS.schoolUnclustered, checked);
  };

  const toggleSetValue = (current: Set<string>, value: string) => {
    const next = new Set(current);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedRegions(new Set());
    setSelectedOwnerships(new Set());
    setSelectedGenders(new Set());
  };

  return (
    <div className="map-wrapper">
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      <div className="control-panel" role="region" aria-label="Map controls">
        <h2>Map Controls</h2>
        <div className="row" style={{ marginBottom: 8, flexWrap: "wrap" }}>
          <button className="button" onClick={recenter} aria-label="Recenter to Uganda">
            ⤿ Recenter Uganda
          </button>
        </div>

        <div className="row" style={{ gap: 16, marginBottom: 12, flexWrap: "wrap" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={fiberVisible}
              onChange={(e) => onToggleFiber(e.target.checked)}
            />
            <span>Fiber</span>
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={schoolsVisible}
              onChange={(e) => onToggleSchools(e.target.checked)}
            />
            <span>Schools</span>
          </label>
        </div>

        <div style={{ borderTop: "1px solid #e2e8f0", margin: "8px 0", height: 0 }} />

        <div className="row" style={{ marginBottom: 10 }}>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search schools by name..."
            aria-label="Search schools by name"
            style={{
              flex: 1,
              border: "1px solid #cbd5e1",
              borderRadius: 8,
              padding: "8px 10px",
            }}
          />
          <button className="button" onClick={clearFilters} aria-label="Clear filters">
            Clear
          </button>
        </div>

        {/* Filters */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
          <fieldset style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 8 }}>
            <legend style={{ fontSize: 12, color: "#475569" }}>Region</legend>
            {filterOptions.regions.map((v) => (
              <label key={v} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <input
                  type="checkbox"
                  checked={selectedRegions.has(v)}
                  onChange={() => setSelectedRegions((s) => toggleSetValue(s, v))}
                />
                <span>{v}</span>
              </label>
            ))}
          </fieldset>
          <fieldset style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 8 }}>
            <legend style={{ fontSize: 12, color: "#475569" }}>Ownership</legend>
            {filterOptions.ownerships.map((v) => (
              <label key={v} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <input
                  type="checkbox"
                  checked={selectedOwnerships.has(v)}
                  onChange={() => setSelectedOwnerships((s) => toggleSetValue(s, v))}
                />
                <span>{v}</span>
              </label>
            ))}
          </fieldset>
          <fieldset style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 8 }}>
            <legend style={{ fontSize: 12, color: "#475569" }}>Gender</legend>
            {filterOptions.genders.map((v) => (
              <label key={v} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <input
                  type="checkbox"
                  checked={selectedGenders.has(v)}
                  onChange={() => setSelectedGenders((s) => toggleSetValue(s, v))}
                />
                <span>{v}</span>
              </label>
            ))}
          </fieldset>
        </div>

        <div className="muted" style={{ marginTop: 8 }}>
          Style: {styleLabel}
          {schoolsData ? ` • ${filteredSchools?.features.length ?? 0} / ${schoolsData.features.length} schools` : ""}
        </div>
      </div>
    </div>
  );
}
