import { Package } from "../package";

export async function ableToTrackUspsRemotely(): Promise<boolean> {
  // doesn't support remote tracking yet.
  return false;
}

export async function updateUspsTracking(trackingNumber: string): Promise<Package[]> {
  console.log(`Updating tracking for ${trackingNumber}`);

  console.log(`Updated tracking for ${trackingNumber}`);

  return [{
    delivered: false,
    deliveryDate: new Date(),
    activity: [],
  }];
}
