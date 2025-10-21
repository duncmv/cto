"use client";

import { useEffect, useRef, useState } from 'react';
import maplibregl, { Map as MLMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getMapStyle, getStyleLabel, KAMPALA_CENTER, UGANDA_BOUNDS } from '@/lib/mapConfig';

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

export default function Map() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [styleLabel, setStyleLabel] = useState<string>('');

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

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

    map.once('load', () => {
      map.fitBounds(UGANDA_BOUNDS, { padding: 40, animate: false });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const recenter = () => {
    mapRef.current?.fitBounds(UGANDA_BOUNDS, { padding: 40, animate: true });
  };

  return (
    <div className="map-wrapper">
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <div className="control-panel" role="region" aria-label="Map controls">
        <h2>Map Controls</h2>
        <div className="row" style={{ marginBottom: 8 }}>
          <button className="button" onClick={recenter} aria-label="Recenter to Uganda">
            ⤿ Recenter Uganda
          </button>
        </div>
        <div className="muted">Style: {styleLabel}</div>
      </div>
    </div>
  );
}
