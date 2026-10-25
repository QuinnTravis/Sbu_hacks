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
- The 1px steel tick under the compass readout.
- One 2px steel mark on the catalog retry alert.

The Saved views, the discovery card, and the tab bar carry no steel.

### Forbidden

No gears, smoke, sepia, rivet frames, or ornate borders. No green chrome. No Waymo, Mapbox, or Google branding. Do not use brass on the ride map, the facing wedge, the rider dot, buttons, navigation, sheets, text, or a second moment such as the active discovery card or a progress dot. Do not add a second warm accent. Do not put steel on roads, labels, the rider dot, or the facing wedge.

## Ride map

The ride instrument is the map in the ride column. It is not a compass dial and not a default basemap embed. Ground is canvas `#eaedf3`. Roads and buildings are paper `#fefeff`. Casings, paths, and boundaries are line `#cdd1db`. Parks and woods are cool gray. Water is a quiet gray-blue. Place labels are ink `#0c101d`; road and water labels are muted `#5d6069`, with a paper halo. The branch line on this map uses that route’s color, as route data, with a paper casing. Action blue `#0071f2` marks the rider dot (white ring), the translucent facing wedge, and catalog points inside the actual pointing cone. All catalog places within the shared 1200m pointing radius appear as small paper dots with ink outlines, including places without sourced stories. In-cone dots use blue with a paper ring and a slightly larger diameter; without a heading all place dots stay neutral. Names are available through native titles and accessible labels, without persistent map labels or new selection actions. The rider stays centered on a north-up map; zoom uses the smaller measured canvas dimension to fit the full radius in every direction, so turning the phone never shifts or rotates the camera. The ride map is an edge-to-edge canvas; do not frame it as a card. Brass does not appear on this surface, and steel does not color the branch line. Attribution uses a compact, keyboard-accessible expandable control in a map corner; opening it reveals the complete OpenFreeMap, OpenMapTiles, and OpenStreetMap attribution. The collapsed control does not cover the dot, wedge, audio bar, candidate sheet, or tab bar. Replay stays labeled simulated.

## Typography

Locally hosted, Latin-subset Google Sans variable font under OFL, with its license in public/fonts. The route-selection home is centered on the geographic LIRR map; a floating bottom sheet holds nearby/all route selection and the primary action. No marketing subtitle.

## Layout

The ride map fills the viewport on phone and desktop. Its camera stays north-up and centered; pointing changes the cone, not the camera. Header, route status, audio, and navigation float above this canvas. Respect safe areas and dynamic viewport height. Keep the discovery sheet and Saved content capped at 660px on desktop, both during a ride and on the home Saved view; the map itself has no content-width cap.

Holding an aim for 450ms reveals a compact nonmodal sheet with place names and distances. The sheet retains its candidate snapshot while it is open, so turning the phone cannot move a row under a finger. Selecting a candidate expands its photo/story in that same sheet, preserving the map behind it; selecting does not save. A selected card remains while reading, even after heading changes. Drag the handle or use its accessible button to expand/collapse; close or drag down to dismiss. Closing only closes. The card has no paging. Its footer is one row: “Not interested” as a muted text button on the left, which hides the place for the rest of the ride, and Save as a pill on the right.

Use one continuous spring for entrance, dragging, snap, and exit; drag follows the pointer without a CSS transition or React render per frame. Clamp overshoot, preserve the current animation position when interrupted, and disable motion for reduced-motion preferences. The handle and close control have at least 44px targets. The sheet is a nonmodal region with no backdrop or focus trap; its content scrolls separately. Closed sheets are inert. Nested photo dialogs own Escape before the sheet. Keep the sheet above the floating navigation, including the collapsed geometry and short landscape; do not let its backing cover the tab bar. Expanded reading replaces the route/audio chrome with a concise route and simulation/status row below the app header, leaving clear space for attribution. Attribution disclosure temporarily uses that context row. In short landscape, the selected card puts its text before the photo while retaining every section in the scroller.

The source summary, evidence state, photo details, and sources remain on the expanded discovery card. The chooser is text-only. Saved rows remain text-only. Map attribution remains a compact, keyboard-accessible expandable control with complete source links. Place it where neither the navigation nor the discovery sheet blocks it. Sensor failures, catalog retry, and simulated rides remain explicit. Route selection retains its geographic map, searchable route sheet, and Start ride action.

There is no ride queue; Saved is the one list. The in-ride Saved tab and the home Saved tab render the same view: a plain “Saved” heading, the current card with its Save pill (plus Previous, count, and Next when more than one place is saved), and the text-only list below. The heading appears only when something is saved. The empty state is one paper card with the blue book window and “Nothing saved yet”; the home view adds a Start discovering primary button, and the ride view adds nothing because Discover is the adjacent tab. Short landscape drops the book window.

## Elevation & Depth

Use the reference's floating translucent white navigation bar with a subtle downward shadow. Sheets use white tonal separation without decorative borders or shadows.

## Shapes

Match the supplied pill controls, round navigation selection, and large sheet radii. The user-pinned reference intentionally overrides earlier 12–16px card guidance.

## Components

Outlined black icons, white circular utility controls, blue primary actions, gray capsule selection. Every navigation control has a real action. The floating navigation is My ride / Saved / About before a ride and Discover / Saved / About during one; the active tab takes the gray capsule. The Saved tab’s blue count badge appears only when the count is above zero; it is a 20px pill that grows away from the icon, never over the label. Save on a card is a 44px pill: tinted blue `#e9f2ff` with blue text and a bookmark-plus icon, and once saved, the `soft` `#dfe3eb` gray capsule with ink text and a bookmark-check icon. Sensor errors, offline status, and unavailable providers remain explicit. Saved entries persist on the device until removed.

## Do's and Don'ts

Match the supplied reference rather than introducing another aesthetic direction. The steel-and-steam tokens above are the only accepted departure, and only as hairlines. The ride instrument is the map, not a compass needle. Preserve the LIRR flow and actual data. Do not add explanatory subtitles for obvious controls, left/right selectors, simulated live readings, or Waymo branding. Replay remains clearly labeled as simulated. Real phone sensors and provider integrations still need their release checks.
