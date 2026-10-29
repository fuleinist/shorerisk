# SPEC — shorerisk

## Problem

Coastal councils hold asset lists in spreadsheets. They do not hold a ranked
list of assets that will meet the shoreline. Open shoreline change rates exist.
Asset maps exist. No open tool joins them into a risk register with costs.

## Product

`shorerisk` is a coastal asset risk register. A user loads shoreline change
transects and a set of assets. The tool projects each asset onto the shoreline
trend. It reports the year each asset may become exposed. It ranks the assets
by urgency and consequence. It drafts adaptation options with order-of-cost.
It exports a printable council brief, a plan drawing and a GeoJSON layer.

## Users

1. A council engineer who needs a first-pass risk list before a grant round.
2. A community group that wants evidence for a dune or path project.
3. A coastal consultant who needs a repeatable screening step.

## Data model

The base geometry is a **transect**. A transect is a straight line from the
baseline shoreline to a point inland. Its start point sits on the most recent
observed shoreline. Its end point sits inland by a fixed length. Each transect
carries one shoreline change rate in metres per year. A negative rate means
retreat.

An **asset** is a point with a class, a replacement cost and a daily user count.
Supported classes: `road`, `path`, `building`, `car_park`, `drainage`,
`beach_access`, `other`.

The tool assigns each asset to the nearest transect. It measures the inland
distance along that transect. This distance uses the same datum as the DEA
Coastlines rate product, where distances are relative to the most recent
baseline shoreline.

## Scope of the first release

### Must have

- A site file with transects, assets and provenance.
- A validator that reports missing or implausible fields.
- An exposure model with best, optimistic and pessimistic cases.
- A risk score from 0 to 100. The formula and its weights are documented.
- A ranked asset table. Ties break by earlier exposure, then higher cost.
- Adaptation options per asset class and urgency band. Each option has an
  order-of-cost range, a lead time and co-benefits.
- A printable HTML brief with the ranked table, the top interventions, the
  method and the limits.
- An SVG plan drawing with the erosion envelope and the ranked assets.
- A GeoJSON export of assessed assets.
- A DEA Coastlines rate importer. It accepts CSV and GeoJSON.
- A static PWA. It works offline after the first load.
- A CLI with the same output as the PWA.
- Tests for every calculation and every output writer.

### Must not have

- No runtime dependencies. Development tools only.
- No API keys. No network call at run time.
- No accounts, tracking or personal data.
- No invented asset data. A missing value stays missing.
- No claim that a historical rate is a forecast.

### Out of scope for the first release

- Wave run-up, storm erosion and dune volume models.
- Sea level rise scenarios beyond a constant rate.
- Tidal datum correction.
- Automatic OSM download. The importer reads a saved Overpass response.
- Multi-site portfolios.
- PDF rendering. The brief is print-ready HTML.

## Exposure model

Let `r` be the rate in m/yr. Let `se` be its standard error. Let `d` be the
inland distance of the asset in metres. Let `t` be years after the baseline
year.

```
erosionBest        = max(0, -r)
erosionOptimistic  = max(0, -(r + 1.96 * se))
erosionPessimistic = max(0, -(r - 1.96 * se))

exposureYear(case) = erosion(case) > 0 ? d / erosion(case) : null
```

An asset with `d <= 0` is already at or seaward of the baseline. The tool marks
it `alreadyExposed` and assigns band A.

Bands use the best estimate:

| Band | Exposure year | Label |
| --- | --- | --- |
| A | 0 to 20 | Act now |
| B | 20 to 50 | Plan |
| C | 50 to 100 | Watch |
| D | over 100, or no retreat | Outside the window |

The pessimistic year appears in the output. A large gap between the best and
pessimistic year lowers the confidence.

### Confidence

Each transect gets a data grade:

- `good`: p-value <= 0.01 and valid span >= 20 years.
- `ok`: p-value <= 0.05 and valid span >= 10 years.
- `poor`: anything else, including a missing significance value.

Each asset gets an assignment grade from its cross-track offset:

- `high`: 15 m or less.
- `medium`: 30 m or less.
- `low`: 60 m or less.
- `none`: over 60 m. The asset is not assessed.

The reported confidence is the lower of the two grades. The brief states the
share of assets with high confidence.

## Risk score

```
costFactor = clamp(log10(max(cost, 1) / 10_000) / 3, 0, 1)
userFactor = clamp(log10(max(users, 0) + 1) / log10(5001), 0, 1)
critFactor = { lifeline: 1.0, evacuation: 0.85, community: 0.65, amenity: 0.4 }

consequence = 100 * (0.5 * costFactor + 0.3 * userFactor + 0.2 * critFactor)
urgency     = { A: 100, B: 65, C: 35, D: 10 }
score       = round(0.6 * urgency + 0.4 * consequence)
```

The score is a screening aid. It is not a benefit-cost analysis. The UI and the
README state this.

## Adaptation options

The catalogue maps an asset class and a band to ordered options. Each option
has a title, a short detail, an order-of-cost range in 2026 AUD, a lead time and
co-benefits. A monitoring option applies to every asset.

Costs are indicative. They cover one typical site. The brief labels them
"order-of-cost, confirm with a coastal engineer".

## Outputs

### Council brief

A single printable HTML file. Sections:

1. Site, baseline year, data source and generation date.
2. Summary counts, value at risk in band A, and the high-confidence share.
3. Ranked asset table.
4. Three priority interventions with costs.
5. Method and limits.
6. Sources and licence.

### Plan drawing

An SVG plan view. It shows the baseline shoreline, the 20, 50 and 100 year
setback envelopes, and the assets coloured by band. It is a schematic, not a
survey drawing.

### GeoJSON

One feature per assessed asset. Properties: id, name, class, band, exposure
year, score, replacement cost, confidence.

## CLI

```
shorerisk validate --site FILE
shorerisk model    --site FILE [--baseline YEAR] [--horizon YEARS] [--json]
shorerisk rank     --site FILE [--top N] [--json]
shorerisk brief    --site FILE --out FILE
shorerisk plan     --site FILE --out FILE
shorerisk export   --site FILE --out FILE
shorerisk build    --site FILE --out-dir DIR
shorerisk import   --rates FILE [--seaward-bearing DEG] [--transect-length M] --out FILE
shorerisk import-osm --assets FILE --out FILE
shorerisk demo     [--json]
```

Exit codes: 0 ok, 1 runtime error, 2 usage or bad input, 3 data error.

## Acceptance criteria

1. `npm run build` passes with TypeScript strict mode.
2. `npm test` passes. Tests cover geometry, exposure, confidence, ranking,
   validation, both importers, the brief, the plan, the GeoJSON export and the
   CLI.
3. `shorerisk demo` works with no network.
4. `shorerisk build` writes `model.json`, `brief.html`, `plan.svg` and
   `risk.geojson`.
5. The PWA loads `model.json`, filters by band, sorts the table, works offline
   and shows the same scores as the CLI.
6. The README shows the logo, the pitch, the features, the quick start, the
   screenshots, the data sources and the licence.
7. Every site file states its provenance. A sample file is marked as a sample.

## Risks and limits

- DEA rates are historical. They are not predictions. A constant rate is a
  screening assumption, not a forecast.
- Rocky coasts, headlands and estuaries are outside the DEA rate product.
- Transects are straight lines. Curved shorelines and structures need more
  transects.
- The model does not include storms, wave run-up or sea level acceleration.
- Asset costs are user inputs. Imported OSM assets carry default costs and are
  marked as estimates.
- The sample site is illustrative. It is not a council assessment.

## Data sources

| Source | Use | Access |
| --- | --- | --- |
| DEA Coastlines rates of change | Shoreline rate, standard error, observations | Open. Export from DEA, or read a saved file |
| OpenStreetMap Overpass | Asset locations, names and classes | Open, ODbL |
| Open-Meteo | Optional context in a later release | Open, no key |
| Council asset registers | Replacement cost and user counts | Local, by permission |

The first release reads local files only. It makes no network calls.