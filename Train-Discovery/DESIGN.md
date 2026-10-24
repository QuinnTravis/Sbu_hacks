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

- `steel` `#8e98a8` — cool hairline, close to `line` `#cdd1db` and the dial grays. Use for compass ticks, a 1px tick under the compass readout, and a 2px tick on the catalog failure alert.
- `brass` `#8f6b3d` — aged brass. The compass needle only, including while simulated aim is idle.

### Where it may appear

- Steel tick marks and hairlines on the compass dial and on the loading, empty-aim, and failed-catalog queue states.
- One 2px steel mark on the catalog retry alert.
- Brass on the compass needle, with a short settle when a heading arrives. Loading ticks may breathe; they stay steel.

### Forbidden

No gears, smoke, sepia, rivet frames, or ornate borders. No green chrome. No Waymo branding. Do not use brass on buttons, navigation, sheets, text, or a second moment such as the active discovery card or a progress dot. Do not add a second warm accent.

## Typography

Locally hosted, Latin-subset Google Sans variable font under OFL, with its license in public/fonts. The route-selection home is centered on the geographic LIRR map; a floating bottom sheet holds nearby/all route selection and the primary action. No marketing subtitle.

## Layout

The ride surface is capped at 660px on desktop, with 18px phone gutters. On the audio follow line, the word Next stays fully visible; the upcoming place name may ellipsize. On a ride, the shell ends above the floating tab bar, and that column scrolls inside the gap: the compass readout, nearby line, candidate rows, and the lower lines of a discovery card stay readable there. The dial yields vertical space so those rows can sit with it. Route selection expands to a map-centered canvas: actual MTA route geometry is tappable, GPS location requests/filtering are available from the map, and a floating rounded bottom sheet contains route search/list and the blue Start ride action. The sheet can collapse to expose more map. Keep floating navigation below the sheet. The ride surface switches between its compass and persistent discovery queue via the same bottom navigation.

## Elevation & Depth

Use the reference's floating translucent white navigation bar with a subtle downward shadow. Sheets use white tonal separation without decorative borders or shadows.

## Shapes

Match the supplied pill controls, round navigation selection, and large sheet radii. The user-pinned reference intentionally overrides earlier 12–16px card guidance.

## Components

Outlined black icons, white circular utility controls, blue primary actions, gray capsule selection. Every navigation control has a real action; discoveries are unavailable before starting a ride. Sensor errors, offline status, and unavailable providers remain explicit. Queue entries persist until discarded.

## Do's and Don'ts

Match the supplied reference rather than introducing another aesthetic direction. The steel-and-steam tokens above are the only accepted departure, and only as hairlines plus the compass needle. Preserve the LIRR flow and actual data. Do not add explanatory subtitles for obvious controls, left/right selectors, simulated live readings, or Waymo branding. Replay remains clearly labeled as simulated. Real phone sensors and provider integrations still need their release checks.
