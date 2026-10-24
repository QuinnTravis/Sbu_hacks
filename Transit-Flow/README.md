# TransitFlow

A transit planner that treats stations as physical spaces. It estimates how long a transfer really takes, how likely you are to make a connection, and what it costs when you miss one. The same engine also drives a network reliability dashboard and a schedule-intervention simulator.

Geographic focus is Queens and the Port Jefferson / Port Washington branches: Flushing–Main St, Jackson Heights, Woodside, Jamaica, Huntington and Stony Brook. Citi Field event crowding is included.

> **All data in this prototype is synthetic or illustrative.** The timetable, delays, demand and indoor station geometry are invented to be plausible. They are not MTA schedules or measurements. The UI labels every figure with where it comes from.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # 44 tests: graph algorithms, transfer model, routing, analytics, adapters
npm run build        # static site in dist/
npm run build:single # one self-contained HTML file in dist-single/
```

No account, API key or network connection is needed. Fonts load from Google Fonts when online and fall back to system fonts otherwise.

## What to try

1. **Plan → Morning to Stony Brook** (leave after 7:45 AM). The planner recommends a reliable route. Open the 7 train via Woodside card: leaving at 7:54 AM connects *on paper* (4‑minute window, 3‑minute published minimum), but the Woodside station model puts the walk at 3–5 minutes before train delays, so about a third of riders make it. Missing it costs about 20 minutes even after re-planning.
2. Click the Woodside transfer on the map or in the timeline → **Station layout** shows the path from the elevated 7 platform, out of fare control, across Roosevelt Av and down to the LIRR, with the car to ride in.
3. **Network view** opens Insights on the same connection as a reliability problem (a "phantom connection"). Under **Test a change**, hold the LIRR up to 90 s and compare before/after, including the cost to riders already on board.
4. **Stations → Jackson Heights**, tick *First time at this station*: walking directions from the elevated 7 to the E/F platforms for an unfamiliar rider.
5. Other scenarios: *7 trains delayed* (demo real-time feed), *After a Citi Field game* (event crowding), *Step-free trip* (elevator-only paths), *Be at Jamaica by 9:00* (arrive-by mode).

## How it works

```
src/
  engine/            pure TypeScript, no UI
    types.ts         timetable, station graph and context types
    graph.ts         Dijkstra (binary heap, multi-source/multi-target)
    station.ts       indoor graph pathfinding, traversal-time sampling, instructions
    crowd.ts         event model: crowding and delay multipliers over time
    delays.ts        delay mixture model; real-time handling and staleness
    transfer.ts      transfer-time distributions and connection probability
    raptor.ts        RAPTOR multi-criteria routing (arrival × number of trips)
    evaluate.ts      Monte Carlo journey evaluation and missed-connection re-planning
    planner.ts       candidate generation, grouping, ranking, explanations
    analytics.ts     day replay, phantom connections, interventions
    realtime.ts      GTFS-Realtime proxy adapter
    gtfs.ts          GTFS static loader (stops/routes/trips/stop_times/transfers)
  data/              synthetic timetable, illustrative station graphs, model inputs
  plan/ stations/ insights/   the three interfaces
```

**One world, three views.** `data/world.ts` builds a single `World` (timetable + station graphs + delay models). Plan, Stations and Insights all call `connectionProbability` / `resolveTransfer` from `engine/transfer.ts`, so the percentage a rider sees for the 7:55 AM Woodside connection is computed by the same code that flags it in Insights.

**Routing.** Candidate journeys come from RAPTOR (Delling et al.), which returns the Pareto set over arrival time and number of trips. It runs once for every departure in the next 75 minutes (range query), then again with each used route banned in turn to surface diverse alternatives. Candidate generation deliberately uses the *published* minimum transfer times, as a conventional planner would, so risky connections are found and then evaluated rather than hidden. In step-free mode RAPTOR instead uses elevator-only paths through the station graphs and drops transfers that have none.

**Transfer model.** A transfer is a path through an indoor graph (platform segments, stairs, escalators, elevators, fare control, sidewalks, crosswalks). Each edge has a log-normal traversal time. A sample draws: where on the platform the rider alights (random unless they follow the car hint), one walking-speed factor shared across the whole path, per-edge noise, and crowd slowdown and queueing during events. The connection succeeds if `inbound arrival + delay + walk ≤ outbound departure + delay − boarding buffer`. Inbound and outbound delays come from a mixture model (on time with small noise, or late with an exponential tail) that builds along the trip. Probabilities come from seeded Monte Carlo (1,500–3,000 draws) with Wilson intervals, and they are labelled as model estimates on synthetic inputs.

**Journey evaluation.** Each candidate is simulated end to end. When a connection is missed, the rider re-plans from that stop with RAPTOR, so the cost of missing reflects the actual next-best option (for example, falling back from Woodside to the Jamaica through train). Journeys that share the same final train and transfer points are grouped. The planner shows the latest departure that still makes every connection in at least 85% of simulations, and lists later "on paper" departures with their odds.

**Ranking.** Planning cost (minutes) = expected time to arrival (including miss risk and re-planning) + 3 min per transfer + 0.5 × walking beyond 6 minutes. Arrive-by mode ranks by latest departure, with a penalty when the on-time probability is below 90%. The breakdown is shown under each route.

**Insights.** For synthetic transfer flows (e.g. Woodside 7 → LIRR eastbound), every inbound trip is paired with its timetabled connection. 100 synthetic service days are replayed using common random numbers: trip delays and walking draws are seeded per day, trip and connection, so before/after comparisons differ only by the intervention. A connection is a **phantom connection** when its window meets the published minimum but under 70% of riders make it.

**Interventions.** *Hold* lets an outbound train wait up to N seconds for late connecting riders. The hold delays that train at every later stop, which can break downstream connections (for example at Huntington), and it costs riders on board (synthetic load × hold time). *Shift* moves a whole trip and warns about headway conflicts. *Faster walkway* shortens one station-graph edge. Results report riders connecting, riders missing, average wait, passenger-minutes, hold cost and net change.

## Simplifications

- **Synthetic data everywhere.** The timetable, delay distributions, demand, onboard loads and event impacts are invented. Station graphs are hand-authored, labelled *illustrative*, and not surveyed.
- **Trip delays are independent across trips** (apart from event scaling). Real delays are correlated across a line and over time.
- **Holds are modelled one station at a time.** Effects on following trains, crews and track capacity are not modelled, and riders already on a shifted train are not costed.
- **"Wait if missed" in Insights** is the next departure on the same line. The rider planner re-plans across the network instead.
- **Calendars and fares are not modelled.** One weekday is represented.
- **Map** is a schematic projection of approximate stop coordinates with no street basemap.

## Using real data

- **Static schedules:** `engine/gtfs.ts` loads MTA GTFS (`gtfs_subway.zip`, `gtfslirr.zip` from <https://www.mta.info/developers>) into the same `Timetable` type. Filter trips by `calendar.txt` for the service day. Map `parent_station` to station-graph ids, and author bindings from GTFS stop ids to platform nodes.
- **Real time:** MTA GTFS-Realtime feeds are protobuf. Run a small proxy that decodes them and returns the JSON shape documented in `engine/realtime.ts`, then set `VITE_REALTIME_PROXY_URL` (see `.env.example`). Trip updates older than 5 minutes are ignored, and the UI says so. Check the MTA terms of use before deploying. Use of MTA logos and route symbols requires a licence, so route chips here use neutral styling with informational colours.
- **Station geometry:** replace the illustrative graphs in `data/stations.ts` with verified layouts and set `verification: 'verified'`. The UI provenance labels read from that field.
