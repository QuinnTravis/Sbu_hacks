import type { World } from '../engine/network';
import type { JourneyEval, TransferEval } from '../engine/evaluate';
import { instructions } from '../engine/station';
import { demandFlows } from '../data/models';
import { bindingKey, type InsightsFocus, type StationFocus } from '../app/settings';
import { Icon, NeedVsWindow, Prov, RiskPill, RouteChip, fmtClock, fmtMin, fmtRange, pct, riskTone } from '../ui/kit';

export function flowFor(t: TransferEval, world: World, j: JourneyEval) {
  const a = world.tt.trips[j.journey.rides[t.index].tripId];
  const b = world.tt.trips[j.journey.rides[t.index + 1].tripId];
  return demandFlows.find(
    (f) =>
      f.fromStop === t.model.fromStop && f.toStop === t.model.toStop &&
      f.inRoute === a.routeId && f.inDir === a.directionId && f.outRoute === b.routeId && f.outDir === b.directionId,
  );
}

export function TransferBlock({
  world,
  journey,
  t,
  onOpenStation,
  onOpenInsights,
}: {
  world: World;
  journey: JourneyEval;
  t: TransferEval;
  onOpenStation: (f: StationFocus) => void;
  onOpenInsights: (f: InsightsFocus) => void;
}) {
  const { model, conn } = t;
  const rides = journey.journey.rides;
  const nextRide = rides[t.index + 1];
  const outRoute = world.tt.routes[nextRide.routeId];
  const tone = riskTone(conn.assessment);
  const path = model.paths?.best.path ?? null;
  const steps = model.graph && path ? instructions(model.graph, path) : [];
  const leavesFare = path?.steps.some((s) => s.edge.kind === 'fare');
  const missedBy = t.arrivalIfMissedSec !== null ? t.arrivalIfMissedSec - journey.journey.arriveSec : null;
  const flow = flowFor(t, world, journey);
  const need = conn.marginSamples.map((m) => m + conn.windowSec);

  return (
    <div className={`transfer risk-${tone}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
          <strong>Transfer at {model.stationName}</strong>
          <span className="small muted">
            {model.inBinding?.label ?? world.tt.stops[model.fromStop].name} → {model.outBinding?.label ?? world.tt.stops[model.toStop].name}
            {leavesFare ? ' · leaves fare control' : ''}
          </span>
        </div>
        <RiskPill a={conn.assessment}>
          {conn.assessment === 'impossible' ? 'Not possible' : `${pct(conn.pSuccess)} make it`}
        </RiskPill>
      </div>

      {!model.feasible && <div className="banner bad">{Icon.alert(16)}<span>{model.infeasibleReason}</span></div>}

      <div className="facts">
        <div className="fact">
          <span className="k">Scheduled window</span>
          <span className="v">{fmtMin(conn.windowSec)}</span>
          <span className="small muted">timetable minimum {fmtMin(model.schedMinSec)}</span>
        </div>
        <div className="fact">
          <span className="k">Estimated transfer</span>
          <span className="v">{model.feasible ? fmtRange(conn.physical.p10, conn.physical.p90) : '—'}</span>
          <span className="small muted">+ {model.outBoardBufferSec}s before doors close</span>
        </div>
        <div className="fact">
          <span className="k">If missed</span>
          <span className="v">{t.arrivalIfMissedSec !== null ? `Arrive ${fmtClock(t.arrivalIfMissedSec)}` : 'No later service'}</span>
          <span className="small muted">{missedBy !== null ? (missedBy <= 60 ? 'same final arrival' : `+${fmtMin(missedBy)} vs plan`) : ''}</span>
        </div>
      </div>

      {model.feasible && conn.windowSec >= 0 && (
        <div style={{ display: 'grid', gap: 4 }}>
          <span className="small muted">Time needed (walk + train delays + boarding) vs. the {outRoute.mode === 'rail' ? 'train' : outRoute.mode === 'bus' ? 'bus' : 'train'}’s departure. Red: rider misses it.</span>
          <NeedVsWindow needSec={need} windowSec={conn.windowSec} />
        </div>
      )}

      {t.carHint && t.connBestCar && t.connBestCar.pSuccess > conn.pSuccess + 0.02 && (
        <div className="banner">
          {Icon.info(16)}
          <span>
            <strong>{t.carHint}</strong> — it is closest to the exit you need. Raises the modelled chance from {pct(conn.pSuccess)} to {pct(t.connBestCar.pSuccess)}.
          </span>
        </div>
      )}

      {!model.modeled && (
        <div className="banner">{Icon.info(16)}<span>No indoor model for this station yet. The estimate is a wide distribution around the published minimum transfer time.</span></div>
      )}

      {steps.length > 0 && (
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <span className="eyebrow">Walking directions</span>
            <Prov>{model.graph?.verification === 'verified' ? 'Verified layout' : 'Illustrative layout'}</Prov>
          </div>
          <ol className="steps">
            {steps.map((s, i) => (
              <li key={i}>
                <span>{s.text}</span>
                <span className="sec">~{Math.max(1, Math.round(s.sec / 10) * 10)}s</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="row-actions">
          {model.graph && model.inBinding && model.outBinding && (
            <button className="btn" onClick={() => onOpenStation({ stationId: model.graph!.id, fromKey: bindingKey(model.inBinding!), toKey: bindingKey(model.outBinding!), timeSec: rides[t.index].arr })}>
              {Icon.station(16)} Station layout
            </button>
          )}
          {flow && (
            <button className="btn" onClick={() => onOpenInsights({ fromStop: model.fromStop, toStop: model.toStop, inTripId: rides[t.index].tripId })}>
              {Icon.insights(16)} Network view
            </button>
          )}
        </div>
        <Prov>Model estimate · synthetic inputs</Prov>
      </div>
    </div>
  );
}

export function JourneyDetail({
  world,
  journey,
  onOpenStation,
  onOpenInsights,
}: {
  world: World;
  journey: JourneyEval;
  onOpenStation: (f: StationFocus) => void;
  onOpenInsights: (f: InsightsFocus) => void;
}) {
  const { tt } = world;
  const j = journey.journey;
  const stopName = (id: string) => tt.stops[id].name;
  return (
    <div className="timeline">
      {j.accessSec > 0 && (
        <div className="leg walk">
          <span className="t">{fmtClock(j.departSec)}</span>
          <span className="bar"><span className="node" style={{ borderColor: 'var(--ink)' }} /></span>
          <div className="body">
            <span className="stop">Leave</span>
            <span className="sub">{Icon.walk(14)} Walk to {stopName(j.accessStop)} · {fmtMin(j.accessSec)}</span>
          </div>
        </div>
      )}
      {j.rides.map((r, i) => {
        const route = tt.routes[r.routeId];
        const trip = tt.trips[r.tripId];
        const isLast = i === j.rides.length - 1;
        return (
          <div key={r.tripId + i}>
            <div className="leg" style={{ ['--c' as string]: route.color }}>
              <span className="t">{fmtClock(r.dep)}</span>
              <span className="bar"><span className="node" /></span>
              <div className="body">
                <span className="stop">{stopName(r.fromStop)}</span>
                <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <RouteChip route={route} />
                  <span className="small">{route.mode === 'rail' ? trip.service : route.longName} toward {trip.headsign}</span>
                </span>
                <span className="sub">{r.toIdx - r.fromIdx} stop{r.toIdx - r.fromIdx === 1 ? '' : 's'} · {fmtMin(r.arr - r.dep)}</span>
              </div>
            </div>
            <div className={`leg${isLast ? ' end' : ' walk'}`} style={{ ['--c' as string]: route.color }}>
              <span className="t">{fmtClock(r.arr)}</span>
              <span className="bar"><span className="node" style={isLast ? { borderRadius: 3, background: 'var(--ink)', borderColor: 'var(--ink)' } : undefined} /></span>
              <div className="body">
                <span className="stop">{stopName(r.toStop)}</span>
                {isLast && j.egressSec > 0 && <span className="sub">Walk to destination · {fmtMin(j.egressSec)}</span>}
                {!isLast && journey.transfers[i] && (
                  <TransferBlock world={world} journey={journey} t={journey.transfers[i]} onOpenStation={onOpenStation} onOpenInsights={onOpenInsights} />
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
