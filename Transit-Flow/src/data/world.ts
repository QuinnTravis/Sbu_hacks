import { makeWorld } from '../engine/network';
import { delayModels } from './models';
import { buildDemoTimetable } from './network';
import { stationGraphs } from './stations';

/** The single demo world shared by Plan, Stations and Insights. */
export const demoWorld = makeWorld(buildDemoTimetable(), stationGraphs, delayModels);
