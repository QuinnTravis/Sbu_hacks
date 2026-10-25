# Train Discovery

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

LIRR passengers using a phone during a train ride.

## Product Purpose

Discover places and their history by pointing a phone at the world outside the train.

## Operating Context

Select a nearby LIRR branch, start a ride, and use live location and absolute device orientation to discover nearby points of interest. Tapping a place opens its card and plays its story once. Not interested hides a place for the rest of the ride. A saved discovery stays on the device after the ride ends. Unprompted narration picks the nearby place that is closest and most interesting.

## Capabilities and Constraints

All LIRR branches; Next.js PWA; Supabase database; Gemini through a structured LangChain evidence and verification pipeline; Google Places photography with attribution. No left/right window selector. The adjacent sbuhacks-demo repository supplies flow context only. Network outages, missing location permissions, and unavailable compass readings need recoverable states. Camera recognition is outside the current scope.

## Product Principles

- Few controls and minimal copy; no explanatory subtitles for obvious controls.
- Sources support every published historical claim.
- No promise of line of sight from geographic proximity alone.
- No ride queue: Saved is the one list the rider keeps. Saved discoveries stay on the device until removed.
- Quality over quantity in automatic narration: a verified story, or a source excerpt right beside the line. Anything thinner plays only when the rider asks.
- Location stays on the device except for the immediate nearby lookup; no location history is stored by default.

## Open Decisions

Deployment hostname and provider API credentials are not yet supplied. Device heading requires real iOS and Android testing on a train before release.

## Evidence on Hand

Official MTA static GTFS includes all 13 route/service records and geographic shapes. Free OpenStreetMap and Wikimedia APIs provide candidate places and evidence. Existing flow demo: ../sbuhacks-demo.

## Visual reference
The user explicitly requires the theme of Waymo iOS from https://mobbin.com/apps/waymo-ios-028a65c1-23a8-4fe1-bcf0-aab15ced5842/dc7cedc4-3442-452c-a4ac-e0181cdac9fd/screens . This replaces the original green interface. Match the supplied screen palette, typography, pill controls, rounded sheets, and floating navigation while keeping Train Discovery identity and functionality.
