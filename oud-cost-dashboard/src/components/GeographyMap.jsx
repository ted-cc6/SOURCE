// src/components/GeographyMap.jsx
//
// Choropleth map that adapts its view based on selectedRegion:
//   "National"  => geoAlbersUsa, all 50 states colored by synthetic mortality rate (15-45 range)
//   "Indiana"   => geoMercator, all 92 Indiana counties colored by synthetic mortality rate (20-60 range)
//   any other   => "Data Unavailable" placeholder, no fetch required
//
// Synthetic rates are computed deterministically from the FIPS id so colors
// are stable across renders and re-mounts without storing any extra state.
//
// TopoJSON is fetched from the us-atlas CDN once per view and cached in a ref.
// Requires: react-simple-maps, topojson-client (peer dep of RSM), react-tooltip

import { useEffect, useRef, useState } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { feature } from 'topojson-client';
import { Tooltip } from 'react-tooltip';

const ATLAS_STATES_URL   = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';
const ATLAS_COUNTIES_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json';
const INDIANA_FIPS       = '18';

// Shared tooltip style matches the project dark-ink design token (#14181f).
const TOOLTIP_STYLE = {
  backgroundColor: '#14181f',
  color: '#e7e4dc',
  fontSize: '12px',
  borderRadius: '4px',
  padding: '6px 10px',
  lineHeight: '1.5',
  pointerEvents: 'none',
};

// Deterministic pseudo-random rate from a FIPS code.
// Uses a simple multiplicative hash so the same FIPS always produces the
// same rate without needing to store a lookup table.
function syntheticRate(fips, min, range) {
  const n = parseInt(fips, 10);
  return min + ((n * 127 + 42) % (range + 1));
}

// Interpolates light salmon (254,202,202) to deep crimson (127,29,29).
// min/max define the data domain so the scale adapts to each view.
function rateToColor(rate, min, max) {
  if (rate == null) return '#d4d0c8';
  const t = Math.max(0, Math.min(1, (rate - min) / (max - min)));
  return `rgb(${Math.round(254 - t * 127)},${Math.round(202 - t * 202)},${Math.round(202 - t * 173)})`;
}

// Shared gradient legend rendered below each map.
function ColorLegend({ low, high, labelLow, labelHigh }) {
  return (
    <div className="mt-4 flex items-center gap-2">
      <span className="text-[10px] text-gray-400 whitespace-nowrap">{labelLow} ({low})</span>
      <div
        className="flex-1 h-2 rounded-full"
        style={{ background: 'linear-gradient(to right, rgb(254,202,202), rgb(127,29,29))' }}
      />
      <span className="text-[10px] text-gray-400 whitespace-nowrap">{labelHigh} ({high})</span>
    </div>
  );
}

export default function GeographyMap({ selectedRegion }) {
  const [geoData, setGeoData] = useState(null);
  const cache = useRef({});

  useEffect(() => {
    // Only fetch TopoJSON for the two supported map views.
    if (selectedRegion !== 'National' && selectedRegion !== 'Indiana') {
      setGeoData(null);
      return;
    }

    // Serve from in-memory cache to avoid repeated CDN requests.
    if (cache.current[selectedRegion]) {
      setGeoData(cache.current[selectedRegion]);
      return;
    }

    setGeoData(null);

    const url = selectedRegion === 'National' ? ATLAS_STATES_URL : ATLAS_COUNTIES_URL;

    fetch(url)
      .then((r) => r.json())
      .then((topology) => {
        let data;
        if (selectedRegion === 'National') {
          data = feature(topology, topology.objects.states);
        } else {
          const all = feature(topology, topology.objects.counties);
          data = {
            ...all,
            features: all.features.filter((f) => String(f.id).startsWith(INDIANA_FIPS)),
          };
        }
        cache.current[selectedRegion] = data;
        setGeoData(data);
      });
  }, [selectedRegion]);

  // Placeholder for states with no curated map data.
  if (selectedRegion !== 'National' && selectedRegion !== 'Indiana') {
    return (
      <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-100 flex flex-col items-center justify-center h-64 text-center">
        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-3">
          <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-gray-700">Data Unavailable</p>
        <p className="mt-1 text-xs text-gray-400 max-w-xs leading-relaxed">
          County-level mapping for <span className="font-medium text-gray-600">{selectedRegion}</span> is
          not yet available. Select <span className="font-medium text-gray-600">National</span> or{' '}
          <span className="font-medium text-gray-600">Indiana</span> to view a choropleth.
        </p>
      </div>
    );
  }

  // Loading skeleton while TopoJSON is in flight.
  if (!geoData) {
    return (
      <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-100 flex items-center justify-center h-64">
        <span className="text-xs text-gray-400">Loading map...</span>
      </div>
    );
  }

  // National view: all 50 states colored by synthetic rate (range 15-45).
  if (selectedRegion === 'National') {
    return (
      <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
        <div className="mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
            Geography, National
          </p>
          <h2 className="mt-0.5 text-base font-semibold text-gray-800">
            United States, Overdose Mortality Rate
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Synthetic estimate, deaths per 100,000 residents
          </p>
        </div>

        <ComposableMap
          projection="geoAlbersUsa"
          projectionConfig={{ scale: 900 }}
          width={800}
          height={480}
          style={{ width: '100%', height: 'auto' }}
        >
          <Geographies geography={geoData}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const rate  = syntheticRate(geo.id, 15, 30);
                const fill  = rateToColor(rate, 15, 45);
                const label = geo.properties.name ?? String(geo.id);
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={fill}
                    stroke="#ffffff"
                    strokeWidth={0.6}
                    data-tooltip-id="geo-map-tip"
                    data-tooltip-html={`<span style="font-weight:600">${label}</span><br/>${rate} deaths / 100k`}
                    style={{
                      default: { outline: 'none' },
                      hover:   { filter: 'brightness(0.82)', outline: 'none', cursor: 'pointer' },
                      pressed: { outline: 'none' },
                    }}
                  />
                );
              })
            }
          </Geographies>
        </ComposableMap>

        <ColorLegend low={15} high={45} labelLow="Low" labelHigh="High" />

        <p className="mt-2 text-[10px] text-gray-400 leading-snug">
          Synthetic Monte Carlo estimates, not official statistics
        </p>

        <Tooltip id="geo-map-tip" float style={TOOLTIP_STYLE} />
      </div>
    );
  }

  // Indiana view: all 92 counties colored by synthetic rate (range 20-60).
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
      <div className="mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
          Geography, Indiana
        </p>
        <h2 className="mt-0.5 text-base font-semibold text-gray-800">
          Indiana County Overdose Mortality Rate
        </h2>
        <p className="mt-0.5 text-xs text-gray-500">
          Synthetic estimate, deaths per 100,000 residents, all 92 counties
        </p>
      </div>

      <div className="relative w-full">
        <ComposableMap
          projection="geoMercator"
          projectionConfig={{ center: [-86.13, 40.27], scale: 5600 }}
          width={400}
          height={340}
          style={{ width: '100%', height: 'auto' }}
        >
          <Geographies geography={geoData}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const fips  = String(geo.id);
                const rate  = syntheticRate(fips, 20, 40);
                const fill  = rateToColor(rate, 20, 60);
                const label = geo.properties.name ?? fips;
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={fill}
                    stroke="#f5f3ee"
                    strokeWidth={0.5}
                    data-tooltip-id="geo-map-tip"
                    data-tooltip-html={`<span style="font-weight:600">${label} County</span><br/>${rate} deaths / 100k`}
                    style={{
                      default: { outline: 'none' },
                      hover:   { filter: 'brightness(0.82)', outline: 'none', cursor: 'pointer' },
                      pressed: { outline: 'none' },
                    }}
                  />
                );
              })
            }
          </Geographies>
        </ComposableMap>

        <Tooltip id="geo-map-tip" float style={TOOLTIP_STYLE} />
      </div>

      <ColorLegend low={20} high={60} labelLow="Low" labelHigh="High" />

      <p className="mt-2 text-[10px] text-gray-400 leading-snug">
        Synthetic Monte Carlo estimates, not official statistics
      </p>
    </div>
  );
}
