import { Package } from "../package";
import { Cache, getPreferenceValues } from "@raycast/api";
import fetch from "node-fetch";

const cache = new Cache();
const cacheKey = "uspsLogin";
const host = "api.usps.com";

export async function ableToTrackUspsRemotely(): Promise<boolean> {
  // doesn't support remote tracking yet.
  return false;
}

export async function updateUspsTracking(trackingNumber: string): Promise<Package[]> {
  console.log(`Updating tracking for ${trackingNumber}`);

  const preferences = getPreferenceValues<Preferences.TrackDeliveries>();
  const consumerKey = preferences.uspsConsumerKey;
  const consumerSecret = preferences.uspsConsumerSecret;

  if (!consumerKey || !consumerSecret) {
    console.log(`Unable to update tracking for ${trackingNumber} because consumerKey or consumerSecret is missing`);
    throw new Error(
      "USPS consumer key or consumer secret is missing.  Ensure they are filled in this extension's settings.",
    );
  }

  const loginResponse = await loginWithCachedData(consumerKey, consumerSecret);

  console.log("Calling USPS tracking");
  const upsTrackingInfo = await track(trackingNumber, loginResponse.access_token);

  const packages = convertUspsTrackingToPackages(upsTrackingInfo);

  console.log(`Updated tracking for ${trackingNumber}`);

  return packages;
}

interface LoginResponseBody {
  access_token: string;
  token_type: string;
  issued_at: number;
  expires_in: number;
  status: string;
  scope: string;
  client_id: string;
}

async function loginWithCachedData(consumerKey: string, consumerSecret: string): Promise<LoginResponseBody> {
  let loginResponse: LoginResponseBody;

  if (!cache.has(cacheKey)) {
    console.log("Logging into USPS");
    loginResponse = await login(consumerKey, consumerSecret);

    cache.set(cacheKey, JSON.stringify(loginResponse));
  } else {
    loginResponse = JSON.parse(cache.get(cacheKey) ?? "{}");

    if (loginResponse.issued_at + loginResponse.expires_in * 1000 < new Date().getTime() + 30 * 1000) {
      // we are less than 30 seconds form the access token expiring
      console.log("Access key expired; logging into USPS");
      loginResponse = await login(consumerKey, consumerSecret);

      cache.set(cacheKey, JSON.stringify(loginResponse));
    }
  }

  return loginResponse;
}

async function login(consumerKey: string, consumerSecret: string): Promise<LoginResponseBody> {
  const response = await fetch(`https://${host}/oauth2/v3/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: consumerKey,
      client_secret: consumerSecret,
    }),
  });

  if (!response.ok) {
    console.log("Failed to login to USPS", response.status, response.statusText, await response.text());
    throw new Error(
      `Failed to login to USPS with status ${response.statusText}.  Ensure consumer key and consumer secret are correct.`,
    );
  }

  const loginResponse = (await response.json()) as LoginResponseBody;
  if (!loginResponse) {
    console.log("Failed to parse USPS login response");
    throw new Error("Failed to parse USPS login response.  Please file a bug report.");
  }

  return loginResponse;
}

interface UspsTrackingInfo {
  trackResponse: {
    shipment: [
      {
        inquiryNumber: string;
        package: [
          {
            trackingNumber: string;
            deliveryDate: [
              {
                type: string;
                date: string;
              },
            ];
            activity: [object];
            currentStatus: {
              description: string;
              code: string;
            };
          },
        ];
      },
    ];
  };
}

async function track(trackingNumber: string, accessToken: string): Promise<UspsTrackingInfo> {
  // const response = await fetch(
  //   `https://${host}/tracking/v3/tracking/${trackingNumber}?expand=SUMMARY`,
  //   {
  //     method: "GET",
  //     headers: {
  //       Authorization: "Bearer " + accessToken,
  //     },
  //   },
  // );
  //
  // if (!response.ok) {
  //   console.log("Failed to get USPS tracking", response.status, response.statusText, await response.text());
  //   throw new Error(`Failed to get USPS tracking with status ${response.statusText}.`);
  // }
  //
  // const trackingResponse = (await response.json()) as UspsTrackingInfo;
  // if (!trackingResponse) {
  //   console.log("Failed to parse USPS login response");
  //   throw new Error("Failed to parse USPS track response.  Please file a bug report.");
  // }

  const trackingResponse: UspsTrackingInfo = {
    trackResponse: {
      shipment: [
        {
          inquiryNumber: "",
          package: [
            {
              activity: [{}],
              currentStatus: { code: "", description: "" },
              deliveryDate: [{ date: "", type: "" }],
              trackingNumber: "",
            },
          ],
        },
      ],
    },
  };

  return trackingResponse;
}

function convertUspsTrackingToPackages(upsTrackingInfo: UspsTrackingInfo): Package[] {
  return [];
  // return upsTrackingInfo.trackResponse.shipment
  //   .flatMap((shipment) => shipment.package)
  //   .map((aPackage) => {
  //     const deliveryDate = aPackage.deliveryDate.find((deliveryDate) => deliveryDate.type === "DEL")?.date;
  //     const rescheduledDeliveryDate = aPackage.deliveryDate.find((deliveryDate) => deliveryDate.type === "RDD")?.date;
  //     const scheduledDeliveryDate = aPackage.deliveryDate.find((deliveryDate) => deliveryDate.type === "SDD")?.date;
  //
  //     return {
  //       delivered: aPackage.currentStatus.code === "011",
  //       deliveryDate: convertUpsDateToDate(deliveryDate || rescheduledDeliveryDate || scheduledDeliveryDate),
  //       activity: [],
  //     };
  //   });
}
