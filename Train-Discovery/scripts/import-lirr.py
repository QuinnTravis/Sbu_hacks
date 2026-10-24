"""Download official MTA GTFS and emit a compact, traceable route snapshot."""
import csv
import io
import json
import math
import pathlib
import urllib.request
import zipfile
from collections import defaultdict
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[1]
URL = 'https://rrgtfsfeeds.s3.amazonaws.com/gtfslirr.zip'

def simplify(points, epsilon=0.00012):
    if len(points) < 3:
        return points
    a, b = points[0], points[-1]
    dx, dy = b[0]-a[0], b[1]-a[1]
    denom = dx*dx+dy*dy
    best, index = 0, 0
    for i, p in enumerate(points[1:-1], 1):
        t = max(0, min(1, ((p[0]-a[0])*dx+(p[1]-a[1])*dy)/denom)) if denom else 0
        d = math.hypot(p[0]-a[0]-t*dx, p[1]-a[1]-t*dy)
        if d > best:
            best, index = d, i
    if best > epsilon:
        return simplify(points[:index+1], epsilon)[:-1]+simplify(points[index:], epsilon)
    return [a, b]

def main():
    raw = urllib.request.urlopen(URL, timeout=30).read()
    feed = zipfile.ZipFile(io.BytesIO(raw))
    def rows(name):
        return list(csv.DictReader(io.TextIOWrapper(feed.open(name), encoding='utf-8-sig')))
    trips = rows('trips.txt')
    by_trip = {t['trip_id']: t for t in trips}
    trip_stops = defaultdict(list)
    for s in rows('stop_times.txt'):
        trip_stops[s['trip_id']].append((int(s['stop_sequence']), s['stop_id']))
    shape_points = defaultdict(list)
    for p in rows('shapes.txt'):
        shape_points[p['shape_id']].append((int(p['shape_pt_sequence']), float(p['shape_pt_lat']), float(p['shape_pt_lon'])))
    shapes = {k: simplify([[round(p[1], 6), round(p[2], 6)] for p in sorted(v)]) for k, v in shape_points.items()}
    stops = {s['stop_id']: {'id': s['stop_id'], 'name': s['stop_name'], 'lat': float(s['stop_lat']), 'lon': float(s['stop_lon'])} for s in rows('stops.txt')}
    routes = []
    for r in rows('routes.txt'):
        matching = [t for t in trips if t['route_id'] == r['route_id']]
        shape_ids = sorted({t['shape_id'] for t in matching if t['shape_id'] in shapes})
        # Reversed and overlapping variants are retained: nearby ranking must cover every terminal.
        paths = [shapes[s] for s in shape_ids]
        stop_ids = {sid for tid, sequence in trip_stops.items() if by_trip.get(tid, {}).get('route_id') == r['route_id'] for _, sid in sequence}
        extra = {}
        # GTFS advertises Belmont Park but currently supplies no trips/shapes.
        # Keep its real rail spur discoverable using an attributed OSM snapshot.
        if not paths and r['route_id'] == '11':
            supplemental = json.loads((ROOT/'public/data/belmont-osm.json').read_text())
            paths = [simplify([[p['lat'],p['lon']] for p in w['geometry']]) for w in supplemental['elements'] if w.get('tags',{}).get('usage') == 'branch']
            stop_ids = {sid for sid, s in stops.items() if 'Belmont' in s['name']}
            extra = {'geometrySource': 'OpenStreetMap contributors', 'geometryLicense': 'ODbL-1.0', 'serviceNote': 'Special service. Track geometry from OpenStreetMap; no scheduled trips in this GTFS snapshot.'}
        routes.append({'id': r['route_id'], 'name': r['route_long_name'], 'color': '#'+r['route_color'], 'paths': paths, 'stops': [stops[s] for s in sorted(stop_ids)], **extra})
    out = {'source': URL, 'importedAt': datetime.now(timezone.utc).isoformat(), 'version': rows('feed_info.txt')[0]['feed_version'], 'routes': routes}
    target = ROOT/'public/data/lirr.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(out, separators=(',', ':')))
    print(f'{len(routes)} routes, {len(stops)} stops, {target.stat().st_size:,} bytes → {target}')

if __name__ == '__main__':
    main()
