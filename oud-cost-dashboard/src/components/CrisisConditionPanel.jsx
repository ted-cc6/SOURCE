// src/components/CrisisConditionPanel.jsx
//
// Displays real-world opioid crisis statistics for the selected region.
// Only National and Indiana have curated data; all other regions show a
// placeholder message prompting the user to select a supported region.

const METRICS = [
  { key: 'mortalityRate',  label: 'Mortality Rate',                  accent: 'bg-red-500'    },
  { key: 'morbidity',      label: 'Morbidity and Hospitalizations',  accent: 'bg-orange-500' },
  { key: 'prescriptions',  label: 'Prescription Volumes',            accent: 'bg-amber-500'  },
  { key: 'illicit',        label: 'Illicit Supply Indicators',       accent: 'bg-purple-500' },
  { key: 'economic',       label: 'Economic Costs',                  accent: 'bg-slate-500'  },
];

const CRISIS_DATA = {
  National: {
    subtitle: 'United States, national aggregate',
    mortalityRate:  '24.0 deaths per 100,000 people',
    morbidity:      '131,620 nonfatal overdose emergency visits annually',
    prescriptions:  'Sustained high volume in localized pockets, though transitioning rapidly to illicit markets',
    illicit:        'Synthetic opioids (fentanyl) now account for roughly 90% of opioid-involved deaths',
    economic:       'Estimated total societal cost exceeding $1.0 Trillion annually',
  },
  Indiana: {
    subtitle: 'State of Indiana, county-level prototype',
    mortalityRate:  'Increased by over 500% since 2003, exceeding 30 deaths per 100,000 people',
    morbidity:      'Over $224 million spent annually on non-lethal overdose hospitalizations',
    prescriptions:  'Disproportionately high dispensing rates persisting in rural counties',
    illicit:        'Rapid emergence of synthetic additives like xylazine mixed with the fentanyl supply',
    economic:       'Over $4.3 billion lost annually, equating to $11 million per day in state economic damages',
  },
};

export default function CrisisConditionPanel({ selectedRegion }) {
  const data = CRISIS_DATA[selectedRegion];

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-100 flex flex-col h-full">
      {/* Header */}
      <div className="mb-5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
          Opioid Crisis
        </p>
        <h2 className="mt-0.5 text-base font-semibold text-gray-800 leading-snug">
          Current Conditions
        </h2>
        <p className="mt-1 text-xs text-gray-500">
          {data ? data.subtitle : 'Public health research indicators'}
        </p>
      </div>

      {/* No-data state for unsupported regions */}
      {!data && (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center mb-3">
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
            </svg>
          </div>
          <p className="text-sm text-gray-500 leading-relaxed">
            Select <span className="font-semibold text-gray-700">National</span> or{' '}
            <span className="font-semibold text-gray-700">Indiana</span> to view detailed crisis metrics.
          </p>
          <p className="mt-2 text-[11px] text-gray-400">
            Additional state-level data is in development.
          </p>
        </div>
      )}

      {/* Metrics list */}
      {data && (
        <ul className="flex flex-col gap-0 divide-y divide-gray-50 flex-1">
          {METRICS.map(({ key, label, accent }) => (
            <li key={key} className="flex gap-3 py-3.5 items-start">
              {/* Colored indicator dot */}
              <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${accent}`} />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5">
                  {label}
                </p>
                <p className="text-sm text-gray-800 leading-snug font-medium">
                  {data[key]}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Disclaimer */}
      <p className="mt-4 pt-3 border-t border-gray-50 text-[10px] text-gray-400 leading-snug">
        {data
          ? 'Research statistics reflect published public health findings. Figures are cited for context and do not constitute official policy positions.'
          : 'Synthetic simulation data is still generated for all regions using national model defaults.'}
      </p>
    </div>
  );
}
