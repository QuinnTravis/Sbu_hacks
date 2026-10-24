import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import "./about.css";

export const metadata = { title: "About & privacy — Train Discovery" };

export default function About() {
  return (
    <main id="main-content" className="about-document">
      <Link href="/" className="about-back">
        <ArrowLeft size={18} aria-hidden="true" />
        Back to your ride
      </Link>
      <h1>About Train Discovery</h1>
      <p>
        Train Discovery connects your LIRR ride to the places around you.
        Geographic proximity and phone direction suggest a place; they do not
        prove visibility or identify a structure from an image.
      </p>
      <h2>Location & device data</h2>
      <p>
        Your GPS and compass readings are processed on your device. We download
        places for your selected branch; your precise location and movement
        history are not sent to our discovery server. Your selected branch,
        provider requests, and normal technical request information may be
        visible to our hosting providers. Your ride and discovery queue are
        stored in your browser until you end the ride or clear site data.
      </p>
      <p>
        With the app open, location and heading update as you travel. Locked
        screens and background browser tabs can suspend these readings. Starting
        a ride requests device permissions; ending a ride stops sensors. You can
        revoke permissions in your browser settings.
      </p>
      <h2 id="sources">Data & credits</h2>
      <p>
        Route geometry and stations were obtained from the{" "}
        <a href="https://www.mta.info/developers">MTA</a> and are hosted by this
        application. Train Discovery is independent and is not affiliated with
        or endorsed by MTA. Route data may be incomplete or outdated.
      </p>
      <p>
        Belmont Park has no scheduled shapes in the imported GTFS. Its track
        geometry is separately attributed to OpenStreetMap and does not imply
        operating service.
      </p>
      <p>
        Place data: ©{" "}
        <a href="https://www.openstreetmap.org/copyright">
          OpenStreetMap contributors
        </a>
        , under the{" "}
        <a href="https://opendatacommons.org/licenses/odbl/1-0/">
          Open Database License
        </a>
        . Download the <a href="/data/places.json">place database</a> and{" "}
        <a href="/data/lirr.json">route snapshot</a>.
      </p>
      <p>
        Historical source passages and adaptations from Wikipedia are attributed
        on individual cards and available under{" "}
        <a href="https://creativecommons.org/licenses/by-sa/4.0/">
          CC BY-SA 4.0
        </a>
        . Historical sentences are generated and checked through LangChain and
        Gemini using quoted source evidence. An automated evidence check is not
        a guarantee that the source itself is correct.
      </p>
      <p>
        Photographs are supplied on demand through Google Places, with
        photographer attribution and links on each image. Photos are not
        included in offline downloads.
      </p>
      <h2>Terms</h2>
      <p>
        Use this application as a passenger and respect your surroundings.
        Discovery information is provided as available, without guarantees of
        accuracy, availability, or line of sight. Google features are subject to
        the{" "}
        <a href="https://policies.google.com/terms">Google Terms of Service</a>{" "}
        and{" "}
        <a href="https://policies.google.com/privacy">Google Privacy Policy</a>.
        Google receives photo requests and technical connection information when
        images load. Supabase stores the public catalog; Gemini processes source
        passages without passenger location data.
      </p>
      <h2>Typography</h2>
      <p>
        Google Sans by the Google Sans Project Authors.{" "}
        <a href="/fonts/Google-Sans-OFL.txt">Font license</a>.
      </p>
    </main>
  );
}
