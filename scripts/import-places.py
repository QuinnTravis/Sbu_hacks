"""Import named OSM discoveries within 1.2 km of every LIRR route.

OSM geometry remains ODbL data. Wikipedia passages are stored with attribution
and CC BY-SA 4.0 metadata. This does NOT mark any generated story verified.
"""
import json
import math
import pathlib
import time
import urllib.parse
import urllib.request
import urllib.error
import sys
import re
from collections import defaultdict
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[1]
HEADERS = {'User-Agent': 'TrainDiscovery/0.1 (LIRR place research; contact via project repository)'}
TOP_PER_ROUTE = 40
OBJECT_NAME = re.compile(r"\b(House|Homestead|Manor|Hall|Church|Meeting|Mill|Fort|Armory|Tavern|Inn|Museum|Mansion|Cottage|Chapel|Synagogue|Lighthouse|Farmhouse)\b", re.I)
RADIO = re.compile(r"\b(AM|FM|TV|Cell Tower)\b")
BRIDGE_NAME = re.compile(r"\b(Bridge|Viaduct|Trestle)\b")
HERITAGE_TYPES = {'building','manor','house','church','place_of_worship','theatre','school','military','maritime','locomotive','railway_car','railway','heritage'}

def classify(place):
    """Category for a place worth looking up from the train, or None to drop it.

    Keep a discrete thing a rider can point at and then hear about: a heritage
    building, a ruin or former use, a museum, a named bridge, or a natural
    place with a source. Drop plaques, street bridges, radio masts, artwork,
    and ordinary stations. Those are not the view.
    """
    tags = place.get('tags') or {}
    name = place.get('name') or ''
    historic = tags.get('historic','')
    tourism = tags.get('tourism','')
    railway = tags.get('railway','')
    wiki = bool(place.get('wikipedia') or place.get('wikidata'))
    heritage = bool(tags.get('heritage'))
    dated = bool(tags.get('start_date') or tags.get('architect'))
    story = wiki or heritage or dated
    named_object = bool(OBJECT_NAME.search(name))
    if not name or RADIO.search(name) or re.search(r'\bHistoric District\b', name, re.I):
        return None
    if tags.get('man_made') in ('tower','mast','antenna','chimney','water_tower') and tags.get('man_made') != 'lighthouse' and not heritage:
        return None
    if tourism in ('artwork','hotel','information','yes','attraction'):
        return None
    if historic in ('memorial','monument','grave','cannon','yes','milestone','tree','district'):
        return None
    if railway == 'station' and 'Long Island Rail Road' not in tags.get('operator',''):
        return None
    if 'bridge' in tags and not BRIDGE_NAME.search(name):
        return None
    score = (4 if place.get('wikipedia') else 2 if place.get('wikidata') else 0) + (3 if heritage else 0) + (1 if dated else 0)
    nature = tourism == 'viewpoint' or tags.get('leisure') in ('park','nature_reserve') or bool(tags.get('natural')) or tags.get('boundary') == 'protected_area'
    if historic == 'ruins' or railway in ('disused','abandoned','roundhouse','turntable'):
        return ('Former use', score + 5)
    if tags.get('railway') == 'yard' and story:
        return ('Former use', score + 3)
    if nature and (story or re.search(r'\b(Preserve|Beach|Park|Marsh|Refuge|Lake|Pond|Harbor|Harbour|Bay)\b', name, re.I)):
        return ('Nature', score + 5)
    if tourism == 'museum' and (story or named_object or re.search(r'Museum|Historical', name, re.I)):
        return ('Heritage', score + 4)
    if historic in HERITAGE_TYPES and (story or named_object or re.search(r'\bHistorical\b', name, re.I)):
        return ('Heritage', score + 3)
    if 'bridge' in tags and wiki:
        return ('Landmark', score + 2)
    if tags.get('man_made') == 'lighthouse' and (story or named_object):
        return ('Landmark', score + 4)
    return None

def lirr_station(place):
    tags = place.get('tags') or {}
    return tags.get('railway') == 'station' and 'Long Island Rail Road' in tags.get('operator','') and bool(place.get('wikipedia'))

def select(places, routes):
    """Keep the strongest window subjects, capped per route, with a station fallback."""
    scored = []
    for place in places:
        ranked = classify(place)
        if not ranked:
            continue
        category, score = ranked
        chosen = dict(place)
        chosen['category'] = category
        chosen['_score'] = score
        scored.append(chosen)
    by_id = {place['id']: place for place in scored}
    kept_routes = defaultdict(set)
    for route in routes:
        group = [place for place in scored if route['id'] in place['routeIds']]
        group.sort(key=lambda place: (-place['_score'], place['name']))
        for place in group[:TOP_PER_ROUTE]:
            kept_routes[place['id']].add(route['id'])
    for route in routes:
        if any(route['id'] in ids for ids in kept_routes.values()):
            continue
        stations = [place for place in places if lirr_station(place) and route['id'] in place['routeIds']]
        stations.sort(key=lambda place: place['name'])
        for place in stations[:6]:
            if place['id'] not in by_id:
                chosen = dict(place)
                chosen['category'] = 'Station'
                chosen['_score'] = 0
                by_id[place['id']] = chosen
            kept_routes[place['id']].add(route['id'])
    chosen_places = []
    for place_id, route_ids in kept_routes.items():
        place = by_id[place_id]
        place['routeIds'] = sorted(route_ids)
        place.pop('_score', None)
        chosen_places.append(place)
    chosen_places.sort(key=lambda place: place['name'])
    return chosen_places

def fetch(url, data=None):
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, data=data, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=100) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if error.code == 429 or attempt == 2:
                raise
            time.sleep(3 * (attempt+1))
        except Exception:
            if attempt == 2:
                raise
            time.sleep(3 * (attempt+1))

def main():
    rail = json.loads((ROOT/'public/data/lirr.json').read_text())
    if '--select-only' in sys.argv:
        catalog = json.loads((ROOT/'public/data/places.json').read_text())
        catalog['places'] = select(catalog['places'], rail['routes'])
        temp = ROOT/'public/data/places.json.tmp'
        temp.write_text(json.dumps(catalog,separators=(',',':')))
        temp.replace(ROOT/'public/data/places.json')
        places = catalog['places']
        print(f'{len(places)} places kept; {sum(bool(p["evidence"]) for p in places)} with source passages')
        for route in rail['routes']:
            print(route['name'], sum(route['id'] in p['routeIds'] for p in places))
        return
    previous_path = ROOT/'public/data/places.json'
    previous = {p['id']:p for p in json.loads(previous_path.read_text())['places']} if previous_path.exists() else {}
    cache = ROOT/'scripts/.osm-cache.json'
    if cache.exists() and time.time()-cache.stat().st_mtime < 86400 and '--refresh' not in sys.argv:
        osm = json.loads(cache.read_text())
    else:
        bbox = '40.53,-74.04,41.04,-71.83'
        query = f'''[out:json][timeout:75];(
          nwr[historic][name]({bbox});
          nwr[tourism~"^(museum|viewpoint)$"][name]({bbox});
          nwr[man_made=lighthouse][name]({bbox});
          nwr[railway~"^(depot|yard|roundhouse|turntable|abandoned|disused)$"][name]({bbox});
          nwr[bridge=yes][name~"[Bb]ridge|[Vv]iaduct|[Tt]restle"][wikipedia]({bbox});
          nwr[heritage][name]({bbox});
          nwr[railway=station][operator="Long Island Rail Road"][name]({bbox});
          nwr[leisure~"^(park|nature_reserve)$"][name][wikipedia]({bbox});
          nwr[natural~"^(beach|wetland|bay)$"][name]({bbox});
          nwr[boundary=protected_area][name][wikipedia]({bbox});
        );out center tags;'''
        osm = fetch('https://overpass-api.de/api/interpreter', urllib.parse.urlencode({'data': query}).encode())
        if osm.get('remark'):
            raise RuntimeError(osm['remark'])
        cache.write_text(json.dumps(osm))
    grid = defaultdict(list)
    cell = 0.025
    for route in rail['routes']:
        for path in route['paths']:
            for a, b in zip(path, path[1:]):
                # Index segments into every intersected cell (long express segments included).
                for x in range(math.floor(min(a[0],b[0])/cell),math.floor(max(a[0],b[0])/cell)+1):
                    for y in range(math.floor(min(a[1],b[1])/cell),math.floor(max(a[1],b[1])/cell)+1):
                        grid[(x,y)].append((route['id'], a, b))
    def nearby(lat, lon):
        scale = math.cos(math.radians(lat)); found = set()
        x, y = math.floor(lat/cell), math.floor(lon/cell)
        for cx in range(x-1,x+2):
            for cy in range(y-1,y+2):
                for rid, a, b in grid[(cx,cy)]:
                    if rid in found:
                        continue
                    ax, ay = (a[1]-lon)*scale, a[0]-lat
                    dx, dy = (b[1]-a[1])*scale, b[0]-a[0]
                    t = max(0,min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy or 1)))
                    if math.hypot(ax+t*dx,ay+t*dy)*111195 < 1200:
                        found.add(rid)
        return sorted(found)
    places, duplicates = [], set()
    for entry in osm['elements']:
        p = entry.get('center', entry)
        lat, lon = p.get('lat'), p.get('lon')
        if lat is None or lon is None:
            continue
        routes = nearby(lat,lon)
        if not routes:
            continue
        tags = entry['tags']; name = tags['name']; key = (name.lower(),round(lat,3),round(lon,3))
        # A named rail segment isn't a distinct landmark just because it is on a bridge.
        if tags.get('railway') == 'rail' and not any(k in tags for k in ['historic','wikidata','wikipedia','tourism']):
            continue
        if 'bridge' in tags and not any(k in tags for k in ['historic','wikidata','wikipedia','tourism','heritage','man_made']) and not re.search(r'\b(bridge|viaduct|trestle)\b', name, re.I):
            continue
        if tags.get('wikidata'):
            key = ('wikidata',tags['wikidata'])
        if key in duplicates:
            continue
        duplicates.add(key)
        category = 'History'
        wikipedia = tags.get('wikipedia','')
        if wikipedia.startswith('en:'):
            wikipedia = wikipedia[3:]
        elif wikipedia and ':' in wikipedia:
            wikipedia = ''
        places.append({'id':f"osm-{entry['type']}-{entry['id']}",'name':name,'lat':lat,'lon':lon,'category':category,'routeIds':routes,'wikipedia':wikipedia,'wikidata':tags.get('wikidata',''),'sourceUrl':f"https://www.openstreetmap.org/{entry['type']}/{entry['id']}",'tags':{k:v for k,v in tags.items() if k in ['historic','tourism','start_date','architect','operator','railway','man_made','heritage','bridge','leisure','natural','boundary','abandoned','disused']},'evidence':[]})
        old = previous.get(places[-1]['id'])
        if old and old['name'] == name and old.get('wikidata','') == tags.get('wikidata',''):
            places[-1]['wikipedia'] = old.get('wikipedia',wikipedia)
            places[-1]['evidence'] = old.get('evidence',[])
            if old.get('story'):
                places[-1]['story'] = old['story']
    # Resolve Wikidata→Wikipedia where OSM only has a Wikidata ID.
    missing = [p for p in places if not p['wikipedia'] and p['wikidata']] if '--skip-enrichment' not in sys.argv else []
    for offset in range(0,len(missing),40):
        batch = missing[offset:offset+40]
        url = 'https://www.wikidata.org/w/api.php?'+urllib.parse.urlencode({'action':'wbgetentities','ids':'|'.join(p['wikidata'] for p in batch),'props':'sitelinks','sitefilter':'enwiki','format':'json'})
        try:
            time.sleep(1.5)
            entities = fetch(url).get('entities',{})
        except urllib.error.HTTPError as error:
            print(f'Wikidata enrichment deferred: HTTP {error.code}.',flush=True)
            break
        for p in batch:
            p['wikipedia'] = entities.get(p['wikidata'],{}).get('sitelinks',{}).get('enwiki',{}).get('title','')
    places[:] = select(places, rail['routes'])
    def stale(p):
        if not p['evidence']:
            return True
        try:
            return (datetime.now(timezone.utc)-datetime.fromisoformat(p['evidence'][0]['retrievedAt'])).total_seconds()>7*86400
        except (ValueError,KeyError):
            return True
    titled = [p for p in places if p['wikipedia'] and stale(p)] if '--skip-enrichment' not in sys.argv else []
    def checkpoint():
        # Keep completed batches if an upstream service throttles or becomes unavailable.
        result = {'importedAt':datetime.now(timezone.utc).isoformat(),'source':'OpenStreetMap / Overpass','license':'ODbL-1.0','places':places}
        temp = ROOT/'public/data/places.json.tmp'
        temp.write_text(json.dumps(result,separators=(',',':')))
        temp.replace(ROOT/'public/data/places.json')
    checkpoint()
    for offset in range(0,len(titled),20):
        batch = titled[offset:offset+20]
        url = 'https://en.wikipedia.org/w/api.php?'+urllib.parse.urlencode({'action':'query','titles':'|'.join(p['wikipedia'] for p in batch),'prop':'extracts|info','explaintext':1,'exintro':1,'inprop':'url','redirects':1,'format':'json'})
        try:
            time.sleep(1.5)
            response = fetch(url)
        except urllib.error.HTTPError as error:
            print(f'Enrichment deferred: HTTP {error.code}. Completed batches are saved; rerun later.',flush=True)
            break
        pages = {p['title']:p for p in response.get('query',{}).get('pages',{}).values()}
        redirects = {p['from']:p['to'] for p in response.get('query',{}).get('redirects',[])}
        for p in batch:
            title = redirects.get(p['wikipedia'],p['wikipedia']); page = pages.get(title)
            if page and page.get('extract'):
                old_evidence = [(e['id'],e['url'],e['text']) for e in p['evidence']]
                p['evidence'] = [{'id':f"wikipedia-{page['pageid']}",'title':title,'url':page['fullurl'],'text':page['extract'][:14000],'retrievedAt':datetime.now(timezone.utc).isoformat(),'license':'CC BY-SA 4.0'}]
                if old_evidence != [(e['id'],e['url'],e['text']) for e in p['evidence']]:
                    p.pop('story',None)
        print(f'Evidence {min(offset+20,len(titled))}/{len(titled)}', flush=True)
        checkpoint()
    checkpoint()
    print(f'{len(places)} places; {sum(bool(p["evidence"]) for p in places)} with source passages')
    for route in rail['routes']:
        print(route['name'],sum(route['id'] in p['routeIds'] for p in places))

if __name__ == '__main__':
    main()
