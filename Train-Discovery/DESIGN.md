---
name: Train Discovery — Waymo reference
description: Match the Waymo iOS theme explicitly supplied by the user.
colors:
  canvas: "#eaedf3"
  paper: "#fefeff"
  ink: "#0c101d"
  muted: "#5d6069"
  line: "#cdd1db"
  primary: "#0071f2"
  selected: "#dfe3eb"
  steel: "#8e98a8"
  brass: "#8f6b3d"
typography:
  display:
    fontFamily: "Google Sans, Arial, sans-serif"
    fontSize: "35px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Google Sans, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  search:
    fontFamily: "Google Sans, Arial, sans-serif"
    fontSize: "22px"
    fontWeight: 500
rounded:
  search: "40px"
  shortcut: "28px"
  primary: "17px"
  sheet: "30px"
  navigation: "42px"
spacing:
  small: "8px"
  medium: "16px"
  large: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.paper}"
    rounded: "{rounded.primary}"
    height: "56px"
---

# Train Discovery

## Overview

The user rejected the previous green UI and explicitly pinned this reference: https://mobbin.com/apps/waymo-ios-028a65c1-23a8-4fe1-bcf0-aab15ced5842/dc7cedc4-3442-452c-a4ac-e0181cdac9fd/screens . The exact page's public previews are the visual authority. Its screenshot colors were sampled directly: canvas RGB(234,237,243), paper RGB(254,254,255), ink RGB(12,16,29), action blue RGB(0,113,242).

## Colors

Cool gray canvas, near-black text, white search and sheets, bright blue primary action. Branch colors appear only as route data. No green UI chrome.

## Steel and steam

A restrained instrument accent on the Waymo base. It does not replace the palette, type, pills, sheets, blue actions, or the map-centered route screen.

### Tokens

- `steel` `#8e98a8` — cool hairline, close to `line` `#cdd1db`. Use for a 1px hairline on the ride map frame, a 1px tick under the compass readout, and a 2px tick on the catalog failure alert.
- `brass` `#8f6b3d` — aged brass. Reserved, and not used. The compass needle is no longer the ride instrument.

### Where it may appear

- One 1px steel hairline on the ride map frame.
- The 1px steel tick under the compass readout, and steel marks on the loading, empty-aim, and failed-catalog queue states. Loading ticks may breathe; they stay steel.
- One 2px steel mark on the catalog retry alert.

### Forbidden

No gears, smoke, sepia, rivet frames, or ornate borders. No green chrome. No Waymo, Mapbox, or Google branding. Do not use brass on the ride map, the facing wedge, the rider dot, buttons, navigation, sheets, text, or a second moment such as the active discovery card or a progress dot. Do not add a second warm accent. Do not put steel on roads, labels, the rider dot, or the facing wedge.

## Ride map

The ride instrument is the map in the ride column. It is not a compass dial and not a default basemap embed. Ground is canvas `#eaedf3`. Roads and buildings are paper `#fefeff`. Casings, paths, and boundaries are line `#cdd1db`. Parks and woods are cool gray. Water is a quiet gray-blue. Place labels are ink `#0c101d`; road and water labels are muted `#5d6069`, with a paper halo. The branch line on this map uses that route’s color, as route data, with a paper casing. Action blue `#0071f2` marks the rider dot (white ring), the translucent facing wedge, and catalog points inside the actual pointing cone. All catalog places within the shared 1200m pointing radius appear as small paper dots with ink outlines, including places without sourced stories. In-cone dots use blue with a paper ring and a slightly larger diameter; without a heading all place dots stay neutral. Names are available through native titles and accessible labels, without persistent map labels or new selection actions. The rider stays centered on a north-up map; zoom uses the smaller measured canvas dimension to fit the full radius in every direction, so turning the phone never shifts or rotates the camera. The ride map is an edge-to-edge canvas; do not frame it as a card. Brass does not appear on this surface, and steel does not color the branch line. Attribution uses a compact, keyboard-accessible expandable control in a map corner; opening it reveals the complete OpenFreeMap, OpenMapTiles, and OpenStreetMap attribution. The collapsed control does not cover the dot, wedge, audio bar, candidate sheet, or tab bar. Replay stays labeled simulated.

## Typography

Locally hosted, Latin-subset Google Sans variable font under OFL, with its license in public/fonts. The route-selection home is centered on the geographic LIRR map; a floating bottom sheet holds nearby/all route selection and the primary action. No marketing subtitle.

## Layout

The ride map fills the viewport on phone and desktop. Its camera stays north-up and centered; pointing changes the cone, not the camera. Header, route status, audio, and navigation float above this canvas. Respect safe areas and dynamic viewport height. Keep the discovery sheet and queue content capped at 660px on desktop; the map itself has no content-width cap.

Holding an aim for 450ms reveals a compact nonmodal sheet with place names and distances. The sheet retains its candidate snapshot while it is open, so turning the phone cannot move a row under a finger. Selecting a candidate adds it to the ride queue and expands its photo/story in that same sheet, preserving the map behind it. A selected card remains while reading, even after heading changes. Drag the handle or use its accessible button to expand/collapse; close or drag down to dismiss. Closing never discards a discovery. Discard discovery is a separate labeled action within the full card.

Use one continuous spring for entrance, dragging, snap, and exit; drag follows the pointer without a CSS transition or React render per frame. Clamp overshoot, preserve the current animation position when interrupted, and disable motion for reduced-motion preferences. The handle and close control have at least 44px targets. The sheet is a nonmodal region with no backdrop or focus trap; its content scrolls separately. Closed sheets are inert. Nested photo dialogs own Escape before the sheet. Keep the sheet above the floating navigation, including the collapsed geometry and short landscape; do not let its backing cover the tab bar. Expanded reading replaces the route/audio chrome with a concise route and simulation/status row below the app header, leaving clear space for attribution. Attribution disclosure temporarily uses that context row. In short landscape, the selected card puts its text before the photo while retaining every section in the scroller.

The source summary, evidence state, photo details, and sources remain on the expanded discovery card. The chooser is text-only. Ride-queue and saved-discovery rows remain text-only. Map attribution remains a compact, keyboard-accessible expandable control with complete source links. Place it where neither the navigation nor the discovery sheet blocks it. Sensor failures, catalog retry, and simulated rides remain explicit. Route selection retains its geographic map, searchable route sheet, and Start ride action.

Route selection: the collapsed route sheet always carries the one primary start action (the demo ride, or Start ride once a route is selected). On wide screens (at least 1024px wide and 541px tall) the route sheet is a left column and the map fits the space beside it; on phones the map fits the space above the open sheet, so the selected route stays visible.

Captions: while narration speaks, the current line floats over the map directly under the top card, in a translucent paper box with ink text sized for reading across a room. Captions dim while paused and disappear when the guide stops or fails. They never cover the rider dot; on wide screens their width is capped at half the viewport.

## Elevation & Depth

Use the reference's floating translucent white navigation bar with a subtle downward shadow. Sheets use white tonal separation without decorative borders or shadows.

## Shapes

Match the supplied pill controls, round navigation selection, and large sheet radii. The user-pinned reference intentionally overrides earlier 12–16px card guidance.

## Components

Outlined black icons, white circular utility controls, blue primary actions, gray capsule selection. Every navigation control has a real action; discoveries are unavailable before starting a ride. Sensor errors, offline status, and unavailable providers remain explicit. Queue entries persist until discarded.

## Do's and Don'ts

Match the supplied reference rather than introducing another aesthetic direction. The steel-and-steam tokens above are the only accepted departure, and only as hairlines. The ride instrument is the map, not a compass needle. Preserve the LIRR flow and actual data. Do not add explanatory subtitles for obvious controls, left/right selectors, simulated live readings, or Waymo branding. Replay remains clearly labeled as simulated. Real phone sensors and provider integrations still need their release checks.
