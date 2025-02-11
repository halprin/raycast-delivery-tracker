import { Package } from "../package";
import { Cache, getPreferenceValues } from "@raycast/api";
import fetch from "node-fetch";
import { Delivery } from "../delivery";

const cache = new Cache();
const cacheKey = "fedexLogin";
const host = "apis.fedex.com";

export async function ableToTrackFedexRemotely(): Promise<boolean> {
  const preferences = getPreferenceValues<Preferences.TrackDeliveries>();
  const apiKey = preferences.fedexApiKey;
  const secretKey = preferences.fedexSecretKey;

  return Boolean(apiKey && secretKey);
}

export async function updateFedexTracking(delivery: Delivery): Promise<Package[]> {
  const trackingNumber = delivery.trackingNumber;

  console.log(`Updating tracking for ${trackingNumber}`);

  const preferences = getPreferenceValues<Preferences.TrackDeliveries>();
  const apiKey = preferences.fedexApiKey;
  const secretKey = preferences.fedexSecretKey;

  if (!apiKey || !secretKey) {
    console.log(`Unable to update tracking for ${trackingNumber} because apiKey or secretKey is missing`);
    throw new Error("FedEx API key or secret key is missing.  Ensure they are filled in this extension's settings.");
  }

  const loginResponse = await loginWithCachedData(apiKey, secretKey);

  console.log("Calling FedEx tracking");
  const upsTrackingInfo = await track(trackingNumber, loginResponse.access_token);

  const packages = convertUpsTrackingToPackages(upsTrackingInfo);

  console.log(`Updated tracking for ${trackingNumber}`);

  return packages;
}

interface LoginResponseBody {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

async function loginWithCachedData(apiKey: string, secretKey: string): Promise<LoginResponseBody> {
  let loginResponse: LoginResponseBody;

  if (!cache.has(cacheKey)) {
    console.log("Logging into FedEx");
    loginResponse = await login(apiKey, secretKey);

    cache.set(cacheKey, JSON.stringify(loginResponse));
  } else {
    loginResponse = JSON.parse(cache.get(cacheKey) ?? "{}");

    const now = new Date().getTime();

    if (now + loginResponse.expires_in * 1000 < now + 30 * 1000) {
      // we are less than 30 seconds form the access token expiring
      console.log("Access key expired; logging into FedEx");
      loginResponse = await login(apiKey, secretKey);

      cache.set(cacheKey, JSON.stringify(loginResponse));
    }
  }

  return loginResponse;
}

async function login(apiKey: string, secretKey: string): Promise<LoginResponseBody> {
  const response = await fetch(`https://${host}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: apiKey,
      client_secret: secretKey,
    }),
  });

  if (!response.ok) {
    console.log("Failed to login to FedEx", response.status, response.statusText, await response.text());
    throw new Error(
      `Failed to login to FedEx with status ${response.statusText}.  Ensure API key and secret key are correct.`,
    );
  }

  const loginResponse = (await response.json()) as LoginResponseBody;
  if (!loginResponse) {
    console.log("Failed to parse FedEx login response");
    throw new Error("Failed to parse FedEx login response.  Please file a bug report.");
  }

  return loginResponse;
}

interface FedexTrackingInfo {
  output: {
    completeTrackResults: [
      {
        trackingNumber: string;
        trackResults: [
          {
            trackingNumberInfo: {
              trackingNumber: string;
            };
            latestStatusDetail: {
              code: string;
            };
            dateAndTimes: [
              {
                type: string;
                dateTime: string;
              },
            ];
          },
        ];
      },
    ];
  };
}

async function track(trackingNumber: string, accessToken: string): Promise<FedexTrackingInfo> {
  const response = await fetch(`https://${host}/track/v1/trackingnumbers`, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      includeDetailedScans: true,
      trackingInfo: [
        {
          trackingNumberInfo: {
            trackingNumber: trackingNumber,
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    console.log("Failed to get FedEx tracking", response.status, response.statusText, await response.text());
    throw new Error(`Failed to get FedEx tracking with status ${response.statusText}.`);
  }

  const trackingResponse = (await response.json()) as FedexTrackingInfo;
  if (!trackingResponse) {
    console.log("Failed to parse FedEx login response");
    throw new Error("Failed to parse FedEx track response.  Please file a bug report.");
  }

  return trackingResponse;
}

function convertUpsTrackingToPackages(fedexTrackingInfo: FedexTrackingInfo): Package[] {
  return fedexTrackingInfo.output.completeTrackResults
    .flatMap((results) => results.trackResults)
    .map((aPackage) => {
      const deliveryDate = aPackage.dateAndTimes.find(
        (dateAndTime) => dateAndTime.type === "ACTUAL_DELIVERY",
      )?.dateTime;
      const estimatedDeliveryDate = aPackage.dateAndTimes.find(
        (dateAndTime) => dateAndTime.type === "ESTIMATED_DELIVERY",
      )?.dateTime;
      const appointmentDeliveryDate = aPackage.dateAndTimes.find(
        (dateAndTime) => dateAndTime.type === "APPOINTMENT_DELIVERY",
      )?.dateTime;

      return {
        delivered: aPackage.latestStatusDetail.code === "DL",
        deliveryDate: convertFedexDateToDate(deliveryDate || estimatedDeliveryDate || appointmentDeliveryDate),
        activity: [],
      };
    });
}

function convertFedexDateToDate(fedexDate: string | undefined): Date | undefined {
  if (!fedexDate) {
    return undefined;
  }

  // fedexDate is an ISO date formatted string
  return new Date(fedexDate);
}
