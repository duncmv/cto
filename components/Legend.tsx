type LegendProps = {
  fiberVisible: boolean;
  schoolsVisible: boolean;
};

export default function Legend({ fiberVisible, schoolsVisible }: LegendProps) {
  return (
    <aside className="map-legend" role="note" aria-label="Map legend">
      <div className="legend-title">Legend</div>
      <div className="legend-grid">
        <div className={`legend-item${fiberVisible ? '' : ' disabled'}`}>
          <span className="legend-swatch line" aria-hidden />
          <span>Fiber lines</span>
        </div>
        <div className={`legend-item${schoolsVisible ? '' : ' disabled'}`}>
          <span className="legend-swatch cluster" aria-hidden />
          <span>School clusters</span>
        </div>
        <div className={`legend-item${schoolsVisible ? '' : ' disabled'}`}>
          <span className="legend-swatch point" aria-hidden />
          <span>School</span>
        </div>
      </div>
    </aside>
  );
}
