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

The ride instrument is the map in the ride column. It is not a compass dial and not a default basemap embed. Ground is canvas `#eaedf3`. Roads and buildings are paper `#fefeff`. Casings, paths, and boundaries are line `#cdd1db`. Parks and woods are cool gray. Water is a quiet gray-blue. Place labels are ink `#0c101d`; road and water labels are muted `#5d6069`, with a paper halo. The branch line on this map uses that route’s color, as route data, with a paper casing. Action blue `#0071f2` marks the rider dot (white ring), the translucent facing wedge, and catalog points inside the actual pointing cone. All catalog places within the shared 1200m pointing radius appear as small paper dots with ink outlines, including places without sourced stories. In-cone dots use blue with a paper ring and a slightly larger diameter; without a heading all place dots stay neutral. Names are available through native titles and accessible labels, without persistent map labels or new selection actions. The rider stays centered on a north-up map; zoom uses the smaller measured canvas dimension to fit the full radius in every direction, so turning the phone never shifts or rotates the camera. A 1px steel hairline frames the map. Brass does not appear on this surface, and steel does not color the branch line. Attribution stays readable in a quiet band inside the frame, under the map, and does not cover the dot, wedge, audio bar, candidate sheet, or tab bar. Replay stays labeled simulated.

## Typography

Locally hosted, Latin-subset Google Sans variable font under OFL, with its license in public/fonts. The route-selection home is centered on the geographic LIRR map; a floating bottom sheet holds nearby/all route selection and the primary action. No marketing subtitle.

## Layout

The ride surface is capped at 660px on desktop, with 18px phone gutters. On the audio follow line, the word Next stays fully visible; the upcoming place name may ellipsize. On a ride, the shell ends above the floating tab bar, and that column scrolls inside the gap: the compass readout, nearby line, candidate rows, and the lower lines of a discovery card stay readable there. The ride map fills the width of the ride column and the space above the candidate sheet. Its floor is 180px so a short phone keeps the credit and the wedge above the tab bar. The MapLibre container is absolutely inset in that frame so its canvas keeps the frame’s height; a percentage height on a relative box collapses and clips the streets. OpenFreeMap attribution stays in a quiet band under the map and is not removed with `display: none`. The pointing sheet is a compact chooser: place name and distance, with a chevron, and no photograph. The photograph stays on the full discovery card. The chooser does not carry the sourced description or “No sourced summary yet.” That description is the discovery card Summary after a row is chosen. Ride-queue and saved-discovery rows remain text-only, with their existing index or chevron. If the map cannot shrink further, the sheet scrolls inside the band above the tab bar so every row stays tappable. The discovery-card footer follows the summary, so it does not cover those lines. Route selection expands to a map-centered canvas: actual MTA route geometry is tappable, GPS location requests/filtering are available from the map, and a floating rounded bottom sheet contains route search/list and the blue Start ride action. The sheet can collapse to expose more map. Keep floating navigation below the sheet. The ride surface switches between its compass and persistent discovery queue via the same bottom navigation.

## Elevation & Depth

Use the reference's floating translucent white navigation bar with a subtle downward shadow. Sheets use white tonal separation without decorative borders or shadows.

## Shapes

Match the supplied pill controls, round navigation selection, and large sheet radii. The user-pinned reference intentionally overrides earlier 12–16px card guidance.

## Components

Outlined black icons, white circular utility controls, blue primary actions, gray capsule selection. Every navigation control has a real action; discoveries are unavailable before starting a ride. Sensor errors, offline status, and unavailable providers remain explicit. Queue entries persist until discarded.

## Do's and Don'ts

Match the supplied reference rather than introducing another aesthetic direction. The steel-and-steam tokens above are the only accepted departure, and only as hairlines. The ride instrument is the map, not a compass needle. Preserve the LIRR flow and actual data. Do not add explanatory subtitles for obvious controls, left/right selectors, simulated live readings, or Waymo branding. Replay remains clearly labeled as simulated. Real phone sensors and provider integrations still need their release checks.
