"""Emit escaped SQL for use with the Supabase MCP execute_sql connector."""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
def quote(value):
    return "'"+str(value).replace("'", "''")+"'"

kind = sys.argv[1]
offset = int(sys.argv[2]) if len(sys.argv) > 2 else 0
count = int(sys.argv[3]) if len(sys.argv) > 3 else 100
if kind == 'routes':
    rows = json.loads((ROOT/'public/data/lirr.json').read_text())['routes']
    values = [f"({quote(r['id'])},{quote(json.dumps(r,separators=(',',':')))}::jsonb)" for r in rows[offset:offset+count]]
    print('insert into public.rail_routes(id,data) values '+','.join(values)+' on conflict(id) do update set data=excluded.data,imported_at=now();')
else:
    rows = json.loads((ROOT/'public/data/places.json').read_text())['places']
    values = [f"({quote(p['id'])},{quote(p['name'])},{p['lat']},{p['lon']},array[{','.join(quote(r) for r in p['routeIds'])}]::text[],{quote(json.dumps(p,separators=(',',':')))}::jsonb)" for p in rows[offset:offset+count]]
    print('insert into public.places(id,name,latitude,longitude,route_ids,data) values '+','.join(values)+' on conflict(id) do update set name=excluded.name,latitude=excluded.latitude,longitude=excluded.longitude,route_ids=excluded.route_ids,data=excluded.data,updated_at=now();')
