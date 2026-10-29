import type {
  AdaptationOption,
  AssetClass,
  Band,
  Intervention,
  RankedAsset,
} from './types.js';

interface Template extends AdaptationOption {
  appliesTo: AssetClass[];
  bands: Band[];
}

const ALL_CLASSES: AssetClass[] = [
  'road',
  'path',
  'building',
  'car_park',
  'drainage',
  'beach_access',
  'other',
];

const ALL_BANDS: Band[] = ['A', 'B', 'C', 'D'];

const TEMPLATES: Template[] = [
  {
    id: 'monitor',
    title: 'Monitor the shoreline each year',
    detail:
      'Survey this transect after each storm season and refresh the rate every five years. Keep photos and a survey note.',
    costLowAUD: 5_000,
    costHighAUD: 20_000,
    leadTimeYears: 0.5,
    coBenefits: ['Early warning', 'Grant evidence'],
    appliesTo: ALL_CLASSES,
    bands: ALL_BANDS,
  },
  {
    id: 'dune-restore',
    title: 'Rebuild the dune and fence the access',
    detail:
      'Place sand fencing, plant local dune species and keep foot traffic on marked paths.',
    costLowAUD: 40_000,
    costHighAUD: 150_000,
    leadTimeYears: 1.5,
    coBenefits: ['Habitat', 'Wave buffer', 'Lower cost than a wall'],
    appliesTo: ['path', 'beach_access', 'other'],
    bands: ['A', 'B'],
  },
  {
    id: 'path-realign',
    title: 'Realign the path behind the dune',
    detail:
      'Move the path landward to a stable setback line. Use a permeable surface and a gentle grade.',
    costLowAUD: 90_000,
    costHighAUD: 260_000,
    leadTimeYears: 1.5,
    coBenefits: ['Access kept open', 'Dune recovery'],
    appliesTo: ['path'],
    bands: ['A'],
  },
  {
    id: 'path-design',
    title: 'Design a landward realignment',
    detail:
      'Survey a new alignment and cost it. Keep the current path open until the new route is funded.',
    costLowAUD: 25_000,
    costHighAUD: 70_000,
    leadTimeYears: 1,
    coBenefits: ['Shovel-ready grant bid'],
    appliesTo: ['path'],
    bands: ['B'],
  },
  {
    id: 'road-realign',
    title: 'Realign the road inland',
    detail:
      'Build a new alignment behind the setback line, then remove the old pavement. Cost is per kilometre.',
    costLowAUD: 1_200_000,
    costHighAUD: 4_500_000,
    leadTimeYears: 5,
    coBenefits: ['Access kept', 'No emergency closures'],
    appliesTo: ['road'],
    bands: ['A'],
  },
  {
    id: 'road-corridor',
    title: 'Reserve an inland corridor',
    detail:
      'Protect a future alignment in the local plan. Add closure triggers and a detour plan.',
    costLowAUD: 40_000,
    costHighAUD: 120_000,
    leadTimeYears: 1,
    coBenefits: ['Low cost now', 'Options kept open'],
    appliesTo: ['road'],
    bands: ['B'],
  },
  {
    id: 'road-access',
    title: 'Keep emergency access and set closure triggers',
    detail:
      'Agree a rainfall and wave trigger with the operations team. Publish the detour before the next storm season.',
    costLowAUD: 20_000,
    costHighAUD: 60_000,
    leadTimeYears: 0.5,
    coBenefits: ['Safety', 'Clear staff rules'],
    appliesTo: ['road'],
    bands: ['A', 'C'],
  },
  {
    id: 'building-protect',
    title: 'Protect the building and plan retreat',
    detail:
      'Raise and seal the ground floor, protect services, and set a trigger for a later move.',
    costLowAUD: 150_000,
    costHighAUD: 600_000,
    leadTimeYears: 2,
    coBenefits: ['Service life extended', 'Wet-floor resilience'],
    appliesTo: ['building'],
    bands: ['A', 'B'],
  },
  {
    id: 'building-retreat',
    title: 'Plan a staged retreat or land swap',
    detail:
      'Value the site, find a replacement site and agree a move date with the owner.',
    costLowAUD: 60_000,
    costHighAUD: 200_000,
    leadTimeYears: 5,
    coBenefits: ['Avoided loss', 'Certainty for users'],
    appliesTo: ['building'],
    bands: ['A', 'B'],
  },
  {
    id: 'carpark-relocate',
    title: 'Move the car park landward',
    detail:
      'Build a smaller car park behind the setback line. Restore the old surface to dune.',
    costLowAUD: 300_000,
    costHighAUD: 1_100_000,
    leadTimeYears: 3,
    coBenefits: ['Dune width', 'Flood-free parking'],
    appliesTo: ['car_park'],
    bands: ['A'],
  },
  {
    id: 'carpark-manage',
    title: 'Cut parking and set a closure plan',
    detail:
      'Remove the seaward rows, add signs, and agree a closure trigger with the operator.',
    costLowAUD: 15_000,
    costHighAUD: 50_000,
    leadTimeYears: 1,
    coBenefits: ['Low cost', 'Clear rules'],
    appliesTo: ['car_park'],
    bands: ['B', 'C'],
  },
  {
    id: 'drainage-extend',
    title: 'Extend the outfall and fit backflow valves',
    detail:
      'Extend the pipe past the new dune toe. Fit valves so sea water cannot run back into the street.',
    costLowAUD: 250_000,
    costHighAUD: 900_000,
    leadTimeYears: 3,
    coBenefits: ['Less street flooding', 'Cleaner beach water'],
    appliesTo: ['drainage'],
    bands: ['A'],
  },
  {
    id: 'drainage-inspect',
    title: 'Inspect and upgrade the outfall',
    detail:
      'CCTV the line, clear sand, and cost a future extension.',
    costLowAUD: 40_000,
    costHighAUD: 120_000,
    leadTimeYears: 1,
    coBenefits: ['Fewer blockages'],
    appliesTo: ['drainage'],
    bands: ['B', 'C'],
  },
  {
    id: 'access-relocate',
    title: 'Relocate the stairs and ramp landward',
    detail:
      'Build a movable access structure at the new dune line. Keep one accessible route.',
    costLowAUD: 60_000,
    costHighAUD: 180_000,
    leadTimeYears: 1,
    coBenefits: ['Access for all', 'Less dune damage'],
    appliesTo: ['beach_access'],
    bands: ['A'],
  },
  {
    id: 'access-design',
    title: 'Design a movable access structure',
    detail:
      'Use a modular ramp that a crew can lift after a storm. Cost the first unit.',
    costLowAUD: 20_000,
    costHighAUD: 60_000,
    leadTimeYears: 1,
    coBenefits: ['Reusable parts'],
    appliesTo: ['beach_access'],
    bands: ['B'],
  },
  {
    id: 'other-remove',
    title: 'Remove or relocate the asset',
    detail:
      'Take out the asset before the next storm season and clear the site.',
    costLowAUD: 10_000,
    costHighAUD: 80_000,
    leadTimeYears: 0.5,
    coBenefits: ['No debris load'],
    appliesTo: ['other'],
    bands: ['A', 'B'],
  },
  {
    id: 'corridor',
    title: 'Reserve a setback corridor in the plan',
    detail:
      'Add the corridor to the local plan so new works cannot move toward the sea.',
    costLowAUD: 10_000,
    costHighAUD: 40_000,
    leadTimeYears: 1,
    coBenefits: ['No new exposure', 'Clear rules for owners'],
    appliesTo: ALL_CLASSES,
    bands: ['B', 'C', 'D'],
  },
  {
    id: 'grant-study',
    title: 'Fund a coastal hazard study',
    detail:
      'Commission a site study that adds storms, wave run-up and sea level rise to this screen.',
    costLowAUD: 50_000,
    costHighAUD: 150_000,
    leadTimeYears: 1.5,
    coBenefits: ['Grant-ready evidence', 'Better cost estimates'],
    appliesTo: ALL_CLASSES,
    bands: ['B', 'C'],
  },
];

function toOption(template: Template): AdaptationOption {
  const { appliesTo: _appliesTo, bands: _bands, ...option } = template;
  return option;
}

export function catalogue(): AdaptationOption[] {
  return TEMPLATES.map(toOption);
}

export function optionsFor(assetClass: AssetClass, band: Band, limit = 3): AdaptationOption[] {
  const matches = TEMPLATES.filter(
    (template) => template.appliesTo.includes(assetClass) && template.bands.includes(band),
  );
  const specific = matches
    .map((template, index) => ({ template, index }))
    .sort((a, b) => {
      if (a.template.appliesTo.length !== b.template.appliesTo.length) {
        return a.template.appliesTo.length - b.template.appliesTo.length;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.template);
  const chosen = specific
    .filter((template) => template.id !== 'monitor')
    .slice(0, Math.max(0, limit - 1));
  const monitor = TEMPLATES.find((template) => template.id === 'monitor');
  const result = chosen.map(toOption);
  if (monitor) result.push(toOption(monitor));
  return result.slice(0, limit);
}

export function buildIntervention(row: RankedAsset): Intervention {
  const options = row.options.length > 0 ? row.options : optionsFor(row.asset.class, row.exposure.band);
  const primary = options[0];
  return {
    asset: row.asset,
    exposure: row.exposure,
    score: row.score,
    options,
    costLowAUD: primary ? primary.costLowAUD : 0,
    costHighAUD: primary ? primary.costHighAUD : 0,
  };
}

export function topInterventions(ranked: RankedAsset[], limit = 3): Intervention[] {
  return ranked.slice(0, limit).map(buildIntervention);
}