import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import "./about.css";

export const metadata = { title: "About & privacy — Gaze" };

export default function About() {
  return (
    <main id="main-content" className="about-document">
      <Link href="/" className="about-back">
        <ArrowLeft size={18} aria-hidden="true" />
        Back to your ride
      </Link>
      <h1>About Gaze</h1>
      <p>
        Gaze connects your train ride to the places around you. Point your
        phone out the window, hear the story of what you are passing, and keep
        the places you want to remember. Geographic proximity and phone
        direction suggest a place; they do not prove visibility or identify a
        structure from an image. Left and right cues come from the route
        geometry and your direction of travel, not from a camera.
      </p>
      <h2>Location & device data</h2>
      <p>
        Your GPS and compass readings are processed on your device. We download
        places for your selected route; your precise location and movement
        history are not sent to our discovery server. Your selected route,
        provider requests, and normal technical request information may be
        visible to our hosting providers. Your ride and its discovery queue stay
        in this browser until you end the ride. Bookmarks stay on this device
        until you remove them or clear site data. A bookmark keeps the story and
        sources already on the card, not your location history, photos, or
        audio. Offline downloads are stored in this browser&apos;s cache.
      </p>
      <p>
        With the app open, location and heading update as you travel. Locked
        screens and background browser tabs can suspend these readings. Starting
        a ride requests device permissions; ending a ride stops sensors. You can
        revoke permissions in your browser settings. Voice questions, when you
        use them, send your recording to the speech provider for transcription;
        recordings are not stored.
      </p>
      <h2 id="sources">Data sources</h2>
      <p>
        California Zephyr route geometry, stations, and timetable come from{" "}
        <a href="https://content.amtrak.com/content/gtfs/GTFS.zip">Amtrak&apos;s published GTFS</a>.
        Long Island Rail Road data comes from the{" "}
        <a href="https://www.mta.info/developers">MTA</a>. Gaze is independent
        and is not affiliated with or endorsed by Amtrak or the MTA. Route data
        may be incomplete or outdated, and nothing here predicts service.
      </p>
      <p>
        Places along the Zephyr come from{" "}
        <a href="https://www.wikidata.org/">Wikidata</a> (CC0); tunnels, rivers,
        and canyons from ©{" "}
        <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>
        , under the{" "}
        <a href="https://opendatacommons.org/licenses/odbl/1-0/">Open Database License</a>
        . Download the <a href="/data/networks/california-zephyr/rail.json">route snapshot</a>{" "}
        and the <a href="/data/networks/california-zephyr/places/cz-rockies.json">Rockies places</a>.
      </p>
      <p>
        Historical source passages and adaptations from Wikipedia are attributed
        on individual cards and available under{" "}
        <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>
        . Stories are generated and checked through LangChain and Gemini using
        quoted source evidence; translations are made only from checked English
        text. An automated evidence check is not a guarantee that the source
        itself is correct. Places with no checked story are described only by
        their map and Wikidata fields, labeled as basic info.
      </p>
      <p>
        Photographs come from Google Places or Wikimedia Commons, with the
        photographer, source, and license on each image. Historic photographs
        are public-domain or openly licensed images from Wikimedia Commons and
        the Library of Congress, credited under each comparison. Air quality
        comes from <a href="https://open-meteo.com/">Open-Meteo</a> and is
        informational only. See every source and license on the{" "}
        <a href="/credits">credits page</a>.
      </p>
      <h2>Terms</h2>
      <p>
        Use this application as a passenger and respect your surroundings.
        Discovery information is provided as available, without guarantees of
        accuracy, availability, or line of sight. No-signal stretches are
        estimates. Google features are subject to the{" "}
        <a href="https://policies.google.com/terms">Google Terms of Service</a>{" "}
        and{" "}
        <a href="https://policies.google.com/privacy">Google Privacy Policy</a>.
        Google receives photo requests and technical connection information when
        images load. Supabase stores the LIRR catalog and narration cache;
        Gemini processes source passages without passenger location data.
      </p>
    </main>
  );
}
