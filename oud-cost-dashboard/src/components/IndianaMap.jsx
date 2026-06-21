// src/components/IndianaMap.jsx
//
// Choropleth map of Indiana counties coloured by synthetic OUD mortality rate.
//
// Requires:  npm install react-simple-maps react-tooltip d3-geo
//
// County geometry is streamed from the us-atlas CDN (the standard
// react-simple-maps data source). topojson-client is bundled as a
// react-simple-maps peer dep, so importing `feature` from it works
// without a separate install. Only the 92 Indiana counties (FIPS "18xx")
// are rendered — no local GeoJSON file required.

import { useEffect, useState } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { feature } from 'topojson-client';
import { Tooltip } from 'react-tooltip';
import { INDIANA_BASELINE } from '../constants/indiana';

const US_ATLAS_URL =
  'https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json';

// Colour scale: light salmon (#fecaca) → deep crimson (#7f1d1d)
// matching the mortalityRate synthetic range of 20–60.
const RATE_MIN = 20;
const RATE_MAX = 60;

function rateToColor(rate) {
  if (rate == null) return '#d4d0c8'; // grey for counties with no data
  const t = Math.max(0, Math.min(1, (rate - RATE_MIN) / (RATE_MAX - RATE_MIN)));
  const r = Math.round(254 - t * (254 - 127));
  const g = Math.round(202 - t * 202);
  const b = Math.round(202 - t * (202 - 29));
  return `rgb(${r},${g},${b})`;
}

// Pre-index by 5-digit FIPS string for O(1) lookup during render.
const countyLookup = Object.fromEntries(
  INDIANA_BASELINE.countyData.map((c) => [c.id, c])
);

export default function IndianaMap() {
  const [geoData, setGeoData] = useState(null);

  useEffect(() => {
    fetch(US_ATLAS_URL)
      .then((r) => r.json())
      .then((topology) => {
        // Convert TopoJSON → GeoJSON, then keep only Indiana (FIPS prefix "18").
        const all = feature(topology, topology.objects.counties);
        setGeoData({
          ...all,
          features: all.features.filter((f) =>
            String(f.id).startsWith('18')
          ),
        });
      });
  }, []);

  if (!geoData) {
    return (
      <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-100 flex items-center justify-center h-48">
        <span className="text-xs text-gray-400">Loading Indiana map…</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
      {/* Header */}
      <div className="mb-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
          State Overview · Indiana
        </p>
        <h2 className="mt-0.5 text-base font-semibold text-gray-800 leading-snug">
          Overdose Mortality Rate
        </h2>
        <p className="mt-0.5 text-xs text-gray-500">
          Synthetic estimate · deaths per 100,000 residents
        </p>
      </div>

      {/* Map — us-atlas TopoJSON projected via geoMercator centred on Indiana */}
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
                // us-atlas features carry the 5-digit FIPS code in geo.id
                // and the county name in geo.properties.name.
                const fips = String(geo.id);
                const county = countyLookup[fips];
                const displayName = geo.properties.name ?? fips;
                const rateLabel = county
                  ? `${county.mortalityRate} deaths / 100k`
                  : 'No data';

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={rateToColor(county?.mortalityRate)}
                    stroke="#f5f3ee"
                    strokeWidth={0.6}
                    data-tooltip-id="indiana-map-tip"
                    data-tooltip-html={`<span style="font-weight:600">${displayName} County</span><br/>${rateLabel}`}
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

        <Tooltip
          id="indiana-map-tip"
          float
          style={{
            backgroundColor: '#14181f',
            color: '#e7e4dc',
            fontSize: '12px',
            borderRadius: '4px',
            padding: '6px 10px',
            lineHeight: '1.5',
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* Colour legend */}
      <div className="mt-4 flex items-center gap-2">
        <span className="text-[10px] text-gray-400 whitespace-nowrap">Low (20)</span>
        <div
          className="flex-1 h-2 rounded-full"
          style={{
            background:
              'linear-gradient(to right, rgb(254,202,202), rgb(127,29,29))',
          }}
        />
        <span className="text-[10px] text-gray-400 whitespace-nowrap">High (60)</span>
      </div>

      {/* Sorted county callout list */}
      <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1">
        {INDIANA_BASELINE.countyData
          .slice()
          .sort((a, b) => b.mortalityRate - a.mortalityRate)
          .map((c) => (
            <li key={c.id} className="flex items-center justify-between text-xs">
              <span className="text-gray-600">{c.name}</span>
              <span
                className="font-mono font-semibold"
                style={{ color: rateToColor(c.mortalityRate) }}
              >
                {c.mortalityRate}
              </span>
            </li>
          ))}
      </ul>

      <p className="mt-3 text-[10px] text-gray-400 leading-snug">
        Synthetic Monte Carlo estimates · not official statistics
      </p>
    </div>
  );
}
