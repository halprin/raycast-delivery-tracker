import { Package } from "../package";
import { Delivery } from "../delivery";

export async function ableToTrackUspsRemotely(): Promise<boolean> {
  // doesn't support remote tracking yet.
  return false;
}

export async function urlToUspsTrackingWebpage(delivery: Delivery): Promise<string> {
  return `https://tools.usps.com/go/TrackConfirmAction_input?qtc_tLabels1=${delivery.trackingNumber}`;
}

export async function updateUspsTracking(delivery: Delivery): Promise<Package[]> {
  const trackingNumber = delivery.trackingNumber;

  console.log(`Updating tracking for ${trackingNumber}`);

  console.log(`Updated tracking for ${trackingNumber}`);

  return [
    {
      delivered: new Date() === delivery.manualDeliveryDate,
      deliveryDate: delivery.manualDeliveryDate,
      activity: [],
    },
  ];
}
