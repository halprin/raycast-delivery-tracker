import { Color } from "@raycast/api";
import { Package } from "./package";
import { updateUspsTracking, ableToTrackUspsRemotely } from "./carriers/usps";
import { updateUpsTracking, ableToTrackUpsRemotely } from "./carriers/ups";
import { updateFedexTracking, ableToTrackFedexRemotely} from "./carriers/fedex";

interface Carrier {
  id: string;
  name: string;
  color: Color;
  updateTracking: (trackingNumber: string) => Promise<Package[]>;
  ableToTrackRemotely: () => Promise<boolean>;
}

const carriers: Carrier[] = [
  {
    id: "usps",
    name: "USPS",
    color: Color.Blue,
    updateTracking: updateUspsTracking,
    ableToTrackRemotely: ableToTrackUspsRemotely,
  },
  {
    id: "ups",
    name: "UPS",
    color: Color.Orange,
    updateTracking: updateUpsTracking,
    ableToTrackRemotely: ableToTrackUpsRemotely,
  },
  {
    id: "fedex",
    name: "FedEx",
    color: Color.Purple,
    updateTracking: updateFedexTracking,
    ableToTrackRemotely: ableToTrackFedexRemotely,
  },
];

export default new Map(carriers.map((carrier) => [carrier.id, carrier]));
