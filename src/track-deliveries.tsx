import {
  Action,
  ActionPanel,
  Color,
  Detail,
  Icon,
  List,
  environment,
  Keyboard,
  showToast,
  Toast,
  confirmAlert,
  Alert,
} from "@raycast/api";
import { debugDeliveries, debugPackages } from "./debugData";
import providers from "./providers";
import { Package, PackageMap } from "./package";
import { Delivery } from "./delivery";
import { useCachedState, useLocalStorage } from "@raycast/utils";
import { useEffect, useState } from "react";
import TrackNewDeliveryAction from "./views/TrackNewDeliveryAction";

export default function TrackDeliveriesCommand() {
  const {
    value: deliveries,
    setValue: setDeliveries,
    isLoading,
  } = useLocalStorage<Delivery[]>("deliveries", environment.isDevelopment ? debugDeliveries : []);

  const [packages, setPackages] = useCachedState<PackageMap>(
    "packages",
    environment.isDevelopment ? debugPackages : {},
  );

  const [trackingIsLoading, setTrackingIsLoading] = useState(false);

  useEffect(() => {
    if (!deliveries || !packages) {
      // don't do anything until both deliveries and packages are initialized
      return;
    }

    setTrackingIsLoading(true);
    refreshTracking(false, deliveries, packages, setPackages, setTrackingIsLoading);
  }, [deliveries]);

  return (
    <List
      isLoading={isLoading || trackingIsLoading}
      actions={
        <ActionPanel>
          <TrackNewDeliveryAction deliveries={deliveries} setDeliveries={setDeliveries} isLoading={isLoading} />
        </ActionPanel>
      }
    >
      {sortTracking(deliveries ?? [], packages).map((item) => (
        <List.Item
          key={item.id}
          id={item.id}
          icon={deliveryIcon(packages[item.id]?.packages)}
          title={item.name}
          subtitle={item.trackingNumber}
          accessories={[
            { text: deliveryAccessory(packages[item.id]?.packages) },
            { text: { value: providers.get(item.carrier)?.name, color: providers.get(item.carrier)?.color } },
          ]}
          actions={
            <ActionPanel>
              <Action.Push
                title="Show Details"
                icon={Icon.MagnifyingGlass}
                target={<Detail markdown={`# ${item.name}`} />}
              />
              <Action
                title="Delete Delivery"
                icon={Icon.Trash}
                shortcut={Keyboard.Shortcut.Common.Remove}
                style={Action.Style.Destructive}
                onAction={() => deleteTracking(item.id, deliveries, setDeliveries)}
              />
              <TrackNewDeliveryAction deliveries={deliveries} setDeliveries={setDeliveries} isLoading={isLoading} />
              <Action
                title="Refresh All"
                icon={Icon.RotateClockwise}
                shortcut={Keyboard.Shortcut.Common.Refresh}
                style={Action.Style.Regular}
                onAction={() => {
                  if (!deliveries || !packages) {
                    // don't do anything until both deliveries and packages are initialized
                    return;
                  }

                  setTrackingIsLoading(true);
                  refreshTracking(true, deliveries, packages, setPackages, setTrackingIsLoading);
                }}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

async function refreshTracking(
  forceRefresh: boolean,
  tracking: Delivery[],
  packages: PackageMap,
  setPackages: (value: ((prevState: PackageMap) => PackageMap) | PackageMap) => void,
  setTrackingIsLoading: (value: ((prevState: boolean) => boolean) | boolean) => void,
) {
  const now = new Date();

  for (const track of tracking.filter((track) => !track.debug)) {
    const provider = providers.get(track.carrier);
    if (!provider) {
      continue;
    }

    const currentTrackPackages = packages[track.id];

    if (
      !forceRefresh &&
      currentTrackPackages &&
      currentTrackPackages.lastUpdated &&
      now.getTime() - currentTrackPackages.lastUpdated.getTime() <= 30 * 60 * 1000
    ) {
      // we have packages for this track (else cache is gone, and we need to refresh),
      // we've recorded the last update time (else we have never refreshed),
      // and it's been less than 30 minutes,
      // then...
      // skip updating
      continue;
    }

    try {
      const refreshedPackages = await provider.updateTracking(track.trackingNumber);

      setPackages((packagesMap) => {
        packagesMap[track.id] = {
          packages: refreshedPackages,
          lastUpdated: now,
        };
        return packagesMap;
      });
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: `Failed to Update Tracking for ${track.trackingNumber}`,
        message: String(error),
      });
    }
  }

  setTrackingIsLoading(false);
}

async function deleteTracking(
  id: string,
  tracking: Delivery[] | undefined,
  setTracking: (value: Delivery[]) => Promise<void>,
) {
  if (!tracking) {
    return;
  }

  const nameOfTrackToDelete = tracking.find((track) => track.id === id)?.name ?? "Unknown";

  const options: Alert.Options = {
    title: "Delete Delivery",
    message: `Are you sure you want to delete ${nameOfTrackToDelete}?`,
    icon: Icon.Trash,
    primaryAction: {
      title: "Delete",
      style: Alert.ActionStyle.Destructive,
    },
  };

  const confirmation = await confirmAlert(options);
  if (!confirmation) {
    return;
  }

  const reducedTracking = tracking.filter((track) => track.id !== id);
  await setTracking(reducedTracking);

  await showToast({
    style: Toast.Style.Success,
    title: "Deleted Delivery",
    message: nameOfTrackToDelete,
  });
}

function sortTracking(tracks: Delivery[], packages: PackageMap): Delivery[] {
  return tracks.toSorted((aTrack, bTrack) => {
    const aPackages = packages[aTrack.id]?.packages ?? [];
    const bPackages = packages[bTrack.id]?.packages ?? [];

    if (aPackages.length > 0 && bPackages.length == 0) {
      // a has packages, and b doesn't
      return -1;
    } else if (aPackages.length == 0 && bPackages.length > 0) {
      // a doesn't have any packages, and b does
      return 1;
    } else if (aPackages.length == 0 && bPackages.length == 0) {
      //a doesn't have any packages, and b doesn't either
      return 0;
    }

    const aAllPackagesDelivered = aPackages.every((aPackage) => aPackage.delivered);
    const bAllPackagesDelivered = bPackages.every((bPackage) => bPackage.delivered);

    if (aAllPackagesDelivered && !bAllPackagesDelivered) {
      // a has all packages delivered, and b doesn't
      return -1;
    } else if (!aAllPackagesDelivered && bAllPackagesDelivered) {
      // a doesn't have all packages delivered, and b does
      return 1;
    }

    const aEarliestDeliveryDate = getPackageWithEarliestDeliveryDate(aPackages).deliveryDate;
    const bEarliestDeliveryDate = getPackageWithEarliestDeliveryDate(bPackages).deliveryDate;

    if (aEarliestDeliveryDate && !bEarliestDeliveryDate) {
      // a has a delivery date, and b doesn't
      return -1;
    } else if (!aEarliestDeliveryDate && bEarliestDeliveryDate) {
      // a doesn't have a delivery date, and b does
      return 1;
    } else if (!aEarliestDeliveryDate && !bEarliestDeliveryDate) {
      // a doesn't have a delivery date, and b doesn't either

      const aSomePackagesDelivered = aPackages.some((aPackage) => aPackage.delivered);
      const bSomePackagesDelivered = bPackages.some((bPackage) => bPackage.delivered);

      if (aSomePackagesDelivered && !bSomePackagesDelivered) {
        // a has some packages delivered, and b doesn't
        return -1;
      } else if (!aSomePackagesDelivered && bSomePackagesDelivered) {
        // a doesn't have any packages delivered, and b does
        return 1;
      }

      // a and b both don't have any packages delivered
      return 0;
    }

    const dayDifferenceDifference =
      calculateDayDifference(aEarliestDeliveryDate!) - calculateDayDifference(bEarliestDeliveryDate!);
    if (dayDifferenceDifference == 0) {
      // both tracks tie for earliest delivery

      const aSomePackagesDelivered = aPackages.some((aPackage) => aPackage.delivered);
      const bSomePackagesDelivered = bPackages.some((bPackage) => bPackage.delivered);

      if (aSomePackagesDelivered && !bSomePackagesDelivered) {
        // a has some packages delivered, and b doesn't
        return -1;
      } else if (!aSomePackagesDelivered && bSomePackagesDelivered) {
        // a doesn't have any packages delivered, and b does
        return 1;
      }

      // a and b both don't have any packages delivered
      return 0;
    }

    return dayDifferenceDifference;
  });
}

function deliveryIcon(packages?: Package[]): Icon {
  if (!packages || packages.length == 0) {
    // there are no packages for this tracking, possible before data has been gotten from API
    return Icon.QuestionMarkCircle;
  }

  const somePackagesDelivered = packages.some((aPackage) => aPackage.delivered);
  let allPackagesDelivered = false;
  if (somePackagesDelivered) {
    allPackagesDelivered = packages.every((aPackage) => aPackage.delivered);
  }

  if (allPackagesDelivered) {
    return Icon.CheckCircle;
  } else if (somePackagesDelivered) {
    return Icon.Circle;
  }

  return Icon.CircleProgress;
}

function deliveryAccessory(packages?: Package[]): { value: string; color?: Color } {
  // check whether all, some, or no packages in a track are delivered

  if (!packages || packages.length == 0) {
    return {
      value: "No packages",
      color: Color.Orange,
    };
  }

  const somePackagesDelivered = packages.some((aPackage) => aPackage.delivered);
  let allPackagesDelivered = false;
  if (somePackagesDelivered) {
    allPackagesDelivered = packages.every((aPackage) => aPackage.delivered);
  }

  if (allPackagesDelivered) {
    return {
      value: "Delivered",
      color: Color.Green,
    };
  }

  //find closest estimated delivered package
  const closestPackage = getPackageWithEarliestDeliveryDate(packages);

  let accessoryText = "En route";
  if (closestPackage.deliveryDate) {
    accessoryText = calculateDayDifference(closestPackage.deliveryDate).toString() + " days until delivery";
  }

  let accessoryColor = undefined;
  if (somePackagesDelivered && !allPackagesDelivered) {
    accessoryText = accessoryText + "; some packages delivered";
    accessoryColor = Color.Blue;
  }

  return {
    value: accessoryText,
    color: accessoryColor,
  };
}

function getPackageWithEarliestDeliveryDate(packages: Package[]): Package {
  const now = new Date();

  return packages.reduce((closest, current) => {
    const closestDeliveryDate = closest.deliveryDate;
    const currentDeliveryDate = current.deliveryDate;

    if (!currentDeliveryDate) {
      // current package has an unknown delivery date
      return closest;
    }

    if (!closestDeliveryDate) {
      // previous package has an unknown delivery date
      return current;
    }

    if (
      Math.abs(currentDeliveryDate.getTime() - now.getTime()) < Math.abs(closestDeliveryDate.getTime() - now.getTime())
    ) {
      return current;
    } else {
      return closest;
    }
  });
}

function calculateDayDifference(deliverDate: Date): number {
  const millisecondsInDay = 1000 * 60 * 60 * 24;

  const millisecondsDifference = deliverDate.getTime() - new Date().getTime();
  let dayDifference = Math.ceil(millisecondsDifference / millisecondsInDay);

  if (dayDifference < 0) {
    dayDifference = 0;
  }

  return dayDifference;
}
