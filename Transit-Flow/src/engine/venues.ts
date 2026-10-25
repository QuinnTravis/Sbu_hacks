// Venues near the modelled network whose events load trains, and how a
// full-size event there affects each station and route. Impact values are
// assumptions in the same style as the sample event in data/models.ts.
// Keys in `stations` are station ids, or stop ids where no station model exists.
// No imports: the dev-server event detector (events-server.ts) shares this file.

export interface Venue {
  id: string;
  name: string;
  /** What the venue hosts, to steer detection. */
  hosts: string;
  /** Typical event length when the end time is unknown, in hours. */
  typicalHours: number;
  stations: Record<string, number>;
  routes: Record<string, number>;
}

export const VENUES: Venue[] = [
  {
    id: 'citi-field',
    name: 'Citi Field',
    hosts: 'Mets baseball, NYCFC soccer, stadium concerts',
    typicalHours: 3,
    stations: { 'mets-willets': 2.6, woodside: 1.9, 'jackson-heights': 1.6, flushing: 1.3 },
    routes: { '7': 1.9, 'LIRR-PW': 1.3 },
  },
  {
    id: 'usta',
    name: 'USTA Billie Jean King National Tennis Center (Arthur Ashe Stadium)',
    hosts: 'US Open tennis, concerts at Arthur Ashe Stadium',
    typicalHours: 4,
    stations: { 'mets-willets': 2.0, woodside: 1.4, 'jackson-heights': 1.3, flushing: 1.2 },
    routes: { '7': 1.5, 'LIRR-PW': 1.2 },
  },
  {
    id: 'forest-hills-stadium',
    name: 'Forest Hills Stadium',
    hosts: 'outdoor concerts',
    typicalHours: 3.5,
    stations: { 'E-FH': 2.2, 'jackson-heights': 1.3 },
    routes: { E: 1.5 },
  },
  {
    id: 'msg',
    name: 'Madison Square Garden (above Penn Station)',
    hosts: 'Knicks, Rangers, concerts',
    typicalHours: 3,
    stations: { 'L-PENN': 2.0, woodside: 1.3 },
    routes: { 'LIRR-PJ': 1.3, 'LIRR-PW': 1.2 },
  },
  {
    id: 'flushing-meadows',
    name: 'Flushing Meadows Corona Park (outdoor festivals, Queens Museum)',
    hosts: 'festivals, fairs, large outdoor gatherings',
    typicalHours: 6,
    stations: { 'mets-willets': 1.7, flushing: 1.3, 'jackson-heights': 1.2 },
    routes: { '7': 1.3 },
  },
];

export type EventSize = 'small' | 'medium' | 'large';

/** Event as reported by the detector, before it is turned into a model window. */
export interface DetectedEvent {
  title: string;
  venueId: string;
  /** HH:MM, New York time. */
  start: string;
  end?: string | null;
  size: EventSize;
  sourceUrl?: string | null;
}

export interface DetectorResponse {
  events: DetectedEvent[];
  /** Why detection could not run, if it could not. */
  error?: string;
}
